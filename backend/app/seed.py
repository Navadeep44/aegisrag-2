"""Demo data: three organizations, all 11 roles represented, seven documents."""
import tempfile
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app import demo_docs, ingestion
from app.auth import hash_password
from app.config import settings
from app.models import DEFAULT_ROLE_PERMISSIONS, Department, Document, DocumentAccess, Role, Tenant, User

ROLES = [
    "admin",
    "organization_owner",
    "iam_admin",
    "document_manager",
    "security_auditor",
    "department_manager",
    "team_lead",
    "hr",
    "finance",
    "engineering",
    "executive",
    "employee",
]

# name, email, roles, clearance (0 public, 1 internal, 2 confidential, 3 restricted), department
ACME_USERS = [
    ("Asha (Admin)", "admin@acme.test", ["admin"], 1, "IT"),
    ("Orla (Owner)", "owner@acme.test", ["organization_owner"], 2, "Executive"),
    ("Ian (IAM Admin)", "iam@acme.test", ["iam_admin", "employee"], 2, "Security"),
    ("Dev (Document Manager)", "docmanager@acme.test", ["document_manager", "employee"], 2, "Operations"),
    ("Sam (Security Auditor)", "auditor@acme.test", ["security_auditor"], 1, "Compliance"),
    ("Deepa (Dept Manager)", "deptmgr@acme.test", ["department_manager", "employee"], 2, "Engineering"),
    ("Tariq (Team Lead)", "teamlead@acme.test", ["team_lead", "employee"], 2, "Engineering"),
    ("Hema (HR)", "hr@acme.test", ["hr", "employee"], 3, "HR"),
    ("Farid (Finance)", "finance@acme.test", ["finance", "employee"], 2, "Finance"),
    ("Esha (Engineer)", "engineer@acme.test", ["engineering", "employee"], 2, "Engineering"),
    ("Emil (Employee)", "employee@acme.test", ["employee"], 1, "General"),
]

# file, title, classification, roles granted ("*" means everyone)
ACME_DOCS = [
    ("leave_policy.pdf", "Leave Policy", 1, ["*"]),
    ("it_onboarding_notes.pdf", "IT Onboarding Notes", 1, ["*"]),
    ("revenue_report_fy2025.pdf", "FY2025 Revenue Report", 2, ["finance", "executive"]),
    ("architecture_overview.pdf", "Platform Architecture Overview", 2, ["engineering", "executive"]),
    ("scanned_invoice.pdf", "Scanned Vendor Invoice", 2, ["finance"]),
    ("salary_bands_2026.xlsx", "Salary Bands 2026", 3, ["hr"]),
    ("visitor_policy_notice.png", "Visitor Policy Notice (photo)", 1, ["*"]),
    ("roadmap_whiteboard.png", "Engineering Roadmap Whiteboard (photo)", 2, ["engineering", "executive"]),
    ("expense_claims_2025.csv", "Expense Claims 2025", 1, ["*"]),
]

# Row-level rules for structured records: each row is visible to its own
# department; finance and executives see every row.
ROW_POLICIES = {
    "Expense Claims 2025": {"column": "Department", "subject_type": "department",
                            "full_access_roles": ["finance", "executive"]},
}


def _add_document(
    db: Session,
    tenant: Tenant,
    owner: User,
    roles: dict,
    path: Path,
    title: str,
    level: int,
    granted: list[str],
    row_policy: dict | None = None,
) -> Document:
    data = path.read_bytes()
    grants = [
        DocumentAccess(subject_type="everyone")
        if g == "*"
        else DocumentAccess(subject_type="role", subject_id=roles[g].id)
        for g in granted
    ]
    checksum = ingestion.compute_checksum(data)
    doc = Document(
        tenant_id=tenant.id,
        owner_id=owner.id,
        title=title,
        filename=path.name,
        kind=ingestion.validate_upload(path.name, data),
        classification=level,
        checksum=checksum,
        version=1,
        access=grants,
        row_policy=row_policy,
    )
    db.add(doc)
    db.commit()
    ingestion.store_original(doc, data)
    ingestion.process_document(doc.id)
    return doc


def seed(db: Session) -> None:
    files = demo_docs.generate(Path(tempfile.mkdtemp(prefix="aegis_demo_")))
    password = hash_password(settings.demo_password)

    from app.industry_templates import slugify

    platform_tenant = Tenant(
        name="Aegis Platform",
        slug="platform",
        industry_category="technology",
        status="active",
        settings={"description": "Global administration and platform scope"},
    )
    acme = Tenant(
        name="Acme Corp",
        slug="acme",
        industry_category="technology",
        website="https://acme.test",
        primary_color="#6366f1",
        status="active",
        settings={"max_upload_mb": 25, "retention_days": 90, "industry": "Enterprise SaaS & Cloud Platforms"},
    )
    globex = Tenant(
        name="Globex",
        slug="globex",
        industry_category="defense",
        website="https://globex.test",
        primary_color="#ef4444",
        status="active",
        settings={"max_upload_mb": 25, "retention_days": 90, "industry": "Defense, Aerospace & Security"},
    )
    db.add_all([platform_tenant, acme, globex])
    db.flush()

    platform_role = Role(
        tenant_id=platform_tenant.id,
        name="platform_super_admin",
        slug="platform-admin",
        description="Global platform super administrator.",
        scope="platform",
        is_system=True,
        permission_keys=DEFAULT_ROLE_PERMISSIONS.get("platform_super_admin", []),
    )
    db.add(platform_role)

    acme_roles = {
        name: Role(
            tenant_id=acme.id,
            name=name,
            slug=slugify(name),
            description=f"{name.replace('_', ' ').title()} role for Acme Corp.",
            default_clearance=2 if name in ("finance", "engineering", "admin", "department_manager") else (3 if name in ("hr", "organization_owner") else 1),
            scope="tenant",
            is_system=True,
            permission_keys=DEFAULT_ROLE_PERMISSIONS.get(name, []),
        )
        for name in ROLES
    }
    globex_roles = {
        name: Role(
            tenant_id=globex.id,
            name=name,
            slug=slugify(name),
            description=f"{name.replace('_', ' ').title()} role for Globex.",
            default_clearance=2 if name == "admin" else 1,
            scope="tenant",
            is_system=True,
            permission_keys=DEFAULT_ROLE_PERMISSIONS.get(name, []),
        )
        for name in ("admin", "employee")
    }
    db.add_all([*acme_roles.values(), *globex_roles.values()])
    db.flush()

    # Create Departments
    platform_dept = Department(tenant_id=platform_tenant.id, name="Platform Ops")
    db.add(platform_dept)

    dept_names = ["IT", "Executive", "Security", "Operations", "Compliance", "Engineering", "HR", "Finance", "General"]
    acme_depts = {name: Department(tenant_id=acme.id, name=name) for name in dept_names}
    db.add_all(acme_depts.values())

    globex_dept = Department(tenant_id=globex.id, name="Executive")
    db.add(globex_dept)
    db.flush()

    # Create Platform Super Admin
    super_admin = User(
        tenant_id=platform_tenant.id,
        name="Soren (Super Admin)",
        email="superadmin@aegisrag.platform",
        password_hash=password,
        clearance=1,
        status="active",
        active=True,
        department_id=platform_dept.id,
        roles=[platform_role],
    )
    db.add(super_admin)

    users = {}
    for name, email, role_names, clearance, dept in ACME_USERS:
        users[email] = User(
            tenant_id=acme.id,
            name=name,
            email=email,
            password_hash=password,
            clearance=clearance,
            status="active",
            active=True,
            department_id=acme_depts[dept].id,
            roles=[acme_roles[r] for r in role_names],
        )
    gita = User(
        tenant_id=globex.id,
        name="Gita (Globex)",
        email="user@globex.test",
        password_hash=password,
        clearance=3,
        status="active",
        active=True,
        department_id=globex_dept.id,
        roles=list(globex_roles.values()),
    )
    db.add_all([*users.values(), gita])
    db.commit()

    admin = users["admin@acme.test"]
    for filename, title, level, granted in ACME_DOCS:
        _add_document(db, acme, admin, acme_roles, files[filename], title, level, granted,
                      row_policy=ROW_POLICIES.get(title))
    _add_document(
        db,
        globex,
        gita,
        globex_roles,
        files["globex_price_list.pdf"],
        "Globex Price List",
        1,
        ["*"],
    )


def add_missing_demo_docs(db: Session) -> list[str]:
    """Adds demo documents introduced after a database was seeded, without
    touching anything else (used when upgrading an existing demo database)."""
    acme = db.execute(select(Tenant).where(Tenant.slug == "acme")).scalar_one_or_none()
    if not acme:
        return []
    admin = db.execute(select(User).where(User.email == "admin@acme.test")).scalar_one_or_none()
    roles = {r.name: r for r in db.execute(select(Role).where(Role.tenant_id == acme.id)).scalars()}
    have = set(db.execute(select(Document.title).where(Document.tenant_id == acme.id)).scalars())
    missing = [d for d in ACME_DOCS if d[1] not in have]
    if not admin or not missing:
        return []
    files = demo_docs.generate(Path(tempfile.mkdtemp(prefix="aegis_demo_")))
    for filename, title, level, granted in missing:
        _add_document(db, acme, admin, roles, files[filename], title, level, granted,
                      row_policy=ROW_POLICIES.get(title))
    return [m[1] for m in missing]


def seed_if_empty(db: Session) -> None:
    if db.execute(select(Tenant.id)).first() is None:
        seed(db)


if __name__ == "__main__":
    from app.db import SessionLocal, engine, init_db
    from app.models import Base

    Base.metadata.drop_all(engine)
    init_db()
    with SessionLocal() as session:
        seed(session)
    print("Database reset to the demo state with all 11 roles.")
