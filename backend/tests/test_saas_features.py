import io
import pytest
from fastapi import HTTPException
from app.api import validate_business_email

def test_business_email_validation_logic():
    # Invalid consumer domains must raise HTTPException 400
    with pytest.raises(HTTPException) as exc1:
        validate_business_email("test@gmail.com")
    assert exc1.value.status_code == 400
    assert "gmail.com" in exc1.value.detail

    with pytest.raises(HTTPException) as exc2:
        validate_business_email("doctor@yahoo.com")
    assert exc2.value.status_code == 400
    assert "yahoo.com" in exc2.value.detail

    with pytest.raises(HTTPException):
        validate_business_email("not-an-email")

    # Valid corporate & business domains should pass without error
    validate_business_email("founder@mercyhealth.business.com")
    validate_business_email("sarah@biotech-innovations.io")
    validate_business_email("admin@apexmedical.org")


def test_public_categories_endpoint(client):
    resp = client.get("/api/public/categories")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) >= 6
    category_ids = [c["id"] for c in data]
    assert "healthcare" in category_ids
    assert "finance" in category_ids
    assert "legal" in category_ids
    assert "defense" in category_ids
    assert "technology" in category_ids
    assert "pharma" in category_ids

    # Healthcare check
    healthcare = next(c for c in data if c["id"] == "healthcare")
    role_names = [r["name"] for r in healthcare["roles"]]
    assert any("Physician" in n or "Doctor" in n for n in role_names)
    assert any("Nurse" in n for n in role_names)


def test_company_registration_and_portal_lifecycle(client):
    reg_payload = {
        "founder_name": "Dr. Sarah Connor",
        "company_name": "Apex Medical Systems",
        "business_email": "sarah.connor@apexmedical.business.com",
        "password": "ApexPassword123!",
        "company_category": "healthcare",
        "website": "https://apexmedical.business.com",
        "logo_url": "https://apexmedical.business.com/logo.png",
        "custom_roles": ["Clinical Trial Monitor", "Patient Safety Officer"],
    }

    reg_resp = client.post("/api/auth/register-company", json=reg_payload)
    assert reg_resp.status_code == 200, reg_resp.text
    reg_data = reg_resp.json()
    assert reg_data["tenant"]["name"] == "Apex Medical Systems"
    assert reg_data["tenant"]["slug"] == "apex-medical-systems"
    assert "token" in reg_data

    token = reg_data["token"]
    auth_headers = {"Authorization": f"Bearer {token}"}

    # Fetch roles from tenant roles hub
    hub_resp = client.get("/api/tenant/roles-hub", headers=auth_headers)
    assert hub_resp.status_code == 200
    hub_data = hub_resp.json()
    assert hub_data["company_name"] == "Apex Medical Systems"
    assert len(hub_data["roles"]) >= 6

    # Verify portal-info for physician role
    doctor_role = next(r for r in hub_data["roles"] if "physician" in r["slug"] or "doctor" in r["slug"])
    portal_slug = doctor_role["slug"]

    info_resp = client.get(f"/api/public/portal-info/apex-medical-systems/{portal_slug}")
    assert info_resp.status_code == 200
    info_data = info_resp.json()
    assert info_data["company_name"] == "Apex Medical Systems"
    assert info_data["role_name"] == doctor_role["name"]

    # Assign a new doctor via tenant roles-hub
    hub_resp = client.get("/api/tenant/roles-hub", headers=auth_headers)
    assert hub_resp.status_code == 200
    hub_data = hub_resp.json()
    assert hub_data["company_name"] == "Apex Medical Systems"
    assert len(hub_data["roles"]) >= 6

    # Find the target physician role in hub
    target_role = next(r for r in hub_data["roles"] if r["slug"] == portal_slug)
    assign_resp = client.post(
        f"/api/tenant/roles/{target_role['id']}/assign-user",
        headers=auth_headers,
        json={
            "name": "Dr. Gregory House",
            "email": "dr.house@apexmedical.business.com",
            "password": "LupusPassword123!",
            "clearance": 2,
        },
    )
    assert assign_resp.status_code == 200
    assign_data = assign_resp.json()
    assert assign_data["name"] == "Dr. Gregory House"

    # Now Dr. House can log in directly via the Role Portal URL
    login_resp = client.post(
        "/api/public/portal-login",
        json={
            "company_slug": "apex-medical-systems",
            "role_slug": portal_slug,
            "email": "dr.house@apexmedical.business.com",
            "password": "LupusPassword123!",
        },
    )
    assert login_resp.status_code == 200
    login_data = login_resp.json()
    assert "token" in login_data
    assert login_data["user"]["name"] == "Dr. Gregory House"
    assert login_data["user"]["tenant"] == "Apex Medical Systems"


def test_database_records_upload_and_schema(client, login):
    headers = login("admin@acme.test")

    # Upload structured CSV database records
    csv_content = b"patient_id,full_name,diagnosis,admission_date,billed_amount\n101,John Doe,Hypertension,2026-01-15,1250.50\n102,Jane Smith,Appendicitis,2026-02-20,4500.00\n103,Robert Brown,Type 2 Diabetes,2026-03-10,850.75\n"
    files = {"file": ("patients_database.csv", csv_content, "text/csv")}
    data = {"title": "Q1 Inpatient Records", "classification": "2"}

    upload_resp = client.post(
        "/api/documents/upload-database",
        headers=headers,
        data=data,
        files=files,
    )
    assert upload_resp.status_code == 200, upload_resp.text
    doc = upload_resp.json()
    assert doc["kind"] == "database"
    assert doc["title"] == "Q1 Inpatient Records"


def test_pdf_section_access_control(client, login):
    headers = login("admin@acme.test")

    # Upload document with structural sections
    txt_content = b"=== SECTION 1: Clinical Protocols ===\nDoctors and nurses must follow sterile procedures.\n\n=== SECTION 2: Financial Accounts ===\nBilling department invoices and internal audits.\n"
    files = {"file": ("clinical_protocol.txt", txt_content, "text/plain")}
    upload_resp = client.post(
        "/api/documents/upload",
        headers=headers,
        data={"title": "Clinical & Financial Protocol", "classification": "1"},
        files=files,
    )
    assert upload_resp.status_code == 200
    doc_id = upload_resp.json()["id"]

    # Get extracted sections
    sec_resp = client.get(f"/api/documents/{doc_id}/sections", headers=headers)
    assert sec_resp.status_code == 200
    sec_data = sec_resp.json()
    assert "sections" in sec_data
    if len(sec_data["sections"]) > 0:
        sec0 = sec_data["sections"][0]
        # Update allowed roles for this section
        put_resp = client.put(
            f"/api/documents/{doc_id}/sections/{sec0['section_id']}/access",
            headers=headers,
            json={"allowed_roles": ["doctor", "chief-medical-officer"]},
        )
        assert put_resp.status_code == 200
        assert put_resp.json()["status"] == "ok"
