"""
Unified Forensics Pipeline
==========================
Orchestrates:
  1. Document forensics (ELA, noise, layout, metadata, OCR)
  2. AI-image detection (per page for PDFs, directly for images)
  3. Fusion into a single verdict

Entry point: run_unified_forensics(file_bytes, filename, reference_text)
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


# ─── Result Schema ─────────────────────────────────────────────────────────────

@dataclass
class UnifiedForensicsResult:
    # Overall verdict
    verdict:          str
    fused_score:      float          # 0-1
    confidence:       float          # 0-1
    ai_probability:   float          # 0-100
    doc_tamper_prob:  float          # 0-1

    # Branches
    ai_branch_used:   bool
    doc_branch_used:  bool
    ai_error:         Optional[str]
    doc_error:        Optional[str]

    # Signals
    dominant_signals: List[str]      = field(default_factory=list)
    signal_breakdown: Dict[str, Any] = field(default_factory=dict)

    # Per-page AI results (PDF multi-page)
    page_results:     List[Dict[str, Any]] = field(default_factory=list)

    # Document forensics pass-through
    heatmap_base64:   Optional[str]  = None
    flagged_regions:  List[Any]      = field(default_factory=list)
    metadata:         Optional[Any]  = None
    ocr:              Optional[Any]  = None

    # File info
    file_type:        str            = "unknown"   # "image" | "pdf" | "text"
    page_count:       int            = 0


# ─── Main Entry Point ──────────────────────────────────────────────────────────

def run_unified_forensics(
    file_bytes:     bytes,
    filename:       str,
    reference_text: Optional[str] = None,
) -> UnifiedForensicsResult:
    """
    Run the full unified forensics pipeline on a file.

    Parameters
    ----------
    file_bytes      Raw bytes of the uploaded file.
    filename        Original filename (used for extension detection).
    reference_text  Optional reference text for document text-comparison.
    """
    ext       = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    file_type = _classify_file(ext)

    logger.info("[UnifiedPipeline] Start: %s  type=%s  size=%d KB",
                filename, file_type, len(file_bytes) // 1024)

    # ── Step 1 — Document Forensics (always) ──────────────────────────────────
    doc_result = _run_doc_forensics(file_bytes, filename, reference_text)

    # ── Step 2 — AI Detection ─────────────────────────────────────────────────
    ai_result, page_results, page_count = _run_ai_branch(
        file_bytes, filename, file_type, ext
    )

    # ── Step 3 — Fuse ─────────────────────────────────────────────────────────
    from .fusion_engine import fuse_results   # noqa: PLC0415
    verdict = fuse_results(ai_result, doc_result)

    # ── Assemble result ───────────────────────────────────────────────────────
    return UnifiedForensicsResult(
        verdict          = verdict.verdict,
        fused_score      = verdict.fused_score,
        confidence       = verdict.confidence,
        ai_probability   = verdict.ai_probability,
        doc_tamper_prob  = verdict.doc_tamper_prob,
        ai_branch_used   = verdict.ai_branch_used,
        doc_branch_used  = verdict.doc_branch_used,
        ai_error         = verdict.ai_error,
        doc_error        = verdict.doc_error,
        dominant_signals = verdict.dominant_signals,
        signal_breakdown = verdict.signal_breakdown,
        page_results     = page_results,
        heatmap_base64   = getattr(doc_result, "heatmap_base64", None),
        flagged_regions  = list(getattr(doc_result, "flagged_regions", []) or []),
        metadata         = getattr(doc_result, "metadata", None),
        ocr              = getattr(doc_result, "ocr",      None),
        file_type        = file_type,
        page_count       = page_count,
    )


# ─── Private Helpers ──────────────────────────────────────────────────────────

def _classify_file(ext: str) -> str:
    if ext in {"jpg", "jpeg", "png", "webp", "bmp", "tiff", "tif", "gif"}:
        return "image"
    if ext == "pdf":
        return "pdf"
    return "text"   # txt, doc, docx, etc.


def _run_doc_forensics(
    file_bytes:     bytes,
    filename:       str,
    reference_text: Optional[str],
) -> Any:
    try:
        from document_forensics.pipeline import run_document_forensics   # noqa: PLC0415
        result = run_document_forensics(file_bytes, filename, reference_text)
        logger.info("[UnifiedPipeline] Doc forensics OK — verdict=%s tamper=%.3f",
                    getattr(result, "verdict", "?"),
                    getattr(result, "tamper_probability", 0.0))
        return result
    except Exception as exc:
        logger.warning("[UnifiedPipeline] Doc forensics failed: %s", exc)
        # Return a minimal sentinel object so the fusion engine can detect the failure
        class _ErrResult:
            tamper_probability = 0.0
            confidence = 0.0
            verdict = ""
            signals = None
            heatmap_base64 = None
            flagged_regions = []
            metadata = None
            ocr = None
            error = str(exc)
        return _ErrResult()


def _run_ai_branch(
    file_bytes: bytes,
    filename:   str,
    file_type:  str,
    ext:        str,
) -> tuple[Optional[Dict[str, Any]], List[Dict[str, Any]], int]:
    """
    Returns (merged_ai_result, per_page_list, page_count).
    merged_ai_result is the (possibly averaged) AI result across pages.
    """
    from .ai_runner import run_ai_detection   # noqa: PLC0415

    if file_type == "image":
        result = run_ai_detection(file_bytes, suffix=f".{ext}")
        return result, [], 1

    if file_type == "pdf":
        return _run_ai_on_pdf(file_bytes)

    # text/doc files — AI detection not applicable
    return None, [], 0


def _run_ai_on_pdf(
    pdf_bytes: bytes,
) -> tuple[Optional[Dict[str, Any]], List[Dict[str, Any]], int]:
    """
    Render PDF pages and run AI detection + ELA + per-page OCR on each.
    Returns (merged_ai_result, per_page_list, page_count).
    """
    from .pdf_renderer import render_pdf_to_images   # noqa: PLC0415
    from .ai_runner    import run_ai_detection        # noqa: PLC0415

    pages = render_pdf_to_images(pdf_bytes)
    if not pages:
        logger.warning("[UnifiedPipeline] PDF rendering returned no pages")
        return None, [], 0

    # Per-page OCR via the enhanced engine
    page_ocr: List[dict] = []
    try:
        from document_forensics.ocr_engine import extract_text_per_page  # noqa: PLC0415
        page_ocr = extract_text_per_page(pdf_bytes, max_pages=len(pages))
        logger.info("[UnifiedPipeline] PDF per-page OCR: %d pages", len(page_ocr))
    except Exception as _ocr_err:
        logger.warning("[UnifiedPipeline] Per-page OCR failed: %s", _ocr_err)

    # Per-page ELA heatmap via tampering localizer
    page_results: List[Dict[str, Any]] = []
    for i, page_bytes in enumerate(pages):
        # AI detection
        r = run_ai_detection(page_bytes, suffix=".jpg")
        r["page"] = i + 1

        # ELA + heatmap for this page
        try:
            from document_forensics.tampering_localizer import run_tampering_analysis  # noqa: PLC0415
            tam = run_tampering_analysis(page_bytes)
            r["ela_score"]      = tam.ela_score
            r["noise_score"]    = tam.noise_score
            r["heatmap_base64"] = tam.heatmap_base64
            r["tamper_prob"]    = tam.tamper_probability
        except Exception as _ela_err:
            logger.debug("[UnifiedPipeline] Page %d ELA failed: %s", i + 1, _ela_err)

        # Per-page OCR
        if i < len(page_ocr):
            r["ocr_text"]       = page_ocr[i].get("text")
            r["ocr_word_count"] = page_ocr[i].get("word_count", 0)
            r["ocr_confidence"] = page_ocr[i].get("confidence")

        page_results.append(r)
        logger.info("[UnifiedPipeline] PDF page %d/%d: ai_prob=%.1f%% ela=%.3f",
                    i + 1, len(pages), r.get("ai_probability", 0.0),
                    r.get("ela_score", 0.0))

    # Merge: worst-case page wins for AI probability
    valid = [r for r in page_results if r.get("error") is None]
    if not valid:
        return {"error": "All PDF pages failed AI detection"}, page_results, len(pages)

    merged = dict(valid[0])
    merged["ai_probability"]    = max(r["ai_probability"]    for r in valid)
    merged["camera_probability"] = max(r["camera_probability"] for r in valid)
    merged["fusion_confidence"]  = max(r["fusion_confidence"]  for r in valid)
    merged["dl_confidence"]      = max(r["dl_confidence"]      for r in valid)
    merged["error"]              = None

    all_signals: List[str] = []
    for r in valid:
        all_signals.extend(r.get("dominant_signals", []))
    merged["dominant_signals"] = list(dict.fromkeys(all_signals))

    return merged, page_results, len(pages)
