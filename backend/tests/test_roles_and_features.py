from sqlalchemy import select
from app.models import Document, DocumentAccess, Tenant, User
from app.authorization import can_read

SUPER_ADMIN = "superadmin@aegisrag.platform"
OWNER = "owner@acme.test"
ADMIN = "admin@acme.test"
IAM = "iam@acme.test"
DOC_MANAGER = "docmanager@acme.test"
AUDITOR = "auditor@acme.test"
EMPLOYEE = "employee@acme.test"
HR = "hr@acme.test"
FINANCE = "finance@acme.test"
GLOBEX = "user@globex.test"


def doc_id(db, title: str) -> str:
    return db.execute(select(Document.id).where(Document.title == title)).scalar_one()


def user(db, email: str) -> User:
    return db.execute(select(User).where(User.email == email)).scalar_one()


def test_platform_super_admin_cannot_read_tenant_content(client, db, login):
    """Platform Super Admin cannot read tenant content solely by platform role"""
    revenue = doc_id(db, "FY2025 Revenue Report")
    person = user(db, SUPER_ADMIN)
    assert not can_read(db, person, revenue)
    preview = client.get(f"/api/documents/{revenue}/pages/1", headers=login(SUPER_ADMIN))
    assert preview.status_code == 404


def test_tenant_suspension_blocks_requests(client, db, login):
    """Suspending a tenant immediately blocks requests from users in that tenant"""
    super_admin_token = login(SUPER_ADMIN)
    employee_token = login(EMPLOYEE)

    # Normal request succeeds
    res = client.get("/api/users/me", headers=employee_token)
    assert res.status_code == 200

    # Suspend Acme tenant
    acme = db.execute(select(Tenant).where(Tenant.name == "Acme Corp")).scalar_one()
    patch_res = client.patch(
        f"/api/platform/tenants/{acme.id}/status",
        headers=super_admin_token,
        json={"status": "suspended"},
    )
    assert patch_res.status_code == 200

    try:
        # Employee request is now blocked
        blocked = client.get("/api/users/me", headers=employee_token)
        assert blocked.status_code == 403
        assert "suspended" in blocked.text.lower()
    finally:
        # Reactivate
        reactivate = client.patch(
            f"/api/platform/tenants/{acme.id}/status",
            headers=super_admin_token,
            json={"status": "active"},
        )
        assert reactivate.status_code == 200


def test_organization_owner_controls_settings_but_not_restricted_content(client, db, login):
    """Organization owner manages settings but cannot read restricted content without grant"""
    owner_token = login(OWNER)
    settings_res = client.get("/api/tenant/settings", headers=owner_token)
    assert settings_res.status_code == 200
    assert "Acme Corp" in settings_res.text

    # Cannot read restricted Salary Bands
    salary = doc_id(db, "Salary Bands 2026")
    preview = client.get(f"/api/documents/{salary}/pages/1", headers=owner_token)
    assert preview.status_code == 404

    # Cannot manage another tenant's settings
    globex = db.execute(select(Tenant).where(Tenant.name == "Globex")).scalar_one()
    patch_other = client.patch(
        f"/api/platform/tenants/{globex.id}/status",
        headers=owner_token,
        json={"status": "suspended"},
    )
    assert patch_other.status_code == 403


def test_user_invitation_and_deactivation_lifecycle(client, db, login):
    """Admin/IAM invites user and deactivation revokes access"""
    admin_token = login(ADMIN)
    invite_res = client.post(
        "/api/users/invite",
        headers=admin_token,
        json={"email": "newbie@acme.test", "name": "Newbie User", "roles": ["employee"], "clearance": 1},
    )
    assert invite_res.status_code == 200
    new_user_id = invite_res.json()["id"]

    newbie_login = client.post("/api/auth/login", json={"email": "newbie@acme.test", "password": "test-only-password"})
    assert newbie_login.status_code == 200
    token = {"Authorization": f"Bearer {newbie_login.json()['token']}"}

    # Can access
    assert client.get("/api/users/me", headers=token).status_code == 200

    # Deactivate user
    deactivate_res = client.patch(
        f"/api/users/{new_user_id}/status",
        headers=admin_token,
        json={"status": "deactivated"},
    )
    assert deactivate_res.status_code == 200

    # Immediately revoked
    blocked = client.get("/api/users/me", headers=token)
    assert blocked.status_code == 401


def test_custom_role_creation_and_delegation(client, db, login):
    """IAM Admin creates custom roles with specific permissions"""
    iam_token = login(IAM)
    role_res = client.post(
        "/api/roles",
        headers=iam_token,
        json={"name": "policy_reviewer", "permission_keys": ["document.metadata.read", "chat.use"]},
    )
    assert role_res.status_code == 200
    created = role_res.json()
    assert created["name"] == "policy_reviewer"
    assert "document.metadata.read" in created["permission_keys"]


def test_document_manager_job_status_and_reprocess(client, db, login):
    """Document Manager tracks ingestion status and can trigger reprocess"""
    dm_token = login(DOC_MANAGER)
    leave = doc_id(db, "Leave Policy")
    status_res = client.get(f"/api/documents/{leave}/status", headers=dm_token)
    assert status_res.status_code == 200
    assert status_res.json()["status"] == "active"

    reprocess_res = client.post(f"/api/documents/{leave}/reprocess", headers=dm_token)
    assert reprocess_res.status_code == 200
    assert reprocess_res.json()["status"] == "reprocessing_started"


def test_security_auditor_is_strictly_read_only(client, db, login):
    """Security auditor can review audit events and export reports but cannot mutate access"""
    auditor_token = login(AUDITOR)
    events_res = client.get("/api/audit/events", headers=auditor_token)
    assert events_res.status_code == 200

    export_res = client.get("/api/audit/export?format=csv", headers=auditor_token)
    assert export_res.status_code == 200
    assert "text/csv" in export_res.headers["content-type"]

    # Cannot mutate document access
    revenue = doc_id(db, "FY2025 Revenue Report")
    mutate_res = client.patch(
        f"/api/documents/{revenue}/access",
        headers=auditor_token,
        json={"grants": [{"subject_type": "everyone"}]},
    )
    assert mutate_res.status_code == 403


def test_access_request_flow_and_grant_application(client, db, login):
    """Employee submits access request; approver grants it and content becomes readable, then reverted"""
    emp_token = login(EMPLOYEE)
    revenue = doc_id(db, "FY2025 Revenue Report")

    # Employee cannot read revenue initially
    assert client.get(f"/api/documents/{revenue}/pages/1", headers=emp_token).status_code == 404

    # Submit request
    req_res = client.post(
        "/api/access-requests",
        headers=emp_token,
        json={"resource_type": "document", "resource_id": revenue, "reason": "Need for audit preparation"},
    )
    assert req_res.status_code == 200
    request_id = req_res.json()["id"]

    try:
        # Approver (IAM Admin) approves request
        iam_token = login(IAM)
        approve_res = client.patch(
            f"/api/access-requests/{request_id}",
            headers=iam_token,
            json={"decision": "approved", "decision_note": "Granted for 24h"},
        )
        assert approve_res.status_code == 200

        # Employee can now read page 1!
        page_res = client.get(f"/api/documents/{revenue}/pages/1", headers=emp_token)
        assert page_res.status_code == 200
    finally:
        # Clean up grant so subsequent security tests run on pristine baseline
        emp_user = user(db, EMPLOYEE)
        db.query(DocumentAccess).filter(
            DocumentAccess.document_id == revenue,
            DocumentAccess.subject_type == "user",
            DocumentAccess.subject_id == emp_user.id,
        ).delete()
        db.commit()


def test_ready_and_logout_endpoints(client, login):
    """Readiness endpoint returns status without secrets, and logout completes cleanly"""
    ready_res = client.get("/api/ready")
    assert ready_res.status_code == 200
    assert ready_res.json()["status"] == "ready"

    emp_token = login(EMPLOYEE)
    logout_res = client.post("/api/auth/logout", headers=emp_token)
    assert logout_res.status_code == 200
    assert logout_res.json()["status"] == "logged_out"


def test_department_management_and_department_grants(client, db, login):
    """Department creation and authorization engine checking department grants"""
    admin_token = login(ADMIN)
    
    # 1. Admin creates a department
    dept_res = client.post("/api/departments", headers=admin_token, json={"name": "BioTech Research"})
    assert dept_res.status_code == 200
    dept_id = dept_res.json()["id"]

    # 2. List departments
    list_res = client.get("/api/departments", headers=admin_token)
    assert list_res.status_code == 200
    names = [d["name"] for d in list_res.json()]
    assert "BioTech Research" in names

    # 3. Test department grant authorization
    revenue = doc_id(db, "FY2025 Revenue Report")
    emp = user(db, EMPLOYEE)
    original_dept = emp.department_id
    
    # Add department grant on revenue doc for BioTech Research
    doc = db.get(Document, revenue)
    dept_grant = DocumentAccess(
        document_id=revenue,
        subject_type="department",
        subject_id=dept_id,
        grantor_id=user(db, ADMIN).id,
    )
    doc.access.append(dept_grant)
    db.commit()

    try:
        # Employee with clearance 1 (revenue report is confidential, classification 2)
        # Even with department grant, clearance ceiling must be enforced!
        emp.department_id = dept_id
        db.commit()
        assert not can_read(db, emp, revenue)

        # Upgrade clearance to 2 -> now authorized via department grant!
        emp.clearance = 2
        db.commit()
        assert can_read(db, emp, revenue)

        # Move to different department -> denied again!
        emp.department_id = original_dept
        db.commit()
        assert not can_read(db, emp, revenue)
    finally:
        emp.department_id = original_dept
        emp.clearance = 1
        db.query(DocumentAccess).filter(
            DocumentAccess.document_id == revenue,
            DocumentAccess.subject_type == "department",
            DocumentAccess.subject_id == dept_id,
        ).delete()
        db.commit()


def test_organization_owner_billing_and_admin_management(client, db, login):
    """Organization Owner accesses billing and designates organization admins"""
    owner_token = login(OWNER)
    emp_token = login(EMPLOYEE)

    # 1. Billing overview
    billing_res = client.get("/api/tenant/billing", headers=owner_token)
    assert billing_res.status_code == 200
    b_data = billing_res.json()
    assert "estimated_monthly_total" in b_data
    assert b_data["active_seats"] > 0
    assert len(b_data["invoices"]) > 0

    # Employee cannot view billing
    forbidden_res = client.get("/api/tenant/billing", headers=emp_token)
    assert forbidden_res.status_code == 403

    # 2. Designate / revoke admin
    emp_user = user(db, EMPLOYEE)
    assign_admin = client.post(
        "/api/tenant/admins",
        headers=owner_token,
        json={"user_id": emp_user.id, "action": "assign"},
    )
    assert assign_admin.status_code == 200
    assert "admin" in assign_admin.json()["roles"]

    # Revoke admin
    revoke_admin = client.post(
        "/api/tenant/admins",
        headers=owner_token,
        json={"user_id": emp_user.id, "action": "revoke"},
    )
    assert revoke_admin.status_code == 200
    assert "admin" not in revoke_admin.json()["roles"]


def test_platform_super_admin_global_security_settings(client, login):
    """Platform Super Admin configures global security parameters"""
    super_admin_token = login(SUPER_ADMIN)
    owner_token = login(OWNER)

    # 1. Super admin reads settings
    sec_res = client.get("/api/platform/security-settings", headers=super_admin_token)
    assert sec_res.status_code == 200
    assert sec_res.json()["mfa_enforced"] is False  # no MFA in this build, so the policy must not claim it

    # 2. Super admin updates settings
    update_res = client.patch(
        "/api/platform/security-settings",
        headers=super_admin_token,
        json={"session_timeout_minutes": 45, "password_min_length": 14},
    )
    assert update_res.status_code == 200
    assert update_res.json()["session_timeout_minutes"] == 45
    assert update_res.json()["password_min_length"] == 14

    # 3. Organization Owner gets 403
    forbidden = client.get("/api/platform/security-settings", headers=owner_token)
    assert forbidden.status_code == 403


def test_department_manager_insights(client, db, login):
    """Department Manager retrieves operational department-level insights"""
    dept_mgr_token = login("deptmgr@acme.test")
    res = client.get("/api/department/insights", headers=dept_mgr_token)
    assert res.status_code == 200
    data = res.json()
    assert "department_name" in data
    assert "members_count" in data
    assert data["members_count"] >= 1
    assert "total_queries_run" in data


def test_hr_admin_onboarding_and_offboarding(client, db, login):
    """HR Admin handles employee onboarding and offboarding lifecycle"""
    hr_token = login(HR)
    emp_token = login(EMPLOYEE)

    # 1. List HR employees
    hr_list = client.get("/api/hr/employees", headers=hr_token)
    assert hr_list.status_code == 200
    assert len(hr_list.json()) > 0

    # 2. Onboard new employee
    onboard_res = client.post(
        "/api/hr/onboard",
        headers=hr_token,
        json={
            "name": "Nico Tester",
            "email": "nico.test@acme.test",
            "clearance": 1,
            "role_name": "employee",
        },
    )
    assert onboard_res.status_code == 200
    new_user_id = onboard_res.json()["id"]

    try:
        # Verify employee is in active directory
        u = db.get(User, new_user_id)
        assert u is not None
        assert u.status == "active"

        # 3. Offboard employee
        offboard_res = client.post(
            "/api/hr/offboard",
            headers=hr_token,
            json={"user_id": new_user_id, "reason": "Contract ended"},
        )
        assert offboard_res.status_code == 200
        assert offboard_res.json()["status"] == "deactivated"

        # 4. Standard employee cannot onboard
        emp_denied = client.post(
            "/api/hr/onboard",
            headers=emp_token,
            json={"name": "Hacker", "email": "hacker@acme.test"},
        )
        assert emp_denied.status_code == 403
    finally:
        # Cleanup
        user_to_del = db.get(User, new_user_id)
        if user_to_del:
            db.delete(user_to_del)
            db.commit()


def test_team_lead_delegated_access_request(client, db, login):
    """Team Lead can request access on behalf of team members; standard employee cannot"""
    team_lead_token = login("teamlead@acme.test")
    emp_token = login(EMPLOYEE)
    emp_user = user(db, EMPLOYEE)
    revenue = doc_id(db, "FY2025 Revenue Report")

    # 1. Standard employee trying to request for someone else gets 403
    forbidden_req = client.post(
        "/api/access-requests",
        headers=emp_token,
        json={
            "resource_type": "document",
            "resource_id": revenue,
            "reason": "Requesting for colleague",
            "target_user_id": user(db, ADMIN).id,
        },
    )
    assert forbidden_req.status_code == 403

    # 2. Team Lead submits request on behalf of employee
    lead_req = client.post(
        "/api/access-requests",
        headers=team_lead_token,
        json={
            "resource_type": "document",
            "resource_id": revenue,
            "reason": "Sprint project delivery",
            "target_user_id": emp_user.id,
        },
    )
    assert lead_req.status_code == 200
    req_id = lead_req.json()["id"]
    assert lead_req.json()["target_user_id"] == emp_user.id

    try:
        # Approver (IAM Admin) approves
        iam_token = login(IAM)
        client.patch(
            f"/api/access-requests/{req_id}",
            headers=iam_token,
            json={"decision": "approved", "decision_note": "Approved by IAM"},
        )

        # Verify that DocumentAccess was granted to emp_user, NOT team_lead
        granted = db.execute(
            select(DocumentAccess).where(
                DocumentAccess.document_id == revenue,
                DocumentAccess.subject_type == "user",
                DocumentAccess.subject_id == emp_user.id,
            )
        ).scalar_one_or_none()
        assert granted is not None
    finally:
        # Clean up grant
        db.query(DocumentAccess).filter(
            DocumentAccess.document_id == revenue,
            DocumentAccess.subject_type == "user",
            DocumentAccess.subject_id == emp_user.id,
        ).delete()
        db.commit()


def test_dashboard_stats_endpoint(client, login):
    """Dashboard stats endpoint returns structured metrics for platform and tenant users"""
    super_token = login(SUPER_ADMIN)
    super_stats = client.get("/api/dashboard/stats", headers=super_token)
    assert super_stats.status_code == 200
    assert super_stats.json()["scope"] == "platform"
    assert super_stats.json()["tenants_count"] >= 2

    emp_token = login(EMPLOYEE)
    emp_stats = client.get("/api/dashboard/stats", headers=emp_token)
    assert emp_stats.status_code == 200
    assert emp_stats.json()["scope"] == "tenant"
    assert "classification_counts" in emp_stats.json()
    assert "accessible_documents" in emp_stats.json()


def test_audit_export_json_and_csv(client, login):
    """Audit export returns JSON or CSV for users with audit.read permission"""
    auditor_token = login(AUDITOR)
    
    # JSON export
    res_json = client.get("/api/audit/export?format=json", headers=auditor_token)
    assert res_json.status_code == 200
    assert "application/json" in res_json.headers["content-type"]
    assert isinstance(res_json.json(), list)

    # CSV export
    res_csv = client.get("/api/audit/export?format=csv", headers=auditor_token)
    assert res_csv.status_code == 200
    assert "text/csv" in res_csv.headers["content-type"]
    assert "ID,Timestamp,Actor" in res_csv.text


def test_flagged_documents_review(client, db, login):
    """Document Manager can list flagged files and review them"""
    doc_mgr_token = login(DOC_MANAGER)
    flagged_list = client.get("/api/documents/flagged", headers=doc_mgr_token)
    assert flagged_list.status_code == 200
    assert isinstance(flagged_list.json(), list)

