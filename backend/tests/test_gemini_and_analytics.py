from unittest.mock import MagicMock, patch
import httpx

from app import ai
from app.config import settings


def test_gemini_settings_loaded():
    assert hasattr(settings, "gemini_api_key")
    assert hasattr(settings, "gemini_base_url")
    assert hasattr(settings, "gemini_model")
    assert settings.gemini_base_url == "https://generativelanguage.googleapis.com/v1beta"
    assert "gemini" in settings.gemini_model


def test_gemini_answer_successful_call():
    """The Gemini answer path returns points that each carry their own citations"""
    from app import answering, llm
    evidence = [
        {"id": 101, "title": "Hospital Medical Protocol", "page": 1, "text": "Patient vitals must be monitored every 4 hours."},
        {"id": 102, "title": "Hospital Medical Protocol", "page": 2, "text": "Emergency triage priority 1 requires immediate physician review."},
    ]
    reply = {"answerable": True, "answer": "Every 4 hours.",
             "points": [{"text": "Patient vitals must be monitored every 4 hours.", "citations": [101]},
                        {"text": "Triage priority 1 requires immediate physician review [102].", "citations": []}]}
    with patch.object(llm, "generate_json", return_value=reply):
        res = answering.generate("How often must patient vitals be monitored?", evidence, [])
    assert res["answerable"] is True
    assert res["points"][0]["citations"] == [101]
    # An inline marker is lifted out of the text into the citation list.
    assert res["points"][1] == {"text": "Triage priority 1 requires immediate physician review.", "citations": [102]}


def test_gemini_fallback_on_api_error():
    evidence = [
        {"id": 201, "title": "Security Handbook", "page": 1, "text": "Passwords must have a minimum of 16 characters and rotate every 90 days."}
    ]
    # Simulate API network timeout or 401 Unauthorized or quota limit
    with patch.object(settings, "gemini_api_key", "invalid-or-expired-key"):
        with patch("httpx.Client.post", side_effect=httpx.HTTPStatusError("401 Unauthorized", request=MagicMock(), response=MagicMock(status_code=401))):
            res = ai.answer("What is the password requirement?", evidence)
            # Must gracefully fall back to local engine without raising exception
            assert res["answerable"] is True
            assert "16 characters" in res["answer"]
            assert 201 in res["citations"]


def test_gemini_fallback_on_connection_error():
    evidence = [
        {"id": 301, "title": "Leave Policy", "page": 1, "text": "Employees receive 25 days of annual paid vacation leave per fiscal year."}
    ]
    with patch.object(settings, "gemini_api_key", "test-key"):
        with patch("httpx.Client.post", side_effect=httpx.ConnectError("Network unreachable")):
            res = ai.answer("How many days of vacation leave are granted?", evidence)
            assert res["answerable"] is True
            assert "25 days" in res["answer"]
            assert 301 in res["citations"]


def test_structured_records_count_query():
    evidence = [
        {
            "id": 401,
            "title": "Hospital Patient Registry",
            "page": 1,
            "text": (
                "Record 1: patient_id: P001; first_name: Alice; last_name: Walker; age: 34; department: Cardiology; bill_amount: 1200\n"
                "Record 2: patient_id: P002; first_name: Bob; last_name: Smith; age: 52; department: Neurology; bill_amount: 2400\n"
                "Record 3: patient_id: P003; first_name: Carol; last_name: Davis; age: 29; department: Cardiology; bill_amount: 1800"
            )
        }
    ]
    res = ai.answer("How many patients are there in the registry?", evidence)
    assert res["answerable"] is True
    assert "3 patient records" in res["answer"].lower() or "3" in res["answer"]
    assert 401 in res["citations"]


def test_structured_records_average_query():
    evidence = [
        {
            "id": 501,
            "title": "Staff Compensation Directory",
            "page": 1,
            "text": (
                "Record 1: employee_id: E101; name: Sarah Connor; role: Senior Radiologist; salary: $150,000\n"
                "Record 2: employee_id: E102; name: John Connor; role: Lead Surgeon; salary: $250,000\n"
                "Record 3: employee_id: E103; name: Kyle Reese; role: Clinical Nurse; salary: $80,000"
            )
        }
    ]
    res = ai.answer("What is the average salary across the employees?", evidence)
    assert res["answerable"] is True
    assert "**Direct Answer**" in res["answer"]
    assert "**Calculation & Methodology**" in res["answer"]
    # Average of (150,000 + 250,000 + 80,000) / 3 = 480,000 / 3 = 160,000
    assert "160,000" in res["answer"]
    assert 501 in res["citations"]


def test_structured_records_total_sum_query():
    evidence = [
        {
            "id": 601,
            "title": "Department Billing Ledger",
            "page": 1,
            "text": (
                "Record 1: bill_id: B1; department: Oncology; amount: 5000\n"
                "Record 2: bill_id: B2; department: Pediatrics; amount: 3000\n"
                "Record 3: bill_id: B3; department: Surgery; amount: 7000"
            )
        }
    ]
    res = ai.answer("What is the total sum of billing amounts?", evidence)
    assert res["answerable"] is True
    assert "**Direct Answer**" in res["answer"]
    assert "**Calculation & Methodology**" in res["answer"]
    # Total sum of 5000 + 3000 + 7000 = 15,000
    assert "15,000" in res["answer"]
    assert 601 in res["citations"]


def test_prose_count_query():
    evidence = [
        {
            "id": 701,
            "title": "Enterprise Cybersecurity Mandate",
            "page": 1,
            "text": (
                "Security Mandates:\n"
                "- Mandate 1: Multi-factor authentication is required on all portals.\n"
                "- Mandate 2: Secrets must be stored in encrypted hardware vaults.\n"
                "- Mandate 3: Database logs must be retained for at least 365 days.\n"
                "- Mandate 4: Session tokens must invalidate after 8 hours of inactivity."
            )
        }
    ]
    res = ai.answer("How many mandates are specified in the security mandate document?", evidence)
    assert res["answerable"] is True
    assert "**Direct Answer**" in res["answer"]
    assert "4" in res["answer"]
    assert 701 in res["citations"]
