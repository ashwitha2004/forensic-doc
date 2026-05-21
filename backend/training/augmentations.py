"""
Forensic-Safe Image Augmentations
──────────────────────────────────────────────────────────────────────────────
Design philosophy:
  Real camera images carry forensic signatures in:
    - PRNU (photo response non-uniformity) noise
    - JPEG DCT block structure and quantization artifacts
    - Chromatic aberration, lens distortion
    - Natural colour response curves

  AI-generated images carry forensic signatures in:
    - GAN/diffusion high-frequency spectral patterns
    - Oversmoothed textures (low spatial-frequency concentration)
    - Absent or synthetic noise profiles
    - Characteristic frequency comb patterns in FFT

  FORBIDDEN augmentations (destroy forensic evidence):
    ✗ Strong Gaussian blur              (erases both real noise and AI patterns)
    ✗ Strong elastic / grid distortion  (disrupts DCT block alignment)
    ✗ MixUp / CutMix                   (mixes incompatible forensic signatures)
    ✗ Strong rotation (> 15°)           (disrupts GAN grid artifacts)
    ✗ Colour space shuffle              (breaks PRNU channel structure)

  ALLOWED augmentations (label-preserving):
    ✓ Horizontal flip            (mirror doesn't change forensic content)
    ✓ Small crop + resize        (keeps scene, preserves texture statistics)
    ✓ Mild brightness/contrast   (simulates exposure variation)
    ✓ JPEG re-compression        (real-world processing; applied conservatively)
    ✓ Mild Gaussian noise        (only for real images; ~σ=2)
    ✓ Subtle colour jitter       (within ±10% of each channel)
──────────────────────────────────────────────────────────────────────────────
"""

import io
import logging
import random
from typing import Callable

import numpy as np
from PIL import Image, ImageEnhance

logger = logging.getLogger(__name__)

REAL_IDX = 0
AI_IDX   = 1


# ─────────────────────────────────────────────────────────────────────────────
# Primitive transforms
# ─────────────────────────────────────────────────────────────────────────────

def random_hflip(img: Image.Image, p: float = 0.5) -> Image.Image:
    return img.transpose(Image.FLIP_LEFT_RIGHT) if random.random() < p else img


def random_crop_resize(
    img: Image.Image,
    min_scale: float = 0.88,
    max_scale: float = 1.0,
    target_size: int = 256,
) -> Image.Image:
    """Random crop then resize to target_size."""
    w, h   = img.size
    scale  = random.uniform(min_scale, max_scale)
    crop_w = int(w * scale)
    crop_h = int(h * scale)
    x0 = random.randint(0, max(0, w - crop_w))
    y0 = random.randint(0, max(0, h - crop_h))
    return img.crop((x0, y0, x0 + crop_w, y0 + crop_h)).resize(
        (target_size, target_size), Image.LANCZOS
    )


def mild_brightness(img: Image.Image, factor_range: tuple = (0.85, 1.15)) -> Image.Image:
    f = random.uniform(*factor_range)
    return ImageEnhance.Brightness(img).enhance(f)


def mild_contrast(img: Image.Image, factor_range: tuple = (0.88, 1.12)) -> Image.Image:
    f = random.uniform(*factor_range)
    return ImageEnhance.Contrast(img).enhance(f)


def mild_colour_jitter(img: Image.Image, strength: float = 0.08) -> Image.Image:
    """Subtle colour jitter — keeps channel ratios close to original."""
    arr = np.array(img, dtype=np.float32)
    for c in range(3):
        delta = random.uniform(-strength * 255, strength * 255)
        arr[:, :, c] = np.clip(arr[:, :, c] + delta, 0, 255)
    return Image.fromarray(arr.astype(np.uint8))


def jpeg_recompress(img: Image.Image, quality_range: tuple = (82, 97)) -> Image.Image:
    """
    Re-encode as JPEG in memory at random quality.
    Simulates downstream processing without destroying AI artifacts
    (quality >= 82 is mild enough to preserve high-freq signatures).
    """
    buf = io.BytesIO()
    q   = random.randint(*quality_range)
    img.save(buf, format="JPEG", quality=q)
    buf.seek(0)
    return Image.open(buf).convert("RGB")


def mild_gaussian_noise(img: Image.Image, sigma: float = 2.5) -> Image.Image:
    """Add pixel-level Gaussian noise (σ ≈ camera read noise). REAL branch only."""
    arr   = np.array(img, dtype=np.float32)
    noise = np.random.normal(0, sigma, arr.shape).astype(np.float32)
    return Image.fromarray(np.clip(arr + noise, 0, 255).astype(np.uint8))


# ─────────────────────────────────────────────────────────────────────────────
# Per-class augmentation pipelines
# ─────────────────────────────────────────────────────────────────────────────

def _augment_real(img: Image.Image) -> Image.Image:
    """
    Augmentation for REAL camera images.
    Adds mild JPEG noise and brightness variation — simulates real-world
    image acquisition and sharing.
    """
    img = random_hflip(img, p=0.5)
    img = random_crop_resize(img, min_scale=0.90, max_scale=1.0)

    if random.random() < 0.5:
        img = mild_brightness(img)
    if random.random() < 0.4:
        img = mild_contrast(img)
    if random.random() < 0.35:
        img = mild_colour_jitter(img, strength=0.07)
    if random.random() < 0.4:
        img = jpeg_recompress(img, quality_range=(85, 97))
    if random.random() < 0.3:
        img = mild_gaussian_noise(img, sigma=random.uniform(1.0, 3.5))

    return img


def _augment_ai(img: Image.Image) -> Image.Image:
    """
    Augmentation for AI-generated images.
    MUCH more conservative: only flip and tiny crop.
    We preserve GAN/diffusion artifacts (spectral fingerprint, smoothness).
    """
    img = random_hflip(img, p=0.5)
    img = random_crop_resize(img, min_scale=0.94, max_scale=1.0)

    # Very mild brightness only — no noise, no JPEG recompress
    if random.random() < 0.25:
        img = mild_brightness(img, factor_range=(0.92, 1.08))

    return img


# ─────────────────────────────────────────────────────────────────────────────
# Public augmentation callable
# ─────────────────────────────────────────────────────────────────────────────

def build_train_augmentation(p_augment: float = 0.85) -> Callable:
    """
    Returns a forensic-safe augmentation function:
        augment(pil_img: Image.Image, label: int) → Image.Image

    Args:
        p_augment: probability of applying augmentation to any given sample
    """
    def augment(pil_img: Image.Image, label: int) -> Image.Image:
        if random.random() > p_augment:
            return pil_img
        if label == REAL_IDX:
            return _augment_real(pil_img)
        else:
            return _augment_ai(pil_img)

    return augment


def build_val_augmentation() -> Callable:
    """Validation/test: no augmentation, just return as-is."""
    def augment(pil_img: Image.Image, label: int) -> Image.Image:
        return pil_img
    return augment
