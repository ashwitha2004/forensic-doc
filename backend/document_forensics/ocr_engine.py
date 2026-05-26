"""
OCR Extraction Engine  (v3 — multi-strategy, multi-language, high-DPI)
=======================================================================
Extracts text from images and PDFs with a robust preprocessing pipeline.

Key improvements over v2:
  • Multi-strategy preprocessing — 4 strategies tried, best confidence wins
  • CLAHE contrast enhancement before thresholding
  • Bilateral filter / NL-means denoising (tuned for documents)
  • Auto-deskew via Hough-transform angle correction
  • Garbage word filtering — drops words with confidence < 25 or mostly symbols
  • PDF rendered at 300 DPI (scale=4.17) instead of 144 DPI
  • Telugu tessdata auto-downloaded on first use if not present
  • PSM 6 → 4 → 3 cascade (tries simpler PSM first, escalates if needed)
"""

from __future__ import annotations

import io
import logging
import os
import shutil
from typing import List, Optional, Tuple

from .schemas import OCRResult, TextComparisonResult

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# Tesseract binary discovery
# ─────────────────────────────────────────────────────────────────────────────

_TESS_EXE = (
    os.environ.get("TESSERACT_CMD", "")
    or r"C:\Program Files\Tesseract-OCR\tesseract.exe"
    or r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe"
    or r"C:\Tesseract-OCR\tesseract.exe"
    or "/usr/bin/tesseract"
    or "/usr/local/bin/tesseract"
    or "/opt/homebrew/bin/tesseract"
)

_TESS_CANDIDATES = [
    os.environ.get("TESSERACT_CMD", ""),
    r"C:\Program Files\Tesseract-OCR\tesseract.exe",
    r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
    r"C:\Tesseract-OCR\tesseract.exe",
    "/usr/bin/tesseract",
    "/usr/local/bin/tesseract",
    "/opt/homebrew/bin/tesseract",
]

_TESSDATA_DIR: Optional[str] = None   # set by _check_tesseract()


def _resolve_tesseract_cmd() -> Optional[str]:
    for candidate in _TESS_CANDIDATES:
        if candidate and os.path.isfile(candidate):
            return candidate
    return shutil.which("tesseract")


def _check_tesseract() -> bool:
    global _TESSDATA_DIR
    try:
        import pytesseract
        resolved = _resolve_tesseract_cmd()
        if not resolved:
            logger.warning("[OCR] tesseract binary not found")
            return False
        pytesseract.pytesseract.tesseract_cmd = resolved

        # Infer default tessdata dir from the binary path
        bin_dir = os.path.dirname(resolved)
        for candidate in [
            os.path.join(bin_dir, "tessdata"),
            os.path.join(bin_dir, "..", "share", "tessdata"),
            "/usr/share/tesseract-ocr/5/tessdata",
            "/usr/share/tesseract-ocr/4.00/tessdata",
            "/usr/share/tessdata",
        ]:
            if os.path.isdir(candidate):
                _TESSDATA_DIR = os.path.normpath(candidate)
                break

        logger.info("[OCR] Tesseract: %s  tessdata: %s", resolved, _TESSDATA_DIR)
        ver = pytesseract.get_tesseract_version()
        logger.info("[OCR] Tesseract version: %s", ver)
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

_PYPDFIUM2_OK: bool = True
try:
    import pypdfium2  # noqa: F401
except ImportError:
    _PYPDFIUM2_OK = False


# ─────────────────────────────────────────────────────────────────────────────
# Multilingual tessdata management
# ─────────────────────────────────────────────────────────────────────────────

# Languages we want to support.  Format: (lang_code, download_url)
_EXTRA_LANGS = [
    (
        "tel",
        "https://github.com/tesseract-ocr/tessdata_best/raw/main/tel.traineddata",
    ),
    (
        "hin",
        "https://github.com/tesseract-ocr/tessdata_best/raw/main/hin.traineddata",
    ),
]

# Custom tessdata dir inside the project (writable, no admin required)
_CUSTOM_TESSDATA = os.path.join(os.path.dirname(__file__), "..", "tessdata_custom")


def _ensure_custom_tessdata() -> Optional[str]:
    """
    Make sure the custom tessdata directory exists and contains the extra
    language packs we want.  Returns the directory path (or None on failure).
    """
    try:
        os.makedirs(_CUSTOM_TESSDATA, exist_ok=True)

        for lang_code, url in _EXTRA_LANGS:
            dest = os.path.join(_CUSTOM_TESSDATA, f"{lang_code}.traineddata")
            if os.path.isfile(dest) and os.path.getsize(dest) > 10_000:
                continue  # already downloaded
            logger.info("[OCR] Downloading %s tessdata…", lang_code)
            try:
                import urllib.request
                urllib.request.urlretrieve(url, dest)
                logger.info("[OCR] %s tessdata saved (%d KB)", lang_code,
                            os.path.getsize(dest) // 1024)
            except Exception as exc:
                logger.warning("[OCR] Failed to download %s: %s", lang_code, exc)
                if os.path.isfile(dest):
                    os.remove(dest)

        return _CUSTOM_TESSDATA
    except Exception as exc:
        logger.warning("[OCR] Custom tessdata setup failed: %s", exc)
        return None


def _available_langs() -> str:
    """
    Always use English-only OCR.
    Combining eng+tel causes Tesseract to hallucinate characters from the
    wrong script and produce garbage output on mixed documents.
    English tessdata handles all Roman-script text correctly regardless of
    the document's origin language.
    """
    return "eng"


def _build_merged_tessdata(custom_dir: str) -> Optional[str]:
    """
    Create a merged tessdata directory that contains both the system traineddata
    and the custom-downloaded ones (using symlinks or copies).
    """
    try:
        merged = os.path.join(os.path.dirname(__file__), "..", "tessdata_merged")
        os.makedirs(merged, exist_ok=True)

        # Copy/link from system dir
        if _TESSDATA_DIR and os.path.isdir(_TESSDATA_DIR):
            for fname in os.listdir(_TESSDATA_DIR):
                if fname.endswith(".traineddata"):
                    src = os.path.join(_TESSDATA_DIR, fname)
                    dst = os.path.join(merged, fname)
                    if not os.path.exists(dst):
                        shutil.copy2(src, dst)

        # Copy custom downloads
        for fname in os.listdir(custom_dir):
            if fname.endswith(".traineddata"):
                src = os.path.join(custom_dir, fname)
                dst = os.path.join(merged, fname)
                if not os.path.exists(dst) or os.path.getsize(dst) < os.path.getsize(src):
                    shutil.copy2(src, dst)

        return merged
    except Exception as exc:
        logger.warning("[OCR] Merged tessdata build failed: %s", exc)
        return None


def _lang() -> str:
    return "eng"


# ─────────────────────────────────────────────────────────────────────────────
# Deskew
# ─────────────────────────────────────────────────────────────────────────────

def _deskew(gray: "np.ndarray") -> "np.ndarray":   # type: ignore[name-defined]
    """
    Auto-correct document skew using Hough line detection.
    Returns the rotated grayscale image.
    Only rotates if angle is between -45° and 45° to avoid flipping.
    """
    try:
        import cv2
        import numpy as np

        # Edge detect on a small version for speed
        scale   = 800 / max(gray.shape)
        small   = cv2.resize(gray, (0, 0), fx=scale, fy=scale)
        edges   = cv2.Canny(small, 50, 150, apertureSize=3)

        lines = cv2.HoughLinesP(
            edges, 1, np.pi / 180,
            threshold=80,
            minLineLength=int(small.shape[1] * 0.3),
            maxLineGap=20,
        )
        if lines is None or len(lines) == 0:
            return gray

        angles = []
        for x1, y1, x2, y2 in lines[:, 0]:
            if x2 - x1 == 0:
                continue
            angle = np.degrees(np.arctan2(y2 - y1, x2 - x1))
            if -45 < angle < 45:
                angles.append(angle)

        if not angles:
            return gray

        # Median angle — robust to outliers
        median_angle = float(np.median(angles))
        if abs(median_angle) < 0.5:
            return gray   # negligible skew

        h, w    = gray.shape
        center  = (w / 2, h / 2)
        M       = cv2.getRotationMatrix2D(center, median_angle, 1.0)
        rotated = cv2.warpAffine(
            gray, M, (w, h),
            flags      = cv2.INTER_CUBIC,
            borderMode = cv2.BORDER_REPLICATE,
        )
        logger.debug("[OCR] Deskew: corrected %.2f°", median_angle)
        return rotated

    except Exception as exc:
        logger.debug("[OCR] Deskew failed (non-fatal): %s", exc)
        return gray


# ─────────────────────────────────────────────────────────────────────────────
# Preprocessing strategies
# ─────────────────────────────────────────────────────────────────────────────

def _to_gray_upscaled(pil_img, min_side: int = 2000) -> "np.ndarray":
    """
    Convert PIL image to grayscale numpy array and upscale if needed.
    Target: at least 300 DPI (≈ 2000px for a typical A4 scan).
    """
    import cv2
    import numpy as np

    arr  = np.array(pil_img.convert("RGB"))
    gray = cv2.cvtColor(arr, cv2.COLOR_RGB2GRAY)

    h, w = gray.shape
    if max(h, w) < min_side:
        scale = min_side / max(h, w)
        gray  = cv2.resize(
            gray, (int(w * scale), int(h * scale)),
            interpolation=cv2.INTER_CUBIC,
        )
    return gray


def _preprocess_strategies(pil_img) -> List[Tuple[str, "PIL.Image.Image"]]:  # type: ignore[name-defined]
    """
    Return 4 preprocessed versions of the input image.
    Each uses a different pipeline suited to different document conditions.
    """
    import cv2
    import numpy as np
    from PIL import Image

    results: List[Tuple[str, Image.Image]] = []

    try:
        gray = _to_gray_upscaled(pil_img)
        gray = _deskew(gray)

        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))

        # ── Strategy 1: CLAHE + Otsu ───────────────────────────────────────
        # Best for documents with uneven illumination (photographed with phone)
        s1 = clahe.apply(gray)
        _, s1 = cv2.threshold(s1, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        results.append(("clahe_otsu", Image.fromarray(s1)))

        # ── Strategy 2: Bilateral filter + CLAHE + Adaptive threshold ──────
        # Best for noisy scans; bilateral preserves edges while denoising
        s2 = cv2.bilateralFilter(gray.astype("uint8"), d=9, sigmaColor=75, sigmaSpace=75)
        s2 = clahe.apply(s2)
        s2 = cv2.adaptiveThreshold(
            s2, 255,
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY,
            15, 8,   # block size 15, C=8 (more conservative than before)
        )
        results.append(("bilateral_clahe_adaptive", Image.fromarray(s2)))

        # ── Strategy 3: Light denoise + Otsu (for clean printed docs) ──────
        s3 = cv2.GaussianBlur(gray.astype("uint8"), (3, 3), 0)
        _, s3 = cv2.threshold(s3, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        results.append(("gauss_otsu", Image.fromarray(s3)))

        # ── Strategy 4: Plain grayscale (no binarisation) ─────────────────
        # Tesseract's LSTM engine often performs better on grey images
        results.append(("plain_gray", Image.fromarray(gray.astype("uint8"))))

    except Exception as exc:
        logger.warning("[OCR] Preprocessing error: %s", exc)
        results.append(("fallback", pil_img.convert("L")))

    return results


# ─────────────────────────────────────────────────────────────────────────────
# Garbage word filtering
# ─────────────────────────────────────────────────────────────────────────────

def _filter_garbage(data: dict) -> Tuple[str, List[int]]:
    """
    Reconstruct OCR text from per-word data, dropping:
    - Words with confidence < 25
    - Words that are mostly non-alphanumeric symbols
    - Pure whitespace / empty tokens

    Returns (filtered_text, [kept_confidences]).
    """
    words: List[str] = []
    kept_confs: List[int] = []

    for i, word in enumerate(data.get("text", [])):
        conf = int(data["conf"][i]) if i < len(data["conf"]) else -1

        if not word.strip():
            # Preserve line breaks
            if data["level"][i] in (2, 3):   # para / line level
                if words and words[-1] != "\n":
                    words.append("\n")
            continue

        if conf < 25:
            continue

        # Garbage ratio: fraction of purely symbolic characters
        alnum = sum(1 for c in word if c.isalnum() or c in "'.,;:-()/% ")
        if len(word) > 1 and alnum / len(word) < 0.40:
            continue

        words.append(word)
        kept_confs.append(conf)

        # Space / line management using block_num and line_num from data
        if i + 1 < len(data["text"]):
            same_line = (
                data.get("block_num", [0] * (i + 2))[i]
                == data.get("block_num", [0] * (i + 2))[i + 1]
                and data.get("line_num", [0] * (i + 2))[i]
                == data.get("line_num", [0] * (i + 2))[i + 1]
            )
            if not same_line and words and words[-1] != "\n":
                words.append("\n")
            else:
                words.append(" ")

    text = "".join(words).strip()
    # Collapse multiple blank lines
    import re
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r" {2,}", " ", text)
    return text, kept_confs


# ─────────────────────────────────────────────────────────────────────────────
# Core OCR runner (single image, one strategy)
# ─────────────────────────────────────────────────────────────────────────────

_PSM_SEQUENCE = [6, 4, 3, 11]   # PSM 6 → single block, 4 → column, 3 → auto, 11 → sparse


def _run_tesseract(img, lang: str, psm: int = 6) -> Tuple[str, float]:
    """
    Run Tesseract on a PIL image with the given PSM mode.
    Returns (text, avg_confidence).  avg_confidence is -1 if OCR fails.
    """
    import pytesseract

    cfg  = f"--oem 1 --psm {psm}"   # oem 1 = LSTM only
    try:
        data = pytesseract.image_to_data(
            img, lang=lang,
            output_type=pytesseract.Output.DICT,
            config=cfg,
        )
        text, confs = _filter_garbage(data)
        avg_conf = sum(confs) / len(confs) if confs else 0.0
        return text, avg_conf
    except Exception as exc:
        logger.debug("[OCR] Tesseract PSM %d failed: %s", psm, exc)
        return "", -1.0


def _best_ocr_for_image(pil_img) -> Tuple[str, float]:
    """
    Try every preprocessing strategy × PSM 6 and return the (text, confidence)
    that maximises word count × average confidence.
    Escalates to other PSM values only if PSM 6 is uniformly weak.
    """
    lang       = _lang()
    strategies = _preprocess_strategies(pil_img)
    best_text  = ""
    best_score = -1.0
    best_conf  = 0.0

    for name, proc_img in strategies:
        text, conf = _run_tesseract(proc_img, lang, psm=6)
        word_count = len(text.split())
        score      = word_count * max(conf, 0)

        logger.debug("[OCR] Strategy %-30s words=%-4d conf=%.1f score=%.1f",
                     name, word_count, conf, score)

        if score > best_score:
            best_score = score
            best_text  = text
            best_conf  = conf

    # If the best result is still weak, try other PSM modes with the plain-gray strategy
    if best_score < 50 and strategies:
        _, plain_img = strategies[-1]   # plain_gray is always last
        for psm in _PSM_SEQUENCE[1:]:
            text, conf = _run_tesseract(plain_img, lang, psm=psm)
            score      = len(text.split()) * max(conf, 0)
            logger.debug("[OCR] PSM %-2d words=%-4d conf=%.1f score=%.1f",
                         psm, len(text.split()), conf, score)
            if score > best_score:
                best_score = score
                best_text  = text
                best_conf  = conf

    return best_text, best_conf


# ─────────────────────────────────────────────────────────────────────────────
# Image OCR  (public)
# ─────────────────────────────────────────────────────────────────────────────

def _ocr_image(img_bytes: bytes) -> OCRResult:
    """Run Tesseract OCR on raw image bytes with multi-strategy preprocessing."""
    if not _TESSERACT_OK:
        return OCRResult(ocr_available=False, extracted_text=None)

    from PIL import Image

    try:
        pil   = Image.open(io.BytesIO(img_bytes)).convert("RGB")
        text, conf = _best_ocr_for_image(pil)
        word_count = len(text.split()) if text else 0

        logger.info("[OCR] Image OCR done: %d words, conf=%.1f", word_count, conf)

        return OCRResult(
            ocr_available  = True,
            extracted_text = text or None,
            word_count     = word_count,
            avg_confidence = round(conf, 1) if conf >= 0 else None,
        )
    except Exception as exc:
        logger.warning("[OCR] Image OCR failed: %s", exc)
        return OCRResult(ocr_available=False, extracted_text=None)


# ─────────────────────────────────────────────────────────────────────────────
# PDF OCR  — embedded text (pdfplumber)
# ─────────────────────────────────────────────────────────────────────────────

def _ocr_pdf_embedded(pdf_bytes: bytes) -> OCRResult:
    """Extract text embedded in the PDF using pdfplumber (no image rendering)."""
    if not _PDFPLUMBER_OK:
        return OCRResult(ocr_available=False, extracted_text=None)

    import pdfplumber

    try:
        parts: List[str] = []
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            for pg in pdf.pages:
                txt = pg.extract_text() or ""
                parts.append(txt)

        full_text  = "\n\n".join(parts).strip()
        word_count = len(full_text.split()) if full_text else 0

        return OCRResult(
            ocr_available  = True,
            extracted_text = full_text or None,
            word_count     = word_count,
            avg_confidence = None,
        )
    except Exception as exc:
        logger.warning("[OCR] PDF embedded text failed: %s", exc)
        return OCRResult(ocr_available=False, extracted_text=None)


# ─────────────────────────────────────────────────────────────────────────────
# PDF OCR — rendered pages (300 DPI)
# ─────────────────────────────────────────────────────────────────────────────

_PDF_RENDER_SCALE = 4.17   # 72 DPI × 4.17 ≈ 300 DPI


def _ocr_pdf_rendered(pdf_bytes: bytes, max_pages: int = 10) -> OCRResult:
    """
    Render every PDF page at 300 DPI and run multi-strategy Tesseract OCR.
    Used when embedded text is absent or sparse (scanned / photographed PDFs).
    """
    if not _TESSERACT_OK or not _PYPDFIUM2_OK:
        return OCRResult(ocr_available=False, extracted_text=None)

    import pypdfium2 as pdfium
    from PIL import Image

    try:
        doc  = pdfium.PdfDocument(pdf_bytes)
        n    = min(len(doc), max_pages)
        page_texts: List[str] = []
        all_confs:  List[float] = []

        for i in range(n):
            try:
                page   = doc[i]
                bitmap = page.render(scale=_PDF_RENDER_SCALE)
                pil    = bitmap.to_pil().convert("RGB")

                text, conf = _best_ocr_for_image(pil)
                all_confs.append(conf)

                if text:
                    page_texts.append(f"[Page {i + 1}]\n{text}")
                else:
                    page_texts.append(f"[Page {i + 1}]\n(no text extracted)")

                logger.info("[OCR] PDF page %d/%d: %d words conf=%.1f",
                            i + 1, n, len(text.split()), conf)

            except Exception as pg_err:
                logger.warning("[OCR] PDF page %d failed: %s", i + 1, pg_err)

        full_text  = "\n\n".join(page_texts).strip()
        avg_conf   = sum(all_confs) / len(all_confs) if all_confs else None
        word_count = len(full_text.split()) if full_text else 0

        return OCRResult(
            ocr_available  = True,
            extracted_text = full_text or None,
            word_count     = word_count,
            avg_confidence = round(avg_conf, 1) if avg_conf is not None else None,
        )
    except Exception as exc:
        logger.warning("[OCR] PDF rendered OCR failed: %s", exc)
        return OCRResult(ocr_available=False, extracted_text=None)


# ─────────────────────────────────────────────────────────────────────────────
# PDF OCR  — smart dispatcher
# ─────────────────────────────────────────────────────────────────────────────

def _ocr_pdf(pdf_bytes: bytes) -> OCRResult:
    """
    Smart PDF OCR:
      1. Try pdfplumber for embedded text.
      2. If sparse (< 30 words), render pages at 300 DPI and use Tesseract.
    """
    embedded = _ocr_pdf_embedded(pdf_bytes)

    if embedded.extracted_text and (embedded.word_count or 0) >= 30:
        logger.info("[OCR] PDF has embedded text (%d words) — skipping render",
                    embedded.word_count or 0)
        return embedded

    logger.info("[OCR] PDF embedded text sparse (%d words) — rendering at 300 DPI",
                embedded.word_count or 0)
    rendered = _ocr_pdf_rendered(pdf_bytes)

    if rendered.extracted_text:
        return rendered

    return embedded if embedded.extracted_text else OCRResult(
        ocr_available=True, extracted_text=None, word_count=0
    )


# ─────────────────────────────────────────────────────────────────────────────
# Per-page PDF OCR  (used by unified pipeline)
# ─────────────────────────────────────────────────────────────────────────────

def extract_text_per_page(pdf_bytes: bytes, max_pages: int = 10) -> List[dict]:
    """
    Extract OCR text per page from a PDF.

    Returns list of dicts:
      { page: int, text: str|None, word_count: int, confidence: float|None }
    """
    results: List[dict] = []

    # pdfplumber embedded pass
    plumber_pages: List[str] = []
    if _PDFPLUMBER_OK:
        try:
            import pdfplumber
            with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
                for pg in pdf.pages[:max_pages]:
                    plumber_pages.append(pg.extract_text() or "")
        except Exception as exc:
            logger.warning("[OCR] pdfplumber per-page failed: %s", exc)

    # Rendered pass
    rendered_pages: List[Optional[str]] = []
    rendered_confs: List[Optional[float]] = []

    need_render = _TESSERACT_OK and _PYPDFIUM2_OK and (
        not plumber_pages
        or any(len((t or "").split()) < 30 for t in plumber_pages)
    )

    if need_render:
        try:
            import pypdfium2 as pdfium
            from PIL import Image

            doc = pdfium.PdfDocument(pdf_bytes)
            n   = min(len(doc), max_pages)

            for i in range(n):
                try:
                    page   = doc[i]
                    bitmap = page.render(scale=_PDF_RENDER_SCALE)
                    pil    = bitmap.to_pil().convert("RGB")
                    text, conf = _best_ocr_for_image(pil)
                    rendered_pages.append(text or None)
                    rendered_confs.append(conf if conf >= 0 else None)
                except Exception as pg_err:
                    logger.warning("[OCR] Per-page render %d failed: %s", i + 1, pg_err)
                    rendered_pages.append(None)
                    rendered_confs.append(None)
        except Exception as exc:
            logger.warning("[OCR] per-page pypdfium2 init failed: %s", exc)

    # Merge
    n_pages = max(len(plumber_pages), len(rendered_pages), 1)
    for i in range(min(n_pages, max_pages)):
        plumber_text = plumber_pages[i] if i < len(plumber_pages) else ""
        render_text  = rendered_pages[i] if i < len(rendered_pages) else None
        render_conf  = rendered_confs[i] if i < len(rendered_confs) else None

        if len((plumber_text or "").split()) >= 30:
            best_text = plumber_text.strip() or None
            best_conf = None
        elif render_text:
            best_text = render_text
            best_conf = render_conf
        else:
            best_text = (plumber_text or "").strip() or None
            best_conf = None

        results.append({
            "page":       i + 1,
            "text":       best_text,
            "word_count": len((best_text or "").split()),
            "confidence": best_conf,
        })

    return results


# ─────────────────────────────────────────────────────────────────────────────
# Plain-text file
# ─────────────────────────────────────────────────────────────────────────────

def _ocr_txt(txt_bytes: bytes) -> OCRResult:
    try:
        try:
            text = txt_bytes.decode("utf-8")
        except UnicodeDecodeError:
            text = txt_bytes.decode("latin-1")
        text       = text.strip()
        word_count = len(text.split()) if text else 0
        return OCRResult(
            ocr_available=True, extracted_text=text or None,
            word_count=word_count, avg_confidence=100.0,
        )
    except Exception as exc:
        logger.warning("TXT read failed: %s", exc)
        return OCRResult(ocr_available=False, extracted_text=None)


# ─────────────────────────────────────────────────────────────────────────────
# Text comparison
# ─────────────────────────────────────────────────────────────────────────────

def _word_set_diff(a: str, b: str) -> Tuple[List[str], List[str]]:
    words_a = set(a.lower().split())
    words_b = set(b.lower().split())
    return sorted(words_b - words_a)[:50], sorted(words_a - words_b)[:50]


def compare_texts(extracted: str, reference: str) -> TextComparisonResult:
    import difflib

    added, removed = _word_set_diff(reference, extracted)
    ref_lines = reference.splitlines()
    ext_lines = extracted.splitlines()
    matcher   = difflib.SequenceMatcher(None, ref_lines, ext_lines)
    ratio     = matcher.ratio()

    changed: List[str] = []
    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag != "equal":
            for line in ref_lines[i1:i2]:
                changed.append(f"- {line}")
            for line in ext_lines[j1:j2]:
                changed.append(f"+ {line}")
            if len(changed) >= 40:
                break

    return TextComparisonResult(
        reference_provided = True,
        similarity_ratio   = round(ratio, 4),
        added_words        = added,
        removed_words      = removed,
        changed_lines      = changed[:40],
        tamper_score       = round(max(0.0, 1.0 - ratio), 4),
    )


# ─────────────────────────────────────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────────────────────────────────────

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
