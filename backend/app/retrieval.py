import re
from dataclasses import dataclass

from pgvector.sqlalchemy import Vector
from sqlalchemy import cast, func, literal, select
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
    by_vector = db.execute(base.order_by(Chunk.embedding.op("<=>")(target)).limit(20)).scalars().all()
    by_keyword: list[int] = []
    words = re.findall(r"[A-Za-z0-9]+", query)
    if words:
        tsv = func.to_tsvector("english", Chunk.text)
        tsq = func.to_tsquery("english", " | ".join(words))
        by_keyword = db.execute(
            base.where(tsv.op("@@")(tsq)).order_by(func.ts_rank(tsv, tsq).desc()).limit(20)
        ).scalars().all()
    return by_vector, by_keyword


def _rank_in_python(db: Session, allowed, query: str, vector: list[float]):
    """SQLite has no vector or full-text ranking, so the permission filter runs
    in SQL and only the chunks it lets through are ranked here."""
    rows = db.execute(
        select(Chunk.id, Chunk.text, Chunk.embedding)
        .join(Document, Chunk.document_id == Document.id).where(allowed)
    ).all()

    def cosine(other: list[float]) -> float:
        dot = sum(a * b for a, b in zip(vector, other))
        norm = (sum(a * a for a in vector) ** 0.5) * (sum(b * b for b in other) ** 0.5)
        return dot / norm if norm else 0.0

    by_vector = [r.id for r in sorted(rows, key=lambda r: cosine(r.embedding), reverse=True)[:20]]
    wanted = set(ai.tokens(query))
    overlap = {r.id: len(wanted & set(ai.tokens(r.text))) for r in rows}
    by_keyword = [i for i in sorted(overlap, key=overlap.get, reverse=True) if overlap[i] > 0][:20]
    return by_vector, by_keyword


def search(db: Session, user: User, query: str, top_k: int | None = None) -> list[Hit]:
    """Hybrid search. The permission filter is part of every SQL statement here,
    so a chunk the user may not read is never ranked, returned or loaded."""
    top_k = top_k or settings.retrieval_top_k
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
