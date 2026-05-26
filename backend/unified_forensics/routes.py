"""
Unified Forensics API Routes
============================
POST /api/unified-forensics/analyze   — full pipeline
GET  /api/unified-forensics/health    — liveness probe
"""

from __future__ import annotations

import logging
import time
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/unified-forensics",
    tags=["Unified Forensics"],
)

_MAX_FILE_SIZE = 30 * 1024 * 1024   # 30 MB

_ALLOWED_EXTENSIONS = {
    "jpg", "jpeg", "png", "webp", "bmp", "tiff", "tif",
    "pdf",
    "txt", "doc", "docx",
}


# ─── Response Models ──────────────────────────────────────────────────────────

class PageResult(BaseModel):
    page:               int
    ai_probability:     float
    camera_probability: float
    fusion_confidence:  float
    # Tamper signals per page
    ela_score:          Optional[float] = None
    noise_score:        Optional[float] = None
    tamper_prob:        Optional[float] = None
    heatmap_base64:     Optional[str]   = None
    # OCR per page
    ocr_text:           Optional[str]   = None
    ocr_word_count:     int             = 0
    ocr_confidence:     Optional[float] = None
    error:              Optional[str]   = None


class MetadataResult(BaseModel):
    software:           Optional[str]  = None
    creation_date:      Optional[str]  = None
    modification_date:  Optional[str]  = None
    suspicious_flags:   List[str]      = []
    raw:                Optional[dict] = None


class OCRResult(BaseModel):
    text:               Optional[str]  = None
    word_count:         int            = 0
    confidence:         Optional[float]= None
    language:           Optional[str]  = None


class FlaggedRegion(BaseModel):
    x:        int
    y:        int
    w:        int
    h:        int
    severity: float
    label:    Optional[str] = None


class SignalScores(BaseModel):
    """Per-signal tamper scores (0-100 percent scale)."""
    ela_score:           Optional[float] = None
    noise_inconsistency: Optional[float] = None
    layout_score:        Optional[float] = None
    metadata_score:      Optional[float] = None
    text_diff_score:     Optional[float] = None


class UnifiedForensicsResponse(BaseModel):
    # Core verdict
    verdict:          str
    fused_score:      float
    confidence:       float

    # Branch scores
    ai_probability:   float          # 0-100
    doc_tamper_prob:  float          # 0-1

    # Signals
    dominant_signals: List[str]
    signal_breakdown: Dict[str, Any]
    signal_scores:    Optional[SignalScores] = None   # NEW: structured doc signals

    # Branch availability
    ai_branch_used:   bool
    doc_branch_used:  bool
    ai_error:         Optional[str]  = None
    doc_error:        Optional[str]  = None

    # Per-page PDF results (now includes ELA + OCR per page)
    page_results:     List[PageResult] = []
    page_count:       int              = 0

    # Document forensics pass-through
    heatmap_base64:   Optional[str]   = None
    flagged_regions:  List[FlaggedRegion] = []
    metadata:         Optional[MetadataResult] = None
    ocr:              Optional[OCRResult]      = None

    # File info
    file_type:        str
    filename:         str
    file_size_kb:     float
    processing_time_ms: float


# ─── Routes ───────────────────────────────────────────────────────────────────

@router.get("/health")
async def health():
    """Liveness probe — checks both sub-pipelines."""
    doc_ok = _probe_doc_forensics()
    ai_ok  = _probe_ai_inference()
    return {
        "status":             "ok",
        "document_forensics": doc_ok,
        "ai_inference":       ai_ok,
        "unified_forensics":  True,
    }


@router.post("/analyze", response_model=UnifiedForensicsResponse)
async def analyze(
    file:           UploadFile      = File(...),
    reference_text: Optional[str]  = Form(None),
):
    """
    Run the unified forensic pipeline on an uploaded file.

    Accepts: JPEG, PNG, WebP, BMP, TIFF, PDF, TXT, DOC, DOCX (max 30 MB).
    """
    t0 = time.perf_counter()

    # ── Validate ──────────────────────────────────────────────────────────────
    filename = file.filename or "upload"
    ext      = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""

    if ext not in _ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported file type '.{ext}'. "
                   f"Allowed: {', '.join(sorted(_ALLOWED_EXTENSIONS))}",
        )

    file_bytes = await file.read()
    if len(file_bytes) > _MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"File too large ({len(file_bytes)//1024} KB). Max 30 MB.",
        )
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Empty file.")

    # ── Run pipeline (sync in thread pool) ───────────────────────────────────
    import asyncio
    from .pipeline import run_unified_forensics   # noqa: PLC0415

    try:
        loop   = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None,
            lambda: run_unified_forensics(file_bytes, filename, reference_text),
        )
    except Exception as exc:
        logger.exception("[UnifiedForensics] Pipeline error for %s", filename)
        raise HTTPException(status_code=500, detail=f"Pipeline error: {exc}") from exc

    elapsed_ms = (time.perf_counter() - t0) * 1000

    # ── Serialize per-page results ────────────────────────────────────────────
    page_results = [
        PageResult(
            page               = r.get("page", i + 1),
            ai_probability     = float(r.get("ai_probability",     50.0)),
            camera_probability = float(r.get("camera_probability",  50.0)),
            fusion_confidence  = float(r.get("fusion_confidence",   0.0)),
            ela_score          = r.get("ela_score"),
            noise_score        = r.get("noise_score"),
            tamper_prob        = r.get("tamper_prob"),
            heatmap_base64     = r.get("heatmap_base64"),
            ocr_text           = r.get("ocr_text"),
            ocr_word_count     = int(r.get("ocr_word_count") or 0),
            ocr_confidence     = r.get("ocr_confidence"),
            error              = r.get("error"),
        )
        for i, r in enumerate(result.page_results or [])
    ]

    # ── Serialize flagged regions ─────────────────────────────────────────────
    flagged = [
        FlaggedRegion(
            x        = getattr(reg, "x",        0),
            y        = getattr(reg, "y",        0),
            w        = getattr(reg, "width",    getattr(reg, "w", 0)),
            h        = getattr(reg, "height",   getattr(reg, "h", 0)),
            severity = getattr(reg, "severity", 0.0),
            label    = getattr(reg, "reason",   getattr(reg, "label", None)),
        )
        for reg in (result.flagged_regions or [])
    ]

    # ── Serialize metadata ────────────────────────────────────────────────────
    meta_obj = result.metadata
    meta_out: Optional[MetadataResult] = None
    if meta_obj is not None:
        if isinstance(meta_obj, dict):
            meta_out = MetadataResult(
                software          = meta_obj.get("software"),
                creation_date     = meta_obj.get("creation_date"),
                modification_date = meta_obj.get("modification_date"),
                suspicious_flags  = list(meta_obj.get("suspicious_flags", []) or []),
                raw               = meta_obj.get("raw"),
            )
        else:
            # MetadataResult dataclass / pydantic model from document_forensics
            soft = (
                getattr(meta_obj, "software_tag",  None) or
                getattr(meta_obj, "software",      None) or
                getattr(meta_obj, "pdf_creator",   None) or
                getattr(meta_obj, "pdf_producer",  None)
            )
            susp_flags = list(getattr(meta_obj, "metadata_notes", []) or [])
            if getattr(meta_obj, "metadata_suspicious", False):
                susp_flags.insert(0, "Suspicious metadata detected (AI/editor software signature)")

            meta_out = MetadataResult(
                software          = soft,
                creation_date     = (
                    getattr(meta_obj, "capture_datetime",     None) or
                    getattr(meta_obj, "pdf_creation_date",    None) or
                    getattr(meta_obj, "creation_date",        None)
                ),
                modification_date = (
                    getattr(meta_obj, "pdf_modification_date", None) or
                    getattr(meta_obj, "modification_date",     None)
                ),
                suspicious_flags  = susp_flags,
                raw               = getattr(meta_obj, "raw", None),
            )

    # ── Serialize OCR  (FIX: field is extracted_text, not text) ──────────────
    ocr_obj = result.ocr
    ocr_out: Optional[OCRResult] = None
    if ocr_obj is not None:
        if isinstance(ocr_obj, dict):
            ocr_out = OCRResult(
                text       = ocr_obj.get("extracted_text") or ocr_obj.get("text"),
                word_count = int(ocr_obj.get("word_count") or 0),
                confidence = ocr_obj.get("avg_confidence") or ocr_obj.get("confidence"),
                language   = ocr_obj.get("language_detected") or ocr_obj.get("language"),
            )
        else:
            # Schema is document_forensics.schemas.OCRResult → field is extracted_text
            text_val = (
                getattr(ocr_obj, "extracted_text", None) or
                getattr(ocr_obj, "text",           None)
            )
            conf_val = (
                getattr(ocr_obj, "avg_confidence", None) or
                getattr(ocr_obj, "confidence",     None)
            )
            ocr_out = OCRResult(
                text       = text_val,
                word_count = int(getattr(ocr_obj, "word_count", 0) or 0),
                confidence = float(conf_val) if conf_val is not None else None,
                language   = (
                    getattr(ocr_obj, "language_detected", None) or
                    getattr(ocr_obj, "language",          None)
                ),
            )

    # ── Structured doc signal scores ─────────────────────────────────────────
    signal_scores: Optional[SignalScores] = None
    breakdown = result.signal_breakdown or {}
    # The fusion engine stores doc signals under "doc_signals" key
    raw_doc_sigs = breakdown.get("doc_signals") or breakdown.get("doc_details", {})
    if raw_doc_sigs and isinstance(raw_doc_sigs, dict):
        def _pct(v):
            if v is None:
                return None
            return round(float(v) * 100, 1)

        signal_scores = SignalScores(
            ela_score           = _pct(raw_doc_sigs.get("ela_score")),
            noise_inconsistency = _pct(raw_doc_sigs.get("noise_inconsistency")),
            layout_score        = _pct(raw_doc_sigs.get("layout_anomaly") or raw_doc_sigs.get("layout_score")),
            metadata_score      = _pct(raw_doc_sigs.get("metadata_suspicion") or raw_doc_sigs.get("metadata_score")),
            text_diff_score     = _pct(raw_doc_sigs.get("text_anomaly") or raw_doc_sigs.get("text_diff_score")),
        )

    return UnifiedForensicsResponse(
        verdict           = result.verdict,
        fused_score       = result.fused_score,
        confidence        = result.confidence,
        ai_probability    = result.ai_probability,
        doc_tamper_prob   = result.doc_tamper_prob,
        dominant_signals  = result.dominant_signals,
        signal_breakdown  = result.signal_breakdown,
        signal_scores     = signal_scores,
        ai_branch_used    = result.ai_branch_used,
        doc_branch_used   = result.doc_branch_used,
        ai_error          = result.ai_error,
        doc_error         = result.doc_error,
        page_results      = page_results,
        page_count        = result.page_count,
        heatmap_base64    = result.heatmap_base64,
        flagged_regions   = flagged,
        metadata          = meta_out,
        ocr               = ocr_out,
        file_type         = result.file_type,
        filename          = filename,
        file_size_kb      = round(len(file_bytes) / 1024, 1),
        processing_time_ms= round(elapsed_ms, 1),
    )


# ─── Health Probe Helpers ─────────────────────────────────────────────────────

def _probe_doc_forensics() -> bool:
    try:
        from document_forensics.pipeline import run_document_forensics   # noqa: F401
        return True
    except Exception:
        return False


def _probe_ai_inference() -> bool:
    try:
        from inference.ai_detector import get_detector   # noqa: F401
        return True
    except Exception:
        return False
