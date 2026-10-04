from sqlalchemy.orm import Session

from app.models import AuditEvent


def log(db: Session, tenant_id: str, user_id: str | None, action: str, decision: str, **detail) -> None:
    """Audit events hold ids and decisions only, never questions or document text."""
    db.add(AuditEvent(tenant_id=tenant_id, user_id=user_id, action=action,
                      decision=decision, detail=detail))
    db.commit()
