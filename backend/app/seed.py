"""Demo data: two fictional organizations, six users, seven documents."""
import tempfile
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app import demo_docs, ingestion
from app.auth import hash_password
from app.config import settings
from app.models import Document, DocumentAccess, Role, Tenant, User

ROLES = ["admin", "hr", "finance", "engineering", "executive", "employee"]

# name, email, roles, clearance (0 public, 1 internal, 2 confidential, 3 restricted)
ACME_USERS = [
    ("Asha (Admin)", "admin@acme.test", ["admin"], 1),
    ("Hema (HR)", "hr@acme.test", ["hr", "employee"], 3),
    ("Farid (Finance)", "finance@acme.test", ["finance", "employee"], 2),
    ("Esha (Engineer)", "engineer@acme.test", ["engineering", "employee"], 2),
    ("Emil (Employee)", "employee@acme.test", ["employee"], 1),
]

# file, title, classification, roles granted ("*" means everyone)
ACME_DOCS = [
    ("leave_policy.pdf", "Leave Policy", 1, ["*"]),
    ("it_onboarding_notes.pdf", "IT Onboarding Notes", 1, ["*"]),
    ("revenue_report_fy2025.pdf", "FY2025 Revenue Report", 2, ["finance", "executive"]),
    ("architecture_overview.pdf", "Platform Architecture Overview", 2, ["engineering", "executive"]),
    ("scanned_invoice.pdf", "Scanned Vendor Invoice", 2, ["finance"]),
    ("salary_bands_2026.xlsx", "Salary Bands 2026", 3, ["hr"]),
]


def _add_document(db: Session, tenant: Tenant, owner: User, roles: dict, path: Path,
                  title: str, level: int, granted: list[str]) -> Document:
    data = path.read_bytes()
    grants = [DocumentAccess(subject_type="everyone") if g == "*"
              else DocumentAccess(subject_type="role", subject_id=roles[g].id) for g in granted]
    doc = Document(tenant_id=tenant.id, owner_id=owner.id, title=title, filename=path.name,
                   kind=ingestion.validate_upload(path.name, data), classification=level,
                   access=grants)
    db.add(doc)
    db.commit()
    ingestion.store_original(doc, data)
    ingestion.process_document(doc.id)
    return doc


def seed(db: Session) -> None:
    files = demo_docs.generate(Path(tempfile.mkdtemp(prefix="aegis_demo_")))
    password = hash_password(settings.demo_password)

    acme = Tenant(name="Acme Corp")
    globex = Tenant(name="Globex")
    db.add_all([acme, globex])
    db.flush()
    acme_roles = {name: Role(tenant_id=acme.id, name=name) for name in ROLES}
    globex_roles = {name: Role(tenant_id=globex.id, name=name) for name in ("admin", "employee")}
    db.add_all([*acme_roles.values(), *globex_roles.values()])
    db.flush()

    users = {}
    for name, email, role_names, clearance in ACME_USERS:
        users[email] = User(tenant_id=acme.id, name=name, email=email, password_hash=password,
                            clearance=clearance, roles=[acme_roles[r] for r in role_names])
    gita = User(tenant_id=globex.id, name="Gita (Globex)", email="user@globex.test",
                password_hash=password, clearance=3, roles=list(globex_roles.values()))
    db.add_all([*users.values(), gita])
    db.commit()

    admin = users["admin@acme.test"]
    for filename, title, level, granted in ACME_DOCS:
        _add_document(db, acme, admin, acme_roles, files[filename], title, level, granted)
    _add_document(db, globex, gita, globex_roles, files["globex_price_list.pdf"],
                  "Globex Price List", 1, ["*"])


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
    print("Database reset to the demo state.")
