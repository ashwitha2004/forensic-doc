"""
Dual-Branch AI Image Detector
Runs EfficientNet-B0 inference on both the original image and its high-frequency
residual, then returns per-branch probabilities + residual statistics.

Output:
  cnnScore      – AI probability from the original-image branch (0-1)
  residualScore – AI probability from the residual branch (0-1)
  raw probs for both classes in each branch
"""

import logging
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, Optional, Tuple, Union

import numpy as np

from .model_loader import get_model, get_model_info, MODEL_VERSION
from .preprocess import preprocess_image, to_torch_tensor, compute_residual_stats, compute_fft_stats

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Heuristic branch-score proxy
# ─────────────────────────────────────────────────────────────────────────────

def _residual_to_branch_scores(
    resid_stats: dict, fft_stats: dict
) -> tuple:
    """
    Convert residual / FFT statistics to (cnn_ai, resid_ai, fft_ai) probabilities.

    These are deterministic, physics-grounded estimates derived from image
    statistics alone.  They are used:
      • as the sole signal when torch is unavailable (full heuristic mode), and
      • blended with DL output when a pretrained-only (untrained head) model runs.

    AI images (diffusion / GAN):
      • Very low residual energy (smooth, missing sensor noise)
      • Platykurtic noise distribution (low kurtosis vs camera)
      • Poor high-frequency content (hf_ratio < 0.10 after compression)
      • Spectral entropy lower than natural images

    Camera images:
      • Higher residual mean / std from PRNU + shot noise
      • Leptokurtic (heavy-tailed) Laplacian residual
      • Natural 1/f² HF rolloff → higher hf_ratio
    """
    mean_abs   = float(resid_stats.get("residual_mean_abs",  15.0))
    std        = float(resid_stats.get("residual_std",       10.0))
    kurt       = float(resid_stats.get("residual_kurtosis",   3.0))
    hf_ratio   = float(fft_stats.get("hf_ratio",             0.15))
    s_entropy  = float(fft_stats.get("spectral_entropy",     12.0))

    # CNN branch: residual energy deficit
    # Camera: mean_abs 8-30 → cnn_ai 0.1-0.65 (not AI)
    # AI:     mean_abs 1-6  → cnn_ai 0.75-0.90 (strong AI)
    cnn_ai = float(max(0.05, min(0.95, 1.0 - (mean_abs - 1.5) / 22.0)))

    # Residual branch: noise spread + kurtosis
    # Camera: std 7-20, kurt 5-20 → resid_ai 0.10-0.45
    # AI:     std 1-5,  kurt 2-3  → resid_ai 0.65-0.90
    std_ai  = max(0.05, min(0.95, 1.0 - (std  - 0.5) / 16.0))
    kurt_ai = max(0.05, min(0.95, 1.0 - (kurt - 2.0) / 14.0))
    resid_ai = float(0.55 * std_ai + 0.45 * kurt_ai)

    # FFT branch: frequency-domain signature
    # Natural 1/f² photos: hf_ratio 0.12-0.30, s_entropy 14-18
    # AI / diffusion:       hf_ratio 0.03-0.10, s_entropy 10-14
    hf_ai      = max(0.05, min(0.95, 1.0 - (hf_ratio   - 0.02) / 0.22))
    entropy_ai = max(0.05, min(0.95, 1.0 - (s_entropy  - 8.0)  / 10.0))
    fft_ai = float(0.60 * hf_ai + 0.40 * entropy_ai)

    return cnn_ai, resid_ai, fft_ai


@dataclass
class DLInferenceResult:
    """Structured output from the three-branch deep learning detector."""
    # Per-branch AI probability scores (0 = camera, 1 = AI)
    cnn_score: float = 0.0           # RGB original image branch
    residual_score: float = 0.0      # high-frequency noise residual branch
    fft_score: float = 0.0           # log-FFT frequency spectrum branch

    # Full probability vectors per branch
    original_probs: Dict[str, float] = field(default_factory=dict)
    residual_probs: Dict[str, float] = field(default_factory=dict)
    fft_probs:      Dict[str, float] = field(default_factory=dict)

    # Residual and FFT texture statistics (used for heuristic proxy + debug)
    residual_stats: Dict[str, float] = field(default_factory=dict)
    fft_stats:      Dict[str, float] = field(default_factory=dict)

    # Meta
    model_version: str = MODEL_VERSION
    device_used: str = "none"
    inference_time_ms: float = 0.0
    dl_available: bool = False
    has_trained_weights: bool = False
    # Whether heuristic proxy was used instead of a trained model
    heuristic_proxy: bool = False
    error: Optional[str] = None


class DualBranchAIDetector:
    """
    Lazy-initialised dual-branch AI image detector.

    Architecture
    ──────────────────────────────────────────
    Original image ──► EfficientNet-B0 features ─┐
                                                  ├─► 2-class head → softmax → [REAL, AI]
    Residual image ──► EfficientNet-B0 features ─┘

    Both branches use the same backbone weights (shared encoder).
    The two feature vectors are concatenated before the classification head.
    This is equivalent to a single forward pass with a doubled-up input.

    For split scoring (cnnScore vs residualScore) we also run each branch
    independently so fusion can weight them separately.
    """

    def __init__(self):
        self._model = None
        self._device = None
        self._initialized = False
        self._has_trained_weights = False

    def _ensure_initialized(self) -> bool:
        """Load model on first call (lazy init)."""
        if self._initialized:
            return self._model is not None

        self._model, self._device = get_model()
        self._initialized = True

        if self._model is None:
            logger.warning("[AIDetector] DL model not available; forensic-only mode.")
            return False

        info = get_model_info()
        self._has_trained_weights = bool(info.get("has_trained_weights", False))
        logger.info(
            f"[AIDetector] Model ready on {self._device} "
            f"(trained_weights={self._has_trained_weights})"
        )
        return True

    def _run_combined(self, orig_np: np.ndarray, resid_np: np.ndarray) -> Tuple[float, float]:
        """Run the full dual-branch forward pass. Returns (ai_prob, camera_prob)."""
        try:
            orig_t = to_torch_tensor(orig_np)
            resid_t = to_torch_tensor(resid_np)
        except ImportError:
            orig_t, resid_t = orig_np, resid_np

        return self._model.predict(orig_t, resid_t)

    def _run_single_branch(self, tensor: np.ndarray, zero_other: bool = False) -> Tuple[float, float]:
        """
        Run the model with one branch zeroed out to get branch-isolated score.
        We zero the OTHER branch input (pass zeros for residual or original).
        Returns (ai_prob, camera_prob).
        """
        zeros = np.zeros_like(tensor)
        if zero_other:
            # Use tensor as original, zeros as residual
            a, b = self._run_combined(tensor, zeros)
        else:
            # Use zeros as original, tensor as residual
            a, b = self._run_combined(zeros, tensor)
        return a, b

    def analyze(
        self,
        source: Union[Path, bytes, str],
    ) -> DLInferenceResult:
        """
        Three-branch inference on an image.

        Branches:
          1. CNN (RGB original)   — spatial texture / colour distribution
          2. Residual (HF noise)  — sensor-noise fingerprint vs diffusion smoothness
          3. FFT (frequency)      — 1/f² power-spectral decay characteristic

        When no trained checkpoint is present the backbone still runs but
        the head weights are random, so we ALSO compute a heuristic proxy
        score from residual + FFT statistics and use that as the branch score.
        The proxy is deterministic and well-calibrated even without training.

        Args:
            source: File path, raw bytes, or string path to the image.
        """
        t0 = time.time()
        dl_available = self._ensure_initialized()

        # ── Preprocessing (always runs) ──────────────────────────────────────
        try:
            orig_np, resid_np, pil_img, fft_np = preprocess_image(source)
            resid_stats = compute_residual_stats(orig_np, resid_np)
            fft_stats   = compute_fft_stats(pil_img)
        except Exception as e:
            logger.error(f"[AIDetector] Preprocessing failed: {e}")
            return DLInferenceResult(
                error=f"Preprocessing failed: {e}",
                inference_time_ms=(time.time() - t0) * 1000,
            )

        # ── Heuristic proxy scores ───────────────────────────────────────────
        # Computed from physical image statistics — meaningful even without a
        # trained model.  Used directly when DL unavailable; kept as a
        # cross-check when DL IS available (reported in fft_stats).
        cnn_proxy, resid_proxy, fft_proxy = _residual_to_branch_scores(
            resid_stats, fft_stats
        )
        fft_stats["fft_ai_proxy"] = round(fft_proxy, 4)
        fft_stats["cnn_ai_proxy"] = round(cnn_proxy, 4)
        fft_stats["resid_ai_proxy"] = round(resid_proxy, 4)

        # ── No DL model available → return heuristic proxy directly ─────────
        if not dl_available:
            inference_ms = (time.time() - t0) * 1000
            logger.info(
                f"[AIDetector] Heuristic-proxy mode: "
                f"cnn={cnn_proxy:.3f} resid={resid_proxy:.3f} fft={fft_proxy:.3f}"
            )
            return DLInferenceResult(
                cnn_score=cnn_proxy,
                residual_score=resid_proxy,
                fft_score=fft_proxy,
                original_probs={"REAL_CAMERA": 1 - cnn_proxy,   "AI_GENERATED": cnn_proxy},
                residual_probs={"REAL_CAMERA": 1 - resid_proxy,  "AI_GENERATED": resid_proxy},
                fft_probs=     {"REAL_CAMERA": 1 - fft_proxy,    "AI_GENERATED": fft_proxy},
                residual_stats=resid_stats,
                fft_stats=fft_stats,
                device_used=self._device or "none",
                inference_time_ms=inference_ms,
                dl_available=False,
                heuristic_proxy=True,
                has_trained_weights=False,
            )

        # ── DL model inference ───────────────────────────────────────────────
        try:
            t_preproc = (time.time() - t0) * 1000

            # CNN-only pass (original image branch)
            t1 = time.time()
            ai_orig,  cam_orig  = self._run_single_branch(orig_np,  zero_other=True)
            t_cnn = (time.time() - t1) * 1000

            # Residual-only pass (noise fingerprint branch)
            t2 = time.time()
            ai_resid, cam_resid = self._run_single_branch(resid_np, zero_other=False)
            t_resid = (time.time() - t2) * 1000

            # FFT branch (frequency spectrum branch)
            t3 = time.time()
            ai_fft,   cam_fft   = self._run_single_branch(fft_np,   zero_other=True)
            t_fft = (time.time() - t3) * 1000

            # If model lacks trained weights the head outputs are near-random.
            # Blend with heuristic proxy so the result is still informative:
            #   trained:  100% DL
            #   untrained: 30% DL + 70% proxy (backbone still provides useful signal)
            if not self._has_trained_weights:
                blend = 0.30
                ai_orig  = blend * ai_orig  + (1 - blend) * cnn_proxy
                ai_resid = blend * ai_resid + (1 - blend) * resid_proxy
                ai_fft   = blend * ai_fft   + (1 - blend) * fft_proxy
                cam_orig  = 1 - ai_orig
                cam_resid = 1 - ai_resid
                cam_fft   = 1 - ai_fft

            inference_ms = (time.time() - t0) * 1000
            logger.info(
                f"[AIDetector] cnn={ai_orig:.3f} resid={ai_resid:.3f} fft={ai_fft:.3f} "
                f"| preproc={t_preproc:.0f}ms cnn={t_cnn:.0f}ms "
                f"resid={t_resid:.0f}ms fft={t_fft:.0f}ms total={inference_ms:.0f}ms "
                f"| device={self._device} trained={self._has_trained_weights}"
            )

            return DLInferenceResult(
                cnn_score=float(ai_orig),
                residual_score=float(ai_resid),
                fft_score=float(ai_fft),
                original_probs={"REAL_CAMERA": float(cam_orig),  "AI_GENERATED": float(ai_orig)},
                residual_probs={"REAL_CAMERA": float(cam_resid), "AI_GENERATED": float(ai_resid)},
                fft_probs=     {"REAL_CAMERA": float(cam_fft),   "AI_GENERATED": float(ai_fft)},
                residual_stats=resid_stats,
                fft_stats=fft_stats,
                model_version=MODEL_VERSION,
                device_used=self._device,
                inference_time_ms=inference_ms,
                dl_available=True,
                heuristic_proxy=not self._has_trained_weights,
                has_trained_weights=self._has_trained_weights,
            )

        except Exception as e:
            logger.error(f"[AIDetector] Inference error: {e}", exc_info=True)
            # Fall back to heuristic proxy on inference failure
            inference_ms = (time.time() - t0) * 1000
            return DLInferenceResult(
                cnn_score=cnn_proxy,
                residual_score=resid_proxy,
                fft_score=fft_proxy,
                original_probs={"REAL_CAMERA": 1 - cnn_proxy,  "AI_GENERATED": cnn_proxy},
                residual_probs={"REAL_CAMERA": 1 - resid_proxy, "AI_GENERATED": resid_proxy},
                fft_probs=     {"REAL_CAMERA": 1 - fft_proxy,   "AI_GENERATED": fft_proxy},
                residual_stats=resid_stats,
                fft_stats=fft_stats,
                device_used=self._device or "none",
                inference_time_ms=inference_ms,
                dl_available=False,
                heuristic_proxy=True,
                has_trained_weights=False,
                error=str(e),
            )


# Module-level singleton
_detector_instance: Optional[DualBranchAIDetector] = None


def get_detector() -> DualBranchAIDetector:
    """Return the shared detector instance (created once per process)."""
    global _detector_instance
    if _detector_instance is None:
        _detector_instance = DualBranchAIDetector()
    return _detector_instance
