import time
from collections import defaultdict, deque

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app import ai, audit, retrieval
from app.authorization import readable_document_ids
from app.config import settings
from app.models import Conversation, Message, User

ABSTAIN = "I couldn't find an authorized source for that information."
REDACTED = "This answer used sources you can no longer access."

_recent: dict[str, deque] = defaultdict(deque)


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


def visible_messages(messages: list[Message], readable: set[str]) -> list[dict]:
    """Old answers are checked against current permissions before they are shown again."""
    out = []
    for m in messages:
        cited_docs = {c["document_id"] for c in (m.citations or [])}
        if m.role == "assistant" and not cited_docs <= readable:
            out.append({"id": m.id, "role": m.role, "content": REDACTED,
                        "status": "redacted", "citations": []})
        else:
            out.append({"id": m.id, "role": m.role, "content": m.content,
                        "status": m.status, "citations": m.citations or []})
    return out


def allowed_history(conversation: Conversation, readable: set[str]) -> list[dict]:
    """Earlier turns passed to the model, minus any answer built on a source
    the user has since lost access to."""
    visible = visible_messages(conversation.messages[-6:], readable)
    return [{"role": m["role"], "content": m["content"]} for m in visible
            if m["status"] != "redacted"]


def answer_question(db: Session, user: User, question: str, conversation_id: str | None) -> dict:
    conversation = None
    if conversation_id:
        conversation = db.get(Conversation, conversation_id)
        if not conversation or conversation.user_id != user.id:
            raise HTTPException(404, "Conversation not found.")
    if not conversation:
        conversation = Conversation(tenant_id=user.tenant_id, user_id=user.id, title=question[:60])
        db.add(conversation)
        db.flush()

    hits = retrieval.search(db, user, question)
    evidence = [{"id": h.chunk.id, "title": h.document.title, "page": h.chunk.page,
                 "text": h.chunk.text} for h in hits]
    context_ids = {h.chunk.id for h in hits}

    valid, dropped, result = [], 0, {"answerable": False, "answer": ""}
    if evidence:
        history = allowed_history(conversation, readable_document_ids(db, user))
        try:
            result = ai.answer(question, evidence, history)
        except Exception:
            raise HTTPException(502, "The language model did not respond. Check the model settings.")
        valid, dropped = validate_citations(result.get("citations", []), context_ids)

    answered = bool(result.get("answerable") and result.get("answer") and valid)
    by_id = {h.chunk.id: h for h in hits}
    citations = [
        {"chunk_id": cid, "document_id": by_id[cid].document.id,
         "title": by_id[cid].document.title, "page": by_id[cid].chunk.page,
         "location": by_id[cid].chunk.location, "kind": by_id[cid].document.kind,
         "classification": by_id[cid].document.classification,
         "snippet": by_id[cid].chunk.text[:400]}
        for cid in valid
    ] if answered else []

    db.add(Message(conversation_id=conversation.id, role="user", content=question))
    reply = Message(conversation_id=conversation.id, role="assistant",
                    content=result["answer"] if answered else ABSTAIN,
                    status="answered" if answered else "abstained", citations=citations)
    db.add(reply)
    db.commit()

    audit.log(db, user.tenant_id, user.id, "chat.query", reply.status,
              conversation_id=conversation.id,
              context_chunk_ids=sorted(context_ids),
              context_document_ids=sorted({h.document.id for h in hits}),
              cited_chunk_ids=valid, dropped_citations=dropped)

    return {"conversation_id": conversation.id, "message_id": reply.id, "status": reply.status,
            "answer": reply.content, "citations": citations}
