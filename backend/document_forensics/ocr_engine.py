"""
OCR Extraction Engine
=====================
Extracts text from images using pytesseract and from PDFs using pdfplumber.
Both libraries are optional — the module degrades gracefully if either is missing
or if Tesseract binary is not installed on the host system.
"""

from __future__ import annotations

import io
import logging
import os
import shutil
from typing import Optional

from .schemas import OCRResult, TextComparisonResult

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Tesseract binary discovery
# ─────────────────────────────────────────────────────────────────────────────

# Ordered list of candidate paths.  The first existing path wins.
# TESSERACT_CMD env var lets deployments override without code changes.
_TESSERACT_CANDIDATES = [
    os.environ.get("TESSERACT_CMD", ""),              # env override (highest priority)
    r"C:\Program Files\Tesseract-OCR\tesseract.exe",  # Windows default installer path
    r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
    r"C:\Tesseract-OCR\tesseract.exe",
    "/usr/bin/tesseract",                             # Linux / macOS
    "/usr/local/bin/tesseract",
    "/opt/homebrew/bin/tesseract",                    # macOS Homebrew (Apple Silicon)
]


def _resolve_tesseract_cmd() -> str | None:
    """
    Return the absolute path to the tesseract binary, or None if not found.
    Tries env var, known Windows paths, then falls back to PATH lookup.
    """
    for candidate in _TESSERACT_CANDIDATES:
        if candidate and os.path.isfile(candidate):
            return candidate
    # Last resort: let shutil search the system PATH
    return shutil.which("tesseract")


# ─────────────────────────────────────────────────────────────────────────────
# Availability checks (cached at module load)
# ─────────────────────────────────────────────────────────────────────────────

def _check_tesseract() -> bool:
    """
    Locate the Tesseract binary, configure pytesseract, and verify it works.
    Returns True if everything is functional.
    """
    try:
        import pytesseract

        resolved = _resolve_tesseract_cmd()
        if resolved:
            pytesseract.pytesseract.tesseract_cmd = resolved
            logger.info("[OCR] Tesseract binary: %s", resolved)
        else:
            logger.warning("[OCR] tesseract binary not found — OCR will be unavailable.")
            return False

        version = pytesseract.get_tesseract_version()
        logger.info("[OCR] Tesseract version: %s", version)
        return True

    except Exception as exc:
        logger.warning("[OCR] Tesseract check failed: %s", exc)
        return False


_TESSERACT_OK: bool = _check_tesseract()
_PDFPLUMBER_OK: bool = True
try:
    import pdfplumber  # noqa: F401
except ImportError:
    _PDFPLUMBER_OK = False


# ─────────────────────────────────────────────────────────────────────────────
# Image OCR
# ─────────────────────────────────────────────────────────────────────────────

def _ocr_image(img_bytes: bytes) -> OCRResult:
    """Run Tesseract OCR on raw image bytes."""
    if not _TESSERACT_OK:
        return OCRResult(
            ocr_available=False,
            extracted_text=None,
        )

    import pytesseract
    from PIL import Image

    try:
        img = Image.open(io.BytesIO(img_bytes)).convert("RGB")

        # Get text + per-word data (for confidence)
        data = pytesseract.image_to_data(img, output_type=pytesseract.Output.DICT)
        text = pytesseract.image_to_string(img).strip()

        # Filter out rows with conf = -1 (non-word blocks)
        confs = [int(c) for c in data["conf"] if int(c) >= 0]
        avg_conf = (sum(confs) / len(confs)) if confs else None

        word_count = len(text.split()) if text else 0

        return OCRResult(
            ocr_available=True,
            extracted_text=text or None,
            word_count=word_count,
            avg_confidence=round(avg_conf, 1) if avg_conf is not None else None,
        )
    except Exception as exc:
        logger.warning("Image OCR failed: %s", exc)
        return OCRResult(ocr_available=False, extracted_text=None)


# ─────────────────────────────────────────────────────────────────────────────
# PDF OCR / text extraction
# ─────────────────────────────────────────────────────────────────────────────

def _ocr_pdf(pdf_bytes: bytes) -> OCRResult:
    """Extract text from a PDF using pdfplumber (no Tesseract needed)."""
    if not _PDFPLUMBER_OK:
        return OCRResult(
            ocr_available=False,
            extracted_text=None,
        )

    import pdfplumber

    try:
        full_text_parts = []
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            for page in pdf.pages:
                page_text = page.extract_text() or ""
                full_text_parts.append(page_text)

        full_text = "\n\n".join(full_text_parts).strip()
        word_count = len(full_text.split()) if full_text else 0

        return OCRResult(
            ocr_available=True,
            extracted_text=full_text or None,
            word_count=word_count,
            avg_confidence=None,   # pdfplumber doesn't report per-word confidence
        )
    except Exception as exc:
        logger.warning("PDF text extraction failed: %s", exc)
        return OCRResult(ocr_available=False, extracted_text=None)


# ─────────────────────────────────────────────────────────────────────────────
# Text comparison
# ─────────────────────────────────────────────────────────────────────────────

def _word_set_diff(a: str, b: str) -> tuple[list[str], list[str]]:
    """Return words (added_in_b, removed_from_a) using simple set difference."""
    words_a = set(a.lower().split())
    words_b = set(b.lower().split())
    added   = sorted(words_b - words_a)[:50]    # cap to 50 for payload size
    removed = sorted(words_a - words_b)[:50]
    return added, removed


def compare_texts(extracted: str, reference: str) -> TextComparisonResult:
    """
    Compare OCR-extracted text against a user-provided reference.
    Uses difflib for line-level diff and set-based word diff.
    """
    import difflib

    added, removed = _word_set_diff(reference, extracted)

    # Line-level similarity ratio
    ref_lines = reference.splitlines()
    ext_lines = extracted.splitlines()
    matcher   = difflib.SequenceMatcher(None, ref_lines, ext_lines)
    ratio     = matcher.ratio()

    # Collect changed lines (limited to 20)
    changed: list[str] = []
    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag != "equal":
            for line in ref_lines[i1:i2]:
                changed.append(f"- {line}")
            for line in ext_lines[j1:j2]:
                changed.append(f"+ {line}")
            if len(changed) >= 40:
                break

    tamper_score = max(0.0, 1.0 - ratio)   # dissimilarity → tamper signal

    return TextComparisonResult(
        reference_provided=True,
        similarity_ratio=round(ratio, 4),
        added_words=added,
        removed_words=removed,
        changed_lines=changed[:40],
        tamper_score=round(tamper_score, 4),
    )


# ─────────────────────────────────────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────────────────────────────────────

def _ocr_txt(txt_bytes: bytes) -> OCRResult:
    """Read a plain-text file directly — no OCR engine required."""
    try:
        # Try UTF-8 first, fall back to latin-1 which never fails
        try:
            text = txt_bytes.decode("utf-8")
        except UnicodeDecodeError:
            text = txt_bytes.decode("latin-1")

        text = text.strip()
        word_count = len(text.split()) if text else 0

        return OCRResult(
            ocr_available=True,
            extracted_text=text or None,
            word_count=word_count,
            avg_confidence=100.0,   # no OCR uncertainty — we read the raw text
        )
    except Exception as exc:
        logger.warning("TXT read failed: %s", exc)
        return OCRResult(ocr_available=False, extracted_text=None)


def extract_text(file_bytes: bytes, filename: str) -> OCRResult:
    """
    Extract text from an image, PDF, or plain-text file.
    Dispatches by file extension; always returns OCRResult (never raises).
    """
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext == "pdf":
        return _ocr_pdf(file_bytes)
    elif ext == "txt":
        return _ocr_txt(file_bytes)
    else:
        return _ocr_image(file_bytes)
