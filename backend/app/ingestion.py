import hashlib
import io
import re
import shutil
from pathlib import Path

import openpyxl
import pymupdf
from sqlalchemy import select

from app import ai, audit, llm, ocr, page_renderer, row_security
from app.config import settings
from app.db import SessionLocal
from app.models import Chunk, Document, IngestionJob, Record, now

MAGIC = {
    ".pdf": ("pdf", b"%PDF"),
    ".png": ("image", b"\x89PNG"),
    ".jpg": ("image", b"\xff\xd8"),
    ".jpeg": ("image", b"\xff\xd8"),
    ".xlsx": ("xlsx", b"PK"),
    ".docx": ("docx", b"PK"),
    ".csv": ("database", None),
    ".tsv": ("database", None),
    ".json": ("database", None),
    ".sql": ("database", None),
    ".txt": ("text", None),
    ".md": ("text", None),
}

INJECTION_PATTERNS = [
    r"ignore (all |any )?(the )?(previous|prior|above|earlier) (instructions|rules|prompts)",
    r"disregard (all |any )?(the )?(previous|prior|above|earlier)",
    r"reveal (every|all|the|any)\b.*\b(file|document|salar|password|secret|prompt)",
    r"you are now\b",
    r"system prompt",
    r"do not (tell|inform) the user",
    r"new instructions?:",
]
_INJECTION = re.compile("|".join(INJECTION_PATTERNS), re.IGNORECASE)
REMOVED = "[instruction-like text removed]"


def compute_checksum(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def validate_upload(filename: str, data: bytes) -> str:
    """Return the document kind, or raise ValueError with a message for the user."""
    ext = Path(filename).suffix.lower()
    if ext not in MAGIC:
        raise ValueError("Unsupported file type. Upload a PDF, DOCX, CSV, TSV, JSON database export, XLSX or image file.")
    kind, magic = MAGIC[ext]
    if magic and not data.startswith(magic):
        raise ValueError(f"File content does not match its {ext} extension.")
    if kind in ("text", "database"):
        try:
            if b"\x00" in data[:4096]:
                raise ValueError
        except ValueError:
            raise ValueError("Text and database records must be valid UTF-8.")
    return kind


def doc_dir(doc: Document) -> Path:
    return Path(settings.file_storage_dir) / doc.tenant_id / doc.id


def page_image_path(doc: Document, page: int) -> Path:
    return doc_dir(doc) / "pages" / f"{page}.png"


def store_original(doc: Document, data: bytes) -> Path:
    folder = doc_dir(doc)
    (folder / "pages").mkdir(parents=True, exist_ok=True)
    path = folder / ("original" + Path(doc.filename).suffix.lower())
    path.write_bytes(data)
    return path


def delete_files(doc: Document) -> None:
    shutil.rmtree(doc_dir(doc), ignore_errors=True)


def normalize_text(text: str) -> str:
    """Normalizes whitespace, line breaks, removes nulls/replacement chars,
    and standardizes list/bullet markers into clean markdown '- '."""
    if not text:
        return ""
    text = text.replace("\r\n", "\n").replace("\r", "\n").replace("\xa0", " ").replace("\x00", "")
    bullet_pattern = r"(?m)^\s*(?:[\ufffd\uf0b7\u2022\u2023\u2043\u2219\u25cb\u25cf\u25d8\u25e6\u25aa\u25ab\u25ac\u25ad\u2013\u2014•▪►▶]|(?:\ufffd\s*[\t\s]+)|\t+)\s*"
    text = re.sub(bullet_pattern, "- ", text)
    text = text.replace("\ufffd", "")
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def sanitize(text: str) -> tuple[str, int]:
    """Replace instruction-like sentences in document text. Returns (clean text, count removed)."""
    text = normalize_text(text)
    removed = 0
    lines = []
    for line in text.split("\n"):
        parts = re.split(r"(?<=[.!?])\s+", line)
        for i, part in enumerate(parts):
            if _INJECTION.search(part):
                parts[i] = REMOVED
                removed += 1
        lines.append(" ".join(parts))
    return "\n".join(lines), removed


def split_text(text: str, max_chars: int = 900) -> list[str]:
    text = normalize_text(text)
    chunks, current = [], ""
    for para in re.split(r"\n\s*\n", text):
        para = para.strip()
        if not para:
            continue
        while len(para) > max_chars:
            cut = -1
            for sep in ["\n- ", "\n• ", "\n* ", ". ", "; ", ", ", " "]:
                pos = para.rfind(sep, max_chars // 3, max_chars)
                if pos != -1:
                    cut = pos + len(sep) if not sep.startswith("\n") else pos
                    break
            if cut == -1 or cut <= 0:
                cut = max_chars
            if current:
                chunks.append(current)
                current = ""
            chunks.append(para[:cut].strip())
            para = para[cut:].strip()
        if len(current) + len(para) + 2 > max_chars and current:
            chunks.append(current)
            current = para
        else:
            current = f"{current}\n\n{para}" if current else para
    if current:
        chunks.append(current)
    return chunks


def _extract_pdf(doc: Document, path: Path) -> tuple[list[tuple[int, str, str, str]], list[dict], int]:
    """Extracts pages, detect precise section headings from outlines/bookmarks and typography font metrics."""
    from collections import Counter

    sections, sections_meta, unread = [], [], 0
    ocr_pages: list[tuple[int, str]] = []
    with pymupdf.open(path) as pdf:
        # Check PDF outline / table of contents
        toc = pdf.get_toc()  # [[lvl, title, page], ...]
        toc_by_page: dict[int, list[tuple[int, str]]] = {}
        if toc:
            for item in toc:
                if len(item) >= 3:
                    lvl, title, pnum = item[0], str(item[1]).strip(), int(item[2])
                    if title:
                        toc_by_page.setdefault(pnum, []).append((lvl, title))

        # Pass 1: Compute dominant body font size across the document
        font_counts: Counter[float] = Counter()
        for page in pdf:
            d = page.get_text("dict")
            for b in d.get("blocks", []):
                if "lines" in b:
                    for l in b["lines"]:
                        for s in l["spans"]:
                            t = s["text"].strip()
                            if t:
                                font_counts[round(s["size"], 1)] += len(t)
        body_size = font_counts.most_common(1)[0][0] if font_counts else 10.0

        current_heading = doc.title or "Overview"
        heading_stack: list[tuple[int, str]] = []
        sec_counter = 1

        for number, page in enumerate(pdf, start=1):
            png = page.get_pixmap(dpi=110).tobytes("png")
            page_image_path(doc, number).write_bytes(png)
            raw_page_text = page.get_text().strip()

            # A chart or diagram: embedded images, or vector drawings that are not just table rules.
            try:
                has_table = bool(page.find_tables().tables)
            except Exception:
                has_table = False
            has_visuals = bool(page.get_images()) or (len(page.get_drawings()) >= 3 and not has_table)
            visual_desc = ""
            if len(raw_page_text) < 40:
                # Scanned page: OCR it (vision model first, offline engine second).
                hi_res = page.get_pixmap(dpi=200).tobytes("png")
                visual_desc, engine = ocr.read_image(hi_res)
                if visual_desc:
                    ocr_pages.append((number, engine))
            elif has_visuals and llm.enabled():
                # Text page with a chart, diagram or embedded image: describe the visual.
                try:
                    visual_desc = llm.transcribe_image(png)
                except Exception:
                    visual_desc = ""

            if not raw_page_text and not visual_desc:
                unread += 1
                continue

            d = page.get_text("dict")
            text_blocks = [b for b in d.get("blocks", []) if "lines" in b]
            page_toc = toc_by_page.get(number, [])
            current_section_buf: list[str] = []

            for b in text_blocks:
                lines: list[str] = []
                max_size = 0.0
                is_bold = False
                for l in b["lines"]:
                    line_str = "".join(s["text"] for s in l["spans"]).strip()
                    if line_str:
                        lines.append(line_str)
                    for s in l["spans"]:
                        if s["text"].strip():
                            sz = round(s["size"], 1)
                            if sz > max_size:
                                max_size = sz
                            flags = s.get("flags", 0)
                            font_name = s.get("font", "").lower()
                            if (flags & 2) or ("bold" in font_name) or ("black" in font_name) or ("heavy" in font_name):
                                is_bold = True

                if not lines:
                    continue

                first_line = lines[0].strip()
                full_block = "\n".join(lines).strip()

                # Running header/footer / page number filtering
                bbox = b.get("bbox", (0, 0, 0, 0))
                is_page_number = bool(re.match(r"^\s*(page\s+\d+(\s+of\s+\d+)?|\d+)\s*$", first_line, re.IGNORECASE))
                if is_page_number:
                    continue
                is_margin = bbox[1] < 45 or bbox[3] > (page.rect.height - 45)
                is_header_footer_heading = is_margin and max_size <= (body_size * 1.05)

                # Footnote detection (small text at page bottom)
                is_footnote = (bbox[3] > (page.rect.height - 120)) and (max_size < body_size or bool(re.match(r"^\d+\s+[A-Z]", first_line)))

                # Check if block starts with bullet
                is_bullet = bool(re.match(r"^[\ufffd\uf0b7\u2022\u2023\u2043\u2219\u25cb\u25cf\u25d8\u25e6\u25aa\u25ab\u25ac\u25ad\u2013\u2014•▪►▶\-\*\t]", first_line))

                # Heading candidate criteria
                is_bare_number = bool(re.match(r"^\s*(\d+(\.\d+)*|[A-Za-z]\.|•|\-|\*)\s*$", first_line))
                clean_fl = re.sub(r"[\s\u200b\xa0]+", " ", first_line).rstrip(":").strip()

                # Precise TOC matching
                matching_toc = None
                toc_lvl = None
                if not is_margin and not is_footnote and not clean_fl.endswith((".", ";", ",")):
                    for lvl, title in page_toc:
                        c_title = re.sub(r"[\s\u200b\xa0]+", " ", title).strip()
                        if clean_fl.lower() == c_title.lower():
                            matching_toc = c_title
                            toc_lvl = lvl
                            break
                        if len(c_title) > 4 and (clean_fl.lower().startswith(c_title.lower()) or c_title.lower().startswith(clean_fl.lower())):
                            if abs(len(clean_fl) - len(c_title)) <= 15:
                                matching_toc = c_title
                                toc_lvl = lvl
                                break
                        m1 = re.match(r"^(\d+(?:\.\d+)*)\b", clean_fl)
                        m2 = re.match(r"^(\d+(?:\.\d+)*)\b", c_title)
                        if m1 and m2 and m1.group(1) == m2.group(1):
                            matching_toc = c_title
                            toc_lvl = lvl
                            break

                is_toc_heading = matching_toc is not None
                is_numbered_title = not clean_fl.endswith((".", ";", ",")) and max_size >= body_size and bool(re.match(r"^(\d+(\.\d+)*|[A-Z]\.|\b(Chapter|Section|Article|Part)\s+\d+)\b\s+[A-Za-z0-9]", clean_fl, re.IGNORECASE)) and len(clean_fl) < 120
                is_larger = max_size >= (body_size * 1.15) and not clean_fl.endswith((".", ";", ","))
                is_bold_title = is_bold and len(clean_fl) < 120 and not clean_fl.endswith((".", ";", ",")) and max_size >= body_size
                is_all_caps = clean_fl.isupper() and 3 < len(clean_fl) < 80 and not clean_fl.endswith((".", ",", ";")) and max_size >= (body_size * 0.95)

                looks_heading = not is_bare_number and not is_bullet and not is_footnote and not is_header_footer_heading and (
                    is_toc_heading or (
                        (is_larger or is_bold_title or is_numbered_title or is_all_caps)
                        and (len(lines) == 1 or len(first_line) < 100)
                    )
                )

                if looks_heading and len(first_line) < 130:
                    cand = matching_toc if is_toc_heading else clean_fl
                    cand = re.sub(r"[\s\u200b\xa0]+", " ", cand).strip()
                    m_num = re.match(r"^(\d+(?:\.\d+)*)", cand)
                    level = toc_lvl or (m_num.group(1).count(".") + 1 if m_num else (1 if max_size >= (body_size * 1.35) else 2))

                    # Finalize text buffer for the previous section on this page
                    if current_section_buf:
                        buf_text = normalize_text("\n\n".join(current_section_buf))
                        if buf_text:
                            sections.append((number, f"page {number}", buf_text, current_heading))
                        current_section_buf = []

                    while heading_stack and heading_stack[-1][0] >= level:
                        heading_stack.pop()
                    heading_stack.append((level, cand))
                    current_heading = " — ".join(h for _, h in heading_stack)

                    if not any(s["heading"].lower() == current_heading.lower() for s in sections_meta):
                        sections_meta.append({
                            "id": f"sec_{sec_counter}",
                            "heading": current_heading,
                            "level": level,
                            "page": number,
                            "snippet": full_block[:150],
                            "allowed_roles": [],
                        })
                        sec_counter += 1

                    if len(lines) > 1:
                        current_section_buf.append("\n".join(lines[1:]))
                else:
                    current_section_buf.append(full_block)

            # Append any remaining text buffer on this page
            if current_section_buf:
                buf_text = normalize_text("\n\n".join(current_section_buf))
                if buf_text:
                    sections.append((number, f"page {number}", buf_text, current_heading))

            # Structured Table Extraction via PyMuPDF Table Finder (Preserves Column -> Row -> Value)
            try:
                tabs = page.find_tables()
                if tabs and tabs.tables:
                    for t_idx, tab in enumerate(tabs.tables, start=1):
                        raw_table = tab.extract()
                        if raw_table and len(raw_table) >= 2:
                            headers = [str(c or f"Col_{i+1}").strip() for i, c in enumerate(raw_table[0])]
                            md_lines = ["| " + " | ".join(headers) + " |", "| " + " | ".join("---" for _ in headers) + " |"]
                            rec_lines = []
                            for r_idx, row in enumerate(raw_table[1:], start=1):
                                clean_row = [str(c or "").strip() for c in row]
                                md_lines.append("| " + " | ".join(clean_row) + " |")
                                pairs = "; ".join(f"{h}: {v}" for h, v in zip(headers, clean_row) if v)
                                rec_lines.append(f"Record #{r_idx}: {pairs}.")
                            table_md = "\n".join(md_lines)
                            records_text = "\n".join(rec_lines)
                            combined_table_text = f"Table (Page {number}, Table {t_idx}):\n{table_md}\n\nStructured Table Records:\n{records_text}"
                            sections.append((number, f"page {number}, table {t_idx}", normalize_text(combined_table_text), current_heading))
            except Exception:
                pass

            # If there was visual OCR content on this page
            if visual_desc:
                label = "OCR" if any(n == number for n, _ in ocr_pages) else "visual"
                vis_content = f"[{'Scanned page text' if label == 'OCR' else 'Visual content'} on page {number}]\n{visual_desc}"
                sections.append((number, f"page {number} · {label}", normalize_text(vis_content), current_heading))

    if not sections_meta and sections:
        sections_meta.append({
            "id": "sec_1",
            "heading": doc.title or "General Document Content",
            "level": 1,
            "page": 1,
            "snippet": sections[0][2][:150] if sections else "",
            "allowed_roles": [],
        })

    return sections, sections_meta, unread


MAX_ROWS = 5000


def _as_number(value) -> float | None:
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return float(value)
    text = str(value or "").strip().replace(",", "").replace("$", "").replace("%", "")
    try:
        return float(text) if text else None
    except ValueError:
        return None


def column_types(columns: list[str], rows: list[dict]) -> dict[str, str]:
    types = {}
    for col in columns:
        values = [r.get(col) for r in rows if str(r.get(col, "")).strip()]
        numeric = sum(_as_number(v) is not None for v in values)
        types[col] = "number" if values and numeric / len(values) >= 0.8 else "text"
    return types


def table_overview(name: str, columns: list[str]) -> str:
    return (f"Structured table '{name}'. Each row is one record. "
            f"Columns: {', '.join(columns)}.")


def row_text(index: int, row: dict) -> str:
    pairs = "; ".join(f"{k}: {v}" for k, v in row.items() if str(v).strip())
    return f"Record #{index}: {pairs}."


def _extract_database(doc: Document, path: Path):
    """Parses structured database records (CSV, TSV, JSON, SQL)."""
    import csv
    import json

    sections, sections_meta = [], []
    raw_data = path.read_bytes()
    filename = doc.filename.lower()
    columns, rows_data = [], []

    if filename.endswith(".json"):
        try:
            parsed = json.loads(raw_data.decode("utf-8", errors="replace"))
            if isinstance(parsed, list) and len(parsed) > 0 and isinstance(parsed[0], dict):
                columns = list(parsed[0].keys())
                rows_data = parsed
            elif isinstance(parsed, dict):
                records_key = next((k for k, v in parsed.items() if isinstance(v, list) and len(v) > 0 and isinstance(v[0], dict)), None)
                if records_key:
                    columns = list(parsed[records_key][0].keys())
                    rows_data = parsed[records_key]
                else:
                    columns = ["Attribute", "Value"]
                    rows_data = [{"Attribute": k, "Value": str(v)} for k, v in parsed.items()]
        except Exception:
            columns = ["Data"]
            rows_data = [{"Data": raw_data.decode("utf-8", errors="replace")}]
    else:
        # CSV / TSV / SQL records
        delimiter = "\t" if filename.endswith(".tsv") else ","
        text_content = raw_data.decode("utf-8", errors="replace")
        try:
            reader = list(csv.reader(text_content.splitlines(), delimiter=delimiter))
            if reader:
                columns = [c.strip() for c in reader[0] if c.strip()]
                for r in reader[1:]:
                    if any(cell.strip() for cell in r):
                        row_dict = {columns[i]: r[i].strip() if i < len(r) else "" for i in range(len(columns))}
                        rows_data.append(row_dict)
        except Exception:
            columns = ["Record"]
            rows_data = [{"Record": line} for line in text_content.splitlines() if line.strip()]

    if not columns:
        columns = ["Record ID", "Content"]

    table_title = Path(doc.filename).stem.replace("_", " ").title()
    schema = {
        "table_name": table_title,
        "columns": columns,
        "row_count": len(rows_data),
        "primary_key": columns[0] if columns else "id",
    }

    sections_meta.append({
        "id": "sec_table_1",
        "heading": f"Database Table: {table_title}",
        "level": 1,
        "page": 1,
        "snippet": f"{len(rows_data)} records • Columns: {', '.join(columns[:6])}",
        "allowed_roles": [],
    })

    # Render preview page
    summary_lines = [
        f"DATABASE TABLE: {table_title}",
        f"TOTAL RECORDS: {len(rows_data)} | ATTRIBUTES: {len(columns)}",
        f"SCHEMA COLUMNS: {', '.join(columns)}",
        "=" * 60,
    ]
    for idx, r in enumerate(rows_data[:15], start=1):
        record_str = " | ".join(f"{k}: {v}" for k, v in list(r.items())[:5])
        summary_lines.append(f"#{idx}: {record_str}")

    page_renderer._render_text_document(
        f"Database Table: {table_title}",
        "\n".join(summary_lines),
        1,
        page_image_path(doc, 1),
        "Internal",
    )

    schema["column_types"] = column_types(columns, rows_data)
    sections.append((1, "table schema", table_overview(table_title, columns), f"Database Table: {table_title}"))
    tables = [{"sheet": table_title, "heading": f"Database Table: {table_title}",
               "columns": columns, "rows": rows_data[:MAX_ROWS]}]
    return sections, sections_meta, schema, tables


def _extract_image(doc: Document, path: Path) -> tuple[list[tuple[int, str, str, str]], list[dict], int]:
    pix = pymupdf.Pixmap(str(path))
    if pix.alpha or pix.n > 3:
        pix = pymupdf.Pixmap(pymupdf.csRGB, pix)
    png = pix.tobytes("png")
    page_image_path(doc, 1).write_bytes(png)
    text, engine = ocr.read_image(png)
    sec_meta = [{"id": "sec_1", "heading": "Image Content", "level": 1, "page": 1, "snippet": text[:150], "allowed_roles": []}]
    if not text:
        return [], sec_meta, 1
    return [(1, f"image · OCR ({engine})", f"[Text read from image]\n{text}", "Image Content")], sec_meta, 0


def _extract_xlsx(doc: Document, path: Path):
    """Every sheet becomes a table; every row becomes its own record and chunk,
    so a cell never loses its column name and rows can carry their own access."""
    sections, sec_meta, tables = [], [], []
    book = openpyxl.load_workbook(io.BytesIO(path.read_bytes()), data_only=True, read_only=True)
    for index, sheet in enumerate(book.worksheets, start=1):
        page_renderer.render_document_page(doc, index, path, page_image_path(doc, index))
        rows = [r for r in sheet.iter_rows(values_only=True) if any(c is not None for c in r)]
        if not rows:
            continue
        header = [str(c).strip() if c is not None else f"Column {i + 1}" for i, c in enumerate(rows[0])]
        sheet_heading = f"Spreadsheet Sheet: {sheet.title}"
        sec_meta.append({
            "id": f"sec_sheet_{index}", "heading": sheet_heading, "level": 1, "page": index,
            "snippet": f"Sheet {sheet.title} • {len(rows) - 1} rows", "allowed_roles": [],
        })
        records = [{h: ("" if c is None else c) for h, c in zip(header, row)} for row in rows[1:MAX_ROWS + 1]]
        sections.append((index, f"sheet {sheet.title}", table_overview(sheet.title, header), sheet_heading))
        tables.append({"sheet": sheet.title, "heading": sheet_heading, "columns": header,
                       "rows": records, "page": index})
    return sections, sec_meta, tables


def _extract_docx(doc: Document, path: Path) -> tuple[list[tuple[int, str, str, str]], list[dict], int]:
    """Extracts text, headings, and tables from DOCX files without heavy third-party dependencies."""
    import zipfile
    import xml.etree.ElementTree as ET

    sections, sections_meta = [], []
    current_heading = doc.title or "Overview"
    buf: list[str] = []
    sec_counter = 1

    try:
        with zipfile.ZipFile(path) as z:
            xml_bytes = z.read("word/document.xml")
        root = ET.fromstring(xml_bytes)

        body = root.find("{http://schemas.openxmlformats.org/wordprocessingml/2006/main}body")
        if body is None:
            body = root

        for child in body:
            tag = child.tag.split("}")[-1]
            if tag == "p":
                p_text = "".join(child.itertext()).strip()
                if not p_text:
                    continue
                is_heading = False
                pPr = child.find("{http://schemas.openxmlformats.org/wordprocessingml/2006/main}pPr")
                if pPr is not None:
                    pStyle = pPr.find("{http://schemas.openxmlformats.org/wordprocessingml/2006/main}pStyle")
                    if pStyle is not None:
                        val = pStyle.get("{http://schemas.openxmlformats.org/wordprocessingml/2006/main}val", "").lower()
                        if "heading" in val or "title" in val:
                            is_heading = True
                if not is_heading and len(p_text) < 90 and (p_text.isupper() or p_text.endswith(":") or bool(re.match(r"^(Section|Chapter|Part|\d+\.)\s+", p_text, re.IGNORECASE))):
                    is_heading = True

                if is_heading:
                    if buf:
                        sections.append((1, "section", "\n\n".join(buf), current_heading))
                        buf = []
                    current_heading = p_text.rstrip(":").strip()
                    sections_meta.append({
                        "id": f"sec_{sec_counter}",
                        "heading": current_heading,
                        "level": 1,
                        "page": 1,
                        "snippet": p_text[:150],
                        "allowed_roles": [],
                    })
                    sec_counter += 1
                else:
                    buf.append(p_text)

            elif tag == "tbl":
                rows = []
                for tr in child.iter("{http://schemas.openxmlformats.org/wordprocessingml/2006/main}tr"):
                    cells = []
                    for tc in tr.iter("{http://schemas.openxmlformats.org/wordprocessingml/2006/main}tc"):
                        c_text = "".join(tc.itertext()).strip()
                        cells.append(c_text)
                    if any(cells):
                        rows.append(cells)
                if rows:
                    headers = [c or f"Col_{i+1}" for i, c in enumerate(rows[0])]
                    md_lines = ["| " + " | ".join(headers) + " |", "| " + " | ".join("---" for _ in headers) + " |"]
                    rec_lines = []
                    for r_idx, row in enumerate(rows[1:], start=1):
                        md_lines.append("| " + " | ".join(row) + " |")
                        pairs = "; ".join(f"{h}: {v}" for h, v in zip(headers, row) if v)
                        rec_lines.append(f"Record #{r_idx}: {pairs}.")
                    tbl_content = f"Table ({current_heading}):\n" + "\n".join(md_lines) + "\n\nStructured Table Records:\n" + "\n".join(rec_lines)
                    sections.append((1, "table", tbl_content, current_heading))

        if buf:
            sections.append((1, "section", "\n\n".join(buf), current_heading))

    except Exception as exc:
        sections.append((1, "doc", f"Could not parse docx: {exc}", current_heading))

    if not sections_meta and sections:
        sections_meta.append({
            "id": "sec_1",
            "heading": current_heading,
            "level": 1,
            "page": 1,
            "snippet": sections[0][2][:150] if sections else "",
            "allowed_roles": [],
        })

    preview_text = "\n\n".join(s[2] for s in sections[:3])
    page_renderer._render_text_document(doc.title or "DOCX Document", preview_text, 1, page_image_path(doc, 1), "Internal")
    return sections, sections_meta, 0


def create_or_update_job(
    db, doc: Document, status: str, stage: str, error_code: str | None = None
) -> IngestionJob:
    job = db.execute(
        select(IngestionJob).where(IngestionJob.document_id == doc.id)
    ).scalars().first()
    if not job:
        job = IngestionJob(
            tenant_id=doc.tenant_id,
            document_id=doc.id,
            status=status,
            stage=stage,
            error_code=error_code,
        )
        db.add(job)
    else:
        job.status = status
        job.stage = stage
        job.error_code = error_code
        job.updated_at = now()
    db.commit()
    return job


def process_document(document_id: str) -> None:
    """Extract, sanitize, chunk and embed one document. Runs as a background task."""
    db = SessionLocal()
    try:
        doc = db.get(Document, document_id)
        if not doc:
            return
        create_or_update_job(db, doc, status="processing", stage="validation")
        path = doc_dir(doc) / ("original" + Path(doc.filename).suffix.lower())
        (doc_dir(doc) / "pages").mkdir(parents=True, exist_ok=True)
        try:
            create_or_update_job(db, doc, status="processing", stage="extraction")
            sections_meta, tables = [], []
            if doc.kind == "pdf":
                sections, sections_meta, unread = _extract_pdf(doc, path)
            elif doc.kind == "database":
                sections, sections_meta, schema, tables = _extract_database(doc, path)
                doc.data_schema = schema
                unread = 0
            elif doc.kind == "image":
                sections, sections_meta, unread = _extract_image(doc, path)
            elif doc.kind == "xlsx":
                sections, sections_meta, tables = _extract_xlsx(doc, path)
                unread = 0
                first = tables[0] if tables else {"columns": [], "rows": []}
                doc.data_schema = {
                    "table_name": first.get("sheet", doc.title), "columns": first["columns"],
                    "row_count": sum(len(t["rows"]) for t in tables),
                    "primary_key": first["columns"][0] if first["columns"] else "id",
                    "column_types": column_types(first["columns"], first["rows"]),
                    "sheets": [{"name": t["sheet"], "columns": t["columns"], "row_count": len(t["rows"])} for t in tables],
                }
            elif doc.kind == "docx":
                sections, sections_meta, unread = _extract_docx(doc, path)
            else:
                text_content = path.read_text("utf-8", errors="replace")
                sections_meta = [{"id": "sec_1", "heading": doc.title or "Text Document", "level": 1, "page": 1, "snippet": text_content[:150], "allowed_roles": []}]
                sections, unread = [(1, "text", text_content, doc.title or "Text Document")], 0
                page_renderer.render_document_page(doc, 1, path, page_image_path(doc, 1))

            doc.sections_metadata = sections_meta

            create_or_update_job(db, doc, status="processing", stage="sanitization")
            pieces, removed = [], 0
            for page, location, text, heading in sections:
                limit = 4000 if doc.kind in ("xlsx", "database") else 1200
                for part in split_text(text, limit):
                    clean, count = sanitize(part)
                    removed += count
                    breadcrumb = f"[{doc.title} | {heading} | Page {page}]\n"
                    enriched_text = breadcrumb + clean
                    pieces.append((page, location, enriched_text, heading))

            # Structured rows: one chunk per record so each row can carry its own access rule.
            row_meta: list[tuple[str, int, dict]] = []
            for table in tables:
                for i, row in enumerate(table["rows"], start=1):
                    clean, count = sanitize(row_text(i, row))
                    removed += count
                    crumb = f"[{doc.title} | {table['heading']} | Row {i}]\n"
                    pieces.append((table.get("page", 1), f"{table['sheet']} · row {i}", crumb + clean, table["heading"]))
                    row_meta.append((table["sheet"], i, {k: (v if isinstance(v, (int, float, str)) else str(v)) for k, v in row.items()}))

            create_or_update_job(db, doc, status="processing", stage="embedding")
            vectors = ai.embed([p[2] for p in pieces]) if pieces else []
            chunks = []
            for (page, location, text, heading), vector in zip(pieces, vectors):
                chunk = Chunk(tenant_id=doc.tenant_id, document_id=doc.id, page=page, location=location,
                              section_heading=heading, allowed_roles=[], text=text, embedding=vector)
                db.add(chunk)
                chunks.append(chunk)
            db.flush()
            first_row_chunk = len(chunks) - len(row_meta)
            for (sheet, idx, data), chunk in zip(row_meta, chunks[first_row_chunk:]):
                db.add(Record(tenant_id=doc.tenant_id, document_id=doc.id, chunk_id=chunk.id,
                              sheet=sheet, row_index=idx, data=data))
            doc.page_count = max(1, max([s[0] for s in sections], default=1))
            doc.flagged = removed > 0
            notes = []
            if unread:
                notes.append(
                    f"{unread} page(s) had no readable text, even after OCR."
                )
            if removed:
                notes.append(f"{removed} instruction-like passage(s) removed.")
            doc.note = " ".join(notes)
            doc.status = "active"
            db.commit()
            if doc.row_policy and row_meta:
                row_security.apply_row_policy(db, doc)
            create_or_update_job(db, doc, status="ready", stage="complete")
            if removed:
                audit.log(
                    db,
                    doc.tenant_id,
                    doc.owner_id,
                    "ingest.injection_flag",
                    "flagged",
                    document_id=doc.id,
                    passages_removed=removed,
                )
        except Exception as error:  # a broken file must not take the worker down
            db.rollback()
            doc.status = "failed"
            doc.note = f"Processing failed: {str(error)[:200]}"
            db.commit()
            create_or_update_job(db, doc, status="failed", stage="failed", error_code=str(error)[:200])
    finally:
        db.close()


def reprocess_document(document_id: str) -> None:
    """Removes existing chunks and re-runs processing."""
    db = SessionLocal()
    try:
        doc = db.get(Document, document_id)
        if not doc:
            return
        db.query(Record).filter(Record.document_id == doc.id).delete()
        chunk_ids = [c for (c,) in db.query(Chunk.id).filter(Chunk.document_id == doc.id).all()]
        if chunk_ids:
            from app.models import ChunkAccess
            db.query(ChunkAccess).filter(ChunkAccess.chunk_id.in_(chunk_ids)).delete(synchronize_session=False)
        db.query(Chunk).filter(Chunk.document_id == doc.id).delete()
        doc.status = "processing"
        doc.version = (doc.version or 1) + 1
        db.commit()
    finally:
        db.close()
    process_document(document_id)
