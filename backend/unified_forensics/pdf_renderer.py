"""
PDF → Image Renderer
====================
Converts PDF pages to JPEG bytes using pypdfium2 (already installed).
Each rendered page can then be fed into the AI image detection pipeline.

Graceful degradation: returns an empty list if pypdfium2 is unavailable or
the PDF cannot be decoded.
"""

from __future__ import annotations

import io
import logging
from typing import List

logger = logging.getLogger(__name__)

_MAX_PAGES_DEFAULT = 5     # analyse at most N pages to bound latency
_RENDER_DPI        = 150   # good quality vs speed trade-off for forensics
_JPEG_QUALITY      = 90


def render_pdf_to_images(
    pdf_bytes: bytes,
    max_pages: int = _MAX_PAGES_DEFAULT,
    dpi:       int = _RENDER_DPI,
) -> List[bytes]:
    """
    Render each page of a PDF to a JPEG-encoded bytes object.

    Parameters
    ----------
    pdf_bytes  Raw bytes of the PDF file.
    max_pages  Maximum number of pages to render (default 5).
    dpi        Rendering resolution (default 150 DPI).

    Returns
    -------
    List[bytes]  One entry per rendered page (JPEG bytes, RGB).
                 Empty list if rendering fails.
    """
    try:
        import pypdfium2 as pdfium   # type: ignore[import-untyped]
    except ImportError:
        logger.warning("[PDFRenderer] pypdfium2 not installed — PDF page rendering unavailable.")
        return []

    try:
        doc     = pdfium.PdfDocument(pdf_bytes)
        n_pages = min(len(doc), max(1, max_pages))
        scale   = dpi / 72.0          # pypdfium2 uses 72-DPI as the baseline

        rendered: List[bytes] = []
        for idx in range(n_pages):
            try:
                page    = doc[idx]
                bitmap  = page.render(scale=scale)
                pil_img = bitmap.to_pil()

                buf = io.BytesIO()
                pil_img.convert("RGB").save(buf, format="JPEG", quality=_JPEG_QUALITY)
                rendered.append(buf.getvalue())

                logger.info("[PDFRenderer] Page %d/%d rendered (%d KB)", idx + 1, n_pages,
                            len(rendered[-1]) // 1024)
            except Exception as page_err:
                logger.warning("[PDFRenderer] Failed to render page %d: %s", idx + 1, page_err)

        return rendered

    except Exception as exc:
        logger.warning("[PDFRenderer] PDF decode failed: %s", exc)
        return []
