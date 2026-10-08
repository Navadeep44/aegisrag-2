import re
from dataclasses import dataclass

from pgvector.sqlalchemy import Vector
from sqlalchemy import cast, func, literal, or_, select
from sqlalchemy.orm import Session

from app import ai
from app.authorization import readable_clause
from app.config import settings
from app.db import IS_SQLITE
from app.models import Chunk, Document, User


@dataclass
class Hit:
    chunk: Chunk
    document: Document


def _rank_in_postgres(db: Session, base, query: str, vector: list[float]):
    target = cast(literal(str(vector)), Vector())
    by_vector = db.execute(base.order_by(Chunk.embedding.op("<=>")(target)).limit(25)).scalars().all()
    by_keyword: list[int] = []
    words = re.findall(r"[A-Za-z0-9]+", query)
    if words:
        tsv = func.to_tsvector("english", func.concat(Chunk.text, " ", Document.title, " ", func.coalesce(Chunk.section_heading, "")))
        tsq = func.to_tsquery("english", " | ".join(words))
        by_keyword = db.execute(
            base.where(tsv.op("@@")(tsq)).order_by(func.ts_rank(tsv, tsq).desc()).limit(25)
        ).scalars().all()
    return by_vector, by_keyword


def _rank_in_python(db: Session, allowed, query: str, vector: list[float]):
    """SQLite has no vector or full-text ranking, so the permission filter runs
    in SQL and only the chunks it lets through are ranked here."""
    rows = db.execute(
        select(Chunk.id, Chunk.text, Chunk.embedding, Document.title, Document.filename, Chunk.section_heading)
        .join(Document, Chunk.document_id == Document.id).where(allowed)
    ).all()

    if not rows:
        return [], []

    def cosine(other: list[float]) -> float:
        if not other:
            return 0.0
        dot = sum(a * b for a, b in zip(vector, other))
        norm = (sum(a * a for a in vector) ** 0.5) * (sum(b * b for b in other) ** 0.5)
        return dot / norm if norm else 0.0

    by_vector = [r[0] for r in sorted(rows, key=lambda r: cosine(r[2]), reverse=True)[:25]]
    
    wanted = set(ai.tokens(query))
    expanded_wanted = set(wanted)
    for w in wanted:
        if w in ai.NUM_WORDS:
            expanded_wanted.update(ai.NUM_WORDS[w])
        for syn in ai.SYNONYMS.get(w, []):
            expanded_wanted.add(ai.stem(syn))

    overlap = {}
    for r in rows:
        cid, text, _, doc_title, doc_fn, sec_heading = r
        chunk_tokens = (
            set(ai.tokens(text))
            | set(ai.tokens(doc_title or ""))
            | set(ai.tokens(doc_fn or ""))
            | set(ai.tokens(sec_heading or ""))
        )
        score = len(expanded_wanted & chunk_tokens)
        
        # Boost if query explicitly targets the document title
        doc_title_tokens = set(ai.tokens(doc_title or ""))
        if doc_title_tokens & wanted:
            score += 3

        overlap[cid] = score

    by_keyword = [i for i in sorted(overlap, key=overlap.get, reverse=True) if overlap[i] > 0][:25]
    return by_vector, by_keyword


def search(db: Session, user: User, query: str, top_k: int | None = None) -> list[Hit]:
    """Hybrid search. The permission filter is part of every SQL statement here,
    so a chunk the user may not read is never ranked, returned or loaded."""
    is_broad = bool(re.search(r"\b(all|every|list|show|who are|how many|total|count|records|table|database|give me)\b", query.lower()))
    default_top_k = max(settings.retrieval_top_k, 20) if is_broad else settings.retrieval_top_k
    top_k = top_k or default_top_k
    allowed = readable_clause(user)
    base = select(Chunk.id).join(Document, Chunk.document_id == Document.id).where(allowed)

    vector = ai.embed([query])[0]
    if IS_SQLITE:
        by_vector, by_keyword = _rank_in_python(db, allowed, query, vector)
    else:
        by_vector, by_keyword = _rank_in_postgres(db, base, query, vector)

    scores: dict[int, float] = {}
    for ranking in (by_vector, by_keyword):
        for rank, chunk_id in enumerate(ranking):
            scores[chunk_id] = scores.get(chunk_id, 0.0) + 1.0 / (60 + rank)
    best = sorted(scores, key=scores.get, reverse=True)[:top_k]
    if not best:
        return []

    # Load the winners through the permission filter again (defense in depth).
    rows = db.execute(
        select(Chunk, Document)
        .join(Document, Chunk.document_id == Document.id)
        .where(Chunk.id.in_(best), allowed)
    ).all()
    by_id = {chunk.id: Hit(chunk, document) for chunk, document in rows}
    
    user_roles_set = set(user.role_names) | {r.slug for r in user.roles if r.slug} | {r.id for r in user.roles}
    results = []
    for i in best:
        if i in by_id:
            hit = by_id[i]
            # Enforce section-level role ACL if restricted
            if hit.chunk.allowed_roles and not user.is_admin and not user.is_platform_admin:
                if not any(r in user_roles_set for r in hit.chunk.allowed_roles):
                    continue
            results.append(hit)
    return results
