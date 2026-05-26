"""
Tampering Localizer
===================
Generates a visual tamper-heatmap by combining:

  1. Error Level Analysis (ELA)
     Re-compress the image at a known JPEG quality; genuine camera photos show
     uniform ELA residuals, while spliced/edited regions show elevated errors.

  2. Noise Residual Map
     High-frequency Wiener-denoising residual amplified × 8.  Inconsistent
     noise patterns across regions indicate compositing or re-sampling.

  3. Block-level Laplacian variance map
     Detects sharpness inconsistency between image blocks — a tell-tale sign
     of copy-paste operations or content-aware fill.

The three maps are fused into a single heatmap overlay (JET colormap) which
is returned as a base64-encoded PNG data URI.

Dependencies: cv2, numpy, PIL (all guaranteed available per requirements).
"""

from __future__ import annotations

import base64
import io
import logging
from typing import List, Optional, Tuple

import cv2
import numpy as np
from PIL import Image

from .schemas import RegionFlag

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# Constants
# ─────────────────────────────────────────────────────────────────────────────

_ELA_QUALITY    = 75     # JPEG quality used for ELA re-compression
_ELA_AMPLIFY    = 10     # Amplification factor for ELA difference map
_NOISE_AMPLIFY  = 8      # Amplification factor for noise residual
_BLOCK_SIZE     = 64     # Block size (px) for Laplacian variance map
_HEATMAP_ALPHA  = 0.55   # Overlay opacity for the heatmap blend
_MAX_SIDE       = 1024   # Resize large images before analysis (speeds things up)

# Score weights for the fused tamper estimate
_W_ELA    = 0.45
_W_NOISE  = 0.30
_W_LAP    = 0.25

# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _resize_if_large(img: np.ndarray) -> np.ndarray:
    """Downscale so max side ≤ _MAX_SIDE (maintains aspect ratio)."""
    h, w = img.shape[:2]
    if max(h, w) <= _MAX_SIDE:
        return img
    scale = _MAX_SIDE / max(h, w)
    return cv2.resize(img, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)


def _to_rgb(img_bytes: bytes) -> np.ndarray:
    """Load image bytes to a uint8 RGB ndarray (raises on failure)."""
    arr = np.frombuffer(img_bytes, dtype=np.uint8)
    bgr = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if bgr is None:
        raise ValueError("cv2 could not decode image")
    return cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)


def _to_jpeg_bytes(img_rgb: np.ndarray, quality: int) -> bytes:
    """Encode RGB ndarray as JPEG bytes at the given quality."""
    bgr = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2BGR)
    ok, buf = cv2.imencode(".jpg", bgr, [cv2.IMWRITE_JPEG_QUALITY, quality])
    if not ok:
        raise RuntimeError("JPEG encode failed")
    return bytes(buf)


def _normalise(arr: np.ndarray) -> np.ndarray:
    """Normalise a float32 array to [0, 1]."""
    mn, mx = arr.min(), arr.max()
    if mx - mn < 1e-9:
        return np.zeros_like(arr, dtype=np.float32)
    return ((arr - mn) / (mx - mn)).astype(np.float32)


# ─────────────────────────────────────────────────────────────────────────────
# Signal maps
# ─────────────────────────────────────────────────────────────────────────────

def _ela_map(img_rgb: np.ndarray) -> np.ndarray:
    """
    Return a float32 ELA map normalised to [0, 1].
    High values = regions that changed significantly under JPEG re-compression.
    """
    original_bytes   = _to_jpeg_bytes(img_rgb, quality=95)
    recompressed_bytes = _to_jpeg_bytes(img_rgb, quality=_ELA_QUALITY)

    orig = np.frombuffer(original_bytes,    dtype=np.uint8)
    comp = np.frombuffer(recompressed_bytes, dtype=np.uint8)

    orig_img = cv2.imdecode(orig, cv2.IMREAD_COLOR).astype(np.float32)
    comp_img = cv2.imdecode(comp, cv2.IMREAD_COLOR).astype(np.float32)

    if orig_img.shape != comp_img.shape:
        comp_img = cv2.resize(comp_img, (orig_img.shape[1], orig_img.shape[0]))

    ela_raw  = np.abs(orig_img - comp_img) * _ELA_AMPLIFY
    ela_gray = ela_raw.mean(axis=2).astype(np.float32)
    return _normalise(ela_gray)


def _noise_residual_map(img_rgb: np.ndarray) -> np.ndarray:
    """
    Return a float32 noise-residual map normalised to [0, 1].
    Uses a Gaussian blur subtraction — inconsistent noise = compositing.
    """
    gray     = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2GRAY).astype(np.float32)
    blurred  = cv2.GaussianBlur(gray, (3, 3), 0)
    residual = np.abs(gray - blurred) * _NOISE_AMPLIFY
    return _normalise(residual)


def _laplacian_variance_map(img_rgb: np.ndarray, block_size: int = _BLOCK_SIZE) -> np.ndarray:
    """
    Return a float32 block-level Laplacian variance map normalised to [0, 1].
    Blocks with very different sharpness from neighbours are suspicious.
    """
    gray = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2GRAY).astype(np.float32)
    lap  = cv2.Laplacian(gray, cv2.CV_32F)
    h, w = lap.shape
    var_map = np.zeros((h, w), dtype=np.float32)

    for y in range(0, h, block_size):
        for x in range(0, w, block_size):
            block = lap[y : y + block_size, x : x + block_size]
            var   = float(block.var())
            var_map[y : y + block_size, x : x + block_size] = var

    # Normalise globally
    norm = _normalise(var_map)

    # Invert: *low* variance blocks surrounded by high-variance blocks are
    # suspicious (pasted flat regions).  High difference from mean → high score.
    mean_v = norm.mean()
    deviation = np.abs(norm - mean_v)
    return _normalise(deviation)


# ─────────────────────────────────────────────────────────────────────────────
# Region detection
# ─────────────────────────────────────────────────────────────────────────────

def _find_flagged_regions(fused: np.ndarray, threshold: float = 0.65) -> List[RegionFlag]:
    """
    Detect connected components in high-activation areas of the fused map.
    Returns up to 10 bounding-box RegionFlags.
    """
    mask = (fused >= threshold).astype(np.uint8) * 255
    # Dilate slightly to merge nearby blobs
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (15, 15))
    mask   = cv2.dilate(mask, kernel, iterations=1)

    num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)

    regions: List[RegionFlag] = []
    for lbl in range(1, num_labels):             # skip background (0)
        x, y, bw, bh, area = stats[lbl, :5]
        if area < 400:                           # ignore tiny noise blobs
            continue
        # Mean activation inside this component
        comp_mask  = (labels == lbl).astype(np.float32)
        severity   = float((fused * comp_mask).sum() / comp_mask.sum())
        regions.append(RegionFlag(
            x=int(x), y=int(y),
            width=int(bw), height=int(bh),
            reason="Elevated ELA / noise inconsistency",
            severity=round(min(severity, 1.0), 3),
        ))

    # Sort by severity descending, return top 10
    regions.sort(key=lambda r: r.severity, reverse=True)
    return regions[:10]


# ─────────────────────────────────────────────────────────────────────────────
# Heatmap rendering
# ─────────────────────────────────────────────────────────────────────────────

def _render_heatmap(img_rgb: np.ndarray, fused: np.ndarray) -> str:
    """
    Blend a JET-colourmap heatmap over the original image.
    Returns a base64-encoded PNG data URI.
    """
    h, w = img_rgb.shape[:2]

    # Upscale fused map to original image size if they differ
    if fused.shape != (h, w):
        fused = cv2.resize(fused, (w, h), interpolation=cv2.INTER_LINEAR)

    # Convert fused [0,1] → uint8 → JET colormap (BGR)
    fused_u8  = (fused * 255).clip(0, 255).astype(np.uint8)
    heat_bgr  = cv2.applyColorMap(fused_u8, cv2.COLORMAP_JET)
    heat_rgb  = cv2.cvtColor(heat_bgr, cv2.COLOR_BGR2RGB)

    # Blend
    original_f = img_rgb.astype(np.float32)
    heat_f     = heat_rgb.astype(np.float32)
    blended    = (original_f * (1 - _HEATMAP_ALPHA) + heat_f * _HEATMAP_ALPHA).clip(0, 255).astype(np.uint8)

    # Encode to PNG → base64 data URI
    pil_img = Image.fromarray(blended)
    buf     = io.BytesIO()
    pil_img.save(buf, format="PNG", optimize=True)
    b64 = base64.b64encode(buf.getvalue()).decode("ascii")
    return f"data:image/png;base64,{b64}"


# ─────────────────────────────────────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────────────────────────────────────

class TamperingLocalizerResult:
    """Return value from `run_tampering_analysis`."""
    def __init__(
        self,
        ela_score: float,
        noise_score: float,
        lap_score: float,
        tamper_probability: float,
        heatmap_base64: Optional[str],
        flagged_regions: List[RegionFlag],
    ):
        self.ela_score          = ela_score
        self.noise_score        = noise_score
        self.lap_score          = lap_score
        self.tamper_probability = tamper_probability
        self.heatmap_base64     = heatmap_base64
        self.flagged_regions    = flagged_regions


def run_tampering_analysis(img_bytes: bytes) -> TamperingLocalizerResult:
    """
    Full tampering localisation for an image.
    Gracefully returns a zero-score result if cv2 fails to decode the image.
    """
    try:
        img_rgb = _to_rgb(img_bytes)
        img_rgb = _resize_if_large(img_rgb)

        ela_map   = _ela_map(img_rgb)
        noise_map = _noise_residual_map(img_rgb)
        lap_map   = _laplacian_variance_map(img_rgb)

        # Fuse maps
        fused = (
            ela_map   * _W_ELA   +
            noise_map * _W_NOISE +
            lap_map   * _W_LAP
        ).astype(np.float32)
        fused = _normalise(fused)

        # Scalar scores — mean activation of the 90th-percentile pixels
        def _p90_mean(m: np.ndarray) -> float:
            p90 = float(np.percentile(m, 90))
            hi  = m[m >= p90]
            return float(hi.mean()) if len(hi) else 0.0

        ela_score   = round(_p90_mean(ela_map),   4)
        noise_score = round(_p90_mean(noise_map), 4)
        lap_score   = round(_p90_mean(lap_map),   4)
        fused_score = round(_p90_mean(fused),     4)

        heatmap = _render_heatmap(img_rgb, fused)
        regions = _find_flagged_regions(fused)

        return TamperingLocalizerResult(
            ela_score          = ela_score,
            noise_score        = noise_score,
            lap_score          = lap_score,
            tamper_probability = fused_score,
            heatmap_base64     = heatmap,
            flagged_regions    = regions,
        )

    except Exception as exc:
        logger.warning("Tampering localiser failed: %s", exc)
        return TamperingLocalizerResult(
            ela_score=0.0, noise_score=0.0, lap_score=0.0,
            tamper_probability=0.0, heatmap_base64=None, flagged_regions=[],
        )
