"""Maintenance: re-embed chunks after changing the embedding model, and move
legacy per-chunk role lists into the SQL-enforced chunk_access table.

    python -m app.reindex            # only chunks whose vector size is wrong
    python -m app.reindex --all      # every chunk
    python -m app.reindex --upgrade  # re-extract every document (OCR, row records)
                                     # and add new demo documents; users and grants stay
"""
import logging
import sys

from sqlalchemy import select

from app import ai, row_security
from app.db import SessionLocal, init_db
from app.models import Chunk, ChunkAccess, Document

logger = logging.getLogger(__name__)


def migrate_legacy_section_rules(db) -> int:
    """Chunks that only carry the old JSON allowed_roles get real chunk_access rows."""
    moved = 0
    guarded = set(db.execute(select(ChunkAccess.chunk_id)).scalars())
    for chunk in db.execute(select(Chunk).where(Chunk.allowed_roles.is_not(None))).scalars():
        if chunk.allowed_roles and chunk.id not in guarded:
            role_ids = row_security.resolve_roles(db, chunk.tenant_id, list(chunk.allowed_roles)) or ["__nobody__"]
            for rid in role_ids:
                db.add(ChunkAccess(chunk_id=chunk.id, subject_type="role", subject_id=rid))
            moved += 1
    db.commit()
    return moved


def reembed(db, everything: bool = False) -> int:
    probe = len(ai.embed_query("probe"))
    chunks = db.execute(select(Chunk)).scalars().all()
    todo = [c for c in chunks if everything or not c.embedding or len(c.embedding) != probe]
    for i in range(0, len(todo), 100):
        batch = todo[i : i + 100]
        for chunk, vec in zip(batch, ai.embed([c.text for c in batch])):
            chunk.embedding = vec
        db.commit()
    return len(todo)


def reapply_row_policies(db) -> int:
    docs = db.execute(select(Document).where(Document.row_policy.is_not(None))).scalars().all()
    for doc in docs:
        row_security.apply_row_policy(db, doc)
    return len(docs)


def reprocess_all(db) -> int:
    from app import ingestion
    ids = list(db.execute(select(Document.id).where(Document.status.in_(["active", "failed", "flagged"]))).scalars())
    for doc_id in ids:
        ingestion.reprocess_document(doc_id)
        print("  reprocessed", db.get(Document, doc_id).title, flush=True)
    return len(ids)


if __name__ == "__main__":
    init_db()
    if "--upgrade" in sys.argv:
        from app.seed import add_missing_demo_docs
        with SessionLocal() as session:
            print("documents re-extracted:", reprocess_all(session))
            print("demo documents added:", add_missing_demo_docs(session))
    with SessionLocal() as session:
        print("legacy section rules moved:", migrate_legacy_section_rules(session))
        print("chunks re-embedded:", reembed(session, "--all" in sys.argv))
        print("row policies applied:", reapply_row_policies(session))
