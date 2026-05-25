"""
AI Inference Runner
===================
Wraps the existing AI detector + fusion pipeline into a helper that
accepts raw image bytes, runs detection, and returns a plain dict.

The existing inference code (get_detector, build_fusion_input, fuse) is
called exactly as inference/routes.py does it — nothing is modified there.
"""

from __future__ import annotations

import io
import logging
import tempfile
from pathlib import Path
from typing import Any, Dict

logger = logging.getLogger(__name__)

# Sentinel used when the forensic heuristic branch is skipped
# (mirrors the pattern in inference/routes.py with has_trained_weights=True)
_FORENSIC_SKIP: Dict[str, Any] = {
    "metadata_detected":        False,
    "camera_probability":       0.5,
    "ai_probability":           0.5,
    "screenshot_probability":   0.0,
    "prediction":               "DL-primary",
    "forensic_confidence_pct":  0.0,
}


def run_ai_detection(image_bytes: bytes, suffix: str = ".jpg") -> Dict[str, Any]:
    """
    Run the existing AI detector on raw image bytes.

    Parameters
    ----------
    image_bytes  JPEG/PNG bytes of a single image (or a PDF page rendered to JPEG).
    suffix       File extension hint for the temp file (default ".jpg").

    Returns
    -------
    dict with keys:
        ai_probability      float  0-100  (higher = more likely AI-generated)
        camera_probability  float  0-100
        dl_confidence       float  0-100
        fusion_confidence   float  0-100
        dominant_signals    list[str]
        signal_breakdown    dict
        weights_used        dict
        raw_dl              dict   (full detector output)
        error               str | None
    """
    try:
        from inference.ai_detector import get_detector          # noqa: PLC0415
        from inference.fusion import build_fusion_input, fuse   # noqa: PLC0415
    except ImportError as exc:
        logger.warning("[AIRunner] Inference module not available: %s", exc)
        return _error_result(f"Inference module not available: {exc}")

    # Write bytes to a temporary file so the detector can open it as a Path
    try:
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(image_bytes)
            tmp_path = Path(tmp.name)
    except OSError as exc:
        logger.warning("[AIRunner] Cannot create temp file: %s", exc)
        return _error_result(f"Temp file error: {exc}")

    try:
        detector   = get_detector()
        dl_result  = detector.analyze(tmp_path)
        fusion_in  = build_fusion_input(dl_result, _FORENSIC_SKIP)
        fusion_out = fuse(fusion_in)

        return {
            "ai_probability":     getattr(fusion_out, "ai_probability",    50.0),
            "camera_probability": getattr(fusion_out, "camera_probability", 50.0),
            "dl_confidence":      getattr(fusion_out, "dl_confidence",      0.0),
            "fusion_confidence":  getattr(fusion_out, "fusion_confidence",  0.0),
            "dominant_signals":   getattr(fusion_out, "dominant_signals",   []),
            "signal_breakdown":   getattr(fusion_out, "signal_breakdown",   {}),
            "weights_used":       getattr(fusion_out, "weights_used",       {}),
            "raw_dl":             dl_result if isinstance(dl_result, dict) else {},
            "error":              None,
        }

    except Exception as exc:
        logger.warning("[AIRunner] Detection failed: %s", exc)
        return _error_result(str(exc))

    finally:
        try:
            tmp_path.unlink(missing_ok=True)
        except Exception:
            pass


def _error_result(msg: str) -> Dict[str, Any]:
    return {
        "ai_probability":     50.0,
        "camera_probability": 50.0,
        "dl_confidence":      0.0,
        "fusion_confidence":  0.0,
        "dominant_signals":   [],
        "signal_breakdown":   {},
        "weights_used":       {},
        "raw_dl":             {},
        "error":              msg,
    }
