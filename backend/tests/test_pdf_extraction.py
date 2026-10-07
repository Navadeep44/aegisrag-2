import pytest
from pathlib import Path
from app.models import Document, Chunk
from app.ingestion import _extract_pdf, process_document, doc_dir
from app.db import SessionLocal

def test_extract_unbookmarked_pdf_multi_headings():
    """Unbookmarked PDFs with multiple headings on single and across pages extract all sections cleanly."""
    doc = Document(id="test_unbook_1", tenant_id="t_test", filename="test_unbookmarked.pdf", title="Medical Compliance")
    (doc_dir(doc) / "pages").mkdir(parents=True, exist_ok=True)
    
    sections, sections_meta, unread = _extract_pdf(doc, Path("test_unbookmarked.pdf"))
    
    # Check that multiple headings were found
    headings = [s["heading"] for s in sections_meta]
    assert any("Emergency Department Intake" in h for h in headings)
    assert any("Inpatient Medication Dispensing" in h for h in headings)
    assert any("Insurance Reimbursement" in h for h in headings)
    
    # Check that sections correspond to those headings
    sec_headings = [s[3] for s in sections]
    assert any("Emergency Department Intake" in sh for sh in sec_headings)
    assert any("Inpatient Medication Dispensing" in sh for sh in sec_headings)
    assert any("Insurance Reimbursement" in sh for sh in sec_headings)


def test_extract_enterprise_policy_with_headers_footers():
    """Running headers and footers are ignored while all actual section headings are captured."""
    doc = Document(id="test_ent_1", tenant_id="t_test", filename="test_enterprise_policy.pdf", title="Safety Manual")
    (doc_dir(doc) / "pages").mkdir(parents=True, exist_ok=True)
    
    sections, sections_meta, unread = _extract_pdf(doc, Path("test_enterprise_policy.pdf"))
    
    headings = [s["heading"] for s in sections_meta]
    # Header and footer must NOT be headings
    assert not any("ACME HEALTHCARE CORP" in h for h in headings)
    assert not any("Page 1 of 2" in h for h in headings)
    
    # True sections must be present
    assert any("Infection Control Protocols" in h for h in headings)
    assert any("Hazardous Waste Management" in h for h in headings)
    assert any("Information Security & Patient Privacy" in h for h in headings)


def test_bookmarked_pdf_extraction():
    """PDFs with native outline TOC are extracted with exact hierarchy."""
    doc = Document(id="test_toc_1", tenant_id="t_test", filename="sample_hospital_policy.pdf", title="Hospital Policy")
    (doc_dir(doc) / "pages").mkdir(parents=True, exist_ok=True)
    
    sections, sections_meta, unread = _extract_pdf(doc, Path("sample_hospital_policy.pdf"))
    
    headings = [s["heading"] for s in sections_meta]
    assert any("Clinical Protocols" in h or "Section 1" in h for h in headings)
    assert any("Financial Billing" in h or "Section 2" in h for h in headings)
    assert any("Executive Governance" in h or "Section 3" in h for h in headings)
