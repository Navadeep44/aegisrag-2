import uuid
from datetime import datetime, timezone

from pgvector.sqlalchemy import Vector
from sqlalchemy import JSON, Boolean, Column, DateTime, ForeignKey, Integer, String, Table, Text
from app.db import IS_POSTGRES
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

LEVELS = ["public", "internal", "confidential", "restricted"]

ALL_PERMISSIONS = [
    "tenant.manage",
    "user.read",
    "user.invite",
    "user.deactivate",
    "role.read",
    "role.manage",
    "role.assign",
    "clearance.assign",
    "document.metadata.read",
    "document.content.read",
    "document.upload",
    "document.classify",
    "document.grant.manage",
    "document.delete",
    "chat.use",
    "chat.history.read_own",
    "audit.read",
    "security_tests.read",
    "security_tests.run",
    "policy.simulate",
    "platform.tenant.manage",
]

DEFAULT_ROLE_PERMISSIONS: dict[str, list[str]] = {
    "platform_super_admin": [
        "platform.tenant.manage",
        "audit.read",
    ],
    "organization_owner": [
        "tenant.manage",
        "user.read",
        "user.invite",
        "user.deactivate",
        "role.read",
        "role.assign",
        "clearance.assign",
        "document.metadata.read",
        "document.content.read",
        "chat.use",
        "chat.history.read_own",
        "audit.read",
    ],
    "admin": [
        "tenant.manage",
        "user.read",
        "user.invite",
        "user.deactivate",
        "role.read",
        "role.manage",
        "role.assign",
        "clearance.assign",
        "document.metadata.read",
        "document.content.read",
        "document.upload",
        "document.classify",
        "document.grant.manage",
        "document.delete",
        "chat.use",
        "chat.history.read_own",
        "audit.read",
        "security_tests.read",
        "security_tests.run",
        "policy.simulate",
    ],
    "iam_admin": [
        "user.read",
        "user.invite",
        "user.deactivate",
        "role.read",
        "role.manage",
        "role.assign",
        "clearance.assign",
        "document.metadata.read",
        "document.content.read",
        "chat.use",
        "chat.history.read_own",
    ],
    "document_manager": [
        "document.metadata.read",
        "document.content.read",
        "document.upload",
        "document.classify",
        "document.grant.manage",
        "document.delete",
        "chat.use",
        "chat.history.read_own",
    ],
    "security_auditor": [
        "audit.read",
        "security_tests.read",
        "document.metadata.read",
        "chat.history.read_own",
        "user.read",
    ],
    "hr": [
        "user.read",
        "user.invite",
        "user.deactivate",
        "document.upload",
        "document.classify",
        "document.grant.manage",
        "document.metadata.read",
        "document.content.read",
        "chat.use",
        "chat.history.read_own",
    ],
    "department_manager": [
        "user.read",
        "document.metadata.read",
        "document.content.read",
        "chat.use",
        "chat.history.read_own",
    ],
    "team_lead": [
        "user.read",
        "document.metadata.read",
        "document.content.read",
        "chat.use",
        "chat.history.read_own",
    ],
    "employee": [
        "chat.use",
        "chat.history.read_own",
        "document.metadata.read",
        "document.content.read",
    ],
    "finance": [
        "chat.use",
        "chat.history.read_own",
        "document.metadata.read",
        "document.content.read",
    ],
    "engineering": [
        "chat.use",
        "chat.history.read_own",
        "document.metadata.read",
        "document.content.read",
    ],
    "executive": [
        "chat.use",
        "chat.history.read_own",
        "document.metadata.read",
        "document.content.read",
    ],
}


def new_id() -> str:
    return uuid.uuid4().hex[:16]


def now() -> datetime:
    return datetime.now(timezone.utc)


def iso(value: datetime | None) -> str:
    """SQLite drops the timezone; stored times are always UTC."""
    if not value:
        return ""
    return (value if value.tzinfo else value.replace(tzinfo=timezone.utc)).isoformat()


class Base(DeclarativeBase):
    pass


user_roles = Table(
    "user_roles",
    Base.metadata,
    Column("user_id", ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
    Column("role_id", ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True),
    Column("assigned_by", String, nullable=True),
    Column("valid_from", DateTime(timezone=True), nullable=True),
    Column("valid_until", DateTime(timezone=True), nullable=True),
)


class Tenant(Base):
    __tablename__ = "tenants"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String, unique=True)
    slug: Mapped[str] = mapped_column(String, default="", index=True)
    industry_category: Mapped[str] = mapped_column(String, default="technology")
    website: Mapped[str | None] = mapped_column(String, nullable=True)
    logo_url: Mapped[str | None] = mapped_column(String, nullable=True)
    primary_color: Mapped[str | None] = mapped_column(String, default="#10b981")
    status: Mapped[str] = mapped_column(String, default="active")  # active | suspended
    settings: Mapped[dict] = mapped_column(JSON, default=dict)


class Role(Base):
    __tablename__ = "roles"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id"), index=True)
    name: Mapped[str] = mapped_column(String)
    slug: Mapped[str] = mapped_column(String, default="")
    description: Mapped[str] = mapped_column(String, default="")
    default_clearance: Mapped[int] = mapped_column(Integer, default=1)
    scope: Mapped[str] = mapped_column(String, default="tenant")  # platform | tenant
    is_system: Mapped[bool] = mapped_column(Boolean, default=True)
    permission_keys: Mapped[list[str]] = mapped_column(JSON, default=list)


class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id"), index=True)
    email: Mapped[str] = mapped_column(String, unique=True)
    name: Mapped[str] = mapped_column(String)
    password_hash: Mapped[str] = mapped_column(String)
    clearance: Mapped[int] = mapped_column(Integer, default=1)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    status: Mapped[str] = mapped_column(String, default="active")  # active | deactivated | invited
    department_id: Mapped[str | None] = mapped_column(String, nullable=True)
    created_by: Mapped[str | None] = mapped_column(String, nullable=True)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    roles: Mapped[list[Role]] = relationship(secondary=user_roles, lazy="selectin")
    tenant: Mapped[Tenant] = relationship(lazy="joined")

    @property
    def role_names(self) -> list[str]:
        return sorted(r.name for r in self.roles)

    @property
    def is_admin(self) -> bool:
        return "admin" in self.role_names or self.has_permission("tenant.manage") or self.has_permission("role.manage")

    @property
    def is_platform_admin(self) -> bool:
        return "platform_super_admin" in self.role_names or self.has_permission("platform.tenant.manage")

    @property
    def permissions(self) -> set[str]:
        perms: set[str] = set()
        for r in self.roles:
            if r.permission_keys:
                perms.update(r.permission_keys)
            elif r.name in DEFAULT_ROLE_PERMISSIONS:
                perms.update(DEFAULT_ROLE_PERMISSIONS[r.name])
        return perms

    @property
    def clearance_label(self) -> str:
        return LEVELS[self.clearance] if 0 <= self.clearance < len(LEVELS) else "internal"

    def has_permission(self, perm: str) -> bool:
        return perm in self.permissions


class Document(Base):
    __tablename__ = "documents"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id"), index=True)
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    title: Mapped[str] = mapped_column(String)
    filename: Mapped[str] = mapped_column(String)
    kind: Mapped[str] = mapped_column(String)  # pdf | image | xlsx | text | database
    classification: Mapped[int] = mapped_column(Integer, default=1)
    status: Mapped[str] = mapped_column(String, default="processing")  # processing | active | failed | flagged | deleted
    note: Mapped[str] = mapped_column(String, default="")
    page_count: Mapped[int] = mapped_column(Integer, default=0)
    flagged: Mapped[bool] = mapped_column(Boolean, default=False)
    version: Mapped[int] = mapped_column(Integer, default=1)
    checksum: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    sections_metadata: Mapped[list] = mapped_column(JSON, default=list)
    data_schema: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    access: Mapped[list["DocumentAccess"]] = relationship(
        cascade="all, delete-orphan", lazy="selectin"
    )


class DocumentAccess(Base):
    """A grant. subject_type is 'everyone', 'role' or 'user'."""

    __tablename__ = "document_access"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    document_id: Mapped[str] = mapped_column(
        ForeignKey("documents.id", ondelete="CASCADE"), index=True
    )
    subject_type: Mapped[str] = mapped_column(String)
    subject_id: Mapped[str | None] = mapped_column(String, nullable=True)
    grantor_id: Mapped[str | None] = mapped_column(String, nullable=True)
    reason: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Chunk(Base):
    """Chunks carry no access list by default. Permissions come from parent doc & section."""

    __tablename__ = "chunks"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id"), index=True)
    document_id: Mapped[str] = mapped_column(
        ForeignKey("documents.id", ondelete="CASCADE"), index=True
    )
    page: Mapped[int] = mapped_column(Integer)
    location: Mapped[str] = mapped_column(String, default="")
    section_heading: Mapped[str | None] = mapped_column(String, nullable=True)
    allowed_roles: Mapped[list | None] = mapped_column(JSON, default=list)
    text: Mapped[str] = mapped_column(Text)
    # pgvector column on Postgres; a JSON list of floats on SQLite.
    embedding = mapped_column(Vector() if IS_POSTGRES else JSON())


class Conversation(Base):
    __tablename__ = "conversations"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id"))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    title: Mapped[str] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    messages: Mapped[list["Message"]] = relationship(
        cascade="all, delete-orphan", order_by="Message.id", lazy="selectin"
    )


class Message(Base):
    __tablename__ = "messages"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    conversation_id: Mapped[str] = mapped_column(
        ForeignKey("conversations.id", ondelete="CASCADE"), index=True
    )
    role: Mapped[str] = mapped_column(String)  # user | assistant
    content: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String, default="")  # answered | abstained
    citations: Mapped[list] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class AuditEvent(Base):
    __tablename__ = "audit_events"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    tenant_id: Mapped[str] = mapped_column(String, index=True)
    user_id: Mapped[str | None] = mapped_column(String, nullable=True)
    actor: Mapped[str | None] = mapped_column(String, nullable=True)
    action: Mapped[str] = mapped_column(String)
    target: Mapped[str | None] = mapped_column(String, nullable=True)
    decision: Mapped[str] = mapped_column(String)  # allowed | denied | answered | abstained | flagged
    detail: Mapped[dict] = mapped_column(JSON, default=dict)
    correlation_id: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class IngestionJob(Base):
    __tablename__ = "ingestion_jobs"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id"), index=True)
    document_id: Mapped[str] = mapped_column(ForeignKey("documents.id", ondelete="CASCADE"), index=True)
    status: Mapped[str] = mapped_column(String, default="queued")  # queued | processing | ready | failed | flagged
    stage: Mapped[str] = mapped_column(String, default="validation")  # validation | extraction | sanitization | chunking | embedding | complete | failed
    error_code: Mapped[str | None] = mapped_column(String, nullable=True)
    retries: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Department(Base):
    __tablename__ = "departments"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id"), index=True)
    name: Mapped[str] = mapped_column(String)


class AccessRequest(Base):
    __tablename__ = "access_requests"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id"), index=True)
    requester_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    target_user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    resource_type: Mapped[str] = mapped_column(String)  # document | role | clearance
    resource_id: Mapped[str | None] = mapped_column(String, nullable=True)
    reason: Mapped[str] = mapped_column(Text)
    decision: Mapped[str] = mapped_column(String, default="pending")  # pending | approved | rejected
    approver_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    decision_note: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
