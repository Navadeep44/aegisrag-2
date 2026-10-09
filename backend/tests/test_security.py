"""Access-control and attack tests. Each docstring is the title shown on the
Security screen. Every test asserts on what reached the model, not only on the
text of the answer."""
import json

from sqlalchemy import select

from app import ai, chat
from app.authorization import can_read, readable_document_ids
from app.config import settings
from app.models import AuditEvent, Chunk, Document, User

REVENUE_Q = "What was our annual revenue?"
ADMIN, HR, FINANCE = "admin@acme.test", "hr@acme.test", "finance@acme.test"
ENGINEER, EMPLOYEE, GLOBEX = "engineer@acme.test", "employee@acme.test", "user@globex.test"


def doc_id(db, title: str) -> str:
    return db.execute(select(Document.id).where(Document.title == title)).scalar_one()


def user(db, email: str) -> User:
    return db.execute(select(User).where(User.email == email)).scalar_one()


def ask(client, headers, question, **extra):
    response = client.post("/api/chat/query", headers=headers, json={"question": question, **extra})
    assert response.status_code == 200, response.text
    return response.json()


def last_context(db, email: str) -> set[str]:
    """Document ids whose chunks were sent to the model for this user's latest question."""
    db.expire_all()
    event = db.execute(select(AuditEvent).where(
        AuditEvent.user_id == user(db, email).id, AuditEvent.action == "chat.query"
    ).order_by(AuditEvent.id.desc())).scalars().first()
    return set(event.detail["context_document_ids"])


def grants_of(client, headers, document_id) -> list[dict]:
    docs = client.get("/api/documents", headers=headers).json()
    access = next(d for d in docs if d["id"] == document_id)["access"]
    return [{"subject_type": g["subject_type"], "subject_id": g["subject_id"]} for g in access]


def set_grants(client, headers, document_id, grants):
    response = client.patch(f"/api/documents/{document_id}/access", headers=headers,
                            json={"grants": grants})
    assert response.status_code == 200, response.text


def test_access_matrix(client, db):
    """Every user can read exactly the documents their roles and clearance allow"""
    shared = {"Leave Policy", "IT Onboarding Notes", "Visitor Policy Notice (photo)", "Expense Claims 2025"}
    expected = {
        ADMIN: shared,
        HR: shared | {"Salary Bands 2026"},
        FINANCE: shared | {"FY2025 Revenue Report", "Scanned Vendor Invoice"},
        ENGINEER: shared | {"Platform Architecture Overview", "Engineering Roadmap Whiteboard (photo)"},
        EMPLOYEE: shared,
        GLOBEX: {"Globex Price List"},
    }
    titles = dict(db.execute(select(Document.id, Document.title)).all())
    for email, allowed in expected.items():
        person = user(db, email)
        assert {titles[i] for i in readable_document_ids(db, person)} == allowed, email
        for document_id, title in titles.items():
            assert can_read(db, person, document_id) == (title in allowed), (email, title)


def test_restricted_chunks_never_reach_model(client, db, login):
    """A restricted document that best matches the question is never sent to the model"""
    revenue = doc_id(db, "FY2025 Revenue Report")
    denied = ask(client, login(EMPLOYEE), REVENUE_Q)
    assert denied["status"] == "abstained" and denied["citations"] == []
    assert revenue not in last_context(db, EMPLOYEE)

    allowed = ask(client, login(FINANCE), REVENUE_Q)
    assert allowed["status"] == "answered" and "48.2" in allowed["answer"]
    assert allowed["citations"][0]["document_id"] == revenue


def test_revocation_applies_to_next_question(client, db, login):
    """Granting then revoking access changes the very next answer"""
    revenue, admin = doc_id(db, "FY2025 Revenue Report"), login(ADMIN)
    original = grants_of(client, admin, revenue)
    employee_id = user(db, EMPLOYEE).id
    try:
        set_grants(client, admin, revenue, original + [{"subject_type": "user", "subject_id": employee_id}])
        assert ask(client, login(EMPLOYEE), REVENUE_Q)["status"] == "answered"
        assert revenue in last_context(db, EMPLOYEE)
    finally:
        set_grants(client, admin, revenue, original)
    assert ask(client, login(EMPLOYEE), REVENUE_Q)["status"] == "abstained"
    assert revenue not in last_context(db, EMPLOYEE)


def test_revoked_answer_is_not_replayed(client, db, login):
    """An old conversation cannot replay an answer after access is revoked"""
    revenue, admin = doc_id(db, "FY2025 Revenue Report"), login(ADMIN)
    original = grants_of(client, admin, revenue)
    try:
        set_grants(client, admin, revenue,
                   original + [{"subject_type": "user", "subject_id": user(db, EMPLOYEE).id}])
        first = ask(client, login(EMPLOYEE), REVENUE_Q)
        assert first["status"] == "answered"
    finally:
        set_grants(client, admin, revenue, original)
    session = client.get(f"/api/chat/sessions/{first['conversation_id']}", headers=login(EMPLOYEE)).json()
    reply = session["messages"][-1]
    assert reply["status"] == "redacted" and "48.2" not in json.dumps(session)
    follow_up = ask(client, login(EMPLOYEE), "And what was the annual revenue again?",
                    conversation_id=first["conversation_id"])
    assert follow_up["status"] == "abstained"


def test_cross_tenant_isolation(client, db, login):
    """A user from another organization gets no content, previews or admin access"""
    revenue = doc_id(db, "FY2025 Revenue Report")
    assert client.get(f"/api/documents/{revenue}/pages/1", headers=login(GLOBEX)).status_code == 404
    assert ask(client, login(GLOBEX), REVENUE_Q)["status"] == "abstained"
    acme_docs = set(db.execute(select(Document.id).where(Document.title != "Globex Price List")).scalars())
    assert not (last_context(db, GLOBEX) & acme_docs)
    change = client.patch(f"/api/documents/{revenue}/access", headers=login(GLOBEX),
                          json={"grants": [{"subject_type": "everyone"}]})
    assert change.status_code == 404
    # An admin cannot grant access to a user of another organization either.
    foreign = client.patch(f"/api/documents/{revenue}/access", headers=login(ADMIN),
                           json={"grants": [{"subject_type": "user", "subject_id": user(db, GLOBEX).id}]})
    assert foreign.status_code == 400


def test_forged_identity_fields_are_ignored(client, db, login):
    """Role, clearance and tenant sent in the request body are ignored"""
    forged = ask(client, login(EMPLOYEE), REVENUE_Q, roles=["finance", "admin"], clearance=3,
                 user_id=user(db, FINANCE).id, tenant_id="x", is_admin=True)
    assert forged["status"] == "abstained"
    assert doc_id(db, "FY2025 Revenue Report") not in last_context(db, EMPLOYEE)


def test_guessed_document_id(client, db, login):
    """Guessing a document id gives the same 'not found' as a real restricted one"""
    real = client.get(f"/api/documents/{doc_id(db, 'FY2025 Revenue Report')}/pages/1", headers=login(EMPLOYEE))
    fake = client.get("/api/documents/0000000000000000/pages/1", headers=login(EMPLOYEE))
    assert real.status_code == fake.status_code == 404 and real.json() == fake.json()
    assert client.get(f"/api/documents/{doc_id(db, 'FY2025 Revenue Report')}/pages/1",
                      headers=login(FINANCE)).status_code == 200


def test_invented_citation_is_rejected(client, login, monkeypatch):
    """An answer whose citations were not in the context is discarded"""
    monkeypatch.setattr(ai, "answer", lambda *a, **k: {
        "answerable": True, "answer": "Revenue was $99 billion.", "citations": [987654]})
    result = ask(client, login(EMPLOYEE), "How many days of annual leave do employees get?")
    assert result["status"] == "abstained" and "99 billion" not in result["answer"]


def test_prompt_injection_in_document(client, db, login):
    """A hidden instruction in a PDF is removed, flagged and cannot unlock other data"""
    notes = doc_id(db, "IT Onboarding Notes")
    assert db.get(Document, notes).flagged
    texts = " ".join(db.execute(select(Chunk.text).where(Chunk.document_id == notes)).scalars())
    assert "ignore all previous" not in texts.lower()
    flagged = db.execute(select(AuditEvent).where(AuditEvent.action == "ingest.injection_flag")).scalars().all()
    assert any(e.detail["document_id"] == notes for e in flagged)
    result = ask(client, login(EMPLOYEE), "What is the salary band for a senior engineer?")
    assert result["status"] == "abstained"
    assert doc_id(db, "Salary Bands 2026") not in last_context(db, EMPLOYEE)


def test_admin_cannot_read_restricted_content(client, db, login):
    """Administrators manage access but cannot read documents they are not granted"""
    assert ask(client, login(ADMIN), "What is the salary band for a senior engineer?")["status"] == "abstained"
    assert ask(client, login(HR), "What is the salary band for a senior engineer?")["status"] == "answered"


def test_non_admin_cannot_use_admin_endpoints(client, db, login):
    """Employees cannot change access, upload, simulate or read the audit log"""
    headers, revenue = login(EMPLOYEE), doc_id(db, "FY2025 Revenue Report")
    assert client.patch(f"/api/documents/{revenue}/access", headers=headers,
                        json={"grants": [{"subject_type": "everyone"}]}).status_code == 403
    assert client.post("/api/documents/upload", headers=headers,
                       files={"file": ("a.txt", b"hello")}).status_code == 403
    assert client.post("/api/policies/simulate", headers=headers,
                       json={"user_id": "x", "question": "q"}).status_code == 403
    assert client.get("/api/audit/events", headers=headers).status_code == 403
    assert client.delete(f"/api/documents/{revenue}", headers=headers).status_code == 403


def test_invalid_tokens_are_rejected(client, login):
    """Missing, tampered or made-up tokens are rejected"""
    good = login(EMPLOYEE)["Authorization"]
    assert client.get("/api/users/me").status_code == 401
    assert client.get("/api/users/me", headers={"Authorization": good[:-3] + "abc"}).status_code == 401
    assert client.get("/api/users/me", headers={"Authorization": "Bearer made.up.token"}).status_code == 401
    assert client.post("/api/auth/demo-login", json={"email": ADMIN}).status_code == 404


def test_upload_limits(client, login, monkeypatch):
    """Oversized files and files of the wrong type are rejected"""
    admin = login(ADMIN)
    disguised = client.post("/api/documents/upload", headers=admin,
                            files={"file": ("report.pdf", b"MZ\x90\x00 executable bytes")})
    assert disguised.status_code == 400
    assert client.post("/api/documents/upload", headers=admin,
                       files={"file": ("tool.exe", b"MZ")}).status_code == 400
    monkeypatch.setattr(settings, "max_upload_mb", 1)
    big = client.post("/api/documents/upload", headers=admin,
                      files={"file": ("big.txt", b"a" * (1024 * 1024 + 10))})
    assert big.status_code == 413


def test_request_burst_is_limited(client, login, monkeypatch):
    """A burst of questions is cut off by the rate limit"""
    monkeypatch.setattr(settings, "rate_limit_per_minute", 3)
    chat._recent.clear()
    codes = [client.post("/api/chat/query", headers=login(EMPLOYEE),
                         json={"question": "leave?"}).status_code for _ in range(5)]
    chat._recent.clear()
    assert codes == [200, 200, 200, 429, 429]


def test_deleted_document_is_not_retrievable(client, login):
    """A deleted document can no longer be retrieved"""
    admin, question = login(ADMIN), "When does the cafeteria open?"
    uploaded = client.post("/api/documents/upload", headers=admin,
                           files={"file": ("cafeteria.txt", b"The cafeteria opens at 8 am.")},
                           data={"title": "Cafeteria Hours", "grants": json.dumps([{"subject_type": "everyone"}])})
    assert uploaded.status_code == 200
    assert ask(client, login(EMPLOYEE), question)["status"] == "answered"
    assert client.delete(f"/api/documents/{uploaded.json()['id']}", headers=admin).status_code == 200
    assert ask(client, login(EMPLOYEE), question)["status"] == "abstained"


def test_new_upload_is_denied_by_default(client, login):
    """A document uploaded without grants is readable by nobody"""
    admin = login(ADMIN)
    uploaded = client.post("/api/documents/upload", headers=admin,
                           files={"file": ("garage.txt", b"The garage code is 4417.")}).json()
    try:
        for email in (ADMIN, EMPLOYEE, HR):
            assert ask(client, login(email), "What is the garage code?")["status"] == "abstained"
    finally:
        client.delete(f"/api/documents/{uploaded['id']}", headers=admin)


def test_simulator_matches_enforcement(client, db, login):
    """The simulator explains exclusions and never returns document content"""
    result = client.post("/api/policies/simulate", headers=login(ADMIN),
                         json={"user_id": user(db, EMPLOYEE).id, "question": REVENUE_Q}).json()
    excluded = {d["title"]: d["reason"] for d in result["excluded"]}
    assert "FY2025 Revenue Report" in excluded and "grant" in excluded["FY2025 Revenue Report"].lower()
    assert "FY2025 Revenue Report" not in {m["title"] for m in result["matches"]}
    assert "48.2" not in json.dumps(result)
    readable = {db.get(Document, i).title for i in readable_document_ids(db, user(db, EMPLOYEE))}
    assert {d["title"] for d in result["searchable"]} == readable
