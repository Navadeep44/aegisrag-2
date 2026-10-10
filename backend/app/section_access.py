"""Assigns each section of a broadly shared document to the roles it concerns.

A handbook shared with everyone can still contain a budget table, a salary
review procedure or an incident runbook. At upload time every section is
classified: sections for everyone stay open, function-specific sections are
restricted to the matching roles through chunk_access (the same SQL-enforced
table used for row rules), so they never reach anyone else's search.

Candidate roles are the roles that can already open the document: every
content role when it is shared with everyone or a department, otherwise only
the roles it was shared with. A section is never widened beyond the document.
"""
import logging
from collections import OrderedDict

from sqlalchemy import select
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from app import ai, llm, row_security
from app.models import Chunk, Document, Role

logger = logging.getLogger(__name__)

# Roles that administer the system rather than consume its content. Sections are
# never assigned to them; managing access is not the same as reading content.
GOVERNANCE_ROLES = {"admin", "iam_admin", "document_manager", "security_auditor", "platform_super_admin"}

# Fallback vocabulary when no model is configured. Custom roles also match on
# words from their own name and description.
KEYWORDS: dict[str, set[str]] = {
    "finance": {"budget", "revenue", "invoice", "expense", "forecast", "profit", "loss", "cost", "accounting",
                "tax", "payable", "receivable", "cash", "capex", "opex", "quarterly", "fiscal", "billing", "spend"},
    "hr": {"compensation", "salary", "payroll", "hiring", "recruit", "recruitment", "disciplinary", "grievance",
           "termination", "appraisal", "promotion", "headcount", "raise", "bonus", "onboarding"},
    "engineering": {"architecture", "deployment", "deploy", "incident", "runbook", "rollback", "kubernetes",
                    "server", "database", "api", "code", "release", "outage", "pager", "infrastructure", "latency"},
    "executive": {"board", "strategy", "acquisition", "merger", "investor", "valuation", "restructuring"},
}

SYSTEM = """You decide which roles need each section of a document, following least privilege.
For every section, list exactly the roles whose daily work requires that content (audience="roles").
Use audience="all" only for content every listed role genuinely needs: a title page, a table of contents,
a company overview, office information, or a policy that applies to every employee.
Function-specific material (financial figures, budgets, compensation, people data, clinical or patient
records, technical procedures, inventories, audits, legal terms) goes only to the roles that use it.
Leadership roles (owner, executive, department manager, team lead) get a section only when they
oversee that work. Use only role names from the list given."""


def applies_to(doc: Document) -> bool:
    return doc.kind not in ("database", "xlsx")  # structured records use row rules instead


def broadly_shared(doc: Document) -> bool:
    return any(g.subject_type in ("everyone", "department") for g in doc.access)


def _content_roles(db: Session, tenant_id: str) -> list[Role]:
    roles = db.execute(select(Role).where(Role.tenant_id == tenant_id)).scalars().all()
    return [r for r in roles if r.name not in GOVERNANCE_ROLES and r.name != "employee"]


def candidate_roles(db: Session, doc: Document) -> list[Role]:
    """Roles a section may be given: the ones that can already open the document."""
    roles = _content_roles(db, doc.tenant_id)
    granted = {g.subject_id for g in doc.access if g.subject_type == "role"}
    if broadly_shared(doc) or not doc.access:
        return roles  # no grants yet: classify against every role so later grants are ready
    return [r for r in roles if r.id in granted]


def _keyword_roles(text: str, heading: str, roles: list[Role]) -> list[str]:
    body, head = set(ai.tokens(text)), set(ai.tokens(heading))
    picked = []
    for r in roles:
        vocab = {ai.stem(w) for w in KEYWORDS.get(r.name, set())}
        vocab |= {t for t in ai.tokens(f"{r.name.replace('_', ' ')} {r.description or ''}")
                  if len(t) > 3 and t not in {"role", "acme", "corp"}}
        score = 3 * len(head & vocab) + len(body & vocab)
        if score >= 3:
            picked.append(r.name)
    return picked


def _model_roles(sections: list[tuple[str, str]], roles: list[Role]) -> list[list[str]] | None:
    names = [r.name for r in roles]
    schema = {"type": "OBJECT", "properties": {"sections": {"type": "ARRAY", "items": {
        "type": "OBJECT",
        "properties": {
            "index": {"type": "INTEGER"},
            "audience": {"type": "STRING", "enum": ["all", "roles"]},
            "roles": {"type": "ARRAY", "items": {"type": "STRING", "enum": names}},
        },
        "required": ["index", "audience"],
    }}}, "required": ["sections"]}
    listing = "\n".join(f"- {r.name}: {r.description or ''}" for r in roles)
    body = "\n\n".join(f"[{i}] {h}\n{t[:700]}" for i, (h, t) in enumerate(sections))
    try:
        data = llm.generate_json(SYSTEM, f"ROLES:\n{listing}\n\nSECTIONS:\n{body}", schema, timeout=20)
    except Exception as exc:
        logger.warning("Section classification by model failed, using keywords: %s", exc)
        return None
    out: list[list[str]] = [[] for _ in sections]
    for item in data.get("sections") or []:
        i = item.get("index")
        if isinstance(i, int) and 0 <= i < len(out) and item.get("audience") == "roles":
            out[i] = [n for n in item.get("roles") or [] if n in names]
    return out


def auto_assign(db: Session, doc: Document) -> dict:
    """Classify the document's sections and write chunk_access rows. Returns a
    summary for the document note. Call before the document becomes active."""
    if not applies_to(doc):
        return {"applied": False}
    chunks = db.execute(select(Chunk).where(Chunk.document_id == doc.id)).scalars().all()
    grouped: OrderedDict[str, list[Chunk]] = OrderedDict()
    for c in chunks:
        grouped.setdefault(c.section_heading or doc.title, []).append(c)
    if len(grouped) < 2:
        return {"applied": False}  # a one-section document is governed by its document grants

    roles = candidate_roles(db, doc)
    if len(roles) < 2 and not broadly_shared(doc):
        return {"applied": False}  # shared with one role: nothing to narrow
    sections = [(h, "\n".join(ai_text(c.text) for c in cs)) for h, cs in grouped.items()]
    assigned = None
    if llm.enabled():
        assigned = []
        for start in range(0, len(sections), 30):  # keep each request small
            part = _model_roles(sections[start:start + 30], roles)
            if part is None:
                assigned = None
                break
            assigned.extend(part)
    if assigned is None:
        if not broadly_shared(doc) and doc.access:
            # Keywords alone cannot tell that, say, executives also need a revenue report,
            # so without the model a document shared with chosen roles is left as granted.
            return {"applied": False}
        assigned = [_keyword_roles(t, h, roles) for h, t in sections]
    # Never assign a role that cannot already open the document, and treat
    # "every candidate role" as no section rule at all.
    names = {r.name for r in roles}
    assigned = [[n for n in a if n in names] for a in assigned]
    assigned = [[] if set(a) >= names else a for a in assigned]

    restricted = 0
    by_heading = {}
    for (heading, members), role_names in zip(grouped.items(), assigned, strict=True):
        role_ids = row_security.resolve_roles(db, doc.tenant_id, role_names)
        row_security.set_chunk_roles(db, [c.id for c in members], role_ids)
        for c in members:
            c.allowed_roles = list(role_names)
        by_heading[heading.lower()] = role_names
        restricted += bool(role_ids)

    meta = []
    for s in doc.sections_metadata or []:
        s = dict(s)
        roles_for = by_heading.get(str(s.get("heading", "")).lower())
        if roles_for is not None:
            s["allowed_roles"] = roles_for
            s["auto_assigned"] = True
        meta.append(s)
    doc.sections_metadata = meta
    flag_modified(doc, "sections_metadata")
    return {"applied": True, "sections": len(grouped), "restricted": restricted}


def ai_text(text: str) -> str:
    """Chunk text without its [document | section | page] breadcrumb."""
    return text.split("]\n", 1)[1] if text.startswith("[") and "]\n" in text else text
