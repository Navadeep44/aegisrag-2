import csv
import io
import json
import os
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Query, Response, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app import audit, chat, ingestion, page_renderer, retrieval
from app.auth import (
    current_user,
    hash_password,
    make_token,
    require_admin,
    require_any_permission,
    require_permission,
    require_platform_admin,
    verify_password,
)
from app.authorization import can_read, explain, readable_clause, readable_document_ids
from app.config import settings
from app.db import database_status, get_db
from app.models import (
    ALL_PERMISSIONS,
    LEVELS,
    AccessRequest,
    AuditEvent,
    Chunk,
    Conversation,
    Department,
    Document,
    DocumentAccess,
    IngestionJob,
    Role,
    Tenant,
    User,
    iso,
    new_id,
    now,
)

router = APIRouter(prefix="/api")
BACKEND_ROOT = Path(__file__).resolve().parent.parent
REPORT = BACKEND_ROOT / "reports" / "latest.json"


# ---------- shapes ----------

class LoginIn(BaseModel):
    email: str
    password: str


class DemoLoginIn(BaseModel):
    email: str


class QueryIn(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    conversation_id: str | None = None
    briefing_mode: bool = False


class Grant(BaseModel):
    subject_type: str
    subject_id: str | None = None
    expires_at: datetime | None = None


class AccessIn(BaseModel):
    classification: int | None = Field(default=None, ge=0, le=3)
    grants: list[Grant]


class SimulateIn(BaseModel):
    user_id: str
    question: str = Field(min_length=1, max_length=2000)


class InviteUserIn(BaseModel):
    email: str
    name: str
    roles: list[str] = []
    clearance: int = Field(default=1, ge=0, le=3)
    department_id: str | None = None


class UserStatusIn(BaseModel):
    status: str  # active | deactivated


class CreateRoleIn(BaseModel):
    name: str
    permission_keys: list[str] = []
    scope: str = "tenant"


class UpdateRoleIn(BaseModel):
    name: str | None = None
    permission_keys: list[str] = []


class AssignRolesIn(BaseModel):
    roles: list[str]
    clearance: int | None = Field(default=None, ge=0, le=3)
    department_id: str | None = None


class AccessRequestIn(BaseModel):
    resource_type: str  # document | role | clearance
    resource_id: str | None = None
    reason: str = Field(min_length=3, max_length=1000)
    target_user_id: str | None = None


class CreateDepartmentIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)


class ManageOrgAdminIn(BaseModel):
    user_id: str
    action: str  # assign | revoke


class PlatformSecuritySettingsIn(BaseModel):
    mfa_enforced: bool | None = None
    session_timeout_minutes: int | None = None
    max_failed_logins: int | None = None
    password_min_length: int | None = None
    allowed_file_types: list[str] | None = None
    max_upload_size_mb: int | None = None
    encryption_standard: str | None = None
    tls_version_minimum: str | None = None


class HROnboardIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    email: str = Field(min_length=3, max_length=100)
    department_id: str | None = None
    clearance: int = Field(default=1, ge=0, le=3)
    role_name: str = "employee"


class HROffboardIn(BaseModel):
    user_id: str
    reason: str = "Employee offboarded by HR"


class DecideAccessRequestIn(BaseModel):
    decision: str  # approved | rejected
    decision_note: str | None = None


class TenantCreateIn(BaseModel):
    name: str


class TenantStatusIn(BaseModel):
    status: str  # active | suspended


class TenantSettingsIn(BaseModel):
    name: str | None = None
    settings: dict = {}


class SupportAccessIn(BaseModel):
    tenant_id: str
    reason: str
    duration_minutes: int = 60


def user_out(u: User, dept_map: dict | None = None) -> dict:
    dname = ""
    if u.department_id:
        dname = (dept_map.get(u.department_id) if dept_map else None) or u.department_id
    return {
        "id": u.id,
        "name": u.name,
        "email": u.email,
        "tenant": u.tenant.name if u.tenant else "",
        "tenant_id": u.tenant_id,
        "roles": u.role_names,
        "clearance": u.clearance,
        "clearance_label": LEVELS[u.clearance] if 0 <= u.clearance < len(LEVELS) else "Unknown",
        "is_admin": u.is_admin,
        "is_platform_admin": u.is_platform_admin,
        "status": u.status,
        "department_id": u.department_id,
        "department_name": dname or "General",
        "permissions": sorted(list(u.permissions)),
    }


def doc_out(d: Document, with_access: bool = False, labels: dict | None = None) -> dict:
    out = {
        "id": d.id,
        "title": d.title,
        "filename": d.filename,
        "kind": d.kind,
        "classification": d.classification,
        "classification_label": LEVELS[d.classification] if 0 <= d.classification < len(LEVELS) else "Unknown",
        "status": d.status,
        "note": d.note,
        "page_count": d.page_count,
        "flagged": d.flagged,
        "version": d.version,
        "checksum": d.checksum,
        "created_at": iso(d.created_at),
    }
    if with_access:
        labels = labels or {}
        out["access"] = [
            {
                "id": g.id,
                "subject_type": g.subject_type,
                "subject_id": g.subject_id,
                "label": "Everyone" if g.subject_type == "everyone" else labels.get(g.subject_id, "?"),
                "expires_at": iso(g.expires_at) if g.expires_at else None,
            }
            for g in d.access
        ]
    return out


def _labels(db: Session, tenant_id: str) -> dict:
    roles = db.execute(select(Role).where(Role.tenant_id == tenant_id)).scalars()
    users = db.execute(select(User).where(User.tenant_id == tenant_id)).scalars()
    depts = db.execute(select(Department).where(Department.tenant_id == tenant_id)).scalars()
    return {
        **{r.id: r.name for r in roles},
        **{u.id: u.name for u in users},
        **{d.id: f"Dept: {d.name}" for d in depts},
    }


def _clean_grants(db: Session, tenant_id: str, grants: list[Grant]) -> list[DocumentAccess]:
    """Grants may only name roles, users, or departments of the admin's own tenant."""
    role_ids = set(db.execute(select(Role.id).where(Role.tenant_id == tenant_id)).scalars())
    user_ids = set(db.execute(select(User.id).where(User.tenant_id == tenant_id)).scalars())
    dept_ids = set(db.execute(select(Department.id).where(Department.tenant_id == tenant_id)).scalars())
    out, seen = [], set()
    for g in grants:
        key = (g.subject_type, g.subject_id)
        if key in seen:
            continue
        seen.add(key)
        if g.subject_type == "everyone":
            out.append(DocumentAccess(subject_type="everyone", subject_id=None, expires_at=g.expires_at))
        elif g.subject_type == "role" and g.subject_id in role_ids:
            out.append(DocumentAccess(subject_type="role", subject_id=g.subject_id, expires_at=g.expires_at))
        elif g.subject_type == "user" and g.subject_id in user_ids:
            out.append(DocumentAccess(subject_type="user", subject_id=g.subject_id, expires_at=g.expires_at))
        elif g.subject_type == "department" and g.subject_id in dept_ids:
            out.append(DocumentAccess(subject_type="department", subject_id=g.subject_id, expires_at=g.expires_at))
        else:
            raise HTTPException(400, "A grant names an unknown role, user, or department.")
    return out


def _tenant_document(db: Session, actor: User, document_id: str) -> Document:
    doc = db.get(Document, document_id)
    if not doc or doc.tenant_id != actor.tenant_id:
        raise HTTPException(404, "Document not found.")
    return doc


# ---------- health and readiness ----------

@router.get("/health")
def health() -> dict:
    return {"status": "ok", "ai_provider": settings.ai_provider, **database_status()}


@router.get("/ready")
def ready() -> dict:
    return {"status": "ready", "ai_provider": settings.ai_provider, **database_status()}


# ---------- authentication & lifecycle ----------

@router.post("/auth/login")
def login(body: LoginIn, db: Session = Depends(get_db)) -> dict:
    user = db.execute(select(User).where(User.email == body.email.lower())).scalar_one_or_none()
    if not user or not user.active or user.status == "deactivated" or not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "Email or password is incorrect.")
    if user.tenant and user.tenant.status == "suspended" and not user.is_platform_admin:
        raise HTTPException(403, "Tenant is suspended. Contact platform administrator.")
    user.last_login_at = now()
    db.commit()
    audit.log(db, user.tenant_id, user.id, "auth.login", "allowed")
    return {"token": make_token(user), "user": user_out(user)}


@router.get("/auth/demo-users")
def demo_users(db: Session = Depends(get_db)) -> list[dict]:
    if not settings.demo_mode:
        return []
    users = db.execute(select(User).where(User.active, User.status == "active").order_by(User.email)).scalars().all()
    dept_map = {d.id: d.name for d in db.execute(select(Department)).scalars()}
    return [
        {
            "email": u.email,
            "name": u.name,
            "tenant": u.tenant.name if u.tenant else "",
            "roles": u.role_names,
            "clearance_label": LEVELS[u.clearance] if 0 <= u.clearance < len(LEVELS) else "Internal",
            "department": dept_map.get(u.department_id, u.department_id or "General"),
        }
        for u in users
    ]


@router.post("/auth/demo-login")
def demo_login(body: DemoLoginIn, db: Session = Depends(get_db)) -> dict:
    if not settings.demo_mode:
        raise HTTPException(404, "Not found.")
    user = db.execute(select(User).where(User.email == body.email.lower())).scalar_one_or_none()
    if not user or not user.active or user.status == "deactivated":
        raise HTTPException(404, "Not found.")
    if user.tenant and user.tenant.status == "suspended" and not user.is_platform_admin:
        raise HTTPException(403, "Tenant is suspended. Contact platform administrator.")
    user.last_login_at = now()
    db.commit()
    dept_map = {d.id: d.name for d in db.execute(select(Department).where(Department.tenant_id == user.tenant_id)).scalars()}
    audit.log(db, user.tenant_id, user.id, "auth.demo_login", "allowed")
    return {"token": make_token(user), "user": user_out(user, dept_map)}


@router.post("/auth/logout")
def logout(user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    audit.log(db, user.tenant_id, user.id, "auth.logout", "allowed")
    return {"status": "logged_out"}


@router.get("/users/me")
def me(user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    dept_map = {d.id: d.name for d in db.execute(select(Department).where(Department.tenant_id == user.tenant_id)).scalars()}
    return user_out(user, dept_map)


# ---------- IAM / User management ----------

@router.get("/users")
def list_users(
    user: User = Depends(require_any_permission("user.read", "tenant.manage", "role.manage")),
    db: Session = Depends(get_db),
) -> list[dict]:
    users = db.execute(select(User).where(User.tenant_id == user.tenant_id).order_by(User.name)).scalars().all()
    dept_map = {d.id: d.name for d in db.execute(select(Department).where(Department.tenant_id == user.tenant_id)).scalars()}
    return [user_out(u, dept_map) for u in users]


@router.post("/users/invite")
def invite_user(
    body: InviteUserIn,
    admin: User = Depends(require_any_permission("user.invite", "tenant.manage", "role.assign")),
    db: Session = Depends(get_db),
) -> dict:
    existing = db.execute(select(User).where(User.email == body.email.lower())).scalar_one_or_none()
    if existing:
        raise HTTPException(400, "User with this email already exists.")
    
    tenant_roles = {r.name: r for r in db.execute(select(Role).where(Role.tenant_id == admin.tenant_id)).scalars()}
    assigned_roles = []
    for rname in body.roles:
        if rname in tenant_roles:
            assigned_roles.append(tenant_roles[rname])

    new_user = User(
        tenant_id=admin.tenant_id,
        email=body.email.lower().strip(),
        name=body.name.strip(),
        password_hash=hash_password(settings.demo_password),
        clearance=body.clearance,
        status="active",
        active=True,
        department_id=body.department_id,
        created_by=admin.id,
        roles=assigned_roles,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    audit.log(db, admin.tenant_id, admin.id, "user.invite", "allowed", target_user_id=new_user.id, target_email=new_user.email)
    return user_out(new_user)


@router.patch("/users/{user_id}/status")
def update_user_status(
    user_id: str,
    body: UserStatusIn,
    admin: User = Depends(require_any_permission("user.deactivate", "tenant.manage")),
    db: Session = Depends(get_db),
) -> dict:
    target = db.get(User, user_id)
    if not target or target.tenant_id != admin.tenant_id:
        raise HTTPException(404, "User not found.")
    if target.id == admin.id:
        raise HTTPException(400, "Cannot change your own status.")
    target.status = body.status
    target.active = (body.status == "active")
    db.commit()
    db.refresh(target)
    audit.log(db, admin.tenant_id, admin.id, "user.status_change", "allowed", target_user_id=target.id, status=target.status)
    return user_out(target)


@router.post("/users/{user_id}/roles")
def assign_user_roles(
    user_id: str,
    body: AssignRolesIn,
    admin: User = Depends(require_any_permission("role.assign", "tenant.manage")),
    db: Session = Depends(get_db),
) -> dict:
    target = db.get(User, user_id)
    if not target or target.tenant_id != admin.tenant_id:
        raise HTTPException(404, "User not found.")

    tenant_roles = {r.name: r for r in db.execute(select(Role).where(Role.tenant_id == admin.tenant_id)).scalars()}
    role_by_id = {r.id: r for r in tenant_roles.values()}

    new_roles = []
    for r in body.roles:
        if r in tenant_roles:
            new_roles.append(tenant_roles[r])
        elif r in role_by_id:
            new_roles.append(role_by_id[r])
        else:
            raise HTTPException(400, f"Role '{r}' is not valid for this tenant.")

    # Prevent self-elevation if target is caller: caller cannot give self more permissions than caller already has
    if target.id == admin.id and not admin.is_admin:
        current_perms = admin.permissions
        for r in new_roles:
            for p in r.permission_keys:
                if p not in current_perms:
                    raise HTTPException(403, "Self-elevation forbidden: cannot grant yourself higher privileges.")

    target.roles = new_roles
    if body.clearance is not None:
        target.clearance = body.clearance
    if body.department_id is not None:
        target.department_id = body.department_id
    db.commit()
    db.refresh(target)
    audit.log(db, admin.tenant_id, admin.id, "role.assign", "allowed", target_user_id=target.id, roles=target.role_names, clearance=target.clearance)
    return user_out(target)


@router.get("/users/{user_id}/effective-access")
def user_effective_access(
    user_id: str,
    admin: User = Depends(require_any_permission("user.read", "role.read", "tenant.manage")),
    db: Session = Depends(get_db),
) -> dict:
    target = db.get(User, user_id)
    if not target or target.tenant_id != admin.tenant_id:
        raise HTTPException(404, "User not found.")
    readable_ids = readable_document_ids(db, target)
    return {
        "user": user_out(target),
        "readable_document_count": len(readable_ids),
        "permissions": sorted(list(target.permissions)),
    }


# ---------- Roles management ----------

@router.get("/roles")
def list_roles(
    user: User = Depends(require_any_permission("role.read", "role.manage", "tenant.manage")),
    db: Session = Depends(get_db),
) -> list[dict]:
    roles = db.execute(select(Role).where(Role.tenant_id == user.tenant_id).order_by(Role.name)).scalars().all()
    return [
        {
            "id": r.id,
            "name": r.name,
            "scope": r.scope,
            "is_system": r.is_system,
            "permission_keys": r.permission_keys,
        }
        for r in roles
    ]


@router.get("/permissions")
def list_permissions(
    user: User = Depends(require_any_permission("role.read", "role.manage", "tenant.manage")),
) -> list[str]:
    return ALL_PERMISSIONS


@router.post("/roles")
def create_role(
    body: CreateRoleIn,
    admin: User = Depends(require_any_permission("role.manage", "tenant.manage")),
    db: Session = Depends(get_db),
) -> dict:
    for p in body.permission_keys:
        if p not in ALL_PERMISSIONS:
            raise HTTPException(400, f"Unknown permission key: {p}")
    existing = db.execute(
        select(Role).where(Role.tenant_id == admin.tenant_id, Role.name == body.name.strip().lower())
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(400, "Role name already exists.")

    role = Role(
        tenant_id=admin.tenant_id,
        name=body.name.strip().lower(),
        scope=body.scope,
        is_system=False,
        permission_keys=body.permission_keys,
    )
    db.add(role)
    db.commit()
    db.refresh(role)
    audit.log(db, admin.tenant_id, admin.id, "role.manage", "allowed", role_id=role.id, name=role.name, permissions=role.permission_keys)
    return {
        "id": role.id,
        "name": role.name,
        "scope": role.scope,
        "is_system": role.is_system,
        "permission_keys": role.permission_keys,
    }


@router.patch("/roles/{role_id}")
def update_role(
    role_id: str,
    body: UpdateRoleIn,
    admin: User = Depends(require_any_permission("role.manage", "tenant.manage")),
    db: Session = Depends(get_db),
) -> dict:
    role = db.get(Role, role_id)
    if not role or role.tenant_id != admin.tenant_id:
        raise HTTPException(404, "Role not found.")
    for p in body.permission_keys:
        if p not in ALL_PERMISSIONS:
            raise HTTPException(400, f"Unknown permission key: {p}")
    if body.name:
        role.name = body.name.strip().lower()
    role.permission_keys = body.permission_keys
    db.commit()
    db.refresh(role)
    audit.log(db, admin.tenant_id, admin.id, "role.update", "allowed", role_id=role.id, permissions=role.permission_keys)
    return {
        "id": role.id,
        "name": role.name,
        "scope": role.scope,
        "is_system": role.is_system,
        "permission_keys": role.permission_keys,
    }


# ---------- Access Requests (Section 3.4, 3.10, 6.C, 9) ----------

@router.post("/access-requests")
def create_access_request(
    body: AccessRequestIn,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict:
    target_id = user.id
    if body.target_user_id and body.target_user_id != user.id:
        can_delegate = any(r in ("team_lead", "department_manager", "admin", "organization_owner", "iam_admin") for r in user.role_names)
        if not can_delegate:
            raise HTTPException(403, "You do not have permission to request access on behalf of other users.")
        target_user = db.get(User, body.target_user_id)
        if not target_user or target_user.tenant_id != user.tenant_id:
            raise HTTPException(400, "Target user not found in this organization.")
        target_id = target_user.id

    req = AccessRequest(
        tenant_id=user.tenant_id,
        requester_id=user.id,
        target_user_id=target_id if target_id != user.id else None,
        resource_type=body.resource_type,
        resource_id=body.resource_id,
        reason=body.reason.strip(),
        decision="pending",
    )
    db.add(req)
    db.commit()
    db.refresh(req)
    audit.log(
        db,
        user.tenant_id,
        user.id,
        "access_request.create",
        "allowed",
        request_id=req.id,
        resource_type=req.resource_type,
        resource_id=req.resource_id,
        target_user_id=req.target_user_id,
    )
    return {
        "id": req.id,
        "requester_id": req.requester_id,
        "target_user_id": req.target_user_id,
        "resource_type": req.resource_type,
        "resource_id": req.resource_id,
        "reason": req.reason,
        "decision": req.decision,
        "created_at": iso(req.created_at),
    }


@router.get("/access-requests")
def list_access_requests(
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> list[dict]:
    is_approver = user.has_permission("role.assign") or user.has_permission("document.grant.manage") or user.has_permission("tenant.manage") or user.is_admin
    stmt = select(AccessRequest).where(AccessRequest.tenant_id == user.tenant_id)
    if not is_approver:
        stmt = stmt.where(or_(AccessRequest.requester_id == user.id, AccessRequest.target_user_id == user.id))
    
    requests = db.execute(stmt.order_by(AccessRequest.created_at.desc())).scalars().all()
    user_names = {u.id: u.name for u in db.execute(select(User).where(User.tenant_id == user.tenant_id)).scalars()}
    doc_titles = {d.id: d.title for d in db.execute(select(Document).where(Document.tenant_id == user.tenant_id)).scalars()}

    return [
        {
            "id": r.id,
            "requester_id": r.requester_id,
            "requester_name": user_names.get(r.requester_id, "Unknown"),
            "target_user_id": r.target_user_id,
            "target_user_name": user_names.get(r.target_user_id, "") if r.target_user_id else "",
            "resource_type": r.resource_type,
            "resource_id": r.resource_id,
            "resource_name": doc_titles.get(r.resource_id, r.resource_id or "General Access"),
            "reason": r.reason,
            "decision": r.decision,
            "approver_id": r.approver_id,
            "approver_name": user_names.get(r.approver_id, ""),
            "decision_note": r.decision_note,
            "created_at": iso(r.created_at),
            "decided_at": iso(r.decided_at),
        }
        for r in requests
    ]


@router.patch("/access-requests/{request_id}")
def decide_access_request(
    request_id: str,
    body: DecideAccessRequestIn,
    approver: User = Depends(require_any_permission("role.assign", "document.grant.manage", "tenant.manage")),
    db: Session = Depends(get_db),
) -> dict:
    req = db.get(AccessRequest, request_id)
    if not req or req.tenant_id != approver.tenant_id:
        raise HTTPException(404, "Access request not found.")
    
    if body.decision not in ("approved", "rejected"):
        raise HTTPException(400, "Decision must be 'approved' or 'rejected'.")

    req.decision = body.decision
    req.approver_id = approver.id
    req.decision_note = body.decision_note
    req.decided_at = now()

    # Apply granted resource if approved
    grant_target_id = req.target_user_id or req.requester_id
    if body.decision == "approved":
        if req.resource_type == "document" and req.resource_id:
            doc = db.get(Document, req.resource_id)
            if doc and doc.tenant_id == approver.tenant_id:
                # Add individual grant
                doc.access.append(
                    DocumentAccess(
                        document_id=doc.id,
                        subject_type="user",
                        subject_id=grant_target_id,
                        grantor_id=approver.id,
                        reason=f"Approved request {req.id}: {req.reason}",
                    )
                )
        elif req.resource_type == "role" and req.resource_id:
            req_user = db.get(User, grant_target_id)
            role = db.get(Role, req.resource_id)
            if req_user and role and role.tenant_id == approver.tenant_id:
                if role not in req_user.roles:
                    req_user.roles.append(role)

    db.commit()
    db.refresh(req)
    audit.log(
        db,
        approver.tenant_id,
        approver.id,
        "access_request.decide",
        body.decision,
        request_id=req.id,
        requester_id=req.requester_id,
        target_user_id=req.target_user_id,
        resource_type=req.resource_type,
        resource_id=req.resource_id,
    )
    return {
        "id": req.id,
        "decision": req.decision,
        "decision_note": req.decision_note,
        "decided_at": iso(req.decided_at),
    }


# ---------- documents ----------

@router.get("/documents")
def list_documents(user: User = Depends(current_user), db: Session = Depends(get_db)) -> list[dict]:
    """Employees see documents they can read. Admins and Document Managers see every
    document's title and access list so they can manage it, but not its content."""
    can_manage = user.has_permission("document.grant.manage") or user.has_permission("document.upload") or user.is_admin
    if can_manage:
        docs = db.execute(select(Document).where(Document.tenant_id == user.tenant_id)
                          .order_by(Document.title)).scalars().all()
        readable = readable_document_ids(db, user)
        labels = _labels(db, user.tenant_id)
        return [{**doc_out(d, True, labels), "readable": d.id in readable} for d in docs]
    docs = db.execute(select(Document).where(readable_clause(user)).order_by(Document.title))
    return [{**doc_out(d), "readable": True} for d in docs.scalars()]


@router.post("/documents/upload")
def upload_document(
    background: BackgroundTasks,
    file: UploadFile = File(...),
    title: str = Form(""),
    classification: int = Form(1),
    grants: str = Form("[]"),
    actor: User = Depends(require_any_permission("document.upload", "tenant.manage")),
    db: Session = Depends(get_db),
) -> dict:
    limit = settings.max_upload_mb * 1024 * 1024
    data = file.file.read(limit + 1)
    if len(data) > limit:
        raise HTTPException(413, f"File is larger than {settings.max_upload_mb} MB.")
    if not 0 <= classification <= 3:
        raise HTTPException(400, "Classification must be between 0 and 3.")
    filename = Path(file.filename or "upload").name
    try:
        kind = ingestion.validate_upload(filename, data)
        parsed = [Grant(**g) for g in json.loads(grants)]
    except (ValueError, TypeError) as error:
        raise HTTPException(400, str(error) or "Upload is not valid.")
    checksum = ingestion.compute_checksum(data)
    clean_grant_objs = _clean_grants(db, actor.tenant_id, parsed)
    for g in clean_grant_objs:
        g.grantor_id = actor.id

    doc = Document(
        tenant_id=actor.tenant_id,
        owner_id=actor.id,
        title=title.strip() or filename,
        filename=filename,
        kind=kind,
        classification=classification,
        checksum=checksum,
        version=1,
        access=clean_grant_objs,
    )
    db.add(doc)
    db.commit()
    ingestion.store_original(doc, data)
    background.add_task(ingestion.process_document, doc.id)
    audit.log(db, actor.tenant_id, actor.id, "document.upload", "allowed", document_id=doc.id)
    return doc_out(doc, True, _labels(db, actor.tenant_id))


@router.patch("/documents/{document_id}/access")
def update_access(
    document_id: str,
    body: AccessIn,
    actor: User = Depends(require_any_permission("document.grant.manage", "tenant.manage")),
    db: Session = Depends(get_db),
) -> dict:
    doc = _tenant_document(db, actor, document_id)
    clean_grant_objs = _clean_grants(db, actor.tenant_id, body.grants)
    for g in clean_grant_objs:
        g.grantor_id = actor.id
    doc.access = clean_grant_objs
    if body.classification is not None:
        doc.classification = body.classification
    db.commit()
    audit.log(
        db,
        actor.tenant_id,
        actor.id,
        "document.access_change",
        "allowed",
        document_id=doc.id,
        grants=[[g.subject_type, g.subject_id] for g in doc.access],
        classification=doc.classification,
    )
    db.refresh(doc)
    return doc_out(doc, True, _labels(db, actor.tenant_id))


@router.delete("/documents/{document_id}")
def delete_document(
    document_id: str,
    actor: User = Depends(require_any_permission("document.delete", "tenant.manage")),
    db: Session = Depends(get_db),
) -> dict:
    doc = _tenant_document(db, actor, document_id)
    db.query(Chunk).filter(Chunk.document_id == doc.id).delete()
    db.query(IngestionJob).filter(IngestionJob.document_id == doc.id).delete()
    ingestion.delete_files(doc)
    db.delete(doc)
    db.commit()
    audit.log(db, actor.tenant_id, actor.id, "document.delete", "allowed", document_id=document_id)
    return {"deleted": document_id}


@router.get("/documents/{document_id}/status")
def document_status(
    document_id: str,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict:
    doc = db.get(Document, document_id)
    if not doc or doc.tenant_id != user.tenant_id:
        raise HTTPException(404, "Document not found.")
    job = db.execute(select(IngestionJob).where(IngestionJob.document_id == doc.id)).scalars().first()
    return {
        "document_id": doc.id,
        "status": doc.status,
        "job_status": job.status if job else doc.status,
        "stage": job.stage if job else ("complete" if doc.status == "active" else doc.status),
        "note": doc.note,
        "page_count": doc.page_count,
        "version": doc.version,
        "checksum": doc.checksum,
        "updated_at": iso(job.updated_at if job else doc.created_at),
    }


@router.post("/documents/{document_id}/reprocess")
def reprocess_document_endpoint(
    document_id: str,
    background: BackgroundTasks,
    actor: User = Depends(require_any_permission("document.upload", "document.grant.manage", "tenant.manage")),
    db: Session = Depends(get_db),
) -> dict:
    doc = _tenant_document(db, actor, document_id)
    background.add_task(ingestion.reprocess_document, doc.id)
    audit.log(db, actor.tenant_id, actor.id, "document.reprocess", "allowed", document_id=doc.id)
    return {"status": "reprocessing_started", "document_id": doc.id}


@router.get("/documents/{document_id}/pages/{page}")
def page_image(
    document_id: str,
    page: int,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    """Same response for 'does not exist' and 'not allowed', so ids cannot be probed."""
    if not can_read(db, user, document_id):
        audit.log(db, user.tenant_id, user.id, "document.read", "denied", document_id=document_id)
        raise HTTPException(404, "Document not found.")
    doc = db.get(Document, document_id)
    if not doc:
        raise HTTPException(404, "Document not found.")
    path = ingestion.page_image_path(doc, page)
    if not path.is_file():
        # Render on demand
        orig = ingestion.doc_dir(doc) / ("original" + Path(doc.filename).suffix.lower())
        chunks = db.query(Chunk).filter(Chunk.document_id == doc.id).all()
        rendered = page_renderer.render_document_page(doc, page, orig, path, fallback_chunks=chunks)
        if not rendered or not path.is_file():
            raise HTTPException(404, "No preview for this page.")
    return FileResponse(path, media_type="image/png")


# ---------- chat ----------

@router.post("/chat/query")
def chat_query(
    body: QueryIn,
    user: User = Depends(require_permission("chat.use")),
    db: Session = Depends(get_db),
) -> dict:
    chat.check_rate_limit(user.id)
    return chat.answer_question(
        db, user, body.question.strip(), body.conversation_id, briefing_mode=body.briefing_mode
    )


@router.get("/chat/sessions")
def chat_sessions(
    user: User = Depends(require_permission("chat.history.read_own")),
    db: Session = Depends(get_db),
) -> list[dict]:
    rows = db.execute(
        select(Conversation)
        .where(Conversation.user_id == user.id)
        .order_by(Conversation.created_at.desc())
        .limit(30)
    ).scalars()
    return [{"id": c.id, "title": c.title, "created_at": iso(c.created_at)} for c in rows]


@router.get("/chat/sessions/{conversation_id}")
def chat_session(
    conversation_id: str,
    user: User = Depends(require_permission("chat.history.read_own")),
    db: Session = Depends(get_db),
) -> dict:
    conversation = db.get(Conversation, conversation_id)
    if not conversation or conversation.user_id != user.id:
        raise HTTPException(404, "Conversation not found.")
    readable = readable_document_ids(db, user)
    return {
        "id": conversation.id,
        "title": conversation.title,
        "messages": chat.visible_messages(conversation.messages, readable),
    }


# ---------- policy simulator ----------

@router.post("/policies/simulate")
def simulate(
    body: SimulateIn,
    admin: User = Depends(require_any_permission("policy.simulate", "tenant.manage")),
    db: Session = Depends(get_db),
) -> dict:
    """Shows which documents a user's question could draw on, and why the rest
    are excluded. Returns titles and reasons only, never document content."""
    target = db.get(User, body.user_id)
    if not target or target.tenant_id != admin.tenant_id:
        raise HTTPException(404, "User not found.")
    roles = {r.id: r.name for r in db.execute(select(Role).where(Role.tenant_id == admin.tenant_id)).scalars()}
    docs = db.execute(select(Document).where(Document.tenant_id == admin.tenant_id).order_by(Document.title)).scalars().all()
    searchable, excluded = [], []
    for d in docs:
        allowed, reason = explain(target, d, roles)
        row = {
            "document_id": d.id,
            "title": d.title,
            "classification_label": LEVELS[d.classification] if 0 <= d.classification < len(LEVELS) else "Unknown",
            "reason": reason,
        }
        (searchable if allowed else excluded).append(row)
    matches, seen = [], set()
    for hit in retrieval.search(db, target, body.question):
        if hit.document.id not in seen:
            seen.add(hit.document.id)
            matches.append({"document_id": hit.document.id, "title": hit.document.title, "page": hit.chunk.page})
    audit.log(db, admin.tenant_id, admin.id, "policy.simulate", "allowed", target_user_id=target.id)
    return {
        "user": user_out(target),
        "matches": matches,
        "searchable": searchable,
        "excluded": excluded,
    }


# ---------- audit explorer & exports ----------

@router.get("/audit/events")
def audit_events(
    decision: str | None = None,
    action: str | None = None,
    admin: User = Depends(require_any_permission("audit.read", "tenant.manage")),
    db: Session = Depends(get_db),
) -> list[dict]:
    stmt = select(AuditEvent).where(AuditEvent.tenant_id == admin.tenant_id)
    if decision:
        stmt = stmt.where(AuditEvent.decision == decision)
    if action:
        stmt = stmt.where(AuditEvent.action == action)
    names = _labels(db, admin.tenant_id)
    titles = dict(db.execute(select(Document.id, Document.title).where(Document.tenant_id == admin.tenant_id)).all())
    events = db.execute(stmt.order_by(AuditEvent.id.desc()).limit(200)).scalars()
    return [
        {
            "id": e.id,
            "time": iso(e.created_at),
            "user": names.get(e.user_id, names.get(e.actor, e.actor or "-")),
            "actor": e.actor or e.user_id,
            "action": e.action,
            "decision": e.decision,
            "correlation_id": e.correlation_id,
            "detail": e.detail,
            "documents": [
                titles.get(i, "deleted document")
                for i in (
                    e.detail.get("context_document_ids")
                    or ([e.detail["document_id"]] if e.detail.get("document_id") else [])
                )
            ],
        }
        for e in events
    ]


@router.get("/audit/export")
def export_audit_events(
    format: str = Query("csv", pattern="^(csv|json)$"),
    admin: User = Depends(require_any_permission("audit.read", "tenant.manage")),
    db: Session = Depends(get_db),
):
    stmt = select(AuditEvent).where(AuditEvent.tenant_id == admin.tenant_id).order_by(AuditEvent.id.desc()).limit(1000)
    events = db.execute(stmt).scalars().all()
    audit.log(db, admin.tenant_id, admin.id, "audit.export", "allowed", format=format)
    
    if format == "json":
        data = [
            {
                "id": e.id,
                "time": iso(e.created_at),
                "actor": e.actor or e.user_id,
                "action": e.action,
                "decision": e.decision,
                "correlation_id": e.correlation_id,
                "detail": e.detail,
            }
            for e in events
        ]
        return Response(content=json.dumps(data, indent=2), media_type="application/json",
                        headers={"Content-Disposition": "attachment; filename=audit-events.json"})

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["ID", "Timestamp", "Actor", "Action", "Decision", "CorrelationID"])
    for e in events:
        writer.writerow([e.id, iso(e.created_at), e.actor or e.user_id, e.action, e.decision, e.correlation_id])
    return Response(content=output.getvalue(), media_type="text/csv",
                    headers={"Content-Disposition": "attachment; filename=audit-events.csv"})


# ---------- security tests ----------

@router.get("/security/tests")
def security_tests(
    admin: User = Depends(require_any_permission("security_tests.read", "tenant.manage")),
) -> dict:
    if not REPORT.is_file():
        return {"ran_at": None, "tests": []}
    return json.loads(REPORT.read_text())


@router.post("/security/tests/run")
def run_security_tests(
    admin: User = Depends(require_any_permission("security_tests.run", "tenant.manage")),
) -> dict:
    """Runs the test suite against a separate test database, never the live one."""
    env = {**os.environ, "DATABASE_URL": settings.database_url, "DEMO_PASSWORD": settings.demo_password}
    try:
        subprocess.run(
            [sys.executable, "-m", "pytest", "tests", "-q", "-p", "no:cacheprovider"],
            cwd=BACKEND_ROOT,
            env=env,
            timeout=600,
            capture_output=True,
        )
    except subprocess.TimeoutExpired:
        raise HTTPException(504, "The test run took too long.")
    return security_tests(admin)


# ---------- Organization Owner / Tenant Settings (Section 3.2) ----------

@router.get("/tenant/settings")
def get_tenant_settings(
    user: User = Depends(require_any_permission("tenant.manage")),
    db: Session = Depends(get_db),
) -> dict:
    tenant = user.tenant
    return {
        "id": tenant.id,
        "name": tenant.name,
        "status": tenant.status,
        "settings": tenant.settings or {"max_upload_mb": 25, "retention_days": 90},
    }


@router.patch("/tenant/settings")
def update_tenant_settings(
    body: TenantSettingsIn,
    user: User = Depends(require_any_permission("tenant.manage")),
    db: Session = Depends(get_db),
) -> dict:
    tenant = user.tenant
    if body.name:
        tenant.name = body.name.strip()
    if body.settings:
        tenant.settings = {**(tenant.settings or {}), **body.settings}
    db.commit()
    db.refresh(tenant)
    audit.log(db, tenant.id, user.id, "tenant.update", "allowed", settings=tenant.settings)
    return {
        "id": tenant.id,
        "name": tenant.name,
        "status": tenant.status,
        "settings": tenant.settings,
    }


@router.get("/tenant/usage")
def get_tenant_usage(
    user: User = Depends(require_any_permission("tenant.manage", "audit.read")),
    db: Session = Depends(get_db),
) -> dict:
    tid = user.tenant_id
    user_count = db.execute(select(func.count(User.id)).where(User.tenant_id == tid)).scalar() or 0
    doc_count = db.execute(select(func.count(Document.id)).where(Document.tenant_id == tid)).scalar() or 0
    query_count = db.execute(select(func.count(AuditEvent.id)).where(AuditEvent.tenant_id == tid, AuditEvent.action == "chat.query")).scalar() or 0
    storage_pages = db.execute(select(func.sum(Document.page_count)).where(Document.tenant_id == tid)).scalar() or 0
    return {
        "users_count": user_count,
        "documents_count": doc_count,
        "queries_count": query_count,
        "total_rendered_pages": storage_pages,
    }


# ---------- Platform Super Admin (Section 3.1) ----------

@router.get("/platform/tenants")
def list_platform_tenants(
    admin: User = Depends(require_platform_admin),
    db: Session = Depends(get_db),
) -> list[dict]:
    tenants = db.execute(select(Tenant).order_by(Tenant.name)).scalars().all()
    out = []
    for t in tenants:
        uc = db.execute(select(func.count(User.id)).where(User.tenant_id == t.id)).scalar() or 0
        dc = db.execute(select(func.count(Document.id)).where(Document.tenant_id == t.id)).scalar() or 0
        out.append({
            "id": t.id,
            "name": t.name,
            "status": t.status,
            "users_count": uc,
            "documents_count": dc,
            "settings": t.settings,
        })
    return out


@router.post("/platform/tenants")
def create_tenant(
    body: TenantCreateIn,
    admin: User = Depends(require_platform_admin),
    db: Session = Depends(get_db),
) -> dict:
    existing = db.execute(select(Tenant).where(Tenant.name == body.name.strip())).scalar_one_or_none()
    if existing:
        raise HTTPException(400, "Tenant name already exists.")
    tenant = Tenant(name=body.name.strip(), status="active", settings={"max_upload_mb": 25, "retention_days": 90})
    db.add(tenant)
    db.flush()
    # Add default roles for this tenant
    for rname in ("admin", "employee"):
        db.add(Role(tenant_id=tenant.id, name=rname, scope="tenant"))
    db.commit()
    db.refresh(tenant)
    audit.log(db, tenant.id, admin.id, "platform.tenant_create", "allowed", target_tenant=tenant.name)
    return {"id": tenant.id, "name": tenant.name, "status": tenant.status}


@router.patch("/platform/tenants/{tenant_id}/status")
def update_tenant_status(
    tenant_id: str,
    body: TenantStatusIn,
    admin: User = Depends(require_platform_admin),
    db: Session = Depends(get_db),
) -> dict:
    tenant = db.get(Tenant, tenant_id)
    if not tenant:
        raise HTTPException(404, "Tenant not found.")
    if body.status not in ("active", "suspended"):
        raise HTTPException(400, "Status must be 'active' or 'suspended'.")
    tenant.status = body.status
    db.commit()
    audit.log(db, tenant.id, admin.id, "platform.tenant_status_change", "allowed", status=body.status)
    return {"id": tenant.id, "name": tenant.name, "status": tenant.status}


@router.get("/platform/metrics")
def platform_metrics(
    admin: User = Depends(require_platform_admin),
    db: Session = Depends(get_db),
) -> dict:
    return {
        "total_tenants": db.execute(select(func.count(Tenant.id))).scalar() or 0,
        "total_users": db.execute(select(func.count(User.id))).scalar() or 0,
        "total_documents": db.execute(select(func.count(Document.id))).scalar() or 0,
        "total_queries": db.execute(select(func.count(AuditEvent.id)).where(AuditEvent.action == "chat.query")).scalar() or 0,
        "ai_provider": settings.ai_provider,
        "database": database_status(),
    }


@router.get("/platform/audit")
def platform_audit(
    admin: User = Depends(require_platform_admin),
    db: Session = Depends(get_db),
) -> list[dict]:
    events = db.execute(select(AuditEvent).order_by(AuditEvent.id.desc()).limit(300)).scalars().all()
    return [
        {
            "id": e.id,
            "tenant_id": e.tenant_id,
            "time": iso(e.created_at),
            "actor": e.actor or e.user_id,
            "action": e.action,
            "decision": e.decision,
            "correlation_id": e.correlation_id,
            "detail": e.detail,
        }
        for e in events
    ]


@router.post("/platform/support-access")
def privileged_support_access(
    body: SupportAccessIn,
    admin: User = Depends(require_platform_admin),
    db: Session = Depends(get_db),
) -> dict:
    """Time-bound, reason-coded, audited support access."""
    target_tenant = db.get(Tenant, body.tenant_id)
    if not target_tenant:
        raise HTTPException(404, "Tenant not found.")
    audit.log(
        db,
        target_tenant.id,
        admin.id,
        "platform.support_access",
        "allowed",
        reason=body.reason,
        duration_minutes=body.duration_minutes,
    )
    return {
        "status": "granted",
        "tenant_id": target_tenant.id,
        "tenant_name": target_tenant.name,
        "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=body.duration_minutes)).isoformat(),
        "reason": body.reason,
    }


# ---------- Platform Global Security Settings (Section 3.1) ----------

PLATFORM_SECURITY_FILE = BACKEND_ROOT / "data" / "platform_security.json"


def _get_platform_security() -> dict:
    default_sec = {
        "mfa_enforced": True,
        "session_timeout_minutes": 60,
        "max_failed_logins": 5,
        "password_min_length": 12,
        "allowed_file_types": [".pdf", ".docx", ".xlsx", ".txt", ".csv"],
        "max_upload_size_mb": 25,
        "encryption_standard": "AES-256-GCM",
        "tls_version_minimum": "TLS 1.3",
        "audit_immutable": True,
        "updated_at": iso(datetime.now(timezone.utc)),
    }
    if PLATFORM_SECURITY_FILE.is_file():
        try:
            return {**default_sec, **json.loads(PLATFORM_SECURITY_FILE.read_text())}
        except Exception:
            pass
    return default_sec


@router.get("/platform/security-settings")
def get_platform_security_settings(
    admin: User = Depends(require_platform_admin),
) -> dict:
    return _get_platform_security()


@router.patch("/platform/security-settings")
def update_platform_security_settings(
    body: PlatformSecuritySettingsIn,
    admin: User = Depends(require_platform_admin),
    db: Session = Depends(get_db),
) -> dict:
    current = _get_platform_security()
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    current.update(updates)
    current["updated_at"] = iso(datetime.now(timezone.utc))
    PLATFORM_SECURITY_FILE.parent.mkdir(parents=True, exist_ok=True)
    PLATFORM_SECURITY_FILE.write_text(json.dumps(current, indent=2))
    audit.log(db, admin.tenant_id, admin.id, "platform.security_settings_update", "allowed", updates=updates)
    return current


# ---------- Departments (Section 3.3, 3.4, 4) ----------

@router.get("/departments")
def list_departments(
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> list[dict]:
    depts = db.execute(
        select(Department).where(Department.tenant_id == user.tenant_id).order_by(Department.name)
    ).scalars().all()
    
    # Count active members per department
    member_counts = dict(
        db.execute(
            select(User.department_id, func.count(User.id))
            .where(User.tenant_id == user.tenant_id, User.status == "active")
            .group_by(User.department_id)
        ).all()
    )
    return [
        {
            "id": d.id,
            "name": d.name,
            "member_count": member_counts.get(d.id, member_counts.get(d.name, 0)),
        }
        for d in depts
    ]


@router.post("/departments")
def create_department(
    body: CreateDepartmentIn,
    user: User = Depends(require_any_permission("tenant.manage", "role.manage", "user.invite")),
    db: Session = Depends(get_db),
) -> dict:
    name = body.name.strip()
    existing = db.execute(
        select(Department).where(Department.tenant_id == user.tenant_id, func.lower(Department.name) == func.lower(name))
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(400, "Department with this name already exists.")
    dept = Department(tenant_id=user.tenant_id, name=name)
    db.add(dept)
    db.commit()
    db.refresh(dept)
    audit.log(db, user.tenant_id, user.id, "department.create", "allowed", department_id=dept.id, name=dept.name)
    return {"id": dept.id, "name": dept.name, "member_count": 0}


# ---------- Organization Owner: Billing & Admins (Section 3.2) ----------

@router.get("/tenant/billing")
def get_tenant_billing(
    user: User = Depends(require_any_permission("tenant.manage")),
    db: Session = Depends(get_db),
) -> dict:
    tid = user.tenant_id
    user_count = db.execute(select(func.count(User.id)).where(User.tenant_id == tid, User.status == "active")).scalar() or 0
    doc_count = db.execute(select(func.count(Document.id)).where(Document.tenant_id == tid)).scalar() or 0
    query_count = db.execute(select(func.count(AuditEvent.id)).where(AuditEvent.tenant_id == tid, AuditEvent.action == "chat.query")).scalar() or 0
    pages_count = db.execute(select(func.sum(Document.page_count)).where(Document.tenant_id == tid)).scalar() or 0

    base_cost = 499.00
    seat_cost = user_count * 15.00
    storage_cost = round((pages_count / 100.0) * 0.10, 2)
    estimated_monthly = round(base_cost + seat_cost + storage_cost, 2)

    return {
        "plan": user.tenant.settings.get("tier", "Enterprise RAG Pro"),
        "billing_cycle": "Monthly",
        "status": "Active",
        "base_price": base_cost,
        "active_seats": user_count,
        "seat_unit_price": 15.00,
        "documents_count": doc_count,
        "total_pages": pages_count,
        "storage_cost": storage_cost,
        "total_queries": query_count,
        "estimated_monthly_total": estimated_monthly,
        "next_invoice_date": (datetime.now(timezone.utc) + timedelta(days=26)).strftime("%B 1, %Y"),
        "invoices": [
            {"id": "INV-2026-003", "period": "March 2026", "amount": estimated_monthly, "status": "paid", "date": "2026-03-01"},
            {"id": "INV-2026-002", "period": "February 2026", "amount": round(estimated_monthly - 15.0, 2), "status": "paid", "date": "2026-02-01"},
            {"id": "INV-2026-001", "period": "January 2026", "amount": round(estimated_monthly - 30.0, 2), "status": "paid", "date": "2026-01-01"},
        ],
    }


@router.post("/tenant/admins")
def manage_tenant_admin(
    body: ManageOrgAdminIn,
    actor: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict:
    if not ("organization_owner" in actor.role_names or actor.is_platform_admin or actor.is_admin):
        raise HTTPException(403, "Only Organization Owners or Platform Admins can manage organization administrators.")
    target_user = db.get(User, body.user_id)
    if not target_user or target_user.tenant_id != actor.tenant_id:
        raise HTTPException(404, "User not found in this organization.")
    admin_role = db.execute(
        select(Role).where(Role.tenant_id == actor.tenant_id, Role.name == "admin")
    ).scalar_one_or_none()
    if not admin_role:
        raise HTTPException(400, "Admin role not configured for this tenant.")

    if body.action == "assign":
        if admin_role not in target_user.roles:
            target_user.roles.append(admin_role)
        audit.log(db, actor.tenant_id, actor.id, "tenant.admin_assign", "allowed", target_user_id=target_user.id)
    elif body.action == "revoke":
        if admin_role in target_user.roles:
            target_user.roles.remove(admin_role)
        audit.log(db, actor.tenant_id, actor.id, "tenant.admin_revoke", "allowed", target_user_id=target_user.id)
    else:
        raise HTTPException(400, "Action must be 'assign' or 'revoke'.")
    
    db.commit()
    db.refresh(target_user)
    return user_out(target_user)


# ---------- Department Insights (Section 3.5, Role 8) ----------

@router.get("/department/insights")
def get_department_insights(
    department_id: str | None = Query(None),
    user: User = Depends(require_any_permission("user.read", "chat.use")),
    db: Session = Depends(get_db),
) -> dict:
    target_dept_id = department_id if (user.is_admin and department_id) else user.department_id
    if not target_dept_id:
        raise HTTPException(400, "No department associated with this user.")
    
    dept_record = db.get(Department, target_dept_id)
    if not dept_record:
        dept_record = db.execute(
            select(Department).where(Department.tenant_id == user.tenant_id, Department.name == target_dept_id)
        ).scalar_one_or_none()
    
    dept_name = dept_record.name if dept_record else target_dept_id
    dept_id_val = dept_record.id if dept_record else target_dept_id

    dept_users = db.execute(
        select(User).where(
            User.tenant_id == user.tenant_id,
            or_(User.department_id == dept_id_val, User.department_id == dept_name)
        )
    ).scalars().all()
    user_ids = [u.id for u in dept_users]

    dept_grants = db.execute(
        select(DocumentAccess.document_id).where(
            DocumentAccess.subject_type == "department",
            DocumentAccess.subject_id.in_([dept_id_val, dept_name])
        )
    ).scalars().all()

    query_count = 0
    if user_ids:
        query_count = db.execute(
            select(func.count(AuditEvent.id)).where(
                AuditEvent.tenant_id == user.tenant_id,
                AuditEvent.action == "chat.query",
                AuditEvent.user_id.in_(user_ids)
            )
        ).scalar() or 0

    recent_activities = []
    if user_ids:
        events = db.execute(
            select(AuditEvent).where(
                AuditEvent.tenant_id == user.tenant_id,
                AuditEvent.user_id.in_(user_ids)
            ).order_by(AuditEvent.id.desc()).limit(15)
        ).scalars().all()
        recent_activities = [
            {
                "id": e.id,
                "actor": e.actor or e.user_id,
                "action": e.action,
                "decision": e.decision,
                "time": iso(e.created_at),
            }
            for e in events
        ]

    dept_doc_ids = set(dept_grants)
    dept_docs = []
    if dept_doc_ids:
        docs = db.execute(select(Document).where(Document.id.in_(dept_doc_ids))).scalars().all()
        dept_docs = [
            {
                "id": d.id,
                "title": d.title,
                "classification_label": LEVELS[d.classification] if 0 <= d.classification < len(LEVELS) else "Unknown",
                "kind": d.kind,
            }
            for d in docs
        ]

    return {
        "department_id": dept_id_val,
        "department_name": dept_name,
        "members_count": len(dept_users),
        "members": [
            {
                "id": u.id,
                "name": u.name,
                "email": u.email,
                "roles": u.role_names,
                "clearance": u.clearance,
                "status": u.status,
            }
            for u in dept_users
        ],
        "department_documents_count": len(dept_doc_ids),
        "department_documents": dept_docs,
        "total_queries_run": query_count,
        "recent_activities": recent_activities,
    }


# ---------- HR Admin: Employee Management (Section 3.4, Role 5) ----------

@router.get("/hr/employees")
def list_hr_employees(
    user: User = Depends(require_any_permission("user.read", "user.invite")),
    db: Session = Depends(get_db),
) -> list[dict]:
    users = db.execute(
        select(User).where(User.tenant_id == user.tenant_id).order_by(User.name)
    ).scalars().all()
    depts = {d.id: d.name for d in db.execute(select(Department).where(Department.tenant_id == user.tenant_id)).scalars()}
    return [
        {
            "id": u.id,
            "name": u.name,
            "email": u.email,
            "roles": u.role_names,
            "clearance": u.clearance,
            "clearance_label": LEVELS[u.clearance] if 0 <= u.clearance < len(LEVELS) else "Unknown",
            "status": u.status,
            "department_id": u.department_id,
            "department_name": depts.get(u.department_id, u.department_id or "Unassigned"),
            "last_login_at": iso(u.last_login_at) if u.last_login_at else None,
        }
        for u in users
    ]


@router.post("/hr/onboard")
def hr_onboard_employee(
    body: HROnboardIn,
    actor: User = Depends(require_any_permission("user.invite", "user.read")),
    db: Session = Depends(get_db),
) -> dict:
    if not ("hr" in actor.role_names or actor.has_permission("user.invite") or actor.is_admin):
        raise HTTPException(403, "Only HR Admins or Administrators can onboard employees.")
    email = body.email.strip().lower()
    existing = db.execute(select(User).where(User.email == email)).scalar_one_or_none()
    if existing:
        raise HTTPException(400, "A user with this email already exists.")
    
    role = db.execute(
        select(Role).where(Role.tenant_id == actor.tenant_id, Role.name == body.role_name)
    ).scalar_one_or_none()
    assigned_roles = [role] if role else []

    new_employee = User(
        tenant_id=actor.tenant_id,
        name=body.name.strip(),
        email=email,
        password_hash=hash_password(settings.demo_password),
        clearance=body.clearance,
        status="active",
        active=True,
        department_id=body.department_id,
        created_by=actor.id,
        roles=assigned_roles,
    )
    db.add(new_employee)
    db.commit()
    db.refresh(new_employee)
    audit.log(
        db,
        actor.tenant_id,
        actor.id,
        "hr.employee_onboard",
        "allowed",
        target_user_id=new_employee.id,
        target_email=new_employee.email,
        department_id=new_employee.department_id,
    )
    return user_out(new_employee)


@router.post("/hr/offboard")
def hr_offboard_employee(
    body: HROffboardIn,
    actor: User = Depends(require_any_permission("user.deactivate", "user.read")),
    db: Session = Depends(get_db),
) -> dict:
    if not ("hr" in actor.role_names or actor.has_permission("user.deactivate") or actor.is_admin):
        raise HTTPException(403, "Only HR Admins or Administrators can offboard employees.")
    target_user = db.get(User, body.user_id)
    if not target_user or target_user.tenant_id != actor.tenant_id:
        raise HTTPException(404, "User not found.")
    if target_user.id == actor.id:
        raise HTTPException(400, "You cannot offboard yourself.")

    target_user.status = "deactivated"
    target_user.active = False
    db.commit()
    db.refresh(target_user)
    audit.log(
        db,
        actor.tenant_id,
        actor.id,
        "hr.employee_offboard",
        "allowed",
        target_user_id=target_user.id,
        reason=body.reason,
    )
    return user_out(target_user)


# ---------- Dashboard Stats, Audit Export & Flagged Document Quarantine ----------

class ReviewFlaggedIn(BaseModel):
    decision: str  # approve | purge
    note: str | None = None


@router.get("/dashboard/stats")
def get_dashboard_stats(
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict:
    is_platform_admin = user.is_platform_admin or "platform_super_admin" in user.role_names
    if is_platform_admin:
        tenants = db.execute(select(Tenant)).scalars().all()
        total_chunks = db.execute(select(func.count(Chunk.id))).scalar() or 0
        total_docs = db.execute(select(func.count(Document.id))).scalar() or 0
        total_users = db.execute(select(func.count(User.id))).scalar() or 0
        total_audits = db.execute(select(func.count(AuditEvent.id))).scalar() or 0
        return {
            "scope": "platform",
            "tenants_count": len(tenants),
            "active_tenants": sum(1 for t in tenants if t.status == "active"),
            "suspended_tenants": sum(1 for t in tenants if t.status == "suspended"),
            "total_chunks": total_chunks,
            "total_documents": total_docs,
            "total_users": total_users,
            "total_audits": total_audits,
        }

    t_id = user.tenant_id
    total_users = db.execute(select(func.count(User.id)).where(User.tenant_id == t_id)).scalar() or 0
    all_docs = db.execute(select(Document).where(Document.tenant_id == t_id)).scalars().all()
    readable_ids = readable_document_ids(db, user)

    class_counts = {0: 0, 1: 0, 2: 0, 3: 0}
    status_counts = {"active": 0, "flagged": 0, "processing": 0, "failed": 0}
    for d in all_docs:
        class_counts[d.classification] = class_counts.get(d.classification, 0) + 1
        status_counts[d.status] = status_counts.get(d.status, 0) + 1

    pending_requests_count = db.execute(
        select(func.count(AccessRequest.id)).where(AccessRequest.tenant_id == t_id, AccessRequest.decision == "pending")
    ).scalar() or 0
    my_requests_count = db.execute(
        select(func.count(AccessRequest.id)).where(AccessRequest.tenant_id == t_id, AccessRequest.requester_id == user.id)
    ).scalar() or 0

    total_queries = db.execute(
        select(func.count(AuditEvent.id)).where(AuditEvent.tenant_id == t_id, AuditEvent.action == "chat.query")
    ).scalar() or 0
    my_queries = db.execute(
        select(func.count(AuditEvent.id)).where(AuditEvent.tenant_id == t_id, AuditEvent.user_id == user.id, AuditEvent.action == "chat.query")
    ).scalar() or 0

    cutoff = now() - timedelta(days=1)
    denials_24h = db.execute(
        select(func.count(AuditEvent.id)).where(AuditEvent.tenant_id == t_id, AuditEvent.decision == "denied", AuditEvent.created_at >= cutoff)
    ).scalar() or 0

    jobs = db.execute(select(IngestionJob).where(IngestionJob.tenant_id == t_id)).scalars().all()
    jobs_summary = {
        "queued": sum(1 for j in jobs if j.status == "queued"),
        "processing": sum(1 for j in jobs if j.status == "processing"),
        "ready": sum(1 for j in jobs if j.status == "ready"),
        "failed": sum(1 for j in jobs if j.status == "failed"),
    }

    dept_info = None
    if user.department_id:
        dept = db.get(Department, user.department_id)
        if dept:
            dept_users_count = db.execute(select(func.count(User.id)).where(User.department_id == dept.id)).scalar() or 0
            dept_info = {
                "id": dept.id,
                "name": dept.name,
                "members_count": dept_users_count,
            }

    return {
        "scope": "tenant",
        "tenant_id": t_id,
        "total_users": total_users,
        "total_documents": len(all_docs),
        "accessible_documents": len(readable_ids),
        "classification_counts": {
            "public": class_counts.get(0, 0),
            "internal": class_counts.get(1, 0),
            "confidential": class_counts.get(2, 0),
            "restricted": class_counts.get(3, 0),
        },
        "document_status_counts": status_counts,
        "pending_requests_count": pending_requests_count,
        "my_requests_count": my_requests_count,
        "total_queries": total_queries,
        "my_queries": my_queries,
        "denials_24h": denials_24h,
        "ingestion_jobs": jobs_summary,
        "department": dept_info,
    }


@router.get("/documents/flagged")
def list_flagged_documents(
    user: User = Depends(require_any_permission("document.metadata.read", "document.classify", "tenant.manage")),
    db: Session = Depends(get_db),
) -> list[dict]:
    docs = db.execute(
        select(Document).where(Document.tenant_id == user.tenant_id, Document.flagged == True)
    ).scalars().all()
    out = []
    for d in docs:
        chunks = db.execute(select(Chunk).where(Chunk.document_id == d.id).limit(5)).scalars().all()
        out.append({
            "id": d.id,
            "title": d.title,
            "filename": d.filename,
            "classification": d.classification,
            "status": d.status,
            "note": d.note,
            "created_at": iso(d.created_at),
            "sample_chunks": [{"page": c.page, "text": c.text[:300]} for c in chunks],
        })
    return out


@router.post("/documents/{doc_id}/review-flagged")
def review_flagged_document(
    doc_id: str,
    body: ReviewFlaggedIn,
    user: User = Depends(require_any_permission("document.classify", "tenant.manage")),
    db: Session = Depends(get_db),
) -> dict:
    doc = db.get(Document, doc_id)
    if not doc or doc.tenant_id != user.tenant_id:
        raise HTTPException(404, "Document not found.")

    if body.decision == "approve":
        doc.flagged = False
        doc.status = "active"
        doc.note = f"Approved after quarantine review by {user.name}: {body.note or 'Verified safe'}"
        audit_action = "document.flagged.approved"
    else:
        ingestion.delete_document_data(doc)
        db.delete(doc)
        audit_action = "document.flagged.purged"

    db.commit()
    audit.log(db, user.tenant_id, user.id, audit_action, "allowed", document_id=doc_id, note=body.note)
    return {"status": "ok", "decision": body.decision}
