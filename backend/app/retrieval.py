import re
from dataclasses import dataclass, field
from typing import Any

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


def singularize(word: str) -> str:
    """Universal English singularizer for domain-agnostic entity normalization."""
    if not word:
        return ""
    w = word.strip().lower()
    irregulars = {
        "people": "person", "men": "man", "women": "woman", "children": "child",
        "data": "data", "criteria": "criterion", "analyses": "analysis",
    }
    if w in irregulars:
        return irregulars[w]
    if w.endswith("ies") and len(w) > 4:
        return w[:-3] + "y"
    if w.endswith("ees") and len(w) > 4:
        return w[:-1]
    if w.endswith("sses") and len(w) > 4:
        return w[:-2]
    if (w.endswith("xes") or w.endswith("ches") or w.endswith("shes")) and len(w) > 4:
        return w[:-2]
    if w.endswith("s") and len(w) > 3 and not w.endswith(("ss", "us", "is")):
        return w[:-1]
    return w


@dataclass
class GenericQuestionModel:
    """Production Generic Question Model for Universal RAG.
    
    Derives structured intent, open-ended entity types, scopes, filters,
    and aggregations from arbitrary user queries across all domains and file types.
    """
    intent: str  # "LOOKUP" | "LIST" | "COMPLETE_LIST" | "COUNT" | "AGGREGATION" | "COMPARE" | "SECTION_NAV" | "SECTION_LOCATE"
    entity_type: str | None = None
    requested_attributes: list[str] = field(default_factory=list)
    requested_count: int | None = None
    scope: dict[str, Any] = field(default_factory=dict)
    filters: list[dict[str, Any]] = field(default_factory=list)
    comparison_groups: list[str] = field(default_factory=list)
    aggregation: str | None = None
    requires_complete_dataset: bool = False
    requires_structural_context: bool = False
    requires_multihop: bool = False

    # Backwards-compatible aliases for pipeline components
    @property
    def target_entity(self) -> str | None:
        return self.entity_type

    @property
    def expected_count(self) -> int | None:
        return self.requested_count

    @property
    def is_asking_for_items(self) -> bool:
        return bool(
            self.entity_type
            and self.entity_type not in ("section", "chapter", "outline", "toc", "table of contents", "part", "module")
            and self.intent in ("LIST", "COMPLETE_LIST", "COUNT")
        )

    @property
    def is_section_nav(self) -> bool:
        return self.intent == "SECTION_NAV"

    @property
    def is_section_locate(self) -> bool:
        return self.intent == "SECTION_LOCATE"

    @property
    def scope_document(self) -> str | None:
        return self.scope.get("document")

    def to_dict(self) -> dict[str, Any]:
        return {
            "intent": self.intent,
            "entity_type": self.entity_type,
            "requested_attributes": self.requested_attributes,
            "requested_count": self.requested_count,
            "scope": self.scope,
            "filters": self.filters,
            "comparison_groups": self.comparison_groups,
            "aggregation": self.aggregation,
            "requires_complete_dataset": self.requires_complete_dataset,
            "requires_structural_context": self.requires_structural_context,
            "requires_multihop": self.requires_multihop,
        }


# Type alias for complete backwards compatibility across tests and handlers
QueryAnalysis = GenericQuestionModel


def parse_query_intent_and_entity(query: str) -> GenericQuestionModel:
    """Document-agnostic, open-ended query intent and generic entity analyzer."""
    q_lower = query.lower().strip().rstrip("?.!")

    # 1. Requested Count (Numeric and written English numbers; filters out calendar years)
    requested_count = None
    num_match = re.search(r"\b(\d+)\b", q_lower)
    if num_match:
        val = int(num_match.group(1))
        # Ignore 4-digit years (e.g. 1990-2099) preceded by date prepositions unless explicitly counted
        if not (1900 <= val <= 2099 and re.search(rf"\b(in|year|since|until|before|after|covers)\s+{val}\b", q_lower)):
            requested_count = val
    if requested_count is None:
        num_words = [
            ("one", 1), ("two", 2), ("three", 3), ("four", 4), ("five", 5),
            ("six", 6), ("seven", 7), ("eight", 8), ("nine", 9), ("ten", 10),
            ("eleven", 11), ("twelve", 12), ("twenty", 20),
        ]
        for word, digit in num_words:
            if re.search(rf"\b{word}\b", q_lower):
                requested_count = digit
                break

    # 2. Scope extraction (document, section, table)
    scope: dict[str, Any] = {}
    doc_match = re.search(
        r"\b(?:in|of|from|under)\s+(?:the\s+)?([A-Za-z0-9\s\-]+?\s+(?:document|manual|report|file|dataset|policy|handbook|guide|specification|standard|agreement|contract))\b",
        query,
        re.IGNORECASE,
    )
    if doc_match:
        raw_doc = doc_match.group(1).strip()
        clean_doc = re.sub(r"\s+\b(document|file)\b$", "", raw_doc, flags=re.IGNORECASE).strip()
        scope["document"] = clean_doc or raw_doc
    else:
        fn_match = re.search(r"\b([A-Za-z0-9_\-]+\.(?:pdf|csv|md|txt|xlsx))\b", query, re.IGNORECASE)
        if fn_match:
            scope["document"] = fn_match.group(1).strip()

    sec_scope_match = re.search(r"\b(?:in|under)\s+(?:section|chapter)\s+([A-Za-z0-9\s\-]+?)(?:\s+(?:of|in)|$)", query, re.IGNORECASE)
    if sec_scope_match:
        scope["section"] = sec_scope_match.group(1).strip()

    # 3. Filters extraction
    filters: list[dict[str, Any]] = []
    dept_match = re.search(r"\bin\s+(?:the\s+)?([A-Za-z0-9\s\-]+?)\s+department\b", q_lower)
    if dept_match:
        filters.append({"attribute": "department", "value": dept_match.group(1).strip()})

    fname_match = re.search(r"\b(?:with\s+)?(?:first\s+name|named)\s+([A-Za-z]+)\b", q_lower)
    if fname_match:
        filters.append({"attribute": "first_name", "value": fname_match.group(1).strip().capitalize()})

    op_match = re.search(r"\b(above|greater than|more than|over|below|less than|under)\s+(?:[\$])?(\d+(?:\.\d+)?)\s*([a-z]+)?\b", q_lower)
    if op_match:
        op = ">" if op_match.group(1) in ("above", "greater than", "more than", "over") else "<"
        filters.append({"attribute": op_match.group(3) or "value", "operator": op, "value": float(op_match.group(2))})

    exp_match = re.search(r"\bexpiring\s+(?:in\s+)?(\d{4})\b", q_lower)
    if exp_match:
        filters.append({"attribute": "expiry", "value": exp_match.group(1)})

    # 4. Comparison groups
    comparison_groups: list[str] = []
    comp_match = re.search(r"\b(?:compare|difference between)\s+(?:the\s+)?([a-z0-9\s\-]+?)\s+(?:between|vs|versus)\s+([a-z0-9\s\-]+?)\s+and\s+([a-z0-9\s\-]+?)(?:\?|$)", q_lower)
    if comp_match:
        comparison_groups = [comp_match.group(2).strip(), comp_match.group(3).strip()]

    # 5. Aggregations & Structural Navigation Detection
    aggregation = None
    if re.search(r"\b(how many|count of|number of|total count)\b", q_lower):
        aggregation = "COUNT"
    elif re.search(r"\b(average|avg|mean)\b", q_lower):
        aggregation = "AVERAGE"
    elif re.search(r"\b(sum of|total sum|total amount|total revenue|total fee|total salary|total bill)\b", q_lower):
        aggregation = "SUM"
    elif re.search(r"\b(minimum|min|lowest|cheapest)\b", q_lower):
        aggregation = "MIN"
    elif re.search(r"\b(maximum|max|highest|most expensive|top paid)\b", q_lower):
        aggregation = "MAX"

    is_section_locate = bool(re.search(
        r"\b(which section|what section contains|where is|where are|what section covers|what section has|which chapter contains|which chapter covers)\b",
        q_lower
    ))
    is_section_nav = bool(re.search(
        r"\b(what are the sections|major sections|all sections|list sections|sections of|sections in|table of contents|document outline|chapters in|chapters of)\b",
        q_lower
    ))

    # 6. Open-Ended Entity and Attribute Resolution
    entity_type = None
    requested_attributes: list[str] = []
    intent = "LOOKUP"

    if is_section_locate:
        intent = "SECTION_LOCATE"
        m = re.search(r"\bwhich (?:section|chapter|part)\s+(?:contains|covers|has|details)\s+(?:the\s+)?([a-z0-9\s\-]+?)(?:\s+(?:in|of)|$)", q_lower)
        if m:
            entity_type = singularize(m.group(1).strip().split()[-1])
        else:
            entity_type = "section"
    elif is_section_nav:
        intent = "SECTION_NAV"
        entity_type = "section"
    elif comparison_groups:
        intent = "COMPARE"
        if comp_match:
            requested_attributes.append(comp_match.group(1).strip())
    elif aggregation == "COUNT":
        intent = "COUNT"
        cnt_m = re.search(r"\b(?:how many|count of|number of|total count of)\s+([a-z0-9\s\-]+?)(?:\s+(?:are|were|in|of|for|from|with)|\?|$)", q_lower)
        if cnt_m:
            entity_type = singularize(cnt_m.group(1).strip().split()[-1])
    elif aggregation in ("AVERAGE", "SUM", "MIN", "MAX"):
        intent = "AGGREGATION"
        agg_m = re.search(r"\b(?:what is the\s+)?(?:average|avg|mean|total sum of|sum of|highest|lowest|maximum|minimum)?\s*([a-z0-9\s\-]+?)\s+of\s+([a-z0-9\s\-]+?)(?:\s+(?:in|of|for|from)|\?|$)", q_lower)
        if agg_m:
            requested_attributes.append(agg_m.group(1).strip())
            entity_type = singularize(agg_m.group(2).strip().split()[-1])
    else:
        # Open-ended generic noun-phrase extraction across arbitrary domains
        patterns = [
            r"\b(?:what are the|what are all the|name the|tell me the)\s+(?:(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty)\s+)?(?:core|major|main|key|primary)?\s*([a-z0-9\s\-]+?)(?:\s+(?:in|of|for|from|with|under)|$)",
            r"\b(?:list all|list the|list|show all|show me all|show me the|show|give me all|give me the details of all|give me the details of|give me)\s+(?:(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+)?(?:core|major|main|key|primary|active)?\s*([a-z0-9\s\-]+?)(?:\s+(?:in|of|for|from|with|above|below|expiring|under)|$)",
            r"\b(?:who are the|who is the)\s+([a-z0-9\s\-]+?)(?:\s+(?:in|of|for|from|with)|$)",
            r"\b(?:summary of|overview of)\s+(?:the\s+)?(?:key\s+)?([a-z0-9\s\-]+?)(?:\s+(?:in|of|for|from)|$)",
            r"\b(?:find)\s+([a-z0-9\s\-]+?)(?:\s+(?:in|of|for|from)|$)",
            r"\bwhat is the\s+([a-z0-9\s\-]+?)(?:\s+(?:in|of|for|from)|$)",
        ]
        for p in patterns:
            m = re.search(p, q_lower)
            if m:
                raw = m.group(1).strip()
                words = [w for w in raw.split() if w not in ("the", "all", "a", "an", "these", "those", "details", "records", "data")]
                if words:
                    entity_type = singularize(words[-1])
                    break

        if requested_count is not None or re.search(r"\b(all|every|complete list|full list)\b", q_lower):
            intent = "COMPLETE_LIST"
        elif re.search(r"\b(list|show|give|name|who are|what are)\b", q_lower):
            intent = "LIST"
        else:
            intent = "LOOKUP"

    requires_complete_dataset = bool(
        requested_count is not None
        or intent in ("COMPLETE_LIST", "COUNT", "AGGREGATION", "COMPARE")
        or re.search(r"\b(all|every|list|how many|total|count|records|table|database|average|avg|sum|overall)\b", q_lower)
    )

    requires_structural_context = bool(
        intent in ("SECTION_LOCATE", "SECTION_NAV")
        or re.search(r"\b(section|chapter|table|row|column|outline|hierarchy|toc)\b", q_lower)
    )

    return GenericQuestionModel(
        intent=intent,
        entity_type=entity_type,
        requested_attributes=requested_attributes,
        requested_count=requested_count,
        scope=scope,
        filters=filters,
        comparison_groups=comparison_groups,
        aggregation=aggregation,
        requires_complete_dataset=requires_complete_dataset,
        requires_structural_context=requires_structural_context,
        requires_multihop=False,
    )


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

    by_vector = [r[0] for r in sorted(rows, key=lambda r: cosine(r[2]), reverse=True)[:35]]
    
    q_analysis = parse_query_intent_and_entity(query)
    target_ent = q_analysis.target_entity
    is_items = q_analysis.is_asking_for_items
    is_sec = q_analysis.is_section_nav

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

        # Substantive vs Structural Reranking (Master Prompt Rules 13, 23 & 37)
        if is_items and target_ent:
            sec_heading_lower = (sec_heading or "").lower()
            synonyms = ai.SYNONYMS.get(target_ent, [])
            if target_ent in sec_heading_lower or any(syn in sec_heading_lower for syn in synonyms):
                score += 5

            has_substantive_entries = bool(
                re.search(rf"\b({target_ent}\s*#?\d+|\d+\.\s+[A-Za-z]|Record\s*#?\d+|[-•*]\s+[A-Za-z])\b", text, re.IGNORECASE)
                or (target_ent in text.lower() and bool(re.search(r"[-•*]\s+[A-Za-z0-9]", text)))
                or ("|" in text and "---" in text)
            )
            if has_substantive_entries:
                score += 4

            # Demote pure Table of Contents / Outline chunks that merely list section titles
            is_pure_toc = bool(
                re.search(r"(table of contents|document outline|overview of sections)", text, re.IGNORECASE)
                or (text.count("Section ") >= 3 and not has_substantive_entries)
            )
            if is_pure_toc:
                score -= 5

        elif is_sec:
            if bool(re.search(r"(section|table of contents|overview|chapters)", text, re.IGNORECASE)):
                score += 5

        overlap[cid] = max(0, score)

    by_keyword = [i for i in sorted(overlap, key=overlap.get, reverse=True) if overlap[i] > 0][:35]
    return by_vector, by_keyword


def search(db: Session, user: User, query: str, top_k: int | None = None) -> list[Hit]:
    """Hybrid search. The permission filter is part of every SQL statement here,
    so a chunk the user may not read is never ranked, returned or loaded."""
    q_analysis = parse_query_intent_and_entity(query)
    is_broad = bool(
        q_analysis.expected_count is not None
        or q_analysis.intent in ("LIST", "COUNT", "AVERAGE", "SUM", "MIN_MAX", "COMPARE")
        or q_analysis.is_asking_for_items
        or re.search(
            r"\b(all|every|list|show|who are|how many|total|count|records|table|database|give me|average|avg|mean|sum|calculate|calculation|aggregation|aggregate|overall|compare|comparison|statistics|stats|breakdown|highest|lowest|max|min)\b",
            query.lower(),
        )
    )
    default_top_k = max(settings.retrieval_top_k, 25) if is_broad else settings.retrieval_top_k
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

    # Adaptive Structural & Sibling Expansion (Complete-List Mode & Parent-Child Retrieval)
    if (q_analysis.requires_complete_dataset or q_analysis.is_asking_for_items) and best:
        top_row = db.execute(
            select(Chunk.document_id, Chunk.section_heading, Chunk.page)
            .join(Document, Chunk.document_id == Document.id)
            .where(Chunk.id == best[0], allowed)
        ).first()
        if top_row:
            top_doc_id, top_heading, top_page = top_row
            sub_conds = []
            if top_heading:
                sub_conds.append(Chunk.section_heading == top_heading)
            if top_page:
                sub_conds.append(Chunk.page.in_([top_page - 1, top_page, top_page + 1]))
            if q_analysis.target_entity:
                sub_conds.append(Chunk.text.ilike(f"%{q_analysis.target_entity}%"))

            sibling_query = (
                select(Chunk.id)
                .join(Document, Chunk.document_id == Document.id)
                .where(
                    allowed,
                    Chunk.document_id == top_doc_id,
                    or_(*sub_conds) if sub_conds else True
                )
                .limit(35)
            )
            sibling_ids = db.execute(sibling_query).scalars().all()
            for sid in sibling_ids:
                if sid not in best:
                    best.append(sid)

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
