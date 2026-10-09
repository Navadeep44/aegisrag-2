"""The single place where read access is decided.

Rule (deny by default). A user can read a document only if it is active,
belongs to the user's tenant, and either:
  * the user has an individual grant on it, or
  * it is granted to everyone or to one of the user's roles, AND the user's
    clearance is at least the document's classification.

Admin, owner, platform admin, auditor, and uploader do not gain content
access implicitly.
Every query that touches documents goes through readable_clause(); every query
that touches chunks or records goes through readable_chunk_clause(), which adds
the row/section-level rule on top.
"""
from datetime import datetime, timezone
from sqlalchemy import and_, exists, or_, select
from sqlalchemy.orm import Session

from app.models import LEVELS, Chunk, ChunkAccess, Document, DocumentAccess, User, now


def readable_clause(user: User):
    current_time = now()
    role_ids = [r.id for r in user.roles]

    unexpired = or_(
        DocumentAccess.expires_at.is_(None),
        DocumentAccess.expires_at > current_time
    )

    individual = exists().where(
        DocumentAccess.document_id == Document.id,
        DocumentAccess.subject_type == "user",
        DocumentAccess.subject_id == user.id,
        unexpired,
    )
    broad_subjects = [DocumentAccess.subject_type == "everyone"]
    if role_ids:
        broad_subjects.append(
            and_(DocumentAccess.subject_type == "role", DocumentAccess.subject_id.in_(role_ids))
        )
    if user.department_id:
        broad_subjects.append(
            and_(DocumentAccess.subject_type == "department", DocumentAccess.subject_id == user.department_id)
        )
    broad = exists().where(
        DocumentAccess.document_id == Document.id,
        or_(*broad_subjects),
        unexpired,
    )
    return and_(
        Document.tenant_id == user.tenant_id,
        Document.status == "active",
        or_(individual, and_(broad, Document.classification <= user.clearance)),
    )


def chunk_rule_clause(user: User):
    """Row/section-level rule. A chunk with no ChunkAccess rows is visible to
    anyone who can read its document; otherwise one row must match the user.
    Applies to admins too: administering access is not reading content."""
    subjects = [and_(ChunkAccess.subject_type == "user", ChunkAccess.subject_id == user.id)]
    role_keys = [r.id for r in user.roles]
    if role_keys:
        subjects.append(and_(ChunkAccess.subject_type == "role", ChunkAccess.subject_id.in_(role_keys)))
    if user.department_id:
        subjects.append(and_(ChunkAccess.subject_type == "department",
                             ChunkAccess.subject_id == user.department_id))
    restricted = exists().where(ChunkAccess.chunk_id == Chunk.id)
    matched = exists().where(ChunkAccess.chunk_id == Chunk.id, or_(*subjects))
    return or_(~restricted, matched)


def readable_chunk_clause(user: User):
    """Use with a query that joins Chunk to Document."""
    return and_(readable_clause(user), Chunk.tenant_id == user.tenant_id, chunk_rule_clause(user))


def can_read(db: Session, user: User, document_id: str) -> bool:
    stmt = select(Document.id).where(Document.id == document_id, readable_clause(user))
    return db.execute(stmt).first() is not None


def readable_document_ids(db: Session, user: User) -> set[str]:
    return set(db.execute(select(Document.id).where(readable_clause(user))).scalars())


def explain(user: User, doc: Document, role_names: dict[str, str]) -> tuple[bool, str]:
    """Human-readable reason for a decision. Used by the simulator only;
    enforcement always uses readable_clause()."""
    if doc.tenant_id != user.tenant_id:
        return False, "Belongs to another organization"
    if doc.status != "active":
        return False, f"Document is {doc.status}"
    
    current_time = now()
    user_role_ids = {r.id for r in user.roles}
    
    for g in doc.access:
        if g.expires_at and g.expires_at <= current_time:
            continue
        if g.subject_type == "user" and g.subject_id == user.id:
            return True, "Individual grant"
            
    matched = None
    for g in doc.access:
        if g.expires_at and g.expires_at <= current_time:
            continue
        if g.subject_type == "everyone":
            matched = "Granted to everyone"
        elif g.subject_type == "role" and g.subject_id in user_role_ids:
            matched = f"Granted to role {role_names.get(g.subject_id, '?')}"
            break
        elif g.subject_type == "department" and user.department_id and g.subject_id == user.department_id:
            matched = f"Granted to department {user.department_id}"
            break
            
    if not matched:
        return False, "No grant for this user or their roles"
    if doc.classification > user.clearance:
        return False, (
            f"Clearance {LEVELS[user.clearance]} is below classification "
            f"{LEVELS[doc.classification]}"
        )
    return True, matched
