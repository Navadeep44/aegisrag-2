"""Audit log writer. Events store ids and decisions only, never question or
document text, so the log itself cannot leak content.
"""
import uuid
from sqlalchemy.orm import Session

from app.models import AuditEvent, now


def log(
    db: Session,
    tenant_id: str,
    user_id: str | None,
    action: str,
    decision: str,
    actor: str | None = None,
    target: str | None = None,
    correlation_id: str | None = None,
    **detail,
) -> AuditEvent:
    """Audit events hold ids and decisions only, never questions or document text."""
    event = AuditEvent(
        tenant_id=tenant_id,
        user_id=user_id,
        actor=actor or user_id or "system",
        action=action,
        target=target or detail.get("document_id") or detail.get("target_user_id"),
        decision=decision,
        correlation_id=correlation_id or uuid.uuid4().hex[:12],
        detail=detail,
        created_at=now(),
    )
    db.add(event)
    db.commit()
    return event
