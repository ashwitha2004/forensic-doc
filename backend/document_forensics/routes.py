"""
Document Forensics API Routes
===============================
POST /api/document-forensics/analyze
    Accepts: multipart/form-data with 'file' + optional 'reference_text'
    Returns: DocumentForensicsResult JSON

GET  /api/document-forensics/health
    Liveness check — reports which sub-modules are available.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse

from .pipeline import run_document_forensics
from .ocr_engine import _TESSERACT_OK, _PDFPLUMBER_OK

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/document-forensics",
    tags=["Document Forensics"],
)

# ── Supported MIME / extension allow-list ─────────────────────────────────────

_ALLOWED_TYPES = {
    "image/jpeg", "image/png", "image/tiff", "image/webp",
    "image/bmp", "image/heic", "image/heif",
    "application/pdf",
    "text/plain",
    # browser sometimes sends these for PDF or txt
    "application/octet-stream",
}

_MAX_SIZE_MB = 20
_MAX_BYTES   = _MAX_SIZE_MB * 1024 * 1024


# ─────────────────────────────────────────────────────────────────────────────
# Routes
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/health")
async def document_forensics_health():
    """Liveness + capability check."""
    import cv2
    import numpy
    from PIL import Image as _pil

    return {
        "status": "ok",
        "modules": {
            "cv2":          cv2.__version__,
            "numpy":        numpy.__version__,
            "PIL":          _pil.__version__,
            "pytesseract":  _TESSERACT_OK,
            "pdfplumber":   _PDFPLUMBER_OK,
        },
        "capabilities": {
            "ela_heatmap":       True,
            "noise_map":         True,
            "layout_analysis":   True,
            "metadata":          True,
            "ocr_images":        _TESSERACT_OK,
            "ocr_pdf":           _PDFPLUMBER_OK,
            "text_comparison":   _TESSERACT_OK or _PDFPLUMBER_OK,
        },
    }


@router.post("/analyze")
async def analyze_document(
    file:           UploadFile = File(..., description="Image (JPEG/PNG/TIFF/WebP) or PDF"),
    reference_text: str        = Form(default="", description="Optional reference text for comparison"),
):
    """
    Run the full document forensics pipeline on the uploaded file.

    Returns a DocumentForensicsResult JSON with:
    - tamper_probability (0-1)
    - verdict (Authentic / Suspicious / Likely Tampered)
    - heatmap_base64 (PNG data URI for display)
    - flagged_regions
    - signals (per-module scores)
    - metadata / ocr / text_comparison sub-results
    """
    # ── Validation ────────────────────────────────────────────────────────────
    if file.content_type and file.content_type not in _ALLOWED_TYPES:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported file type: {file.content_type}. "
                   f"Supported: JPEG, PNG, TIFF, WebP, BMP, PDF, TXT.",
        )

    file_bytes = await file.read()

    if len(file_bytes) == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    if len(file_bytes) > _MAX_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File too large ({len(file_bytes) / 1024 / 1024:.1f} MB). "
                   f"Maximum allowed size is {_MAX_SIZE_MB} MB.",
        )

    filename       = file.filename or "upload.bin"
    reference_clean = reference_text.strip() if reference_text else None

    logger.info(
        "[DocForensics] /analyze — file=%s size=%.1f KB ref=%s",
        filename,
        len(file_bytes) / 1024,
        "yes" if reference_clean else "no",
    )

    # ── Pipeline ──────────────────────────────────────────────────────────────
    try:
        result = run_document_forensics(
            file_bytes     = file_bytes,
            filename       = filename,
            reference_text = reference_clean,
        )
    except Exception as exc:
        logger.exception("Document forensics pipeline crashed: %s", exc)
        raise HTTPException(status_code=500, detail=f"Analysis failed: {exc}")

    # Pydantic → dict → JSON response
    return JSONResponse(content=result.model_dump())
