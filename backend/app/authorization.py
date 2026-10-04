"""The single place where read access is decided.

Rule (deny by default). A user can read a document only if it is active,
belongs to the user's tenant, and either:
  * the user has an individual grant on it, or
  * it is granted to everyone or to one of the user's roles, AND the user's
    clearance is at least the document's classification.

Every query that touches documents or chunks must go through readable_clause().
"""
from sqlalchemy import and_, exists, or_, select
from sqlalchemy.orm import Session

from app.models import LEVELS, Document, DocumentAccess, User


def readable_clause(user: User):
    role_ids = [r.id for r in user.roles]
    individual = exists().where(
        DocumentAccess.document_id == Document.id,
        DocumentAccess.subject_type == "user",
        DocumentAccess.subject_id == user.id,
    )
    broad_subjects = [DocumentAccess.subject_type == "everyone"]
    if role_ids:
        broad_subjects.append(
            and_(DocumentAccess.subject_type == "role", DocumentAccess.subject_id.in_(role_ids))
        )
    broad = exists().where(DocumentAccess.document_id == Document.id, or_(*broad_subjects))
    return and_(
        Document.tenant_id == user.tenant_id,
        Document.status == "active",
        or_(individual, and_(broad, Document.classification <= user.clearance)),
    )


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
    user_role_ids = {r.id for r in user.roles}
    for g in doc.access:
        if g.subject_type == "user" and g.subject_id == user.id:
            return True, "Individual grant"
    matched = None
    for g in doc.access:
        if g.subject_type == "everyone":
            matched = "Granted to everyone"
        elif g.subject_type == "role" and g.subject_id in user_role_ids:
            matched = f"Granted to role {role_names.get(g.subject_id, '?')}"
            break
    if not matched:
        return False, "No grant for this user or their roles"
    if doc.classification > user.clearance:
        return False, (
            f"Clearance {LEVELS[user.clearance]} is below classification "
            f"{LEVELS[doc.classification]}"
        )
    return True, matched
