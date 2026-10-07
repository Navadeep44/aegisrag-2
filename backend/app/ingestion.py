import hashlib
import io
import re
import shutil
from pathlib import Path

import openpyxl
import pymupdf
from sqlalchemy import select

from app import ai, audit, page_renderer
from app.config import settings
from app.db import SessionLocal
from app.models import Chunk, Document, IngestionJob, now

MAGIC = {
    ".pdf": ("pdf", b"%PDF"),
    ".png": ("image", b"\x89PNG"),
    ".jpg": ("image", b"\xff\xd8"),
    ".jpeg": ("image", b"\xff\xd8"),
    ".xlsx": ("xlsx", b"PK"),
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
        raise ValueError("Unsupported file type. Upload a PDF, CSV, TSV, JSON database export, XLSX or image file.")
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


def sanitize(text: str) -> tuple[str, int]:
    """Replace instruction-like sentences in document text. Returns (clean text, count removed)."""
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
    chunks, current = [], ""
    for para in re.split(r"\n\s*\n", text):
        para = para.strip()
        if not para:
            continue
        while len(para) > max_chars:
            cut = para.rfind(". ", 0, max_chars)
            cut = cut + 1 if cut > max_chars // 2 else max_chars
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
    """Extracts pages, detect precise section headings from outlines/bookmarks and font metrics."""
    sections, sections_meta, unread = [], [], 0
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

        current_heading = "Overview"
        current_level = 1
        sec_counter = 1

        for number, page in enumerate(pdf, start=1):
            png = page.get_pixmap(dpi=110).tobytes("png")
            page_image_path(doc, number).write_bytes(png)
            text = page.get_text().strip()

            # Handle headings from TOC on this page
            if number in toc_by_page:
                for lvl, title in toc_by_page[number]:
                    current_heading = title
                    current_level = lvl
                    sections_meta.append({
                        "id": f"sec_{sec_counter}",
                        "heading": current_heading,
                        "level": current_level,
                        "page": number,
                        "snippet": f"Page {number} • {current_heading}",
                        "allowed_roles": [],
                    })
                    sec_counter += 1

            # Font-based structural heading detection fallback
            if number not in toc_by_page and text:
                blocks = page.get_text("blocks")
                for b in blocks:
                    b_text = b[4].strip()
                    lines = [l.strip() for l in b_text.splitlines() if l.strip()]
                    if lines:
                        first_line = lines[0]
                        looks_like_heading = bool(
                            re.match(r"^(Chapter|Section|Article|Part|\d+(\.\d+)*)\b", first_line, re.IGNORECASE)
                            or (first_line.isupper() and 3 < len(first_line) < 60)
                            or (len(first_line) <= 60 and first_line == first_line.title() and not first_line.endswith((".", ",", ";", ":")))
                        )
                        if looks_like_heading and 4 <= len(first_line) <= 75:
                            if not any(s["heading"].lower() == first_line.lower() for s in sections_meta):
                                current_heading = first_line
                                current_level = 1 if re.match(r"^\d+\b", first_line) else 2
                                snippet = " ".join(lines[1:])[:150] if len(lines) > 1 else first_line
                                sections_meta.append({
                                    "id": f"sec_{sec_counter}",
                                    "heading": current_heading,
                                    "level": current_level,
                                    "page": number,
                                    "snippet": snippet,
                                    "allowed_roles": [],
                                })
                                sec_counter += 1
                                break

            has_visuals = bool(page.get_images()) or len(page.get_drawings()) > 8
            if len(text) < 40 or has_visuals:
                seen = ai.describe_image(png).strip()
                if seen:
                    text = seen if len(text) < 40 else f"{text}\n\n[Visual content]\n{seen}"

            if not text:
                unread += 1
                continue
            sections.append((number, f"page {number}", text, current_heading))

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


def _extract_database(doc: Document, path: Path) -> tuple[list[tuple[int, str, str, str]], list[dict], dict]:
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

    batch_size = 5
    total_batches = max(1, (len(rows_data) + batch_size - 1) // batch_size)
    for b_idx in range(total_batches):
        chunk_rows = rows_data[b_idx * batch_size : (b_idx + 1) * batch_size]
        lines = [f"Database Table: {table_title} (Records {b_idx * batch_size + 1}-{b_idx * batch_size + len(chunk_rows)})"]
        for r_idx, r in enumerate(chunk_rows, start=b_idx * batch_size + 1):
            pairs = "; ".join(f"{k}: {v}" for k, v in r.items() if str(v).strip())
            lines.append(f"Record #{r_idx}: {pairs}.")
        content = "\n".join(lines)
        loc = f"records {b_idx * batch_size + 1}-{b_idx * batch_size + len(chunk_rows)}"
        heading = f"{table_title} (Records {b_idx * batch_size + 1}-{b_idx * batch_size + len(chunk_rows)})"
        sections.append((1, loc, content, heading))

    return sections, sections_meta, schema


def _extract_image(doc: Document, path: Path) -> tuple[list[tuple[int, str, str, str]], list[dict], int]:
    png = pymupdf.Pixmap(str(path)).tobytes("png")
    page_image_path(doc, 1).write_bytes(png)
    text = ai.describe_image(png).strip()
    sec_meta = [{"id": "sec_1", "heading": "Image Content", "level": 1, "page": 1, "snippet": text[:150], "allowed_roles": []}]
    return ([(1, "image", text, "Image Content")], sec_meta, 0) if text else ([], sec_meta, 1)


def _extract_xlsx(doc: Document, path: Path) -> tuple[list[tuple[int, str, str, str]], list[dict], int]:
    """Each row becomes 'Header: value; ...' so a cell never loses its column name."""
    sections, sec_meta = [], []
    book = openpyxl.load_workbook(io.BytesIO(path.read_bytes()), data_only=True, read_only=True)
    for index, sheet in enumerate(book.worksheets, start=1):
        page_renderer.render_document_page(doc, index, path, page_image_path(doc, index))
        rows = [r for r in sheet.iter_rows(values_only=True) if any(c is not None for c in r)]
        if not rows:
            continue
        header = [str(c) if c is not None else f"Column {i + 1}" for i, c in enumerate(rows[0])]
        sheet_heading = f"Spreadsheet Sheet: {sheet.title}"
        sec_meta.append({
            "id": f"sec_sheet_{index}",
            "heading": sheet_heading,
            "level": 1,
            "page": index,
            "snippet": f"Sheet {sheet.title} • {len(rows)} rows",
            "allowed_roles": [],
        })
        for start in range(1, len(rows), 25):
            block = rows[start : start + 25]
            lines = [f"Sheet: {sheet.title}"]
            for row in block:
                cells = [f"{h}: {c}" for h, c in zip(header, row) if c is not None]
                lines.append("; ".join(cells) + ".")
            location = f"sheet {sheet.title}, rows {start + 1}-{start + len(block)}"
            sections.append((index, location, "\n".join(lines), sheet_heading))
    return sections, sec_meta, 0


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
        try:
            create_or_update_job(db, doc, status="processing", stage="extraction")
            sections_meta = []
            if doc.kind == "pdf":
                sections, sections_meta, unread = _extract_pdf(doc, path)
            elif doc.kind == "database":
                sections, sections_meta, schema = _extract_database(doc, path)
                doc.data_schema = schema
                unread = 0
            elif doc.kind == "image":
                sections, sections_meta, unread = _extract_image(doc, path)
            elif doc.kind == "xlsx":
                sections, sections_meta, unread = _extract_xlsx(doc, path)
            else:
                text_content = path.read_text("utf-8", errors="replace")
                sections_meta = [{"id": "sec_1", "heading": doc.title or "Text Document", "level": 1, "page": 1, "snippet": text_content[:150], "allowed_roles": []}]
                sections, unread = [(1, "text", text_content, doc.title or "Text Document")], 0
                page_renderer.render_document_page(doc, 1, path, page_image_path(doc, 1))

            doc.sections_metadata = sections_meta

            create_or_update_job(db, doc, status="processing", stage="sanitization")
            pieces, removed = [], 0
            for page, location, text, heading in sections:
                limit = 4000 if doc.kind in ("xlsx", "database") else 900
                for part in split_text(text, limit):
                    clean, count = sanitize(part)
                    removed += count
                    pieces.append((page, location, clean, heading))

            create_or_update_job(db, doc, status="processing", stage="embedding")
            vectors = ai.embed([p[2] for p in pieces]) if pieces else []
            for (page, location, text, heading), vector in zip(pieces, vectors):
                db.add(
                    Chunk(
                        tenant_id=doc.tenant_id,
                        document_id=doc.id,
                        page=page,
                        location=location,
                        section_heading=heading,
                        allowed_roles=[],
                        text=text,
                        embedding=vector,
                    )
                )
            doc.page_count = max(1, max([s[0] for s in sections], default=1))
            doc.flagged = removed > 0
            notes = []
            if unread:
                notes.append(
                    f"{unread} page(s) had no readable text. Configure a vision model to read scans and images."
                )
            if removed:
                notes.append(f"{removed} instruction-like passage(s) removed.")
            doc.note = " ".join(notes)
            doc.status = "active"
            db.commit()
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
        db.query(Chunk).filter(Chunk.document_id == doc.id).delete()
        doc.status = "processing"
        doc.version = (doc.version or 1) + 1
        db.commit()
    finally:
        db.close()
    process_document(document_id)
