"""Writes row- and section-level rules into the chunk_access table, where the
retrieval SQL enforces them (see authorization.chunk_rule_clause)."""
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.models import Chunk, ChunkAccess, Department, Document, Record, Role


def resolve_roles(db: Session, tenant_id: str, values: list[str]) -> list[str]:
    """Accepts role ids, names or slugs; returns role ids in this tenant."""
    if not values:
        return []
    wanted = {v.strip().lower() for v in values if v and v.strip()}
    roles = db.execute(select(Role).where(Role.tenant_id == tenant_id)).scalars().all()
    return [r.id for r in roles if r.id.lower() in wanted or r.name.lower() in wanted
            or (r.slug or "").lower() in wanted]


def set_chunk_roles(db: Session, chunk_ids: list[int], role_ids: list[str]) -> None:
    if not chunk_ids:
        return
    db.execute(delete(ChunkAccess).where(ChunkAccess.chunk_id.in_(chunk_ids)))
    for cid in chunk_ids:
        for rid in role_ids:
            db.add(ChunkAccess(chunk_id=cid, subject_type="role", subject_id=rid))


def apply_row_policy(db: Session, doc: Document) -> dict:
    """Restrict each record to the department (or role) named in one of its
    columns. Roles in full_access_roles see every row. Rows whose value matches
    no department/role are visible only to the full-access roles."""
    records = db.execute(select(Record).where(Record.document_id == doc.id)).scalars().all()
    chunk_ids = [r.chunk_id for r in records]
    if chunk_ids:
        db.execute(delete(ChunkAccess).where(ChunkAccess.chunk_id.in_(chunk_ids)))
    policy = doc.row_policy or {}
    column = policy.get("column")
    if not column or not records:
        db.commit()
        return {"restricted_rows": 0, "unmatched_rows": 0}

    kind = policy.get("subject_type", "department")
    if kind == "role":
        rows = db.execute(select(Role).where(Role.tenant_id == doc.tenant_id)).scalars().all()
        lookup = {}
        for r in rows:
            lookup[r.name.lower()] = r.id
            if r.slug:
                lookup[r.slug.lower()] = r.id
    else:
        rows = db.execute(select(Department).where(Department.tenant_id == doc.tenant_id)).scalars().all()
        lookup = {d.name.lower(): d.id for d in rows}
    full_access = resolve_roles(db, doc.tenant_id, policy.get("full_access_roles", []))

    unmatched = 0
    for rec in records:
        value = str((rec.data or {}).get(column, "")).strip().lower()
        subject = lookup.get(value)
        if subject:
            db.add(ChunkAccess(chunk_id=rec.chunk_id, subject_type=kind, subject_id=subject))
        else:
            unmatched += 1
        for rid in full_access:
            db.add(ChunkAccess(chunk_id=rec.chunk_id, subject_type="role", subject_id=rid))
        if not subject and not full_access:
            # Never leave a row open by accident: lock it to a subject nobody has.
            db.add(ChunkAccess(chunk_id=rec.chunk_id, subject_type="role", subject_id="__nobody__"))
    db.commit()
    return {"restricted_rows": len(records), "unmatched_rows": unmatched}


def restricted_chunk_count(db: Session, document_id: str) -> int:
    return db.execute(
        select(func.count(func.distinct(ChunkAccess.chunk_id)))
        .join(Chunk, Chunk.id == ChunkAccess.chunk_id)
        .where(Chunk.document_id == document_id)
    ).scalar_one()


def purge_document_chunks(db: Session, document_id: str) -> None:
    """Delete a document's chunks together with their records and access rules.

    SQLite does not enforce ON DELETE CASCADE by default and may reuse a freed
    chunk id, so leftover chunk_access rows would silently attach to the next
    upload's chunks. Always remove all three together.
    """
    chunk_ids = list(db.execute(select(Chunk.id).where(Chunk.document_id == document_id)).scalars())
    db.execute(delete(Record).where(Record.document_id == document_id))
    if chunk_ids:
        db.execute(delete(ChunkAccess).where(ChunkAccess.chunk_id.in_(chunk_ids)))
    db.execute(delete(Chunk).where(Chunk.document_id == document_id))


def remove_orphans(db: Session) -> int:
    """Startup clean-up for databases written before purge_document_chunks existed."""
    live = select(Chunk.id)
    n = db.execute(delete(ChunkAccess).where(ChunkAccess.chunk_id.not_in(live))).rowcount or 0
    n += db.execute(delete(Record).where(Record.chunk_id.not_in(live))).rowcount or 0
    db.commit()
    return n
