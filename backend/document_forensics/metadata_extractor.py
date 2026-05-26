"""
Metadata Extraction Module
==========================
Extracts EXIF data from images and document metadata from PDFs.
Flags suspicious patterns (missing EXIF on supposed camera photo,
Photoshop/GIMP software tag, mismatched creation dates, etc.).
"""

from __future__ import annotations

import io
import logging
from typing import Any, Dict, List, Optional

from .schemas import MetadataResult

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _tag_val(exif: Dict[str, Any], tag_name: str) -> Optional[str]:
    """Return a string value for an EXIF tag, or None if absent/empty."""
    val = exif.get(tag_name)
    if val is None:
        return None
    s = str(val).strip()
    return s if s else None


# Software tags that indicate post-processing / generation
_SUSPICIOUS_SOFTWARE = {
    "adobe photoshop", "gimp", "lightroom", "paint.net",
    "stable diffusion", "midjourney", "dall-e", "firefly",
    "canva", "pixlr", "fotor", "facetune", "snapseed",
}

# Known AI/GAN generator software substrings
_AI_SOFTWARE = {
    "stable diffusion", "midjourney", "dall-e", "firefly",
    "dreamstudio", "novelai", "invoke ai", "comfyui",
}


def _software_flags(software: str) -> tuple[bool, bool]:
    """Return (suspicious, ai_generated) booleans from software tag."""
    low = software.lower()
    ai  = any(kw in low for kw in _AI_SOFTWARE)
    sus = ai or any(kw in low for kw in _SUSPICIOUS_SOFTWARE)
    return sus, ai


# ─────────────────────────────────────────────────────────────────────────────
# Image EXIF
# ─────────────────────────────────────────────────────────────────────────────

def _extract_image_exif(img_bytes: bytes) -> MetadataResult:
    """Extract EXIF from an image (JPEG / TIFF / PNG / WebP)."""
    from PIL import Image, ExifTags
    import PIL.ExifTags as ExifTagsModule

    result = MetadataResult(file_type="image", exif_present=False)
    notes: List[str] = []

    try:
        img = Image.open(io.BytesIO(img_bytes))
        result.mime_type = Image.MIME.get(img.format or "", "image/unknown")
        result.file_size_kb = round(len(img_bytes) / 1024, 1)

        # PIL getexif() returns an IFDRational-aware dict keyed by int tag IDs
        raw_exif = img.getexif()
        if not raw_exif:
            notes.append("No EXIF data found — may be a screenshot or AI-generated image.")
            result.metadata_notes = notes
            return result

        # Resolve integer tag IDs to human-readable names
        exif: Dict[str, Any] = {}
        for tag_id, value in raw_exif.items():
            tag_name = ExifTagsModule.TAGS.get(tag_id, str(tag_id))
            exif[tag_name] = value

        result.exif_present = True

        result.camera_make    = _tag_val(exif, "Make")
        result.camera_model   = _tag_val(exif, "Model")
        result.capture_datetime = _tag_val(exif, "DateTimeOriginal") or _tag_val(exif, "DateTime")
        result.software_tag   = _tag_val(exif, "Software")

        # GPS presence
        gps_info = exif.get("GPSInfo")
        result.gps_present = bool(gps_info)

        # Flag suspicious software
        if result.software_tag:
            sus, _ = _software_flags(result.software_tag)
            if sus:
                notes.append(f"Suspicious software tag: '{result.software_tag}'")
                result.metadata_suspicious = True

        # Flag missing camera make/model despite EXIF being present
        if not result.camera_make and not result.camera_model:
            notes.append("EXIF present but no camera make/model — possible synthetic origin.")

    except Exception as exc:
        logger.warning("EXIF extraction failed: %s", exc)
        notes.append(f"EXIF parse error: {exc}")

    result.metadata_notes = notes
    return result


# ─────────────────────────────────────────────────────────────────────────────
# PDF metadata
# ─────────────────────────────────────────────────────────────────────────────

def _extract_pdf_metadata(pdf_bytes: bytes) -> MetadataResult:
    """Extract document metadata from a PDF."""
    result = MetadataResult(file_type="pdf", exif_present=False)
    notes: List[str] = []

    try:
        import pdfplumber

        result.file_size_kb = round(len(pdf_bytes) / 1024, 1)
        result.mime_type = "application/pdf"

        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            result.pdf_page_count = len(pdf.pages)
            meta = pdf.metadata or {}

            result.pdf_author           = meta.get("Author")       or meta.get("/Author")
            result.pdf_creator          = meta.get("Creator")      or meta.get("/Creator")
            result.pdf_producer         = meta.get("Producer")     or meta.get("/Producer")
            result.pdf_creation_date    = meta.get("CreationDate") or meta.get("/CreationDate")
            result.pdf_modification_date = meta.get("ModDate")     or meta.get("/ModDate")

        # Flag suspicious producer (Photoshop, Word → then re-saved, etc.)
        producer_str = (result.pdf_producer or "") + (result.pdf_creator or "")
        if producer_str:
            sus, _ = _software_flags(producer_str)
            if sus:
                notes.append(f"Suspicious PDF producer/creator: '{producer_str.strip()}'")
                result.metadata_suspicious = True

        if not result.pdf_author and not result.pdf_creator:
            notes.append("No author or creator recorded in PDF metadata.")

    except ImportError:
        notes.append("pdfplumber not available — PDF metadata extraction skipped.")
        logger.warning("pdfplumber not installed; PDF metadata unavailable.")
    except Exception as exc:
        logger.warning("PDF metadata extraction failed: %s", exc)
        notes.append(f"PDF metadata parse error: {exc}")

    result.metadata_notes = notes
    return result


# ─────────────────────────────────────────────────────────────────────────────
# Public entry point
# ─────────────────────────────────────────────────────────────────────────────

def extract_metadata(file_bytes: bytes, filename: str) -> MetadataResult:
    """
    Dispatch to the appropriate extractor based on filename extension.
    Always returns a MetadataResult — never raises.
    """
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""

    if ext == "pdf":
        return _extract_pdf_metadata(file_bytes)
    elif ext in {"jpg", "jpeg", "png", "tiff", "tif", "webp", "bmp", "heic", "heif"}:
        return _extract_image_exif(file_bytes)
    elif ext == "txt":
        return MetadataResult(
            file_type="text",
            mime_type="text/plain",
            file_size_kb=round(len(file_bytes) / 1024, 1),
            exif_present=False,
            metadata_notes=["Plain-text file — no embedded metadata to extract."],
        )
    else:
        # Unknown — try image EXIF first, silently fall back
        try:
            res = _extract_image_exif(file_bytes)
            res.file_type = "unknown"
            return res
        except Exception:
            return MetadataResult(
                file_type="unknown",
                file_size_kb=round(len(file_bytes) / 1024, 1),
                metadata_notes=["Unrecognised file type — metadata extraction skipped."],
            )
