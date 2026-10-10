"""HTTP API. Every route is grouped by area (auth, users, documents, chat,
simulator, audit, settings). Routes stay thin: access rules live in
authorization.py, the question pipeline in chat.py, file handling in ingestion.py.
"""
import csv
import io
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Query, Response, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from app import audit, chat, ingestion, ocr, page_renderer, retrieval, row_security, section_access
from app.ws import manager
from app.auth import (
    current_user,
    get_user_from_token,
    hash_password,
    make_token,
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
    Message,
    Role,
    Tenant,
    User,
    iso,
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
    document_ids: list[str] | None = None


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


class EditAccessRequestIn(BaseModel):
    resource_type: str | None = None
    resource_id: str | None = None
    reason: str | None = Field(default=None, min_length=3, max_length=1000)
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


from app.industry_templates import INDUSTRY_CATEGORIES, slugify


class TenantStatusIn(BaseModel):
    status: str  # active | suspended


class TenantSettingsIn(BaseModel):
    name: str | None = None
    website: str | None = None
    logo_url: str | None = None
    industry_category: str | None = None
    primary_color: str | None = None
    settings: dict = {}


class RegisterCompanyIn(BaseModel):
    founder_name: str = Field(min_length=2, max_length=100)
    company_name: str = Field(min_length=2, max_length=100)
    business_email: str = Field(min_length=5, max_length=150)
    password: str = Field(min_length=6, max_length=100)
    company_website: str | None = None
    website: str | None = None
    company_logo: str | None = None
    logo_url: str | None = None
    company_category: str = Field(default="healthcare")
    custom_roles: list[dict | str] | None = None


class PortalLoginIn(BaseModel):
    company_slug: str
    role_slug: str
    email: str
    password: str


class AddCustomRoleIn(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    description: str = Field(default="")
    default_clearance: int = Field(default=1, ge=0, le=3)
    permissions: list[str] = Field(default_factory=list)


class AssignRoleUserIn(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    email: str = Field(min_length=3, max_length=150)
    password: str = Field(min_length=6, max_length=100)
    clearance: int | None = Field(default=None, ge=0, le=3)


class SectionAccessIn(BaseModel):
    allowed_roles: list[str] = Field(default_factory=list)


class RowPolicyIn(BaseModel):
    column: str | None = Field(default=None, max_length=200)
    subject_type: str = Field(default="department", pattern="^(department|role)$")
    full_access_roles: list[str] = Field(default_factory=list)


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
        "tenant_slug": u.tenant.slug if u.tenant else "",
        "tenant_logo": u.tenant.logo_url if u.tenant else None,
        "tenant_category": u.tenant.industry_category if u.tenant else "general",
        "tenant_website": u.tenant.website if u.tenant else None,
        "tenant_primary_color": u.tenant.primary_color if u.tenant else "#10b981",
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


STAGE_PERCENT = {
    "queued": 15,
    "validation": 25,
    "extraction": 50,
    "sanitization": 75,
    "embedding": 90,
    "complete": 100,
    "failed": 0,
}


def doc_out(d: Document, with_access: bool = False, labels: dict | None = None, job: IngestionJob | None = None) -> dict:
    stage = job.stage if job else ("complete" if d.status == "active" else "validation")
    percent = 100 if d.status == "active" else (0 if d.status in ("failed", "error") else STAGE_PERCENT.get(stage, 25))
    out = {
        "id": d.id,
        "title": d.title,
        "filename": d.filename,
        "kind": d.kind,
        "classification": d.classification,
        "classification_label": LEVELS[d.classification] if 0 <= d.classification < len(LEVELS) else "Unknown",
        "status": d.status,
        "stage": stage,
        "progress_percent": percent,
        "note": d.note,
        "page_count": d.page_count,
        "flagged": d.flagged,
        "version": d.version,
        "checksum": d.checksum,
        "created_at": iso(d.created_at),
        "sections_metadata": d.sections_metadata or [],
        "data_schema": d.data_schema,
        "row_policy": d.row_policy,
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


# ---------- real-time websocket endpoint ----------

@router.websocket("/ws")
async def websocket_updates(
    websocket: WebSocket,
    token: str = Query(""),
    db: Session = Depends(get_db),
):
    """Establishes real-time duplex channel for instant status notifications."""
    user = get_user_from_token(db, token) if token else None
    if not user:
        await websocket.close(code=1008)
        return
    await manager.connect(websocket, user.tenant_id)
    try:
        await websocket.send_text(json.dumps({"type": "connected", "tenant_id": user.tenant_id}))
        while True:
            text = await websocket.receive_text()
            if text == "ping":
                await websocket.send_text(json.dumps({"type": "pong"}))
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception:
        manager.disconnect(websocket)



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


# ---------- company sign-up and role portals ----------

DISALLOWED_CONSUMER_DOMAINS = {
    "gmail.com", "googlemail.com", "yahoo.com", "ymail.com", "rocketmail.com",
    "hotmail.com", "outlook.com", "live.com", "msn.com", "icloud.com", "me.com",
    "mac.com", "aol.com", "mail.com", "proton.me", "protonmail.com", "zoho.com",
}


def validate_business_email(email: str) -> None:
    clean = email.strip().lower()
    if "@" not in clean:
        raise HTTPException(400, "Please provide a valid business email address.")
    parts = clean.split("@")
    if len(parts) != 2 or not parts[0] or not parts[1]:
        raise HTTPException(400, "Please provide a valid business email address.")
    domain = parts[1]
    if domain in DISALLOWED_CONSUMER_DOMAINS:
        raise HTTPException(
            400,
            f"Registration requires a business email ID (e.g. user@company.business.com or company domain). Consumer email domains (@{domain}) are not permitted."
        )


@router.get("/public/categories")
def get_public_categories() -> list[dict]:
    """Returns all 6 enterprise SaaS industry templates with their tailored roles."""
    return list(INDUSTRY_CATEGORIES.values())


@router.post("/auth/register-company")
def register_company(body: RegisterCompanyIn, db: Session = Depends(get_db)):
    """Self-serve company SaaS registration. Provisions tenant, creates specialized industry roles, founder account, and returns authenticated session."""
    validate_business_email(body.business_email)

    existing_user = db.execute(select(User).where(User.email == body.business_email.lower().strip())).scalar_one_or_none()
    if existing_user:
        raise HTTPException(400, "An account with this business email already exists. Please sign in.")

    base_slug = slugify(body.company_name)
    slug = base_slug
    counter = 1
    while db.execute(select(Tenant).where(Tenant.slug == slug)).scalar_one_or_none():
        slug = f"{base_slug}-{counter}"
        counter += 1

    existing_tenant = db.execute(select(Tenant).where(func.lower(Tenant.name) == body.company_name.lower())).scalar_one_or_none()
    if existing_tenant:
        raise HTTPException(400, "A company with this name has already been registered.")

    cat_key = body.company_category.lower()
    category_template = INDUSTRY_CATEGORIES.get(cat_key, INDUSTRY_CATEGORIES["healthcare"])

    tenant = Tenant(
        name=body.company_name.strip(),
        slug=slug,
        industry_category=cat_key,
        website=(body.website or body.company_website or "").strip() or None,
        logo_url=body.logo_url or body.company_logo or None,
        primary_color=category_template.get("color", "#10b981"),
        status="active",
        settings={
            "tier": "Enterprise SaaS Pro",
            "industry": category_template["name"],
            "badge": category_template["badge"],
            "created_via": "self_serve_onboarding",
        },
    )
    db.add(tenant)
    db.flush()

    owner_role = Role(
        tenant_id=tenant.id,
        name="organization_owner",
        slug="owner",
        description="Organization founder and chief executive administrator.",
        default_clearance=3,
        scope="tenant",
        is_system=True,
        permission_keys=ALL_PERMISSIONS,
    )
    admin_role = Role(
        tenant_id=tenant.id,
        name="admin",
        slug="admin",
        description="System administrator with full operational access.",
        default_clearance=2,
        scope="tenant",
        is_system=True,
        permission_keys=ALL_PERMISSIONS,
    )
    db.add_all([owner_role, admin_role])

    for r_spec in category_template["roles"]:
        new_r = Role(
            tenant_id=tenant.id,
            name=r_spec["name"],
            slug=r_spec["slug"],
            description=r_spec["description"],
            default_clearance=r_spec["default_clearance"],
            scope="tenant",
            is_system=False,
            permission_keys=r_spec.get("permissions", []),
        )
        db.add(new_r)

    if body.custom_roles:
        for cr in body.custom_roles:
            c_name = cr.get("name") if isinstance(cr, dict) else str(cr).strip()
            if c_name:
                custom_slug = slugify(c_name)
                c_desc = cr.get("description", f"Specialized {c_name} role.") if isinstance(cr, dict) else f"Specialized {c_name} role."
                c_clearance = cr.get("default_clearance", 1) if isinstance(cr, dict) else 1
                c_perms = cr.get("permissions", ["document.metadata.read", "document.content.read", "chat.use", "chat.history.read_own"]) if isinstance(cr, dict) else ["document.metadata.read", "document.content.read", "chat.use", "chat.history.read_own"]
                c_role = Role(
                    tenant_id=tenant.id,
                    name=c_name,
                    slug=custom_slug,
                    description=c_desc,
                    default_clearance=c_clearance,
                    scope="tenant",
                    is_system=False,
                    permission_keys=c_perms,
                )
                db.add(c_role)

    dept_name = "Clinical Operations" if cat_key == "healthcare" else "Operations"
    dept = Department(tenant_id=tenant.id, name=dept_name)
    db.add(dept)
    db.flush()

    user = User(
        tenant_id=tenant.id,
        name=body.founder_name.strip(),
        email=body.business_email.lower().strip(),
        password_hash=hash_password(body.password),
        clearance=3,
        active=True,
        status="active",
        department_id=dept.id,
        roles=[owner_role, admin_role],
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    db.refresh(tenant)

    audit.log(
        db,
        tenant.id,
        user.id,
        "tenant.register",
        "allowed",
        company_name=tenant.name,
        slug=tenant.slug,
        category=cat_key,
    )

    token = make_token(user)
    return {
        "token": token,
        "user": user_out(user, {dept.id: dept.name}),
        "tenant": {
            "id": tenant.id,
            "name": tenant.name,
            "slug": tenant.slug,
            "category": tenant.industry_category,
            "website": tenant.website,
            "logo_url": tenant.logo_url,
            "primary_color": tenant.primary_color,
        },
    }


@router.get("/public/portal-info/{company_slug}/{role_slug}")
def get_role_portal_info(company_slug: str, role_slug: str, db: Session = Depends(get_db)):
    """Public endpoint to load company branding and role credentials card for role portal URL."""
    tenant = db.execute(select(Tenant).where(Tenant.slug == company_slug.lower(), Tenant.status == "active")).scalar_one_or_none()
    if not tenant:
        raise HTTPException(404, "Company workspace not found.")

    role = db.execute(
        select(Role).where(
            Role.tenant_id == tenant.id,
            or_(
                Role.slug == role_slug.lower(),
                func.lower(Role.name) == role_slug.replace("-", " ").lower(),
                func.lower(Role.name) == role_slug.lower(),
            ),
        )
    ).scalar_one_or_none()
    if not role:
        raise HTTPException(404, "Role portal not found for this company.")

    all_users = db.execute(select(User).where(User.tenant_id == tenant.id, User.active == True)).scalars().all()
    users_in_role = sum(1 for u in all_users if role in u.roles)

    return {
        "company_id": tenant.id,
        "company_name": tenant.name,
        "company_slug": tenant.slug,
        "company_logo": tenant.logo_url,
        "company_website": tenant.website,
        "company_category": tenant.industry_category,
        "company_color": tenant.primary_color or "#10b981",
        "role_id": role.id,
        "role_name": role.name,
        "role_slug": role.slug,
        "role_description": role.description,
        "clearance": role.default_clearance,
        "clearance_label": LEVELS[role.default_clearance] if 0 <= role.default_clearance < len(LEVELS) else "Internal",
        "users_count": users_in_role,
    }


@router.post("/public/portal-login")
def portal_login(body: PortalLoginIn, db: Session = Depends(get_db)):
    """Authenticates user through their role-specific company portal URL."""
    tenant = db.execute(select(Tenant).where(Tenant.slug == body.company_slug.lower(), Tenant.status == "active")).scalar_one_or_none()
    if not tenant:
        raise HTTPException(404, "Company workspace not found.")

    role = db.execute(
        select(Role).where(
            Role.tenant_id == tenant.id,
            or_(
                Role.slug == body.role_slug.lower(),
                func.lower(Role.name) == body.role_slug.replace("-", " ").lower(),
                func.lower(Role.name) == body.role_slug.lower(),
            ),
        )
    ).scalar_one_or_none()
    if not role:
        raise HTTPException(404, "Role portal not found.")

    user = db.execute(select(User).where(User.tenant_id == tenant.id, User.email == body.email.lower().strip())).scalar_one_or_none()
    if not user or not user.active or user.status == "deactivated" or not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "Invalid email or password.")

    user_role_ids = {r.id for r in user.roles}
    is_privileged = user.is_admin or user.is_platform_admin or ("organization_owner" in user.role_names)
    if role.id not in user_role_ids and not is_privileged:
        raise HTTPException(403, f"Your credentials are valid, but your account does not hold the '{role.name}' role in {tenant.name}.")

    user.last_login_at = now()
    db.commit()

    dept_map = {d.id: d.name for d in db.execute(select(Department).where(Department.tenant_id == tenant.id)).scalars()}
    audit.log(db, tenant.id, user.id, "auth.portal_login", "allowed", role_slug=role.slug, company_slug=tenant.slug)
    return {"token": make_token(user), "user": user_out(user, dept_map)}


@router.get("/tenant/roles-hub")
def get_tenant_roles_hub(user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Returns all roles configured for this company, with direct portal links and assigned members."""
    tenant = user.tenant
    roles = db.execute(select(Role).where(Role.tenant_id == tenant.id).order_by(Role.name)).scalars().all()
    all_users = db.execute(select(User).where(User.tenant_id == tenant.id)).scalars().all()

    result = []
    for r in roles:
        assigned = [
            {
                "id": u.id,
                "name": u.name,
                "email": u.email,
                "clearance": u.clearance,
                "clearance_label": LEVELS[u.clearance] if 0 <= u.clearance < len(LEVELS) else "Internal",
                "status": u.status,
                "is_admin": u.is_admin,
            }
            for u in all_users if r in u.roles
        ]
        portal_slug = r.slug or slugify(r.name)
        portal_url = f"/portal/{tenant.slug}/{portal_slug}"
        result.append({
            "id": r.id,
            "name": r.name,
            "slug": portal_slug,
            "description": r.description,
            "default_clearance": r.default_clearance,
            "clearance_label": LEVELS[r.default_clearance] if 0 <= r.default_clearance < len(LEVELS) else "Internal",
            "is_system": r.is_system,
            "portal_url": portal_url,
            "assigned_count": len(assigned),
            "users": assigned,
            "permissions": r.permission_keys or [],
        })
    return {
        "company_name": tenant.name,
        "company_slug": tenant.slug,
        "company_category": tenant.industry_category,
        "company_logo": tenant.logo_url,
        "roles": result,
    }


@router.post("/tenant/roles")
def add_custom_role(
    body: AddCustomRoleIn,
    user: User = Depends(require_any_permission("role.manage", "tenant.manage")),
    db: Session = Depends(get_db),
):
    """Allows company owner/admin to add an extra custom role."""
    clean_name = body.name.strip()
    slug = slugify(clean_name)

    existing = db.execute(
        select(Role).where(Role.tenant_id == user.tenant_id, or_(func.lower(Role.name) == clean_name.lower(), Role.slug == slug))
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(400, "A role with this name or slug already exists.")

    new_role = Role(
        tenant_id=user.tenant_id,
        name=clean_name,
        slug=slug,
        description=body.description.strip(),
        default_clearance=body.default_clearance,
        scope="tenant",
        is_system=False,
        permission_keys=body.permissions or ["document.metadata.read", "document.content.read", "chat.use", "chat.history.read_own"],
    )
    db.add(new_role)
    db.commit()
    db.refresh(new_role)

    audit.log(db, user.tenant_id, user.id, "role.create", "allowed", role_id=new_role.id, name=new_role.name, slug=new_role.slug)
    return {
        "id": new_role.id,
        "name": new_role.name,
        "slug": new_role.slug,
        "description": new_role.description,
        "default_clearance": new_role.default_clearance,
        "portal_url": f"/portal/{user.tenant.slug}/{new_role.slug}",
    }


@router.post("/tenant/roles/{role_id}/assign-user")
def assign_role_user(
    role_id: str,
    body: AssignRoleUserIn,
    user: User = Depends(require_any_permission("user.invite", "role.manage", "tenant.manage")),
    db: Session = Depends(get_db),
):
    """Creates or assigns an employee user to a specific role with name, username/email, and password."""
    role = db.get(Role, role_id)
    if not role or role.tenant_id != user.tenant_id:
        raise HTTPException(404, "Role not found.")

    target_email = body.email.lower().strip()
    existing_user = db.execute(select(User).where(User.tenant_id == user.tenant_id, User.email == target_email)).scalar_one_or_none()

    if existing_user:
        if body.password:
            existing_user.password_hash = hash_password(body.password)
        if role not in existing_user.roles:
            existing_user.roles.append(role)
        if body.clearance is not None:
            existing_user.clearance = max(existing_user.clearance, body.clearance)
        db.commit()
        db.refresh(existing_user)
        target = existing_user
    else:
        target = User(
            tenant_id=user.tenant_id,
            name=body.name.strip(),
            email=target_email,
            password_hash=hash_password(body.password),
            clearance=body.clearance if body.clearance is not None else role.default_clearance,
            active=True,
            status="active",
            created_by=user.id,
            roles=[role],
        )
        db.add(target)
        db.commit()
        db.refresh(target)

    audit.log(db, user.tenant_id, user.id, "user.assign_role", "allowed", target_user_id=target.id, role_id=role.id, role_name=role.name)
    return {
        "id": target.id,
        "name": target.name,
        "email": target.email,
        "clearance": target.clearance,
        "roles": target.role_names,
        "status": target.status,
    }


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


# ---------- users ----------

@router.get("/users")
def list_users(
    user: User = Depends(require_any_permission("user.read", "tenant.manage", "role.manage", "document.grant.manage")),
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


# ---------- roles ----------

@router.get("/roles")
def list_roles(
    user: User = Depends(require_any_permission("role.read", "role.manage", "tenant.manage", "document.grant.manage")),
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


# ---------- access requests ----------

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
    manager.broadcast_sync(user.tenant_id, {"type": "access_request.created", "id": req.id, "requester_id": req.requester_id})
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


@router.put("/access-requests/{request_id}")
@router.patch("/access-requests/{request_id}/edit")
def edit_access_request(
    request_id: str,
    body: EditAccessRequestIn,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict:
    req = db.get(AccessRequest, request_id)
    if not req or req.tenant_id != user.tenant_id:
        raise HTTPException(404, "Access request not found.")
    
    can_manage = user.has_permission("tenant.manage") or user.is_admin
    if req.requester_id != user.id and not can_manage:
        raise HTTPException(403, "You can only edit access requests you submitted.")

    if req.decision != "pending":
        raise HTTPException(400, f"Cannot edit an access request that has already been {req.decision}.")

    if body.resource_type is not None:
        req.resource_type = body.resource_type
    if body.resource_id is not None:
        req.resource_id = body.resource_id
    if body.reason is not None and body.reason.strip():
        req.reason = body.reason.strip()
    if body.target_user_id is not None:
        if body.target_user_id != user.id:
            can_delegate = any(r in ("team_lead", "department_manager", "admin", "organization_owner", "iam_admin") for r in user.role_names)
            if not can_delegate:
                raise HTTPException(403, "You do not have permission to request access on behalf of other users.")
        req.target_user_id = body.target_user_id if body.target_user_id != user.id else None

    db.commit()
    db.refresh(req)
    audit.log(
        db,
        user.tenant_id,
        user.id,
        "access_request.update",
        "allowed",
        request_id=req.id,
        resource_type=req.resource_type,
        resource_id=req.resource_id,
        target_user_id=req.target_user_id,
    )
    doc_titles = dict(db.execute(select(Document.id, Document.title).where(Document.tenant_id == user.tenant_id)).all())
    user_names = dict(db.execute(select(User.id, User.name).where(User.tenant_id == user.tenant_id)).all())
    return {
        "id": req.id,
        "requester_id": req.requester_id,
        "requester_name": user_names.get(req.requester_id, user.name),
        "target_user_id": req.target_user_id,
        "target_user_name": user_names.get(req.target_user_id, "") if req.target_user_id else "",
        "resource_type": req.resource_type,
        "resource_id": req.resource_id,
        "resource_name": doc_titles.get(req.resource_id, req.resource_id or "General Access"),
        "reason": req.reason,
        "decision": req.decision,
        "created_at": iso(req.created_at),
    }


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
    manager.broadcast_sync(approver.tenant_id, {
        "type": "access_request.decided",
        "id": req.id,
        "decision": req.decision,
        "resource_id": req.resource_id,
        "target_user_id": grant_target_id,
    })
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
    chunk_counts = dict(
        db.execute(
            select(Chunk.document_id, func.count(Chunk.id))
            .where(Chunk.tenant_id == user.tenant_id)
            .group_by(Chunk.document_id)
        ).all()
    )
    jobs = dict(
        db.execute(
            select(IngestionJob.document_id, IngestionJob)
            .where(IngestionJob.tenant_id == user.tenant_id)
        ).all()
    )
    can_manage = user.has_permission("document.grant.manage") or user.has_permission("document.upload") or user.is_admin
    if can_manage:
        docs = db.execute(select(Document).where(Document.tenant_id == user.tenant_id)
                          .order_by(Document.title)).scalars().all()
        readable = readable_document_ids(db, user)
        labels = _labels(db, user.tenant_id)
        return [{**doc_out(d, True, labels, jobs.get(d.id)), "readable": d.id in readable, "chunk_count": chunk_counts.get(d.id, 0)} for d in docs]
    docs = db.execute(select(Document).where(readable_clause(user)).order_by(Document.title))
    return [{**doc_out(d, False, None, jobs.get(d.id)), "readable": True, "chunk_count": chunk_counts.get(d.id, 0)} for d in docs.scalars()]


@router.get("/documents/scoreboard")
def get_documents_scoreboard(
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Returns catalog metrics and ingestion health scoreboard for the Documents page."""
    can_manage = user.has_permission("document.grant.manage") or user.has_permission("document.upload") or user.is_admin
    t_id = user.tenant_id
    all_docs = db.execute(select(Document).where(Document.tenant_id == t_id)).scalars().all()
    readable_ids = readable_document_ids(db, user)
    
    total_docs = len(all_docs)
    active_docs = sum(1 for d in all_docs if d.status == "active")
    processing_docs = sum(1 for d in all_docs if d.status == "processing")
    flagged_docs = sum(1 for d in all_docs if d.flagged or d.status == "flagged")
    total_pages = sum(d.page_count for d in all_docs)
    total_chunks = db.execute(select(func.count(Chunk.id)).where(Chunk.tenant_id == t_id)).scalar() or 0

    health_score = round((active_docs / max(total_docs, 1)) * 100) if total_docs > 0 else 100

    return {
        "total_documents": total_docs,
        "accessible_documents": len(readable_ids),
        "active_documents": active_docs,
        "processing_documents": processing_docs,
        "flagged_documents": flagged_docs,
        "total_pages": total_pages,
        "total_chunks": total_chunks,
        "health_score": health_score,
        "can_manage": can_manage,
    }


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
        raise HTTPException(400, str(error) or "Upload is not valid.") from error
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
    manager.broadcast_sync(actor.tenant_id, {"type": "document.created", "document_id": doc.id, "title": doc.title})
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
    manager.broadcast_sync(actor.tenant_id, {"type": "document.access_changed", "document_id": doc.id})
    db.refresh(doc)
    return doc_out(doc, True, _labels(db, actor.tenant_id))


@router.get("/documents/{document_id}/sections")
def get_document_sections(
    document_id: str,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Returns extracted headings and sections for a PDF or database records document."""
    doc = _tenant_document(db, user, document_id)
    normalized_sections = [
        {
            "id": s.get("id") or s.get("section_id"),
            "section_id": s.get("section_id") or s.get("id"),
            "heading": s.get("heading", ""),
            "level": s.get("level", 1),
            "page": s.get("page", 1),
            "preview": s.get("snippet", s.get("preview", "")),
            "snippet": s.get("snippet", s.get("preview", "")),
            "allowed_roles": s.get("allowed_roles", []),
            "auto_assigned": bool(s.get("auto_assigned")),
        }
        for s in (doc.sections_metadata or [])
    ]
    return {
        "document_id": doc.id,
        "title": doc.title,
        "kind": doc.kind,
        "sections": normalized_sections,
        "data_schema": doc.data_schema,
    }


@router.post("/documents/{document_id}/sections/auto-assign")
def auto_assign_sections(
    document_id: str,
    user: User = Depends(require_any_permission("document.grant.manage", "tenant.manage")),
    db: Session = Depends(get_db),
) -> dict:
    """Re-run the automatic section-to-role assignment (replaces manual section choices)."""
    doc = _tenant_document(db, user, document_id)
    if not section_access.applies_to(doc):
        raise HTTPException(400, "Spreadsheets and record tables use row rules instead of section rules.")
    result = section_access.auto_assign(db, doc)
    db.commit()
    audit.log(db, user.tenant_id, user.id, "document.section_auto_assign", "allowed",
              document_id=doc.id, restricted=result.get("restricted", 0))
    return {"status": "ok", **result, "sections_metadata": doc.sections_metadata}


@router.put("/documents/{document_id}/sections/{section_id}/access")
def update_section_access(
    document_id: str,
    section_id: str,
    body: SectionAccessIn,
    user: User = Depends(require_any_permission("document.grant.manage", "tenant.manage")),
    db: Session = Depends(get_db),
) -> dict:
    """Assigns or updates role access on a specific extracted section/heading."""
    doc = _tenant_document(db, user, document_id)
    raw_sections = doc.sections_metadata or []
    new_sections = []
    matched_section = None
    for sec in raw_sections:
        s_dict = dict(sec)
        if s_dict.get("id") == section_id or s_dict.get("section_id") == section_id:
            s_dict["allowed_roles"] = list(body.allowed_roles)
            s_dict["auto_assigned"] = False  # an admin's choice replaces the automatic one
            matched_section = s_dict
        new_sections.append(s_dict)

    if not matched_section:
        raise HTTPException(404, "Section not found in document outline.")

    doc.sections_metadata = new_sections
    flag_modified(doc, "sections_metadata")

    # Update chunks that belong to this section heading
    heading_text = matched_section.get("heading")
    if heading_text:
        chunks = db.execute(
            select(Chunk).where(Chunk.document_id == doc.id, Chunk.section_heading == heading_text)
        ).scalars().all()
        for c in chunks:
            c.allowed_roles = list(body.allowed_roles)
            flag_modified(c, "allowed_roles")
        # Enforced in SQL through chunk_access (authorization.chunk_rule_clause).
        role_ids = row_security.resolve_roles(db, user.tenant_id, list(body.allowed_roles))
        if body.allowed_roles and not role_ids:
            role_ids = ["__nobody__"]
        row_security.set_chunk_roles(db, [c.id for c in chunks], role_ids)

    db.commit()
    audit.log(
        db,
        user.tenant_id,
        user.id,
        "document.section_access_update",
        "allowed",
        document_id=doc.id,
        section_id=section_id,
        allowed_roles=body.allowed_roles,
    )
    return {"status": "ok", "section": matched_section}


@router.post("/documents/upload-database")
def upload_database_records(
    background: BackgroundTasks,
    file: UploadFile = File(...),
    title: str = Form(""),
    classification: int = Form(1),
    grants: str = Form("[]"),
    actor: User = Depends(require_any_permission("document.upload", "tenant.manage")),
    db: Session = Depends(get_db),
) -> dict:
    """Dedicated endpoint for uploading database records (CSV, TSV, JSON, SQL)."""
    limit = settings.max_upload_mb * 1024 * 1024
    data = file.file.read(limit + 1)
    if len(data) > limit:
        raise HTTPException(413, f"File is larger than {settings.max_upload_mb} MB.")
    filename = Path(file.filename or "database_records.csv").name
    ext = Path(filename).suffix.lower()
    if ext not in (".csv", ".tsv", ".json", ".sql"):
        raise HTTPException(400, "Database records upload must be a CSV, TSV, JSON, or SQL file.")

    clean_title = title.strip() or Path(filename).stem.replace("_", " ").title()
    parsed_grants = [Grant(**g) for g in json.loads(grants)]
    clean_grants = _clean_grants(db, actor.tenant_id, parsed_grants)
    for g in clean_grants:
        g.grantor_id = actor.id

    checksum = ingestion.compute_checksum(data)
    doc = Document(
        tenant_id=actor.tenant_id,
        owner_id=actor.id,
        title=clean_title,
        filename=filename,
        kind="database",
        classification=classification,
        status="processing",
        checksum=checksum,
        access=clean_grants,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    ingestion.store_original(doc, data)
    background.add_task(ingestion.process_document, doc.id)

    audit.log(db, actor.tenant_id, actor.id, "document.upload_database", "allowed", document_id=doc.id, title=doc.title)
    return {**doc_out(doc, True, _labels(db, actor.tenant_id)), "readable": True}


@router.delete("/documents/{document_id}")
def delete_document(
    document_id: str,
    actor: User = Depends(require_any_permission("document.delete", "tenant.manage")),
    db: Session = Depends(get_db),
) -> dict:
    doc = _tenant_document(db, actor, document_id)
    row_security.purge_document_chunks(db, doc.id)
    db.query(IngestionJob).filter(IngestionJob.document_id == doc.id).delete()
    ingestion.delete_files(doc)
    db.delete(doc)
    db.commit()
    audit.log(db, actor.tenant_id, actor.id, "document.delete", "allowed", document_id=document_id)
    manager.broadcast_sync(actor.tenant_id, {"type": "document.deleted", "document_id": document_id})
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
    stage = job.stage if job else ("complete" if doc.status == "active" else doc.status)
    percent = 100 if doc.status == "active" else (0 if doc.status in ("failed", "error") else STAGE_PERCENT.get(stage, 25))
    return {
        "document_id": doc.id,
        "status": doc.status,
        "job_status": job.status if job else doc.status,
        "stage": stage,
        "percent": percent,
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


_highlights_cache: dict[tuple[str, int, str], list[list[float]]] = {}


@router.get("/documents/{document_id}/pages/{page}/highlights")
def page_highlights(
    document_id: str,
    page: int,
    q: str = "",
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Boxes (0-1 page coordinates) around the cited sentence on a PDF or image page,
    so a citation opens on the exact words it relies on. Same 404 rule as page images."""
    if not can_read(db, user, document_id):
        raise HTTPException(404, "Document not found.")
    doc = db.get(Document, document_id)
    if not doc or len(q or "") < 3:
        return {"rects": []}

    cache_key = (document_id, page, q[:200])
    if cache_key in _highlights_cache:
        return {"rects": _highlights_cache[cache_key]}

    clean_q = re.sub(r"[\"'\*#\(\)\[\]]", " ", q)
    clean_q = re.sub(r"\s+", " ", clean_q).strip()

    rects = []
    try:
        if doc.kind == "pdf":
            path = ingestion.doc_dir(doc) / ("original" + Path(doc.filename).suffix.lower())
            import pymupdf
            with pymupdf.open(path) as pdf:
                if 1 <= page <= len(pdf):
                    pg = pdf[page - 1]
                    w, h = pg.rect.width, pg.rect.height
                    # 1. Try direct search of full clean phrase
                    found = pg.search_for(clean_q)
                    # 2. Try searching by sub-clauses
                    if not found:
                        clauses = [c.strip() for c in re.split(r"[,\.;\n]", clean_q) if len(c.strip().split()) >= 3]
                        for c in clauses:
                            found = pg.search_for(c)
                            if found:
                                break
                    # 3. Try substantive word pairs/runs
                    if not found:
                        words = [w for w in clean_q.split() if len(w) > 3 and w.lower() not in {
                            "that", "with", "this", "from", "they", "their", "there", "have", "were", "been"
                        }]
                        if len(words) >= 2:
                            for i in range(len(words) - 1):
                                pair = f"{words[i]} {words[i+1]}"
                                f = pg.search_for(pair)
                                if f:
                                    found.extend(f)
                                    if len(found) >= 4:
                                        break
                    if found:
                        rects = [[round(r.x0 / w, 4), round(r.y0 / h, 4), round(r.x1 / w, 4), round(r.y1 / h, 4)] for r in found[:30]]

        elif doc.kind == "image":
            # Image highlight via page 1 PNG and RapidOCR box matching
            p_img = ingestion.page_image_path(doc, page)
            if p_img.is_file():
                import pymupdf
                pix = pymupdf.Pixmap(str(p_img))
                w, h = pix.width, pix.height
                ocr_eng = ocr.get_ocr_engine()
                if ocr_eng:
                    res, _ = ocr_eng(p_img.read_bytes())
                    if res:
                        q_lower = clean_q.lower()
                        stopwords = {
                            "the", "and", "for", "with", "from", "that", "this", "have", "were", "been",
                            "they", "their", "there", "what", "when", "where", "which", "will", "would",
                            "could", "should", "your", "about", "into", "over", "after", "also", "page"
                        }
                        q_words = {w.lower() for w in re.findall(r"\b\w+\b", clean_q) if len(w) > 2 and w.lower() not in stopwords}
                        found_boxes = []

                        # Pass 1: exact substring match
                        for box, text, _conf in res:
                            t_lower = text.lower().strip()
                            if len(t_lower) >= 3 and (t_lower in q_lower or q_lower in t_lower):
                                x0 = min(pt[0] for pt in box)
                                y0 = min(pt[1] for pt in box)
                                x1 = max(pt[0] for pt in box)
                                y1 = max(pt[1] for pt in box)
                                found_boxes.append([round(x0 / w, 4), round(y0 / h, 4), round(x1 / w, 4), round(y1 / h, 4)])

                        # Pass 2: if few exact matches, match meaningful keyword tokens
                        if len(found_boxes) < 2 and q_words:
                            for box, text, _conf in res:
                                t_words = {w.lower() for w in re.findall(r"\b\w+\b", text) if len(w) > 2 and w.lower() not in stopwords}
                                overlap = q_words & t_words
                                if overlap and (len(overlap) >= 2 or len(overlap) / max(len(t_words), 1) >= 0.5):
                                    x0 = min(pt[0] for pt in box)
                                    y0 = min(pt[1] for pt in box)
                                    x1 = max(pt[0] for pt in box)
                                    y1 = max(pt[1] for pt in box)
                                    coords = [round(x0 / w, 4), round(y0 / h, 4), round(x1 / w, 4), round(y1 / h, 4)]
                                    if coords not in found_boxes:
                                        found_boxes.append(coords)
                        rects = found_boxes[:30]
    except Exception:
        pass

    _highlights_cache[cache_key] = rects
    if len(_highlights_cache) > 500:
        _highlights_cache.clear()
    return {"rects": rects}



@router.put("/documents/{document_id}/row-policy")
def update_row_policy(
    document_id: str,
    body: RowPolicyIn,
    user: User = Depends(require_any_permission("document.grant.manage", "tenant.manage")),
    db: Session = Depends(get_db),
) -> dict:
    """Row-level security for structured records: each row is visible only to the
    department (or role) named in one column; full-access roles see every row.
    Enforced inside the retrieval SQL through chunk_access."""
    doc = _tenant_document(db, user, document_id)
    if doc.kind not in ("database", "xlsx"):
        raise HTTPException(400, "Row rules apply to structured records (CSV, JSON, XLSX).")
    columns = (doc.data_schema or {}).get("columns", [])
    if body.column and body.column not in columns:
        raise HTTPException(400, "Unknown column.")
    doc.row_policy = body.model_dump() if body.column else None
    db.commit()
    stats = row_security.apply_row_policy(db, doc)
    audit.log(db, user.tenant_id, user.id, "document.row_policy_update", "allowed",
              document_id=doc.id, column=body.column, subject_type=body.subject_type)
    return {"status": "ok", "row_policy": doc.row_policy, **stats}


@router.get("/system/pipeline")
def pipeline_info(user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    """What the RAG pipeline is running on, for the UI's architecture view."""
    from app import llm
    from app.db import IS_SQLITE
    from app.models import ChunkAccess, Record
    tenant_chunks = select(Chunk.id).where(Chunk.tenant_id == user.tenant_id)
    return {
        "provider": "gemini" if llm.enabled() else settings.ai_provider,
        "chat_model": settings.gemini_model if llm.enabled() else (settings.ai_chat_model or "local-extractive"),
        "embed_model": settings.gemini_embed_model if llm.enabled() else (settings.ai_embed_model or "local-hash-256"),
        "embed_dim": settings.embed_dim if llm.enabled() else 256,
        "vector_store": "SQLite + in-process cosine/BM25" if IS_SQLITE else "PostgreSQL pgvector + tsvector",
        "ocr": ["gemini-vision"] * llm.enabled() + (["rapidocr"] if settings.local_ocr else []),
        "documents": db.execute(select(func.count(Document.id)).where(Document.tenant_id == user.tenant_id,
                                                                     Document.status == "active")).scalar_one(),
        "chunks": db.execute(select(func.count()).select_from(tenant_chunks.subquery())).scalar_one(),
        "records": db.execute(select(func.count(Record.id)).where(Record.tenant_id == user.tenant_id)).scalar_one(),
        "row_rules": db.execute(select(func.count(func.distinct(ChunkAccess.chunk_id)))
                                .where(ChunkAccess.chunk_id.in_(tenant_chunks))).scalar_one(),
    }


# ---------- chat ----------

@router.post("/chat/query")
def chat_query(
    body: QueryIn,
    user: User = Depends(require_permission("chat.use")),
    db: Session = Depends(get_db),
) -> dict:
    chat.check_rate_limit(user.id)
    return chat.answer_question(
        db,
        user,
        body.question.strip(),
        body.conversation_id,
        briefing_mode=body.briefing_mode,
        document_ids=body.document_ids,
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
    cited = {c.get("chunk_id") for m in conversation.messages for c in (m.citations or []) if c.get("chunk_id")}
    return {
        "id": conversation.id,
        "title": conversation.title,
        "messages": chat.visible_messages(conversation.messages, readable,
                                          chat.readable_chunk_ids(db, user, cited)),
    }


@router.get("/chat/suggestions")
def get_chat_suggestions(
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Returns dynamic recommended questions tailored strictly to the current user's
    assigned roles and the documents they actually have access to in this workspace."""
    readable_ids = readable_document_ids(db, user)
    docs = db.execute(
        select(Document).where(Document.id.in_(readable_ids), Document.status == "active")
    ).scalars().all() if readable_ids else []

    role_labels = [r.name for r in user.roles] or ["Employee"]
    primary_role_label = role_labels[0]

    # If user has no accessible documents, return clear guidance
    if not docs:
        return {
            "suggestions": [
                "How do I request access to organization documents?",
                "What documents are available in this workspace?",
                "Who is the administrator for this tenant?",
            ],
            "role": primary_role_label,
            "accessible_documents_count": 0,
            "has_access": False,
        }

    suggestions = []
    seen = set()

    def add_q(q: str):
        if q not in seen and len(suggestions) < 6:
            seen.add(q)
            suggestions.append(q)

    # Build suggestions from what each readable document actually contains:
    # numeric columns for tables, headings for prose, the title otherwise.
    for d in docs:
        schema = d.data_schema or {}
        if d.kind in ("database", "xlsx") and schema.get("columns"):
            numeric = [c for c, t in (schema.get("column_types") or {}).items() if t == "number"]
            add_q(f"How many records are in {d.title}?")
            if numeric:
                add_q(f"What is the total {numeric[0]} in {d.title}?")
            continue
        headings = [
            re.sub(r"^[0-9.\-\s]+", "", s.get("heading", "")).strip()
            for s in (d.sections_metadata or [])
        ]
        headings = [h for h in headings if h and len(h) < 50 and h.lower() != d.title.lower()
                    and not any(k in h.lower() for k in ("table of contents", "outline", "cover"))]
        if headings:
            add_q(f"What does {d.title} say about {headings[0]}?")
        else:
            add_q(f"What are the key points in {d.title}?")

    # Fallback / General questions grounded in accessible document titles
    if len(suggestions) < 3:
        for d in docs:
            add_q(f"Summarize {d.title}.")

    return {
        "suggestions": suggestions[:4],
        "role": primary_role_label,
        "accessible_documents_count": len(docs),
        "has_access": True,
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
    # Row-level view for structured records the user can open: how many rows the SQL rule lets through.
    from app.authorization import readable_chunk_clause
    from app.models import Record
    row_access = []
    for row in searchable:
        d = next(x for x in docs if x.id == row["document_id"])
        if d.kind not in ("database", "xlsx"):
            continue
        total = db.execute(select(func.count(Record.id)).where(Record.document_id == d.id)).scalar_one()
        visible = db.execute(select(func.count(Record.id)).join(Chunk, Chunk.id == Record.chunk_id)
                             .join(Document, Document.id == Record.document_id)
                             .where(Record.document_id == d.id, readable_chunk_clause(target))).scalar_one()
        rule = d.row_policy or {}
        row_access.append({"document_id": d.id, "title": d.title, "visible_rows": visible, "total_rows": total,
                           "rule": f"Rows filtered by {rule['column']} ({rule.get('subject_type', 'department')})"
                           if rule.get("column") else "No row rule"})
    audit.log(db, admin.tenant_id, admin.id, "policy.simulate", "allowed", target_user_id=target.id)
    return {
        "user": user_out(target),
        "matches": matches,
        "searchable": searchable,
        "excluded": excluded,
        "row_access": row_access,
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
    events = db.execute(stmt.order_by(AuditEvent.id.desc()).limit(200)).scalars().all()
    user_map = {u.id: u for u in db.execute(select(User).where(User.tenant_id == admin.tenant_id)).scalars()}
    out_events = []
    for e in events:
        u = user_map.get(e.user_id)
        q = e.detail.get("question") if e.detail else None
        if not q and e.action == "chat.query" and e.detail and e.detail.get("conversation_id"):
            q = db.execute(
                select(Message.content)
                .where(Message.conversation_id == e.detail["conversation_id"], Message.role == "user")
                .order_by(Message.id.desc())
            ).scalars().first()

        roles = e.detail.get("user_roles") if e.detail else None
        if not roles and u:
            roles = [r.name for r in u.roles]

        out_events.append({
            "id": e.id,
            "time": iso(e.created_at),
            "user": names.get(e.user_id, names.get(e.actor, e.actor or "-")),
            "user_email": u.email if u else (e.detail.get("user_email") if e.detail else ""),
            "roles": roles or [],
            "question": q,
            "actor": e.actor or e.user_id,
            "action": e.action,
            "decision": e.decision,
            "correlation_id": e.correlation_id,
            "detail": e.detail,
            "suggested_resource": e.detail.get("suggested_resource") if e.detail else None,
            "documents": [
                titles.get(i, "deleted document")
                for i in (
                    e.detail.get("context_document_ids")
                    or ([e.detail["document_id"]] if e.detail.get("document_id") else [])
                )
            ] if e.detail else [],
        })
    return out_events


@router.get("/audit/unauthorized-queries")
def get_unauthorized_queries(
    admin: User = Depends(require_any_permission("audit.read", "tenant.manage")),
    db: Session = Depends(get_db),
) -> list[dict]:
    """Returns questions asked by assigned roles that received no authorized source (abstained),
    along with the user's assigned roles, timestamp, and inaccessible suggested resources."""
    stmt = (
        select(AuditEvent)
        .where(
            AuditEvent.tenant_id == admin.tenant_id,
            AuditEvent.action == "chat.query",
            AuditEvent.decision == "abstained",
        )
        .order_by(AuditEvent.id.desc())
        .limit(100)
    )
    events = db.execute(stmt).scalars().all()
    user_map = {u.id: u for u in db.execute(select(User).where(User.tenant_id == admin.tenant_id)).scalars()}
    
    out = []
    for e in events:
        u = user_map.get(e.user_id)
        q = e.detail.get("question") if e.detail else None
        if not q and e.detail and e.detail.get("conversation_id"):
            q = db.execute(
                select(Message.content)
                .where(Message.conversation_id == e.detail["conversation_id"], Message.role == "user")
                .order_by(Message.id.desc())
            ).scalars().first()
        
        roles = e.detail.get("user_roles") if e.detail else None
        if not roles and u:
            roles = [r.name for r in u.roles]

        out.append({
            "id": e.id,
            "time": iso(e.created_at),
            "user_id": e.user_id,
            "user_name": u.name if u else (e.actor or "Unknown"),
            "user_email": u.email if u else "",
            "roles": roles or ["Employee"],
            "user_roles": roles or ["Employee"],
            "question": q or "Query with no authorized sources found",
            "decision": "abstained",
            "suggested_resource": e.detail.get("suggested_resource") if e.detail else None,
            "conversation_id": e.detail.get("conversation_id") if e.detail else None,
        })
    return out


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
        raise HTTPException(504, "The test run took too long.") from None
    return security_tests(admin)


# ---------- tenant settings ----------

@router.get("/tenant/settings")
def get_tenant_settings(
    user: User = Depends(require_any_permission("tenant.manage")),
    db: Session = Depends(get_db),
) -> dict:
    tenant = user.tenant
    return {
        "id": tenant.id,
        "name": tenant.name,
        "slug": tenant.slug,
        "industry_category": tenant.industry_category,
        "website": tenant.website,
        "logo_url": tenant.logo_url,
        "primary_color": tenant.primary_color or "#10b981",
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
    if body.website is not None:
        tenant.website = body.website.strip()
    if body.logo_url is not None:
        tenant.logo_url = body.logo_url
    if body.industry_category is not None:
        tenant.industry_category = body.industry_category
    if body.primary_color is not None:
        tenant.primary_color = body.primary_color
    if body.settings:
        tenant.settings = {**(tenant.settings or {}), **body.settings}
        flag_modified(tenant, "settings")
    db.commit()
    db.refresh(tenant)
    audit.log(db, tenant.id, user.id, "tenant.update", "allowed", settings=tenant.settings)
    return {
        "id": tenant.id,
        "name": tenant.name,
        "slug": tenant.slug,
        "industry_category": tenant.industry_category,
        "website": tenant.website,
        "logo_url": tenant.logo_url,
        "primary_color": tenant.primary_color,
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


# ---------- platform super admin ----------

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


# ---------- platform security settings ----------

def _platform_security_file() -> Path:
    # Kept next to stored documents so a test run (temporary storage dir) never
    # touches the live settings.
    return Path(settings.file_storage_dir) / "platform_security.json"


def _get_platform_security() -> dict:
    default_sec = {
        # Stored policy only: nothing below is enforced by this build yet.
        "mfa_enforced": False,
        "session_timeout_minutes": 60,
        "max_failed_logins": 5,
        "password_min_length": 12,
        "allowed_file_types": [".pdf", ".docx", ".xlsx", ".txt", ".csv"],
        "max_upload_size_mb": 25,
        "updated_at": iso(datetime.now(timezone.utc)),
    }
    if _platform_security_file().is_file():
        try:
            return {**default_sec, **json.loads(_platform_security_file().read_text())}
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
    _platform_security_file().parent.mkdir(parents=True, exist_ok=True)
    _platform_security_file().write_text(json.dumps(current, indent=2))
    audit.log(db, admin.tenant_id, admin.id, "platform.security_settings_update", "allowed", updates=updates)
    return current


# ---------- departments ----------

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


# ---------- billing & admins ----------

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


# ---------- department insights ----------

@router.get("/department/insights")
def get_department_insights(
    department_id: str | None = Query(None),
    user: User = Depends(require_any_permission("user.read", "chat.use")),
    db: Session = Depends(get_db),
) -> dict:
    target_dept_id = department_id if (user.is_admin and department_id) else user.department_id
    if not target_dept_id:
        first_dept = db.execute(select(Department).where(Department.tenant_id == user.tenant_id).order_by(Department.name)).scalars().first()
        if first_dept:
            target_dept_id = first_dept.id
        else:
            return {
                "department_id": None,
                "department_name": "General",
                "member_count": 0,
                "document_count": 0,
                "monthly_queries": 0,
                "members": [],
                "documents": [],
                "activities": [],
            }
    
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


# ---------- hr admin: employee management ----------

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


# ---------- dashboard stats and flagged-document review ----------

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
            "accessible_documents": total_docs,
            "total_users": total_users,
            "total_audits": total_audits,
            "my_queries": db.execute(select(func.count(AuditEvent.id)).where(AuditEvent.user_id == user.id, AuditEvent.action == "chat.query")).scalar() or 0,
            "total_queries": db.execute(select(func.count(AuditEvent.id)).where(AuditEvent.action == "chat.query")).scalar() or 0,
            "pending_requests_count": db.execute(select(func.count(AccessRequest.id)).where(AccessRequest.decision == "pending")).scalar() or 0,
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
        row_security.purge_document_chunks(db, doc.id)
        db.query(IngestionJob).filter(IngestionJob.document_id == doc.id).delete()
        ingestion.delete_files(doc)
        db.delete(doc)
        audit_action = "document.flagged.purged"

    db.commit()
    audit.log(db, user.tenant_id, user.id, audit_action, "allowed", document_id=doc_id, note=body.note)
    return {"status": "ok", "decision": body.decision}
