import json
from pathlib import Path
from sqlalchemy import select
import pytest

from app import chat, ingestion
from app.auth import hash_password
from app.models import Document, DocumentAccess, Role, Tenant, User


import uuid

@pytest.fixture
def hospital_tenant_setup(db):
    """Creates a tenant with a patient CSV document and an authorized doctor/analyst."""
    uid = uuid.uuid4().hex[:8]
    tenant = Tenant(
        name=f"Apex Health Systems {uid}",
        slug=f"apex-health-{uid}",
        industry_category="healthcare",
        status="active",
        settings={},
    )
    db.add(tenant)
    db.flush()

    role = Role(
        tenant_id=tenant.id,
        name="doctor",
        slug="doctor",
        description="Medical Doctor",
        default_clearance=2,
        scope="tenant",
        is_system=False,
        permission_keys=["chat.use", "document.upload", "document.read"],
    )
    db.add(role)
    db.flush()

    user = User(
        tenant_id=tenant.id,
        name="Dr. Gregory",
        email=f"gregory_{uid}@apex.test",
        password_hash=hash_password("change-me-demo"),
        clearance=2,
        status="active",
        active=True,
        roles=[role],
    )
    db.add(user)
    db.flush()

    csv_content = (
        b"record_id,patient_name,gender,age,department,admission_status,primary_diagnosis\n"
        b"PAT-101,David Miller,M,45,Cardiology,Admitted,Atrial Fibrillation\n"
        b"PAT-102,Eleanor Vance,F,32,Neurology,Observation,Migraine with Aura\n"
        b"PAT-103,David Smith,M,58,Trauma Center,Discharged,Fracture\n"
        b"PAT-104,Clara Oswald,F,29,Pulmonology,Admitted,Acute Asthma\n"
        b"PAT-105,Sarah Connor,F,40,Oncology,Scheduled,Annual Checkup\n"
    )

    doc = Document(
        tenant_id=tenant.id,
        owner_id=user.id,
        title="Patient Admissions",
        filename="patients.csv",
        kind="database",
        classification=1,
        checksum=ingestion.compute_checksum(csv_content),
        version=1,
        access=[DocumentAccess(subject_type="role", subject_id=role.id)],
    )
    db.add(doc)
    db.commit()

    ingestion.store_original(doc, csv_content)
    ingestion.process_document(doc.id)

    return tenant, user, doc


def test_specific_patient_record_search(db, hospital_tenant_setup):
    """Specific entity searches correctly return the requested record details."""
    tenant, user, doc = hospital_tenant_setup
    
    # Search by first name
    res = chat.answer_question(db, user, "Give me the details of patient with first name David", None)
    assert res["status"] == "answered"
    assert len(res["citations"]) > 0
    assert "David Miller" in res["answer"] or "David Smith" in res["answer"]
    assert "PAT-101" in res["answer"] or "PAT-103" in res["answer"]

    # Search by query 'Find David'
    res2 = chat.answer_question(db, user, "Find David", None)
    assert res2["status"] == "answered"
    assert "David" in res2["answer"]


def test_broad_patient_listing_queries(db, hospital_tenant_setup):
    """Broad natural language questions successfully return all patient records in structured format."""
    tenant, user, doc = hospital_tenant_setup

    queries = [
        "Give me the details of all patients",
        "Give me all patients",
        "Show me all patients",
        "List all patients",
        "Who are the patients?",
    ]

    for q in queries:
        res = chat.answer_question(db, user, q, None)
        assert res["status"] == "answered", f"Query '{q}' failed with status: {res['status']}"
        assert len(res["citations"]) > 0
        # Should contain patient records
        assert "PAT-101" in res["answer"]
        assert "Eleanor Vance" in res["answer"]
        assert "Clara Oswald" in res["answer"]


def test_patient_count_aggregation_query(db, hospital_tenant_setup):
    """Count and aggregation questions return the dataset record count and overview."""
    tenant, user, doc = hospital_tenant_setup

    res = chat.answer_question(db, user, "How many patients are there?", None)
    assert res["status"] == "answered"
    assert "5 records" in res["answer"] or "5" in res["answer"]
    assert len(res["citations"]) > 0


def test_attribute_filter_query(db, hospital_tenant_setup):
    """Subgroup filtering (e.g. female patients) correctly filters matching records."""
    tenant, user, doc = hospital_tenant_setup

    res = chat.answer_question(db, user, "Show female patients", None)
    assert res["status"] == "answered"
    assert "Eleanor Vance" in res["answer"]
    assert "Clara Oswald" in res["answer"]
    assert "Sarah Connor" in res["answer"]
    assert len(res["citations"]) > 0


def test_multiple_document_upload_and_cross_retrieval(client, db, hospital_tenant_setup):
    """Multiple documents uploaded simultaneously can be independently retrieved without cross-contamination."""
    tenant, user, _ = hospital_tenant_setup

    token_resp = client.post("/api/auth/login", json={"email": user.email, "password": "change-me-demo"})
    assert token_resp.status_code == 200
    token = token_resp.json()["token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Upload Doc 1: Doctors CSV
    csv_bytes = b"doctor_id,name,specialization,branch,phone\nDOC-01,Dr. John Smith,Cardiology,East Wing,555-0101\nDOC-02,Dr. Jane Doe,Neurology,West Wing,555-0102\n"
    res1 = client.post(
        "/api/documents/upload-database",
        files={"file": ("doctors.csv", csv_bytes, "text/csv")},
        data={"title": "Doctors Directory", "classification": "1", "grants": json.dumps([{"subject_type": "everyone"}])},
        headers=headers,
    )
    assert res1.status_code == 200

    # Upload Doc 2: Flood Methodology Markdown / PDF text
    md_bytes = b"# Flood Exposure Analysis\n\nThe flood fraction threshold is fixed at 20% inundated area. Historical FloodScan baseline covers 1998-2022.\n"
    res2 = client.post(
        "/api/documents/upload",
        files={"file": ("methodology.md", md_bytes, "text/markdown")},
        data={"title": "Flood Exposure Methodology", "classification": "1", "grants": json.dumps([{"subject_type": "everyone"}])},
        headers=headers,
    )
    assert res2.status_code == 200

    # Query Doctors CSV
    q1 = client.post("/api/chat/query", json={"question": "List all doctors"}, headers=headers)
    assert q1.status_code == 200
    d1 = q1.json()
    assert d1["status"] == "answered"
    assert "Dr. John Smith" in d1["answer"]
    assert "Dr. Jane Doe" in d1["answer"]

    # Query Flood Markdown
    q2 = client.post("/api/chat/query", json={"question": "What is the flood fraction threshold?"}, headers=headers)
    assert q2.status_code == 200
    d2 = q2.json()
    assert d2["status"] == "answered"
    assert "20%" in d2["answer"]

