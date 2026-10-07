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
        raise ValueError("Unsupported file type. Upload a PDF, PNG, JPG, XLSX, TXT or MD file.")
    kind, magic = MAGIC[ext]
    if magic and not data.startswith(magic):
        raise ValueError(f"File content does not match its {ext} extension.")
    if kind == "text":
        try:
            if "\x00" in data.decode("utf-8"):
                raise ValueError
        except ValueError:
            raise ValueError("Text files must be valid UTF-8.")
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


def _extract_pdf(doc: Document, path: Path) -> tuple[list[tuple[int, str, str]], int]:
    sections, unread = [], 0
    with pymupdf.open(path) as pdf:
        for number, page in enumerate(pdf, start=1):
            png = page.get_pixmap(dpi=110).tobytes("png")
            page_image_path(doc, number).write_bytes(png)
            text = page.get_text().strip()
            has_visuals = bool(page.get_images()) or len(page.get_drawings()) > 8
            if len(text) < 40 or has_visuals:
                seen = ai.describe_image(png).strip()
                if seen:
                    text = seen if len(text) < 40 else f"{text}\n\n[Visual content]\n{seen}"
            if not text:
                unread += 1
                continue
            sections.append((number, f"page {number}", text))
    return sections, unread


def _extract_image(doc: Document, path: Path) -> tuple[list[tuple[int, str, str]], int]:
    png = pymupdf.Pixmap(str(path)).tobytes("png")
    page_image_path(doc, 1).write_bytes(png)
    text = ai.describe_image(png).strip()
    return ([(1, "image", text)], 0) if text else ([], 1)


def _extract_xlsx(doc: Document, path: Path) -> tuple[list[tuple[int, str, str]], int]:
    """Each row becomes 'Header: value; ...' so a cell never loses its column name."""
    sections = []
    book = openpyxl.load_workbook(io.BytesIO(path.read_bytes()), data_only=True, read_only=True)
    for index, sheet in enumerate(book.worksheets, start=1):
        # Render visual sheet preview image
        page_renderer.render_document_page(doc, index, path, page_image_path(doc, index))
        rows = [r for r in sheet.iter_rows(values_only=True) if any(c is not None for c in r)]
        if not rows:
            continue
        header = [str(c) if c is not None else f"Column {i + 1}" for i, c in enumerate(rows[0])]
        for start in range(1, len(rows), 25):
            block = rows[start : start + 25]
            lines = [f"Sheet: {sheet.title}"]
            for row in block:
                cells = [f"{h}: {c}" for h, c in zip(header, row) if c is not None]
                lines.append("; ".join(cells) + ".")
            location = f"sheet {sheet.title}, rows {start + 1}-{start + len(block)}"
            sections.append((index, location, "\n".join(lines)))
    return sections, 0


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
            if doc.kind == "pdf":
                sections, unread = _extract_pdf(doc, path)
            elif doc.kind == "image":
                sections, unread = _extract_image(doc, path)
            elif doc.kind == "xlsx":
                sections, unread = _extract_xlsx(doc, path)
            else:
                text_content = path.read_text("utf-8", errors="replace")
                sections, unread = [(1, "text", text_content)], 0
                page_renderer.render_document_page(doc, 1, path, page_image_path(doc, 1))

            create_or_update_job(db, doc, status="processing", stage="sanitization")
            pieces, removed = [], 0
            for page, location, text in sections:
                limit = 4000 if doc.kind == "xlsx" else 900
                for part in split_text(text, limit):
                    clean, count = sanitize(part)
                    removed += count
                    pieces.append((page, location, clean))

            create_or_update_job(db, doc, status="processing", stage="embedding")
            vectors = ai.embed([p[2] for p in pieces]) if pieces else []
            for (page, location, text), vector in zip(pieces, vectors):
                db.add(
                    Chunk(
                        tenant_id=doc.tenant_id,
                        document_id=doc.id,
                        page=page,
                        location=location,
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
