"""The question pipeline.

    guard -> permission filter (SQL) -> hybrid retrieval -> exact table maths
    or grounded generation -> claim verification -> audit

Also re-checks old answers against the user's current access before showing
them again, and keeps a simple per-user rate limit.
"""
import logging
import re
import time
from collections import defaultdict, deque

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from sqlalchemy import func

from app import ai, analytics, answering, audit, grounding, llm, retrieval, validator
from app.authorization import readable_chunk_clause, readable_document_ids
from app.config import settings
from app.models import Chunk, Conversation, Document, Message, Record, User

logger = logging.getLogger(__name__)

NO_AUTHORIZED_DOCS = "NO AUTHORIZED DOCUMENTS FOUND. You do not currently have access permissions to any active documents in this organization. Please contact your administrator or request access to the required documents in the Documents catalog."
REDACTED = "This answer used sources you can no longer access."
REFUSED = ("I can't help with bypassing access controls. Answers are built only from sources you are "
           "authorized to read, and that check happens inside the database before anything reaches the model.")
JAILBREAK = re.compile(
    r"\b(ignore|bypass|override|disregard|circumvent|disable|skip)\b.{0,40}\b(restrictions?|access|authori[sz]ation|"
    r"security|permissions?|polic(y|ies)|instructions|rules|guardrails|filters?)\b"
    r"|\b(pretend|act) (you are|to be|as) (an? )?(admin|administrator|root|superuser|hr|finance)\b"
    r"|\breveal (the |your )?(system prompt|hidden instructions)\b"
    r"|\bdeveloper mode\b|\bjailbreak\b", re.I)

_recent: dict[str, deque] = defaultdict(deque)


def resolve_coreference(question: str, history: list[dict]) -> str:
    """Enriches conversational follow-up questions (with pronouns or demonstratives)
    with entity context from recent conversation turns to maximize retrieval recall."""
    if not history:
        return question

    q_lower = question.lower().strip()
    pronoun_pattern = r"\b(it|its|they|them|their|this|that|these|those|the first|the second|the third|the fourth|the last|former|latter|which one|what about)\b"
    is_followup = bool(re.search(pronoun_pattern, q_lower)) or len(question.split()) <= 4

    if not is_followup:
        return question

    # Extract keywords from the most recent user turn or assistant snippet
    context_tokens = []
    for msg in reversed(history[-4:]):
        content = msg.get("content", "")
        # Filter markdown and noise
        cleaned = re.sub(r"[#*`\[\]()|\-_]", " ", content)
        words = [w for w in cleaned.split() if len(w) > 3 and w.lower() not in {
            "what", "when", "where", "which", "there", "their", "about", "could", "would", "should", "please"
        }]
        if words:
            context_tokens.extend(words[:12])
            break

    if context_tokens:
        context_hint = " ".join(dict.fromkeys(context_tokens[:8]))
        enriched = f"{question} ({context_hint})"
        logger.info("Enriched query with conversational coreference: '%s' -> '%s'", question, enriched)
        return enriched

    return question


def check_rate_limit(user_id: str) -> None:
    window = _recent[user_id]
    now = time.monotonic()
    while window and now - window[0] > 60:
        window.popleft()
    if len(window) >= settings.rate_limit_per_minute:
        raise HTTPException(429, "Too many questions. Wait a minute and try again.")
    window.append(now)


def validate_citations(cited: list, context_ids: set[int]) -> tuple[list[int], int]:
    """Keep only citations that point at evidence the model was actually given."""
    valid, dropped = [], 0
    for value in cited:
        try:
            chunk_id = int(value)
        except (TypeError, ValueError):
            dropped += 1
            continue
        if chunk_id in context_ids and chunk_id not in valid:
            valid.append(chunk_id)
        elif chunk_id not in context_ids:
            dropped += 1
    return valid, dropped


def visible_messages(messages: list[Message], readable: set[str],
                     readable_chunks: set[int] | None = None) -> list[dict]:
    """Old answers are checked against current permissions before they are shown
    again: every cited document, and every cited row/section chunk, must still be readable."""
    out = []
    for m in messages:
        cited_docs = {c["document_id"] for c in (m.citations or [])}
        cited_chunks = {c.get("chunk_id") for c in (m.citations or [])}
        lost = not cited_docs <= readable or (
            readable_chunks is not None and not cited_chunks <= readable_chunks)
        if m.role == "assistant" and lost:
            out.append({"id": m.id, "role": m.role, "content": REDACTED,
                        "status": "redacted", "citations": [], "meta": None})
        else:
            out.append({"id": m.id, "role": m.role, "content": m.content,
                        "status": m.status, "citations": m.citations or [], "meta": m.meta})
    return out


def readable_chunk_ids(db: Session, user: User, chunk_ids: set[int]) -> set[int]:
    if not chunk_ids:
        return set()
    rows = db.execute(select(Chunk.id).join(Document, Document.id == Chunk.document_id)
                      .where(Chunk.id.in_(chunk_ids), readable_chunk_clause(user))).scalars()
    return set(rows)


def allowed_history(conversation: Conversation, readable: set[str]) -> list[dict]:
    """Earlier turns passed to the model, minus any answer built on a source
    the user has since lost access to."""
    visible = visible_messages(conversation.messages[-6:], readable)
    return [{"role": m["role"], "content": m["content"]} for m in visible
            if m["status"] != "redacted"]




def _body(text: str) -> str:
    """Chunk text without the [title | heading | page] breadcrumb."""
    return text.split("]\n", 1)[1] if text.startswith("[") and "]\n" in text else text


def _authz_stats(db: Session, user: User, readable_ids: set[str]) -> dict:
    permitted = db.execute(select(func.count(Chunk.id)).join(Document, Document.id == Chunk.document_id)
                           .where(readable_chunk_clause(user))).scalar_one()
    stats = {"documents_authorized": len(readable_ids), "chunks_authorized": permitted,
             "rule": "tenant = :tenant AND status = 'active' AND (user_grant OR (role/dept/everyone grant "
                     "AND classification <= :clearance)) AND (no row rule OR row rule matches user)"}
    if user.is_admin or user.has_permission("audit.read"):
        total = db.execute(select(func.count(Chunk.id)).where(Chunk.tenant_id == user.tenant_id)).scalar_one()
        stats["chunks_withheld"] = max(0, total - permitted)
    return stats


def _evidence(hits) -> list[dict]:
    return [{"id": h.chunk.id, "title": h.document.title, "page": h.chunk.page, "text": h.chunk.text,
             "kind": h.document.kind, "location": h.chunk.location} for h in hits]


def _citation(chunk: Chunk, doc: Document, quote: str = "") -> dict:
    return {"chunk_id": chunk.id, "document_id": doc.id, "title": doc.title, "page": chunk.page,
            "location": chunk.location, "kind": doc.kind, "classification": doc.classification,
            "section_heading": chunk.section_heading or "", "snippet": _body(chunk.text)[:700],
            "quote": quote}


def _answer_from_table(db: Session, user: User, result: dict) -> tuple[list[grounding.Claim], list[dict]]:
    ids = result["row_chunk_ids"]
    rows = db.execute(select(Chunk, Document).join(Document, Document.id == Chunk.document_id)
                      .where(Chunk.id.in_(ids), readable_chunk_clause(user))).all()
    by_id = {c.id: (c, d) for c, d in rows}
    cites = [_citation(*by_id[i]) for i in ids if i in by_id]
    cited_ids = [c["chunk_id"] for c in cites]
    claims = [grounding.Claim(text=result["headline"], citations=cited_ids[:12], status=grounding.COMPUTED,
                              quote=f"Computed: {result['explain']}")]
    return claims, cites


def answer_question(
    db: Session,
    user: User,
    question: str,
    conversation_id: str | None,
    briefing_mode: bool = False,
    document_ids: list[str] | None = None,
) -> dict:
    started = time.perf_counter()
    steps: list[dict] = []

    def step(key: str, label: str, t0: float, **detail):
        steps.append({"key": key, "label": label, "ms": round((time.perf_counter() - t0) * 1000), **detail})

    conversation = None
    if conversation_id:
        conversation = db.get(Conversation, conversation_id)
        if not conversation or conversation.user_id != user.id:
            raise HTTPException(404, "Conversation not found.")
    if not conversation:
        conversation = Conversation(tenant_id=user.tenant_id, user_id=user.id, title=question[:60])
        db.add(conversation)
        db.flush()

    t0 = time.perf_counter()
    step("identity", "Identity resolved from signed token", t0, roles=user.role_names,
         clearance=user.clearance_label, tenant=user.tenant.name if user.tenant else "")

    # 1. Guard: requests to get around access control are refused, not answered.
    if JAILBREAK.search(question):
        return _finish(db, user, conversation, question, status="refused", answer=REFUSED, citations=[],
                       meta={"mode": "guard", "claims": [], "trace": {"steps": steps + [{
                           "key": "guard", "label": "Access-bypass attempt blocked", "ms": 0}],
                           "total_ms": round((time.perf_counter() - started) * 1000)}},
                       context_ids=set(), hits=[], dropped=0, briefing_mode=briefing_mode)

    # 2. Authorization: computed in SQL, before any search.
    t0 = time.perf_counter()
    all_readable_ids = readable_document_ids(db, user)
    scoped_search = document_ids is not None
    if scoped_search:
        selected_set = set(document_ids)
        readable_ids = [d for d in all_readable_ids if d in selected_set]
    else:
        readable_ids = all_readable_ids

    authz = _authz_stats(db, user, readable_ids)
    step("authz", "Permission filter compiled into retrieval SQL", t0, **authz)

    history = allowed_history(conversation, set(all_readable_ids))
    retrieval_query = resolve_coreference(question, history)
    q_analysis = retrieval.parse_query_intent_and_entity(question)

    # 3. Retrieval over authorized chunks only.
    t0 = time.perf_counter()
    rtrace: dict = {}
    hits = (
        retrieval.search(
            db, user, retrieval_query, trace=rtrace,
            document_ids=readable_ids if scoped_search else None
        )
        if readable_ids
        else []
    )
    evidence = _evidence(hits)
    context_ids = {h.chunk.id for h in hits}
    step("retrieve", "Hybrid search (dense + BM25, reciprocal-rank fusion)", t0, hits=len(hits),
         documents=len({h.document.id for h in hits}), **rtrace)

    claims: list[grounding.Claim] = []
    citations: list[dict] = []
    table, gaps, headline, mode, dropped = None, "", "", "rag", 0

    # 4a. Structured records: exact computation over authorized rows.
    t0 = time.perf_counter()
    table_result = None
    if readable_ids:
        other_docs = [d.title for d in db.query(Document).filter(Document.id.in_(readable_ids),
                                                                Document.kind.notin_(["database", "xlsx"]))]
        try:
            table_result = analytics.answer(
                db, user, question, other_docs,
                document_ids=readable_ids if scoped_search else None
            )
        except Exception as exc:
            logger.warning("Analytics failed, using document retrieval: %s", exc)
    if table_result:
        mode = "analytics"
        claims, citations = _answer_from_table(db, user, table_result)
        headline, table = table_result["headline"], table_result.get("table")
        context_ids |= {c["chunk_id"] for c in citations}
        step("analytics", "Computed exactly over authorized rows", t0, explain=table_result["explain"],
             rows_matched=table_result["matched"], rows_authorized=table_result["scanned"],
             plan=table_result.get("plan"))

    # 4b. Grounded generation over retrieved evidence.
    elif evidence:
        t0 = time.perf_counter()
        model = "local-extractive"
        gen = None
        if llm.enabled():
            try:
                gen = answering.generate(question, evidence, history)
                model = settings.gemini_model
            except Exception as exc:
                logger.warning("Gemini answer failed, using local engine: %s", exc)
        if gen is not None:
            valid_ids = set()
            for p in gen["points"]:
                ok, bad = validate_citations(p["citations"], context_ids)
                dropped += bad
                claims.append(grounding.Claim(text=p["text"], citations=ok))
                valid_ids |= set(ok)
            headline, gaps = gen["answer"], gen["gaps"]
            if gen.get("table"):
                tc, bad = validate_citations(gen["table"].get("citations") or [], context_ids)
                dropped += bad
                table = {"columns": gen["table"]["columns"], "rows": gen["table"]["rows"], "citations": tc}
            if not gen["answerable"]:
                claims = []
        else:
            # Structured rows were already offered to the exact analytics engine above;
            # the offline engine answers from prose, PDF tables and OCR text.
            row_ids = set(db.execute(select(Record.chunk_id).where(Record.chunk_id.in_(context_ids))).scalars())
            q_tok = set(ai.tokens(question))
            prose = [e for e in evidence if e["id"] not in row_ids
                     or q_tok & set(ai.tokens(e["title"]))
                     or len(q_tok & set(ai.tokens(e["text"]))) >= min(2, len(q_tok))] or evidence
            try:
                result = ai.answer(question, prose, history)
            except Exception as e:
                logger.error("AI answering error: %s", e)
                raise HTTPException(502, "The language model did not respond. Check the model settings.") from e
            valid, dropped = validate_citations(result.get("citations", []), context_ids)
            val_res = validator.validate_answer(question, result, evidence, q_analysis)
            if not val_res.valid and val_res.should_retry:
                expanded = retrieval.search(
                    db, user, retrieval_query, top_k=50,
                    document_ids=readable_ids if scoped_search else None
                )
                if len(expanded) > len(hits):
                    hits, evidence = expanded, _evidence(expanded)
                    context_ids = {h.chunk.id for h in hits}
                    result = ai.answer(question, evidence, history)
                    valid, dropped = validate_citations(result.get("citations", []), context_ids)
            if result.get("answerable") and result.get("answer") and valid:
                claims = grounding.claims_from_text(result["answer"], valid)
                headline = result["answer"]
        step("generate", "Answer drafted from evidence only", t0, model=model, evidence_blocks=len(evidence))

        # 5. Verify every claim against the exact chunk it cites.
        t0 = time.perf_counter()
        by_id = {e["id"]: e["text"] for e in evidence}
        for c in claims:
            grounding.verify(c, by_id)
        total = len(claims)
        kept = [c for c in claims if c.status != grounding.UNSUPPORTED]
        removed = total - len(kept)
        claims = kept
        if gen is not None and headline and claims:
            union = sorted({i for c in claims for i in c.citations})
            hv = grounding.verify(grounding.Claim(text=headline, citations=union), by_id)
            if hv.status == grounding.UNSUPPORTED:
                headline = claims[0].text
        step("verify", "Claim-level citation check", t0, claims=total, removed=removed,
             verified=sum(c.status == grounding.VERIFIED for c in claims),
             partial=sum(c.status == grounding.PARTIAL for c in claims), invalid_citations=dropped)

        hit_by_id = {h.chunk.id: h for h in hits}
        order: list[int] = []
        for c in claims:
            for cid in c.citations:
                if cid in hit_by_id and cid not in order:
                    order.append(cid)
        for cid in (table or {}).get("citations", []):
            if cid in hit_by_id and cid not in order:
                order.append(cid)
        quotes = {c.quote_chunk: c.quote for c in claims if c.quote_chunk}
        citations = [_citation(hit_by_id[i].chunk, hit_by_id[i].document, quotes.get(i, "")) for i in order]

    answered = bool(claims) and bool(citations) and any(c.status != grounding.UNSUPPORTED for c in claims)
    if answered:
        number = {c["chunk_id"]: i + 1 for i, c in enumerate(citations)}
        if mode == "rag" and not llm.enabled() and headline:
            answer_text = headline
        else:
            bullets = "\n".join(
                f"- {c.text} " + "".join(f"[{number[i]}]" for i in c.citations if i in number) for c in claims
                if mode == "rag")
            answer_text = (headline or claims[0].text) + (f"\n\n{bullets}" if bullets else "")
        if mode == "analytics" and table:
            md = ["| " + " | ".join(table["columns"]) + " |", "|" + " --- |" * len(table["columns"])]
            md += ["| " + " | ".join(str(v) for v in row) + " |" for row in table["rows"]]
            answer_text += "\n\n" + "\n".join(md)
        if briefing_mode:
            titles = list(dict.fromkeys(c["title"] for c in citations))
            answer_text = ("### Executive briefing\n\n" + answer_text + "\n\n**Sources**\n"
                           + "\n".join(f"- *{t}*" for t in titles))
        status = "answered"
    else:
        if not readable_ids:
            if scoped_search:
                answer_text = (
                    "None of the selected documents are authorized under your current permissions "
                    "or no matching documents were found in your selection."
                )
            else:
                answer_text = NO_AUTHORIZED_DOCS
        else:
            titles = [d.title for d in db.query(Document).filter(Document.id.in_(readable_ids)).limit(5)]
            if scoped_search:
                answer_text = (
                    f"I couldn't find an answer in the selected documents ({', '.join(titles)}). "
                    "You can expand your selection or request access to other sources."
                )
            else:
                answer_text = ("I couldn't find an answer in the documents you're authorized to search ("
                               + ", ".join(titles) + "). If you need other sources, request access from the Documents page.")
        status, claims, citations, table = "abstained", [], [], None

    suggested_resource = None
    if status in ("abstained", "refused"):
        unauthorized_docs = db.query(Document).filter(
            Document.tenant_id == user.tenant_id,
            Document.status == "active",
            Document.id.notin_(readable_ids)
        ).all()
        if unauthorized_docs:
            target = None
            if scoped_search and document_ids:
                scoped_unauth = [d for d in unauthorized_docs if d.id in set(document_ids)]
                if scoped_unauth:
                    target = scoped_unauth[0]
            if not target:
                q_tokens = set(ai.tokens(question))
                best_doc = None
                best_score = -1
                for d in unauthorized_docs:
                    d_tokens = set(ai.tokens(d.title))
                    overlap = len(q_tokens & d_tokens)
                    if overlap > best_score:
                        best_score = overlap
                        best_doc = d
                target = best_doc or unauthorized_docs[0]
            suggested_resource = {
                "id": target.id,
                "title": target.title,
                "classification": target.classification,
            }

    g = {"score": grounding.score(claims), "claims": len(claims),
         "verified": sum(c.status in (grounding.VERIFIED, grounding.COMPUTED) for c in claims),
         "partial": sum(c.status == grounding.PARTIAL for c in claims)}
    meta = {"mode": mode, "headline": headline if answered else "", "claims": [c.to_dict() for c in claims],
            "table": table, "gaps": gaps if answered else "", "grounding": g,
            "suggested_resource": suggested_resource,
            "selected_document_ids": document_ids if scoped_search else None,
            "trace": {"steps": steps, "total_ms": round((time.perf_counter() - started) * 1000)}}
    return _finish(db, user, conversation, question, status=status, answer=answer_text, citations=citations,
                   meta=meta, context_ids=context_ids, hits=hits, dropped=dropped, briefing_mode=briefing_mode,
                   suggested_resource=suggested_resource)


def _finish(db, user, conversation, question, *, status, answer, citations, meta, context_ids, hits,
            dropped, briefing_mode, suggested_resource=None) -> dict:
    db.add(Message(conversation_id=conversation.id, role="user", content=question))
    reply = Message(conversation_id=conversation.id, role="assistant", content=answer,
                    status=status, citations=citations, meta=meta)
    db.add(reply)
    db.commit()
    audit.log(
        db, user.tenant_id, user.id, "chat.query", "flagged" if status == "refused" else status,
        conversation_id=conversation.id,
        question=question,
        user_roles=[r.name for r in user.roles],
        user_name=user.name,
        user_email=user.email,
        context_chunk_ids=sorted(context_ids),
        context_document_ids=sorted({h.document.id for h in hits} | {c["document_id"] for c in citations}),
        cited_chunk_ids=[c["chunk_id"] for c in citations],
        dropped_citations=dropped,
        grounding=(meta or {}).get("grounding"),
        mode=(meta or {}).get("mode"),
        briefing_mode=briefing_mode,
        suggested_resource=suggested_resource.get("title") if suggested_resource else None,
        selected_document_ids=(meta or {}).get("selected_document_ids"),
    )
    return {
        "conversation_id": conversation.id,
        "message_id": reply.id,
        "status": status,
        "answer": answer,
        "citations": citations,
        "suggested_resource": suggested_resource,
        "meta": meta,
    }

