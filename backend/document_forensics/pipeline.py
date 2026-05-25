"""
Document Forensics Pipeline
============================
Orchestrates all sub-modules and fuses their scores into a single
tamper-probability verdict.

Fusion weights
--------------
  ELA tampering          35%
  Noise residual         20%
  Layout inconsistency   15%
  Metadata anomaly       15%
  Text diff (optional)   15%

When text comparison is unavailable (no reference provided) its weight is
redistributed proportionally to the remaining signals.
"""

from __future__ import annotations

import logging
import time
from typing import List, Optional

from .metadata_extractor import extract_metadata
from .ocr_engine import extract_text, compare_texts
from .tampering_localizer import run_tampering_analysis
from .layout_analyzer import analyze_layout
from .schemas import (
    DocumentForensicsResult,
    TamperingSignals,
    TextComparisonResult,
)

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# Weight table
# ─────────────────────────────────────────────────────────────────────────────

_BASE_WEIGHTS = {
    "ela":      0.35,
    "noise":    0.20,
    "layout":   0.15,
    "metadata": 0.15,
    "text":     0.15,
}


def _fuse_scores(
    ela:      Optional[float],
    noise:    Optional[float],
    layout:   Optional[float],
    metadata: float,
    text:     Optional[float],
) -> float:
    """
    Weighted fusion of all tamper signals.
    Absent signals (None) have their weight redistributed to present ones.
    """
    pairs = {
        "ela":      ela,
        "noise":    noise,
        "layout":   layout,
        "metadata": metadata,
        "text":     text,
    }

    active   = {k: v for k, v in pairs.items() if v is not None}
    inactive = {k for k in pairs if k not in active}

    if not active:
        return 0.0

    # Redistribute missing weights proportionally to active signals
    missing_weight = sum(_BASE_WEIGHTS[k] for k in inactive)
    total_active_w = sum(_BASE_WEIGHTS[k] for k in active)

    weighted_sum = 0.0
    for key, val in active.items():
        effective_w = _BASE_WEIGHTS[key] + (
            _BASE_WEIGHTS[key] / total_active_w * missing_weight
        )
        weighted_sum += effective_w * val

    return round(min(max(weighted_sum, 0.0), 1.0), 4)


def _verdict(prob: float, conf: float) -> str:
    """Human-readable verdict based on tamper probability."""
    if prob >= 0.60 and conf >= 0.40:
        return "Likely Tampered"
    if prob >= 0.35 and conf >= 0.30:
        return "Suspicious"
    return "Authentic"


def _dominant_signals(signals: TamperingSignals, threshold: float = 0.35) -> List[str]:
    """Return list of signal names that exceeded the threshold."""
    out: List[str] = []
    if signals.ela_score is not None and signals.ela_score >= threshold:
        out.append("ELA anomaly")
    if signals.noise_inconsistency is not None and signals.noise_inconsistency >= threshold:
        out.append("Noise inconsistency")
    if signals.layout_score is not None and signals.layout_score >= threshold:
        out.append("Layout inconsistency")
    if signals.metadata_score >= threshold:
        out.append("Metadata anomaly")
    if signals.text_diff_score >= threshold:
        out.append("Text content mismatch")
    if not out:
        out.append("No significant tampering signals")
    return out


def _metadata_tamper_score(meta_result) -> float:
    """Convert metadata flags to a 0-1 tamper score."""
    score = 0.0
    if not meta_result.exif_present and meta_result.file_type == "image":
        score += 0.40    # Missing EXIF on supposed photo
    if meta_result.metadata_suspicious:
        score += 0.45    # Photoshop/AI software tag
    if not meta_result.gps_present and meta_result.exif_present and meta_result.camera_make:
        score += 0.05    # Minor: camera but no GPS (common but slight signal)
    return round(min(score, 1.0), 4)


# ─────────────────────────────────────────────────────────────────────────────
# Public entry point
# ─────────────────────────────────────────────────────────────────────────────

def run_document_forensics(
    file_bytes:     bytes,
    filename:       str,
    reference_text: Optional[str] = None,
) -> DocumentForensicsResult:
    """
    Run the full document forensics pipeline.

    Parameters
    ----------
    file_bytes      Raw bytes of the uploaded image or PDF.
    filename        Original filename (used for extension detection).
    reference_text  Optional ground-truth text to compare OCR output against.

    Returns
    -------
    DocumentForensicsResult — fully populated, never raises.
    """
    t_start = time.perf_counter()
    warnings: List[str] = []
    modules_run: List[str] = []

    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    is_image = ext in {"jpg", "jpeg", "png", "tiff", "tif", "webp", "bmp", "heic", "heif"}
    is_pdf   = ext == "pdf"
    is_text  = ext == "txt"

    # ── 1. Metadata extraction ────────────────────────────────────────────────
    logger.info("[DocForensics] Running metadata extraction…")
    meta_result = extract_metadata(file_bytes, filename)
    modules_run.append("metadata")
    metadata_score = _metadata_tamper_score(meta_result)

    # ── 2. Tampering localisation (images only) ───────────────────────────────
    ela_score    = None
    noise_score  = None
    heatmap_b64  = None
    flagged_regs = []

    if is_image:
        logger.info("[DocForensics] Running ELA + noise residual analysis…")
        tam = run_tampering_analysis(file_bytes)
        ela_score    = tam.ela_score
        noise_score  = tam.noise_score
        heatmap_b64  = tam.heatmap_base64
        flagged_regs = tam.flagged_regions
        modules_run.append("tampering_localizer")
    elif is_pdf:
        warnings.append("ELA heatmap not available for PDF files.")
    elif is_text:
        warnings.append("ELA heatmap not available for plain-text files.")
    else:
        warnings.append(f"Unrecognised extension '{ext}' — ELA skipped.")

    # ── 3. Layout analysis (images only) ─────────────────────────────────────
    layout_score = None
    if is_image:
        logger.info("[DocForensics] Running layout/font inconsistency analysis…")
        lay = analyze_layout(file_bytes)
        layout_score = lay.layout_score
        if lay.findings:
            warnings.extend(lay.findings)
        modules_run.append("layout_analyzer")
    elif is_text:
        pass   # No pixel-level layout analysis for plain text

    # ── 4. OCR text extraction ────────────────────────────────────────────────
    logger.info("[DocForensics] Running OCR extraction…")
    ocr_result = extract_text(file_bytes, filename)
    modules_run.append("ocr_engine")
    if not ocr_result.ocr_available:
        warnings.append("OCR unavailable (Tesseract/pdfplumber not installed or no text found).")

    # ── 5. Text comparison ────────────────────────────────────────────────────
    text_comparison: Optional[TextComparisonResult] = None
    text_score = None

    if reference_text and ocr_result.ocr_available and ocr_result.extracted_text:
        logger.info("[DocForensics] Running text comparison…")
        text_comparison = compare_texts(ocr_result.extracted_text, reference_text)
        text_score = text_comparison.tamper_score
        modules_run.append("text_comparison")
    elif reference_text and not (ocr_result.ocr_available and ocr_result.extracted_text):
        warnings.append("Reference text provided but no OCR text extracted — comparison skipped.")

    # ── 6. Fusion ─────────────────────────────────────────────────────────────
    tamper_prob = _fuse_scores(
        ela      = ela_score,
        noise    = noise_score,
        layout   = layout_score,
        metadata = metadata_score,
        text     = text_score,
    )

    # Confidence: how many signals did we actually run?
    active_signal_count = sum(
        v is not None for v in [ela_score, noise_score, layout_score, metadata_score, text_score]
    )
    confidence = round(active_signal_count / 5, 2)   # 0.2–1.0

    signals = TamperingSignals(
        ela_score           = round(ela_score,   4) if ela_score   is not None else None,
        noise_inconsistency = round(noise_score, 4) if noise_score is not None else None,
        layout_score        = round(layout_score,4) if layout_score is not None else None,
        metadata_score      = metadata_score,
        text_diff_score     = round(text_score,  4) if text_score  is not None else 0.0,
    )

    dominant = _dominant_signals(signals)
    verdict  = _verdict(tamper_prob, confidence)

    elapsed_ms = (time.perf_counter() - t_start) * 1000

    logger.info(
        "[DocForensics] Done: verdict=%s tamper=%.3f conf=%.2f (%.0f ms)",
        verdict, tamper_prob, confidence, elapsed_ms,
    )

    return DocumentForensicsResult(
        tamper_probability = tamper_prob,
        verdict            = verdict,
        confidence         = confidence,
        dominant_signals   = dominant,
        heatmap_base64     = heatmap_b64,
        flagged_regions    = flagged_regs,
        metadata           = meta_result,
        ocr                = ocr_result,
        text_comparison    = text_comparison,
        signals            = signals,
        processing_time_ms = round(elapsed_ms, 1),
        modules_run        = modules_run,
        warnings           = warnings,
    )
