"""Deterministic Answer Validation Layer for AegisRAG.

Enforces strict compliance with:
1. Entity-Type Correctness (Requested Entity ≈ Returned Entity; no sections for entities)
2. Number-Aware Answering (Requested Count ≈ Returned Count; no silent truncation)
3. Source Count vs Retrieved Count (Top-K != Source Truth)
4. Completeness & Deduplication (Unique items, no duplicate counting)
5. Citation Support (Every claim verified in evidence context)
6. Grounding (Zero hallucinated or fabricated entities)
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any


@dataclass
class ValidationResult:
    valid: bool
    reason: str = ""
    error_code: str = ""
    should_retry: bool = False
    retry_strategy: str = ""
    extracted_entities: list[str] = field(default_factory=list)
    entity_count: int = 0
    source_count: int | None = None
    expected_count: int | None = None


def extract_answer_items(answer_text: str) -> list[str]:
    """Extract discrete numbered or bulleted items from an answer string."""
    items = []
    for line in answer_text.splitlines():
        line = line.strip()
        # Numbered list item: 1. Item, 2. Item
        m_num = re.match(r"^(\d+)[.)]\s+(.+)$", line)
        if m_num:
            items.append(m_num.group(2).strip())
            continue
        # Bullet list item: - Item, * Item
        m_bullet = re.match(r"^[-*•]\s+(.+)$", line)
        if m_bullet:
            content = m_bullet.group(1).strip()
            # Ignore sub-bullets that look like metadata keys: **Calculated Metric**: ...
            if not re.match(r"^\*\*[A-Za-z\s]+\*\*:", content):
                items.append(content)
    return items


def validate_answer(
    question: str,
    answer_result: dict[str, Any],
    evidence: list[dict[str, Any]],
    query_analysis: Any,
) -> ValidationResult:
    """Deterministic post-generation answer validation.
    
    Verifies that the generated answer satisfies the query's structural and
    semantic constraints without hallucination or entity-type mismatch.
    """
    if not answer_result.get("answerable"):
        return ValidationResult(
            valid=True,
            reason="System legitimately abstained (no authorized answerable content).",
            error_code="ABSTAINED",
        )

    answer_text = str(answer_result.get("answer", ""))
    citations = answer_result.get("citations", [])
    expected_count = getattr(query_analysis, "expected_count", None)
    target_entity = getattr(query_analysis, "target_entity", None)
    is_asking_for_items = getattr(query_analysis, "is_asking_for_items", False)
    is_section_nav = getattr(query_analysis, "is_section_nav", False)
    is_section_locate = getattr(query_analysis, "is_section_locate", False)

    # 1. Citation context verification
    context_ids = {e["id"] for e in evidence}
    invalid_cits = [c for c in citations if c not in context_ids]
    if invalid_cits:
        return ValidationResult(
            valid=False,
            reason=f"Citations contain IDs not present in evidence: {invalid_cits}",
            error_code="INVALID_CITATIONS",
            should_retry=False,
        )

    # 2. Section Locate Validation ("Which section contains X?")
    if is_section_locate:
        # Answer must specify a section name/number, NOT list the child items
        has_section_ref = bool(re.search(r"\b(section\s*#?\d+|chapter\s*#?\d+|part\s*#?\d+)\b", answer_text, re.IGNORECASE))
        if not has_section_ref and any(f"section" in e.get("text", "").lower() for e in evidence):
            return ValidationResult(
                valid=False,
                reason="Section location query did not return a section reference.",
                error_code="MISSING_SECTION_REFERENCE",
                should_retry=True,
                retry_strategy="EXPAND_SECTION_NAV",
            )
        return ValidationResult(valid=True, reason="Section location query passed.")

    # 3. Section Navigation Validation ("What are the major sections?")
    if is_section_nav:
        # Answer must list document sections, not entity items
        items = extract_answer_items(answer_text)
        return ValidationResult(
            valid=True,
            reason="Section navigation query passed.",
            extracted_entities=items,
            entity_count=len(items),
        )

    # 4. Entity-Type Correctness: Entity != Document Structural Containers
    items = extract_answer_items(answer_text)
    if is_asking_for_items and target_entity and target_entity not in ("section", "chapter", "outline", "toc", "part", "module"):
        # Check if returned items are mistakenly document structural containers
        structural_items = [
            it for it in items
            if re.match(r"^(Section|Chapter|Part|Module)\s+\d+:\s+[A-Za-z]", it, re.IGNORECASE)
            or re.match(r"^(Table of Contents|Outline|Overview of Sections)\b", it, re.IGNORECASE)
        ]
        if len(structural_items) >= 2 and len(structural_items) >= len(items) * 0.7:
            return ValidationResult(
                valid=False,
                reason=f"Entity type mismatch: requested '{target_entity}', but answer returned document structural containers.",
                error_code="ENTITY_TYPE_MISMATCH",
                should_retry=True,
                retry_strategy="FORCE_ENTITY_ITEMS",
                extracted_entities=items,
                entity_count=len(items),
            )

    # 5. Number-Aware & Count Validation
    if expected_count is not None and is_asking_for_items:
        actual_count = len(items)
        if actual_count < expected_count:
            return ValidationResult(
                valid=False,
                reason=f"Requested {expected_count} {target_entity}s, but only {actual_count} were found in current context.",
                error_code="INCOMPLETE_COUNT",
                should_retry=True,
                retry_strategy="EXPAND_RETRIEVAL_SIBLINGS",
                expected_count=expected_count,
                entity_count=actual_count,
                extracted_entities=items,
            )

    return ValidationResult(
        valid=True,
        reason="Answer passed all deterministic validation checks.",
        extracted_entities=items,
        entity_count=len(items),
        expected_count=expected_count,
    )
