"""
Layout & Font Inconsistency Analyzer
=====================================
Detects visual layout anomalies that suggest document manipulation:

  • Block-level noise variance inconsistency
    (spliced regions often have different sensor noise characteristics)

  • Blur inconsistency across text regions
    (copy-pasted text blocks may be sharper/blurrier than surrounding content)

  • Lighting gradient analysis
    (uneven illumination discontinuities across the page)

Returns a single layout_score ∈ [0, 1] and a list of textual findings.
"""

from __future__ import annotations

import logging
from typing import List, Tuple

import cv2
import numpy as np

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# Constants
# ─────────────────────────────────────────────────────────────────────────────

_BLOCK_SIZE = 80      # Analysis block size (pixels)
_MIN_BLOCKS = 4       # Minimum blocks needed for meaningful variance

# How many standard deviations above the mean constitutes a "suspicious" block
_NOISE_SIGMA_THRESHOLD = 2.5
_BLUR_SIGMA_THRESHOLD  = 2.0


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _load_gray(img_bytes: bytes) -> np.ndarray:
    arr = np.frombuffer(img_bytes, dtype=np.uint8)
    bgr = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if bgr is None:
        raise ValueError("cv2 could not decode image for layout analysis")
    return cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY).astype(np.float32)


def _block_metrics(gray: np.ndarray, block_size: int) -> Tuple[np.ndarray, np.ndarray]:
    """
    Compute per-block (noise_std, laplacian_var) across the image.
    Returns two 1-D arrays of floats.
    """
    h, w = gray.shape
    noise_vals: List[float] = []
    blur_vals:  List[float] = []

    # Noise estimate via median absolute deviation of high-frequency residual
    blurred = cv2.GaussianBlur(gray, (3, 3), 0)
    residual = gray - blurred

    lap = cv2.Laplacian(gray, cv2.CV_32F)

    for y in range(0, h - block_size + 1, block_size):
        for x in range(0, w - block_size + 1, block_size):
            r_block = residual[y : y + block_size, x : x + block_size]
            l_block = lap[y : y + block_size, x : x + block_size]

            noise_vals.append(float(np.std(r_block)))
            blur_vals.append(float(np.var(l_block)))

    return np.array(noise_vals, dtype=np.float32), np.array(blur_vals, dtype=np.float32)


def _outlier_fraction(vals: np.ndarray, sigma: float) -> float:
    """Return fraction of values that are > mean + sigma * std."""
    if len(vals) < _MIN_BLOCKS:
        return 0.0
    mu  = vals.mean()
    std = vals.std()
    if std < 1e-6:
        return 0.0
    outliers = (vals > mu + sigma * std).sum()
    return float(outliers) / len(vals)


def _lighting_inconsistency(gray: np.ndarray) -> float:
    """
    Score ∈ [0, 1] measuring horizontal and vertical illumination discontinuities.
    Compute mean luminance per row and column, then measure variance of second
    derivative (acceleration of luminance change).
    """
    row_means = gray.mean(axis=1)   # shape (H,)
    col_means = gray.mean(axis=0)   # shape (W,)

    def _accel_std(v: np.ndarray) -> float:
        if len(v) < 3:
            return 0.0
        d2 = np.diff(v, n=2)
        return float(d2.std())

    row_std = _accel_std(row_means)
    col_std = _accel_std(col_means)

    # Normalise empirically: typical clean doc is ~0-5, heavy edit is 20+
    score = min((row_std + col_std) / 40.0, 1.0)
    return round(float(score), 4)


# ─────────────────────────────────────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────────────────────────────────────

class LayoutAnalysisResult:
    def __init__(self, layout_score: float, findings: List[str]):
        self.layout_score = layout_score
        self.findings     = findings


def analyze_layout(img_bytes: bytes) -> LayoutAnalysisResult:
    """
    Analyse image layout for tamper signals.
    Returns LayoutAnalysisResult with a [0, 1] score and human-readable findings.
    Never raises — returns a 0-score result on any error.
    """
    findings: List[str] = []
    try:
        gray = _load_gray(img_bytes)

        noise_vals, blur_vals = _block_metrics(gray, _BLOCK_SIZE)

        noise_outlier_frac = _outlier_fraction(noise_vals, _NOISE_SIGMA_THRESHOLD)
        blur_outlier_frac  = _outlier_fraction(blur_vals,  _BLUR_SIGMA_THRESHOLD)
        lighting_score     = _lighting_inconsistency(gray)

        if noise_outlier_frac > 0.10:
            findings.append(
                f"{noise_outlier_frac * 100:.0f}% of image blocks show abnormal noise levels "
                f"(possible compositing or copy-paste)."
            )

        if blur_outlier_frac > 0.12:
            findings.append(
                f"{blur_outlier_frac * 100:.0f}% of blocks have inconsistent sharpness "
                f"(possible content-aware fill or region replacement)."
            )

        if lighting_score > 0.35:
            findings.append(
                f"Uneven luminance gradient detected (score={lighting_score:.2f}) — "
                "may indicate patch blending or dodging."
            )

        # Fuse into single score
        layout_score = round(
            noise_outlier_frac * 0.40 +
            blur_outlier_frac  * 0.35 +
            lighting_score     * 0.25,
            4,
        )

        return LayoutAnalysisResult(layout_score=min(layout_score, 1.0), findings=findings)

    except Exception as exc:
        logger.warning("Layout analysis failed: %s", exc)
        return LayoutAnalysisResult(layout_score=0.0, findings=[f"Layout analysis error: {exc}"])
