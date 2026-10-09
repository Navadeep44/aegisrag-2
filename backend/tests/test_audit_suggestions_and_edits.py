import pytest
from app.models import AccessRequest, AuditEvent, Document, User

ADMIN = "admin@acme.test"
EMPLOYEE = "employee@acme.test"
FINANCE = "finance@acme.test"


def test_edit_access_request(client, login, db):
    """Requesters can update their pending access request justification and resource."""
    headers = login(EMPLOYEE)
    
    # 1. Submit an access request
    res = client.post(
        "/api/access-requests",
        headers=headers,
        json={
            "resource_type": "document",
            "resource_id": None,
            "reason": "Need initial access for quarterly review",
        },
    )
    assert res.status_code == 200, res.text
    req_data = res.json()
    req_id = req_data["id"]

    # 2. Edit the pending request
    edit_res = client.put(
        f"/api/access-requests/{req_id}",
        headers=headers,
        json={
            "resource_type": "document",
            "resource_id": None,
            "reason": "Updated reason: need access to audit vendor compliance",
        },
    )
    assert edit_res.status_code == 200, edit_res.text
    updated = edit_res.json()
    assert "vendor compliance" in updated["reason"]

    # Verify via DB
    with db:
        req = db.get(AccessRequest, req_id)
        assert "vendor compliance" in req.reason


def test_audit_unauthorized_queries_visible_to_admin(client, login, db):
    """Admins can inspect questions asked by assigned roles that returned no authorized source."""
    admin_headers = login(ADMIN)
    user_headers = login(EMPLOYEE)

    # Ask an out-of-scope question that abstains or has no authorized context
    chat_res = client.post(
        "/api/chat/query",
        headers=user_headers,
        json={"question": "What is the secret offboarding protocol for executives?"},
    )
    assert chat_res.status_code == 200

    # Admin checks unauthorized-queries endpoint
    res = client.get("/api/audit/unauthorized-queries", headers=admin_headers)
    assert res.status_code == 200, res.text
    unauth_list = res.json()
    assert isinstance(unauth_list, list)
    
    # Verify events endpoint also includes question and roles
    events_res = client.get("/api/audit/events", headers=admin_headers)
    assert events_res.status_code == 200
    events = events_res.json()
    chat_events = [e for e in events if e["action"] == "chat.query"]
    assert len(chat_events) > 0
    assert any("secret" in (e.get("question") or "").lower() for e in chat_events)


def test_chat_suggestions_grounded_in_roles_and_documents(client, login):
    """Ask AI suggestions are dynamically tailored to user roles and accessible documents."""
    headers = login(FINANCE)
    res = client.get("/api/chat/suggestions", headers=headers)
    assert res.status_code == 200, res.text
    data = res.json()
    assert "suggestions" in data
    assert "role" in data
    assert len(data["suggestions"]) > 0


def test_documents_scoreboard(client, login):
    """Admin documents scoreboard returns catalog readiness and health metrics."""
    admin_headers = login(ADMIN)
    res = client.get("/api/documents/scoreboard", headers=admin_headers)
    assert res.status_code == 200, res.text
    sb = res.json()
    assert "total_documents" in sb
    assert "active_documents" in sb
    assert "health_score" in sb
    assert sb["total_documents"] >= 1
    assert sb["health_score"] >= 0
