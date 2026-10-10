"""Automatic section-to-role assignment. Each docstring is the title shown on the
Security screen."""
from sqlalchemy import select

from app.models import AuditEvent, Chunk, ChunkAccess, Document, User

EMPLOYEE, FINANCE, HR, ENGINEER, ADMIN = (
    "employee@acme.test", "finance@acme.test", "hr@acme.test", "engineer@acme.test", "admin@acme.test")


def _handbook(db) -> Document:
    return db.execute(select(Document).where(Document.title == "Company Handbook 2026")).scalar_one()


def _sections_reached(db, email: str) -> set[str]:
    """Section headings whose chunks were sent to the model for the user's last question."""
    db.expire_all()
    uid = db.execute(select(User.id).where(User.email == email)).scalar_one()
    event = db.execute(select(AuditEvent).where(AuditEvent.user_id == uid, AuditEvent.action == "chat.query")
                       .order_by(AuditEvent.id.desc())).scalars().first()
    ids = set(event.detail["context_chunk_ids"])
    rows = db.execute(select(Chunk.section_heading).where(Chunk.id.in_(ids))).scalars()
    return {h for h in rows if h}


def ask(client, headers, question):
    r = client.post("/api/chat/query", headers=headers, json={"question": question})
    assert r.status_code == 200, r.text
    return r.json()


def test_sections_are_assigned_to_roles_at_upload(db):
    """A document shared with everyone gets its function-specific sections restricted"""
    doc = _handbook(db)
    by_heading = {s["heading"]: s.get("allowed_roles", []) for s in doc.sections_metadata}
    budget = next(v for k, v in by_heading.items() if "Budget" in k)
    pay = next(v for k, v in by_heading.items() if "Compensation" in k)
    runbook = next(v for k, v in by_heading.items() if "Runbook" in k)
    overview = next(v for k, v in by_heading.items() if "Overview" in k)
    assert "finance" in budget and "hr" in pay and "engineering" in runbook
    assert overview == []
    # Enforced in SQL, not only stored as metadata.
    chunk_ids = db.execute(select(Chunk.id).where(Chunk.document_id == doc.id)).scalars().all()
    assert db.execute(select(ChunkAccess).where(ChunkAccess.chunk_id.in_(chunk_ids))).first() is not None


def test_employee_never_receives_restricted_sections(client, db, login):
    """An employee asking about the budget gets nothing from the finance section"""
    result = ask(client, login(EMPLOYEE), "What is the Q3 2026 operating budget?")
    assert "6.8" not in result["answer"]
    assert not any("Budget" in h for h in _sections_reached(db, EMPLOYEE))


def test_each_role_reaches_its_own_section(client, db, login):
    """Finance reads the budget section, HR the compensation section, engineering the runbook"""
    assert "6.8" in ask(client, login(FINANCE), "What is the Q3 2026 operating budget?")["answer"]
    assert "4.5" in ask(client, login(HR), "What is the merit increase pool in the salary review?")["answer"]
    eng = ask(client, login(ENGINEER), "How do I roll back the last deployment during an incident?")
    assert "deployctl" in eng["answer"]
    ask(client, login(FINANCE), "How do I roll back the last deployment during an incident?")
    assert not any("Runbook" in h for h in _sections_reached(db, FINANCE))


def test_general_sections_stay_open(client, login):
    """Sections meant for everyone remain answerable for every employee"""
    result = ask(client, login(EMPLOYEE), "What are the office opening hours?")
    assert result["status"] == "answered" and "08:00" in result["answer"]


def test_admin_can_override_and_rerun(client, db, login):
    """An admin's manual section choice is kept until auto-assignment is re-run"""
    admin = login(ADMIN)
    doc = _handbook(db)
    sections = client.get(f"/api/documents/{doc.id}/sections", headers=admin).json()["sections"]
    budget = next(s for s in sections if "Budget" in s["heading"])
    assert budget["auto_assigned"] is True
    r = client.put(f"/api/documents/{doc.id}/sections/{budget['section_id']}/access", headers=admin,
                   json={"allowed_roles": []})
    assert r.status_code == 200
    try:
        assert "6.8" in ask(client, login(EMPLOYEE), "What is the Q3 2026 operating budget?")["answer"]
    finally:
        rerun = client.post(f"/api/documents/{doc.id}/sections/auto-assign", headers=admin)
        assert rerun.status_code == 200 and rerun.json()["restricted"] >= 3
    assert "6.8" not in ask(client, login(EMPLOYEE), "What is the Q3 2026 operating budget?")["answer"]


def test_role_shared_document_narrows_but_never_widens(client, db, login, monkeypatch, tmp_path):
    """Sections of a role-shared document go only to the granted roles that need them"""
    import json

    import pymupdf

    from app import llm, section_access
    from app.models import Role
    admin = login(ADMIN)
    roles = {r.name: r.id for r in db.execute(select(Role).where(
        Role.tenant_id == _handbook(db).tenant_id)).scalars()}
    pdf = pymupdf.open()
    toc = []
    for title, body in [("Q4 Budget", "The Q4 budget is $9.1 million."), ("Q4 Hiring Plan", "We will hire 12 engineers.")]:
        page = pdf.new_page()
        page.insert_text((50, 100), title, fontsize=18, fontname="hebo")
        page.insert_text((50, 140), body, fontsize=10)
        toc.append([1, title, pdf.page_count])
    pdf.set_toc(toc)
    path = tmp_path / "plan.pdf"
    pdf.save(path)

    calls = []

    def fake_model(sections, candidates):
        calls.append(sorted(r.name for r in candidates))
        # "hr" is not granted on this document, so it must be dropped.
        return [["finance", "hr"] if "Budget" in h else ["executive"] for h, _ in sections]

    monkeypatch.setattr(llm, "enabled", lambda: True)
    monkeypatch.setattr(section_access, "_model_roles", fake_model)
    up = client.post("/api/documents/upload", headers=admin, files={"file": ("plan.pdf", path.read_bytes())},
                     data={"title": "Q4 Plan", "grants": json.dumps(
                         [{"subject_type": "role", "subject_id": roles["finance"]},
                          {"subject_type": "role", "subject_id": roles["executive"]}])})
    assert up.status_code == 200, up.text
    doc_id = up.json()["id"]
    try:
        db.expire_all()
        doc = db.get(Document, doc_id)
        assert calls and calls[0] == ["executive", "finance"]  # candidates are the granted roles only
        by_heading = {s["heading"]: s.get("allowed_roles", []) for s in doc.sections_metadata}
        assert by_heading["Q4 Budget"] == ["finance"]
        assert by_heading["Q4 Hiring Plan"] == ["executive"]
    finally:
        client.delete(f"/api/documents/{doc_id}", headers=admin)


def test_running_headers_are_not_sections(tmp_path):
    """A header repeated at the top of every page is page furniture, not a section"""
    import pymupdf

    from app import ingestion
    from app.config import settings
    pdf = pymupdf.open()
    for i, title in enumerate(["Budget", "Hiring"], start=1):
        page = pdf.new_page()
        page.insert_text((50, 30), "ACME CONFIDENTIAL HANDBOOK", fontsize=9)
        page.insert_text((50, 120), title, fontsize=18, fontname="hebo")
        page.insert_text((50, 160), f"Body text for {title.lower()} on page {i}.", fontsize=10)
    path = tmp_path / "h.pdf"
    pdf.save(path)
    doc = Document(id="hdr", tenant_id="t", filename="h.pdf", title="Handbook")
    (ingestion.doc_dir(doc) / "pages").mkdir(parents=True, exist_ok=True)
    _, meta, _ = ingestion._extract_pdf(doc, path)
    headings = [m["heading"] for m in meta]
    assert not any("CONFIDENTIAL" in h for h in headings), headings
    assert {"Budget", "Hiring"} <= set(headings)
    assert settings.file_storage_dir
