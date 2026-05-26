"""
Pydantic schemas for the Document Forensics API.
All fields are Optional so that partial failures degrade gracefully.
"""

from __future__ import annotations

from typing import List, Optional
from pydantic import BaseModel, Field


# ─────────────────────────────────────────────────────────────────────────────
# Sub-schemas
# ─────────────────────────────────────────────────────────────────────────────

class RegionFlag(BaseModel):
    """A rectangular image region flagged as suspicious."""
    x: int
    y: int
    width: int
    height: int
    reason: str
    severity: float = Field(..., ge=0.0, le=1.0, description="0=benign, 1=high suspicion")


class MetadataResult(BaseModel):
    """File / EXIF / PDF metadata."""
    file_type: str                                # "image" | "pdf" | "unknown"
    mime_type: Optional[str] = None
    file_size_kb: Optional[float] = None

    # EXIF (images)
    camera_make: Optional[str] = None
    camera_model: Optional[str] = None
    capture_datetime: Optional[str] = None
    gps_present: bool = False
    software_tag: Optional[str] = None           # e.g. "Adobe Photoshop"
    exif_present: bool = False

    # PDF
    pdf_author: Optional[str] = None
    pdf_creator: Optional[str] = None
    pdf_producer: Optional[str] = None
    pdf_creation_date: Optional[str] = None
    pdf_modification_date: Optional[str] = None
    pdf_page_count: Optional[int] = None

    # Interpretation
    metadata_suspicious: bool = False
    metadata_notes: List[str] = Field(default_factory=list)


class OCRResult(BaseModel):
    """OCR extraction outcome."""
    ocr_available: bool
    extracted_text: Optional[str] = None
    word_count: Optional[int] = None
    avg_confidence: Optional[float] = None       # 0-100 per pytesseract
    language_detected: Optional[str] = None


class TextComparisonResult(BaseModel):
    """Diff between extracted OCR text and provided reference text."""
    reference_provided: bool = False
    similarity_ratio: Optional[float] = None     # 0.0-1.0
    added_words: List[str] = Field(default_factory=list)
    removed_words: List[str] = Field(default_factory=list)
    changed_lines: List[str] = Field(default_factory=list)
    tamper_score: float = 0.0                    # 0=identical, 1=completely different


class TamperingSignals(BaseModel):
    """Per-signal tamper indicators (all 0-1 probability scale)."""
    ela_score: Optional[float] = None            # Error Level Analysis
    noise_inconsistency: Optional[float] = None  # Cross-region noise variance
    layout_score: Optional[float] = None         # Font/block inconsistency
    metadata_score: float = 0.0                  # Missing/suspicious EXIF
    text_diff_score: float = 0.0                 # OCR vs reference
    ai_image_score: Optional[float] = None       # Re-use of existing DL model


class DocumentForensicsResult(BaseModel):
    """Top-level response from POST /api/document-forensics/analyze."""

    # ── Verdict ──────────────────────────────────────────────────────────────
    tamper_probability: float = Field(..., ge=0.0, le=1.0)
    verdict: str                                 # "Authentic" | "Suspicious" | "Likely Tampered"
    confidence: float = Field(..., ge=0.0, le=1.0)
    dominant_signals: List[str] = Field(default_factory=list)

    # ── Heatmap ──────────────────────────────────────────────────────────────
    heatmap_base64: Optional[str] = None         # PNG data-URI, browser-ready
    flagged_regions: List[RegionFlag] = Field(default_factory=list)

    # ── Sub-results ───────────────────────────────────────────────────────────
    metadata: Optional[MetadataResult] = None
    ocr: Optional[OCRResult] = None
    text_comparison: Optional[TextComparisonResult] = None
    signals: TamperingSignals

    # ── Debug / timing ───────────────────────────────────────────────────────
    processing_time_ms: float
    modules_run: List[str] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)
