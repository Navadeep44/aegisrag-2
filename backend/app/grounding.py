"""Claim-level citation grounding.

Every claim in an answer must cite evidence the model was given, and the cited
text must actually support it: each number in the claim has to appear in the
cited chunks, and enough of the claim's content words have to be there too.
Unsupported claims are removed before the answer is shown.
"""
import re
from dataclasses import dataclass, field

from app import ai

VERIFIED, PARTIAL, UNSUPPORTED, COMPUTED = "verified", "partial", "unsupported", "computed"
_NUM = re.compile(r"(?<![A-Za-z])[-+]?\$?\d[\d,]*(?:\.\d+)?%?")
_MARK = re.compile(r"\s*\[(\d+(?:\s*,\s*\d+)*)\]")
_YEARISH = re.compile(r"^(19|20)\d{2}$")


@dataclass
class Claim:
    text: str
    citations: list[int]
    status: str = VERIFIED
    support: float = 1.0
    quote: str = ""
    quote_chunk: int | None = None
    missing_numbers: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {"text": self.text, "citations": self.citations, "status": self.status,
                "support": round(self.support, 2), "quote": self.quote,
                "quote_chunk": self.quote_chunk, "missing_numbers": self.missing_numbers}


def norm_number(raw: str) -> str:
    value = raw.replace("$", "").replace(",", "").replace("%", "").lstrip("+")
    if "." in value:
        value = value.rstrip("0").rstrip(".")
    return value


def numbers_in(text: str) -> set[str]:
    return {norm_number(m) for m in _NUM.findall(text) if norm_number(m) not in ("", "-")}


def strip_markers(text: str) -> tuple[str, list[int]]:
    ids = [int(i) for group in _MARK.findall(text) for i in group.split(",")]
    return _MARK.sub("", text).strip(), ids


def _sentences(text: str) -> list[str]:
    parts = re.split(r"(?<=[.!?])\s+|\n+", text)
    return [p.strip(" -*•|") for p in parts if len(p.strip()) > 3]


def best_quote(claim: str, chunk_text: str) -> tuple[str, float]:
    """The sentence in the chunk that shares the most content words with the claim."""
    want = set(ai.tokens(claim)) | numbers_in(claim)
    best, score = "", 0.0
    body = chunk_text.split("]\n", 1)[-1] if chunk_text.startswith("[") else chunk_text
    for sentence in _sentences(body):
        have = set(ai.tokens(sentence)) | numbers_in(sentence)
        overlap = len(want & have) / (len(want) or 1)
        if overlap > score:
            best, score = sentence, overlap
    return best[:320], score


def verify(claim: Claim, evidence_by_id: dict[int, str]) -> Claim:
    if claim.status == COMPUTED:
        return claim
    cited = [evidence_by_id[c] for c in claim.citations if c in evidence_by_id]
    if not cited:
        claim.status, claim.support = UNSUPPORTED, 0.0
        return claim
    joined = "\n".join(cited)
    have_numbers = numbers_in(joined)
    missing = [n for n in numbers_in(claim.text)
               if n not in have_numbers and not (_YEARISH.match(n) and n in joined)]
    want = set(ai.tokens(claim.text))
    have = set(ai.tokens(joined))
    overlap = len(want & have) / len(want) if want else 1.0
    claim.missing_numbers = missing
    claim.support = overlap
    if not missing and overlap >= 0.5:
        claim.status = VERIFIED
    elif overlap >= 0.3 and len(missing) <= 1:
        claim.status = PARTIAL
    else:
        claim.status = UNSUPPORTED
    best = ("", 0.0, None)
    for cid in claim.citations:
        if cid in evidence_by_id:
            quote, score = best_quote(claim.text, evidence_by_id[cid])
            if score > best[1]:
                best = (quote, score, cid)
    claim.quote, _, claim.quote_chunk = best
    return claim


def claims_from_text(answer: str, default_citations: list[int]) -> list[Claim]:
    """Split a free-text answer (local engine or legacy model reply) into claims.
    Inline [id] markers are used when present; otherwise the reply's citation list."""
    claims = []
    for line in answer.splitlines():
        line = line.strip()
        if not line or set(line) <= set("|-: ") or line.startswith("#"):
            continue
        text, ids = strip_markers(re.sub(r"^\s*(?:[-*•]|\d+[.)])\s+", "", line))
        text = re.sub(r"\*\*", "", text).strip()
        if len(text) < 3:
            continue
        claims.append(Claim(text=text, citations=ids or list(default_citations)))
    return claims


def score(claims: list[Claim]) -> float:
    if not claims:
        return 0.0
    weights = {VERIFIED: 1.0, COMPUTED: 1.0, PARTIAL: 0.5, UNSUPPORTED: 0.0}
    return round(sum(weights[c.status] for c in claims) / len(claims), 2)
