"""
Image Preprocessing Pipeline
Prepares images for dual-branch inference:
  branch-1: normalized original
  branch-2: amplified high-frequency residual (denoise subtraction)
"""

import logging
from io import BytesIO
from pathlib import Path
from typing import Tuple, Union

import cv2
import numpy as np
from PIL import Image

logger = logging.getLogger(__name__)

# ImageNet normalization constants
_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
_STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)

TARGET_SIZE = (224, 224)

# Residual amplification: higher = more sensitive to subtle high-freq artifacts
RESIDUAL_AMPLIFY = 6.0
# Gaussian kernel for low-frequency baseline
BLUR_KERNEL = (5, 5)
BLUR_SIGMA = 1.2


# ---------------------------------------------------------------------------
# Core helpers
# ---------------------------------------------------------------------------

def _load_pil(source: Union[Path, bytes, str]) -> Image.Image:
    """Load a PIL Image from file path or raw bytes."""
    if isinstance(source, (str, Path)):
        img = Image.open(str(source))
    elif isinstance(source, bytes):
        img = Image.open(BytesIO(source))
    else:
        raise TypeError(f"Unsupported source type: {type(source)}")

    if img.mode != "RGB":
        img = img.convert("RGB")
    return img


def _pil_to_tensor(pil_img: Image.Image) -> "np.ndarray":
    """Convert PIL Image → (1, 3, H, W) float32 numpy array, ImageNet-normalized."""
    arr = np.array(pil_img.resize(TARGET_SIZE, Image.LANCZOS), dtype=np.float32)
    arr = arr / 255.0
    arr = (arr - _MEAN) / _STD
    # HWC → CHW → BCHW
    tensor = arr.transpose(2, 0, 1)[np.newaxis]  # (1, 3, 224, 224)
    return np.ascontiguousarray(tensor)


def _extract_residual(pil_img: Image.Image) -> Image.Image:
    """
    High-frequency residual extraction via denoise subtraction.

    Algorithm:
      1. Resize to TARGET_SIZE in float32
      2. Apply Gaussian blur → low-frequency approximation
      3. residual = original - smooth  (captures sensor noise, DL artifacts, etc.)
      4. Amplify by RESIDUAL_AMPLIFY
      5. Shift to [0, 255] range (center at 128)
      6. Return as uint8 RGB PIL image

    Why: Diffusion models / GANs introduce characteristic high-frequency
    patterns that are subtle in the spatial domain but visible in the residual.
    Real camera images have PRNU-consistent residuals; AI images do not.
    """
    arr = np.array(pil_img.resize(TARGET_SIZE, Image.LANCZOS), dtype=np.float32)

    # Per-channel Gaussian blur (low-frequency baseline)
    blurred = np.stack(
        [cv2.GaussianBlur(arr[:, :, c], BLUR_KERNEL, BLUR_SIGMA) for c in range(3)],
        axis=2,
    )

    residual = arr - blurred
    residual = residual * RESIDUAL_AMPLIFY
    residual = np.clip(residual + 128.0, 0.0, 255.0).astype(np.uint8)

    return Image.fromarray(residual, mode="RGB")


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def preprocess_image(
    source: Union[Path, bytes, str]
) -> Tuple[np.ndarray, np.ndarray, Image.Image, np.ndarray]:
    """
    Full preprocessing pipeline for three-branch inference.

    Returns:
        original_tensor   : (1, 3, 224, 224) float32, ImageNet-normalized RGB
        residual_tensor   : (1, 3, 224, 224) float32, ImageNet-normalized HF residual
        pil_image         : original PIL Image (for forensic feature extraction)
        fft_tensor        : (1, 3, 224, 224) float32, ImageNet-normalized log-FFT spectrum
    """
    pil_img = _load_pil(source)
    original_tensor = _pil_to_tensor(pil_img)

    residual_pil = _extract_residual(pil_img)
    residual_tensor = _pil_to_tensor(residual_pil)

    fft_pil    = extract_fft_branch(pil_img)
    fft_tensor = _pil_to_tensor(fft_pil)

    return original_tensor, residual_tensor, pil_img, fft_tensor


def to_torch_tensor(np_tensor: np.ndarray):
    """Convert numpy (1, 3, H, W) to a PyTorch float tensor."""
    import torch
    return torch.from_numpy(np_tensor).float()


def extract_fft_branch(pil_img: Image.Image) -> Image.Image:
    """
    FFT log-magnitude spectrum as a third forensic branch.

    Motivation: AI images from diffusion / GAN sources lack the natural 1/f²
    power-spectral falloff of real photographs.  Converting the grayscale image
    to its log-magnitude Fourier spectrum and passing it through the same CNN
    backbone exposes low-high frequency energy patterns that are invisible in
    the spatial domain.

    Returns a 3-channel (duplicated grayscale) uint8 PIL image sized to
    TARGET_SIZE so it can be normalised with _pil_to_tensor unchanged.
    """
    arr = np.array(pil_img.resize(TARGET_SIZE, Image.LANCZOS).convert("L"), dtype=np.float32)

    # 2-D FFT → shift DC to centre → log-compress
    spectrum = np.fft.fftshift(np.fft.fft2(arr))
    log_mag  = np.log1p(np.abs(spectrum))

    # Normalise to [0, 255]
    lo, hi = log_mag.min(), log_mag.max()
    norm = (log_mag - lo) / (hi - lo + 1e-8) * 255.0
    fft_u8 = np.clip(norm, 0, 255).astype(np.uint8)

    # Duplicate to 3 channels (EfficientNet expects RGB)
    fft_rgb = np.stack([fft_u8, fft_u8, fft_u8], axis=2)
    return Image.fromarray(fft_rgb, mode="RGB")


def compute_fft_stats(pil_img: Image.Image) -> dict:
    """
    Compute frequency-domain statistics used as the heuristic FFT branch
    when no trained model checkpoint is available.

    Returns:
      hf_ratio       – high-freq / total energy (low for AI images)
      spectral_entropy – Shannon entropy of normalised power (low for AI)
      radial_falloff  – exponent of 1/f power law fit (flat for AI)
    """
    arr = np.array(pil_img.resize((256, 256), Image.LANCZOS).convert("L"), dtype=np.float32)
    spectrum = np.fft.fftshift(np.fft.fft2(arr))
    power    = np.abs(spectrum) ** 2

    h, w   = power.shape
    cy, cx = h // 2, w // 2

    # Build radial distance map
    ys, xs    = np.ogrid[:h, :w]
    r_map     = np.sqrt((ys - cy) ** 2 + (xs - cx) ** 2)
    r_max     = min(cy, cx)

    total_power = power.sum() + 1e-12

    # High-frequency ratio: energy beyond 40% of Nyquist radius
    hf_mask  = r_map > 0.40 * r_max
    hf_ratio = float(power[hf_mask].sum() / total_power)

    # Spectral entropy
    p_norm    = power / total_power
    p_norm    = p_norm[p_norm > 0]
    s_entropy = float(-np.sum(p_norm * np.log2(p_norm + 1e-30)))

    # 1/f slope via log-log regression on radial profile
    radial_bins = np.arange(1, r_max, 2, dtype=float)
    ring_power  = np.array([
        power[(r_map >= r - 1) & (r_map < r + 1)].mean()
        for r in radial_bins
    ], dtype=float)
    valid = ring_power > 0
    if valid.sum() > 5:
        log_r = np.log(radial_bins[valid])
        log_p = np.log(ring_power[valid])
        coeffs = np.polyfit(log_r, log_p, 1)
        radial_falloff = float(coeffs[0])   # typically ~−2 for natural photos
    else:
        radial_falloff = -2.0

    return {
        "hf_ratio":        hf_ratio,
        "spectral_entropy": s_entropy,
        "radial_falloff":  radial_falloff,
    }


def compute_residual_stats(original_tensor: np.ndarray, residual_tensor: np.ndarray) -> dict:
    """
    Compute statistical properties of the residual that aid fusion scoring.

    Returns a dict with:
      - residual_mean_abs  : average absolute deviation (low for AI images)
      - residual_std       : spread of high-freq energy
      - residual_kurtosis  : leptokurtic (camera) vs platykurtic (GAN) residuals
      - channel_correlation: inter-channel correlation in residual
    """
    # Undo ImageNet normalization for meaningful stats
    orig = (original_tensor[0].transpose(1, 2, 0) * _STD + _MEAN) * 255.0
    resid = (residual_tensor[0].transpose(1, 2, 0) * _STD + _MEAN) - 128.0

    mean_abs = float(np.mean(np.abs(resid)))
    std = float(np.std(resid))

    flat = resid.reshape(-1)
    mu4 = np.mean((flat - flat.mean()) ** 4)
    kurtosis = float(mu4 / (flat.std() ** 4 + 1e-8))

    # Per-channel correlation in residual
    r_ch = resid.reshape(TARGET_SIZE[0] * TARGET_SIZE[1], 3)
    corr_matrix = np.corrcoef(r_ch.T)
    avg_corr = float((corr_matrix[0, 1] + corr_matrix[0, 2] + corr_matrix[1, 2]) / 3.0)

    return {
        "residual_mean_abs": mean_abs,
        "residual_std": std,
        "residual_kurtosis": kurtosis,
        "channel_correlation": avg_corr,
    }
