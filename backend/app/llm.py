"""Google AI Studio (Gemini) client: structured generation, embeddings, vision.

Every call is a plain REST request with a short timeout. Callers decide what
to do when a call fails; nothing here invents a fallback answer.
"""
import base64
import json
import logging
import math
import time

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

# Fast models first; a model that is unavailable or out of quota is skipped at once.
FALLBACK_MODELS = ["gemini-2.0-flash", "gemini-1.5-flash", "gemini-2.0-flash-lite", "gemini-1.5-pro"]
BUDGET_SECONDS = 20  # one generate() call never waits longer than this across all models
_dead: dict[str, float] = {}  # model -> time it failed with 404/429, skipped for a while


def api_key() -> str:
    return (settings.gemini_api_key or settings.google_api_key or "").strip()


def enabled() -> bool:
    return settings.ai_provider == "gemini" and bool(api_key())


def _url(model: str, method: str) -> str:
    base = (settings.gemini_base_url or "https://generativelanguage.googleapis.com/v1beta").rstrip("/")
    return f"{base}/models/{model}:{method}"


def _models() -> list[str]:
    out = [settings.gemini_model.strip()] if settings.gemini_model else []
    models = out + [m for m in FALLBACK_MODELS if m not in out]
    alive = [m for m in models if time.time() - _dead.get(m, 0) > 300]
    return alive or models


def _post(url: str, body: dict, timeout: float) -> dict:
    last: Exception | None = None
    for attempt in range(2):
        try:
            res = httpx.post(url, headers={"x-goog-api-key": api_key()}, json=body, timeout=timeout)
            if res.status_code in (500, 503) and attempt == 0:
                time.sleep(0.8)
                continue
            res.raise_for_status()
            return res.json()
        except httpx.HTTPStatusError as exc:
            # Missing model, bad request or exhausted quota: retrying this model will not help.
            if exc.response.status_code in (400, 403, 404, 429):
                raise
            last = exc
        except Exception as exc:  # network errors, timeouts
            last = exc
            time.sleep(0.4)
    raise last or RuntimeError("Gemini request failed")


def generate(system: str, parts: list[dict], schema: dict | None = None,
             temperature: float = 0.0, timeout: float = 30) -> str:
    """One-shot generation. Returns the text of the first candidate."""
    body: dict = {
        "contents": [{"role": "user", "parts": parts}],
        "generationConfig": {"temperature": temperature},
    }
    if system:
        body["system_instruction"] = {"parts": [{"text": system}]}
    if schema is not None:
        body["generationConfig"]["responseMimeType"] = "application/json"
        body["generationConfig"]["responseSchema"] = schema
    last: Exception | None = None
    deadline = time.time() + BUDGET_SECONDS
    for model in _models():
        left = deadline - time.time()
        if left < 2:
            break
        try:
            data = _post(_url(model, "generateContent"), body, min(timeout, left))
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code in (404, 429):
                _dead[model] = time.time()
            logger.warning("Gemini model %s failed: %s", model, exc.response.status_code)
            last = exc
            continue
        except Exception as exc:
            logger.warning("Gemini model %s failed: %s", model, exc)
            last = exc
            continue
        cands = data.get("candidates") or []
        if not cands:
            return ""
        return "".join(p.get("text", "") for p in cands[0].get("content", {}).get("parts", []))
    raise last or RuntimeError("No Gemini model answered")


def generate_json(system: str, text: str, schema: dict, **kw) -> dict:
    raw = generate(system, [{"text": text}], schema=schema, **kw)
    raw = raw.strip()
    if raw.startswith("```"):
        raw = raw.strip("`").split("\n", 1)[-1]
    start, end = raw.find("{"), raw.rfind("}")
    if start == -1 or end <= start:
        return {}
    return json.loads(raw[start : end + 1])


def _normalize(vec: list[float]) -> list[float]:
    norm = math.sqrt(sum(v * v for v in vec)) or 1.0
    return [v / norm for v in vec]


def embed(texts: list[str], task: str = "RETRIEVAL_DOCUMENT") -> list[list[float]]:
    """Batch embeddings. task is RETRIEVAL_DOCUMENT for chunks, RETRIEVAL_QUERY for questions."""
    model = settings.gemini_embed_model
    out: list[list[float]] = []
    for i in range(0, len(texts), 100):
        batch = texts[i : i + 100]
        body = {"requests": [{
            "model": f"models/{model}",
            "content": {"parts": [{"text": t[:8000]}]},
            "taskType": task,
            "outputDimensionality": settings.embed_dim,
        } for t in batch]}
        for wait in (0, 8, 20, 40):
            time.sleep(wait)
            try:
                data = _post(_url(model, "batchEmbedContents"), body, timeout=60)
                break
            except httpx.HTTPStatusError as exc:
                # Free-tier quotas reset within a minute: back off instead of degrading vectors.
                if exc.response.status_code != 429 or wait == 40:
                    raise
        out.extend(_normalize(e["values"]) for e in data["embeddings"])
    return out


VISION_PROMPT = (
    "You are an OCR engine. Transcribe every piece of text in this image exactly as written, "
    "top to bottom, preserving numbers, currency symbols, dates and line breaks. "
    "Render tables as Markdown tables (one row per line). "
    "Then, only if the image contains a chart, diagram, stamp, signature or photo, add a line "
    "'VISUAL:' followed by a factual description (axes, labels, values, components, arrows). "
    "Never guess unreadable text; write [illegible] instead. Output plain text only."
)


def transcribe_image(png: bytes) -> str:
    part = {"inline_data": {"mime_type": "image/png", "data": base64.b64encode(png).decode()}}
    return generate("", [{"text": VISION_PROMPT}, part], timeout=60).strip()
