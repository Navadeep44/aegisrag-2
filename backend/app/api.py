import json
import os
import subprocess
import sys
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import audit, chat, ingestion, retrieval
from app.auth import current_user, make_token, require_admin, verify_password
from app.authorization import can_read, explain, readable_clause, readable_document_ids
from app.config import settings
from app.db import database_status, get_db
from app.models import LEVELS, iso, AuditEvent, Chunk, Conversation, Document, DocumentAccess, Role, User

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


class Grant(BaseModel):
    subject_type: str
    subject_id: str | None = None


class AccessIn(BaseModel):
    classification: int | None = Field(default=None, ge=0, le=3)
    grants: list[Grant]


class SimulateIn(BaseModel):
    user_id: str
    question: str = Field(min_length=1, max_length=2000)


def user_out(u: User) -> dict:
    return {"id": u.id, "name": u.name, "email": u.email, "tenant": u.tenant.name,
            "roles": u.role_names, "clearance": u.clearance,
            "clearance_label": LEVELS[u.clearance], "is_admin": u.is_admin}


def doc_out(d: Document, with_access: bool = False, labels: dict | None = None) -> dict:
    out = {"id": d.id, "title": d.title, "filename": d.filename, "kind": d.kind,
           "classification": d.classification, "classification_label": LEVELS[d.classification],
           "status": d.status, "note": d.note, "page_count": d.page_count,
           "flagged": d.flagged, "created_at": iso(d.created_at)}
    if with_access:
        labels = labels or {}
        out["access"] = [
            {"subject_type": g.subject_type, "subject_id": g.subject_id,
             "label": "Everyone" if g.subject_type == "everyone" else labels.get(g.subject_id, "?")}
            for g in d.access
        ]
    return out


def _labels(db: Session, tenant_id: str) -> dict:
    roles = db.execute(select(Role).where(Role.tenant_id == tenant_id)).scalars()
    users = db.execute(select(User).where(User.tenant_id == tenant_id)).scalars()
    return {**{r.id: r.name for r in roles}, **{u.id: u.name for u in users}}


def _clean_grants(db: Session, tenant_id: str, grants: list[Grant]) -> list[DocumentAccess]:
    """Grants may only name roles and users of the admin's own tenant."""
    role_ids = set(db.execute(select(Role.id).where(Role.tenant_id == tenant_id)).scalars())
    user_ids = set(db.execute(select(User.id).where(User.tenant_id == tenant_id)).scalars())
    out, seen = [], set()
    for g in grants:
        key = (g.subject_type, g.subject_id)
        if key in seen:
            continue
        seen.add(key)
        if g.subject_type == "everyone":
            out.append(DocumentAccess(subject_type="everyone", subject_id=None))
        elif g.subject_type == "role" and g.subject_id in role_ids:
            out.append(DocumentAccess(subject_type="role", subject_id=g.subject_id))
        elif g.subject_type == "user" and g.subject_id in user_ids:
            out.append(DocumentAccess(subject_type="user", subject_id=g.subject_id))
        else:
            raise HTTPException(400, "A grant names an unknown role or user.")
    return out


def _tenant_document(db: Session, admin: User, document_id: str) -> Document:
    doc = db.get(Document, document_id)
    if not doc or doc.tenant_id != admin.tenant_id:
        raise HTTPException(404, "Document not found.")
    return doc


# ---------- health and login ----------

@router.get("/health")
def health() -> dict:
    return {"status": "ok", "ai_provider": settings.ai_provider, **database_status()}


@router.post("/auth/login")
def login(body: LoginIn, db: Session = Depends(get_db)) -> dict:
    user = db.execute(select(User).where(User.email == body.email.lower())).scalar_one_or_none()
    if not user or not user.active or not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "Email or password is incorrect.")
    return {"token": make_token(user), "user": user_out(user)}


@router.get("/auth/demo-users")
def demo_users(db: Session = Depends(get_db)) -> list[dict]:
    if not settings.demo_mode:
        return []
    users = db.execute(select(User).where(User.active).order_by(User.email)).scalars()
    return [{"email": u.email, "name": u.name, "tenant": u.tenant.name, "roles": u.role_names}
            for u in users]


@router.post("/auth/demo-login")
def demo_login(body: DemoLoginIn, db: Session = Depends(get_db)) -> dict:
    if not settings.demo_mode:
        raise HTTPException(404, "Not found.")
    user = db.execute(select(User).where(User.email == body.email.lower())).scalar_one_or_none()
    if not user or not user.active:
        raise HTTPException(404, "Not found.")
    return {"token": make_token(user), "user": user_out(user)}


@router.get("/users/me")
def me(user: User = Depends(current_user)) -> dict:
    return user_out(user)


@router.get("/users")
def list_users(admin: User = Depends(require_admin), db: Session = Depends(get_db)) -> list[dict]:
    users = db.execute(select(User).where(User.tenant_id == admin.tenant_id).order_by(User.name))
    return [user_out(u) for u in users.scalars()]


@router.get("/roles")
def list_roles(admin: User = Depends(require_admin), db: Session = Depends(get_db)) -> list[dict]:
    roles = db.execute(select(Role).where(Role.tenant_id == admin.tenant_id).order_by(Role.name))
    return [{"id": r.id, "name": r.name} for r in roles.scalars()]


# ---------- documents ----------

@router.get("/documents")
def list_documents(user: User = Depends(current_user), db: Session = Depends(get_db)) -> list[dict]:
    """Employees see documents they can read. Admins see every document's
    title and access list so they can manage it, but not its content."""
    if user.is_admin:
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
    admin: User = Depends(require_admin),
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
    doc = Document(tenant_id=admin.tenant_id, owner_id=admin.id, title=title.strip() or filename,
                   filename=filename, kind=kind, classification=classification,
                   access=_clean_grants(db, admin.tenant_id, parsed))
    db.add(doc)
    db.commit()
    ingestion.store_original(doc, data)
    background.add_task(ingestion.process_document, doc.id)
    audit.log(db, admin.tenant_id, admin.id, "document.upload", "allowed", document_id=doc.id)
    return doc_out(doc, True, _labels(db, admin.tenant_id))


@router.patch("/documents/{document_id}/access")
def update_access(document_id: str, body: AccessIn, admin: User = Depends(require_admin),
                  db: Session = Depends(get_db)) -> dict:
    doc = _tenant_document(db, admin, document_id)
    doc.access = _clean_grants(db, admin.tenant_id, body.grants)
    if body.classification is not None:
        doc.classification = body.classification
    db.commit()
    audit.log(db, admin.tenant_id, admin.id, "document.access_change", "allowed",
              document_id=doc.id, grants=[[g.subject_type, g.subject_id] for g in doc.access],
              classification=doc.classification)
    db.refresh(doc)
    return doc_out(doc, True, _labels(db, admin.tenant_id))


@router.delete("/documents/{document_id}")
def delete_document(document_id: str, admin: User = Depends(require_admin),
                    db: Session = Depends(get_db)) -> dict:
    doc = _tenant_document(db, admin, document_id)
    db.query(Chunk).filter(Chunk.document_id == doc.id).delete()
    ingestion.delete_files(doc)
    db.delete(doc)
    db.commit()
    audit.log(db, admin.tenant_id, admin.id, "document.delete", "allowed", document_id=document_id)
    return {"deleted": document_id}


@router.get("/documents/{document_id}/pages/{page}")
def page_image(document_id: str, page: int, user: User = Depends(current_user),
               db: Session = Depends(get_db)):
    """Same response for 'does not exist' and 'not allowed', so ids cannot be probed."""
    if not can_read(db, user, document_id):
        audit.log(db, user.tenant_id, user.id, "document.read", "denied", document_id=document_id)
        raise HTTPException(404, "Document not found.")
    path = ingestion.page_image_path(db.get(Document, document_id), page)
    if not path.is_file():
        raise HTTPException(404, "No preview for this page.")
    return FileResponse(path, media_type="image/png")


# ---------- chat ----------

@router.post("/chat/query")
def chat_query(body: QueryIn, user: User = Depends(current_user),
               db: Session = Depends(get_db)) -> dict:
    chat.check_rate_limit(user.id)
    return chat.answer_question(db, user, body.question.strip(), body.conversation_id)


@router.get("/chat/sessions")
def chat_sessions(user: User = Depends(current_user), db: Session = Depends(get_db)) -> list[dict]:
    rows = db.execute(select(Conversation).where(Conversation.user_id == user.id)
                      .order_by(Conversation.created_at.desc()).limit(30)).scalars()
    return [{"id": c.id, "title": c.title, "created_at": iso(c.created_at)} for c in rows]


@router.get("/chat/sessions/{conversation_id}")
def chat_session(conversation_id: str, user: User = Depends(current_user),
                 db: Session = Depends(get_db)) -> dict:
    conversation = db.get(Conversation, conversation_id)
    if not conversation or conversation.user_id != user.id:
        raise HTTPException(404, "Conversation not found.")
    readable = readable_document_ids(db, user)
    return {"id": conversation.id, "title": conversation.title,
            "messages": chat.visible_messages(conversation.messages, readable)}


# ---------- admin: simulator, audit, tests ----------

@router.post("/policies/simulate")
def simulate(body: SimulateIn, admin: User = Depends(require_admin),
             db: Session = Depends(get_db)) -> dict:
    """Shows which documents a user's question could draw on, and why the rest
    are excluded. Returns titles and reasons only, never document content."""
    target = db.get(User, body.user_id)
    if not target or target.tenant_id != admin.tenant_id:
        raise HTTPException(404, "User not found.")
    roles = {r.id: r.name for r in db.execute(
        select(Role).where(Role.tenant_id == admin.tenant_id)).scalars()}
    docs = db.execute(select(Document).where(Document.tenant_id == admin.tenant_id)
                      .order_by(Document.title)).scalars().all()
    searchable, excluded = [], []
    for d in docs:
        allowed, reason = explain(target, d, roles)
        row = {"document_id": d.id, "title": d.title,
               "classification_label": LEVELS[d.classification], "reason": reason}
        (searchable if allowed else excluded).append(row)
    matches, seen = [], set()
    for hit in retrieval.search(db, target, body.question):
        if hit.document.id not in seen:
            seen.add(hit.document.id)
            matches.append({"document_id": hit.document.id, "title": hit.document.title,
                            "page": hit.chunk.page})
    audit.log(db, admin.tenant_id, admin.id, "policy.simulate", "allowed", target_user_id=target.id)
    return {"user": user_out(target), "matches": matches,
            "searchable": searchable, "excluded": excluded}


@router.get("/audit/events")
def audit_events(decision: str | None = None, admin: User = Depends(require_admin),
                 db: Session = Depends(get_db)) -> list[dict]:
    stmt = select(AuditEvent).where(AuditEvent.tenant_id == admin.tenant_id)
    if decision:
        stmt = stmt.where(AuditEvent.decision == decision)
    names = _labels(db, admin.tenant_id)
    titles = dict(db.execute(select(Document.id, Document.title)
                             .where(Document.tenant_id == admin.tenant_id)).all())
    events = db.execute(stmt.order_by(AuditEvent.id.desc()).limit(200)).scalars()
    return [{"id": e.id, "time": iso(e.created_at), "user": names.get(e.user_id, "-"),
             "action": e.action, "decision": e.decision, "detail": e.detail,
             "documents": [titles.get(i, "deleted document") for i in
                           (e.detail.get("context_document_ids")
                            or ([e.detail["document_id"]] if e.detail.get("document_id") else []))]}
            for e in events]


@router.get("/security/tests")
def security_tests(admin: User = Depends(require_admin)) -> dict:
    if not REPORT.is_file():
        return {"ran_at": None, "tests": []}
    return json.loads(REPORT.read_text())


@router.post("/security/tests/run")
def run_security_tests(admin: User = Depends(require_admin)) -> dict:
    """Runs the test suite against a separate test database, never the live one."""
    env = {**os.environ, "DATABASE_URL": settings.database_url,
           "DEMO_PASSWORD": settings.demo_password}
    try:
        subprocess.run([sys.executable, "-m", "pytest", "tests", "-q", "-p", "no:cacheprovider"],
                       cwd=BACKEND_ROOT, env=env, timeout=600, capture_output=True)
    except subprocess.TimeoutExpired:
        raise HTTPException(504, "The test run took too long.")
    return security_tests(admin)
