"""
backend/document_forensics — Document tampering detection pipeline.

Capabilities
------------
* Error Level Analysis (ELA) heatmap
* Noise residual map
* Layout / font inconsistency scoring
* OCR text extraction (pytesseract + pdfplumber, graceful degradation)
* EXIF / PDF metadata extraction
* Fused tamper-probability verdict

Route exported: POST /api/document-forensics/analyze
"""

from .routes import router as document_forensics_router   # noqa: F401

__all__ = ["document_forensics_router"]
