"""Read text out of images and scanned pages.

Order: the Gemini vision model (layout, tables, chart descriptions), then the
offline RapidOCR engine. Both are optional; '' means nothing could be read.
"""
import logging

from app import llm
from app.config import settings

logger = logging.getLogger(__name__)
_engine = None


def get_ocr_engine():
    global _engine
    if not settings.local_ocr:
        return None
    if _engine is None:
        try:
            from rapidocr_onnxruntime import RapidOCR
            _engine = RapidOCR()
        except Exception as exc:
            logger.info("Local OCR unavailable: %s", exc)
            return None
    return _engine


def _rapid(png: bytes) -> str:
    engine = get_ocr_engine()
    if engine is None:
        return ""
    try:
        result, _ = engine(png)
    except Exception as exc:  # engine missing or image unreadable
        logger.info("Local OCR processing failed: %s", exc)
        return ""
    if not result:
        return ""
    # Group boxes into lines by vertical position so table rows stay together.
    boxes = sorted(result, key=lambda r: (r[0][0][1], r[0][0][0]))
    lines: list[list[tuple[float, str]]] = []
    last_y = None
    for box, text, conf in boxes:
        if float(conf) < 0.5:
            continue
        y = (box[0][1] + box[2][1]) / 2
        height = abs(box[2][1] - box[0][1]) or 10
        if last_y is not None and abs(y - last_y) < height * 0.6:
            lines[-1].append((box[0][0], text))
        else:
            lines.append([(box[0][0], text)])
            last_y = y
    return "\n".join("  ".join(t for _, t in sorted(line)) for line in lines)


def read_image(png: bytes) -> tuple[str, str]:
    """Returns (text, engine) where engine is 'gemini-vision', 'rapidocr' or ''."""
    if llm.enabled():
        try:
            text = llm.transcribe_image(png)
            if text.strip():
                return text.strip(), "gemini-vision"
        except Exception as exc:
            logger.warning("Vision transcription failed, using local OCR: %s", exc)
    text = _rapid(png)
    return (text, "rapidocr") if text.strip() else ("", "")
