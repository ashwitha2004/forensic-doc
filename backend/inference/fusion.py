"""
Multi-Signal Fusion Layer  — v3 (DL-primary, heuristic fallback)
=================================================================

Final verdict weighting:

  When a TRAINED checkpoint is loaded:
    DL-only   CNN 45% + Residual 35% + FFT 20%
    Heuristic and metadata weights are ZEROED.
    The trained model's three branches are the sole decision makers.

  When only a pretrained (untrained head) backbone is available:
    DL signals are blended with frequency heuristics.

  When no DL model is available at all:
    Heuristic proxy + metadata only.

All scores are in [0, 1] where 1.0 = strong AI indicator.
"""

import logging
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

# ── Weight profiles ───────────────────────────────────────────────────────────

# Trained checkpoint — DL-only, heuristics disabled
_DL_ONLY = {
    "cnn":       0.45,   # RGB original-image branch
    "residual":  0.35,   # noise/residual branch
    "fft_dl":    0.20,   # FFT frequency branch
    "frequency": 0.00,   # heuristic freq  — DISABLED for trained model
    "metadata":  0.00,   # EXIF / metadata — DISABLED for trained model
}

# Pretrained backbone + heuristic-proxy blend — DL head is random/untrained
_UNTRAINED = {
    "cnn":       0.20,
    "residual":  0.15,
    "fft_dl":    0.10,
    "frequency": 0.40,
    "metadata":  0.15,
}

# No DL at all — heuristic proxy is the sole signal
FALLBACK_WEIGHTS_NO_DL = {
    "cnn":       0.25,   # proxy scores from residual/FFT stats
    "residual":  0.20,
    "fft_dl":    0.15,
    "frequency": 0.30,
    "metadata":  0.10,
}


@dataclass
class FusionInput:
    """All raw signals fed into the fusion layer."""
    # DL branch scores (0-1, probability of AI_GENERATED)
    cnn_score:      float = 0.5   # RGB original-image branch
    residual_score: float = 0.5   # noise/residual branch
    fft_score:      float = 0.5   # FFT frequency branch

    # Heuristic forensic detector score (0-1, higher = more AI-like)
    # Only used when has_trained_weights is False
    forensic_score: float = 0.5

    # Metadata reliability score (0-1, higher = less camera-like metadata)
    # Only used when has_trained_weights is False
    metadata_score: float = 0.5

    # Whether DL inference was actually run (even heuristic proxy counts)
    dl_available: bool = False

    # Whether the loaded model has trained forensic weights (vs random/pretrained head)
    has_trained_weights: bool = False

    # Whether heuristic proxy was used in place of actual DL inference
    heuristic_proxy: bool = False

    # Residual and FFT texture statistics for diagnostic reporting
    residual_stats: Dict[str, float] = field(default_factory=dict)
    fft_stats:      Dict[str, float] = field(default_factory=dict)

    # Individual detector sub-scores (optional, for UI breakdown)
    detector_sub_scores: Dict[str, float] = field(default_factory=dict)


@dataclass
class FusionResult:
    """Fused output — final probabilities and confidence."""
    # Core probabilities (always sum to 1)
    ai_probability:     float = 0.0
    camera_probability: float = 0.0

    # Per-branch confidence scores (for UI display)
    dl_confidence:       float = 0.0   # Combined CNN + residual + FFT confidence
    forensic_confidence: float = 0.0   # Forensic heuristic confidence (legacy)
    fusion_confidence:   float = 0.0   # Overall fusion confidence

    # Dominant detection reasons (ordered by contribution)
    dominant_signals: List[str] = field(default_factory=list)

    # Per-signal breakdown (raw scores used in fusion)
    signal_breakdown: Dict[str, float] = field(default_factory=dict)

    # Weights used this inference
    weights_used: Dict[str, float] = field(default_factory=dict)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _clamp(v: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, v))


def _derive_forensic_score(forensic_signals) -> float:
    """
    Convert existing forensic detector output into a 0-1 AI probability.
    Only used when has_trained_weights is False (fallback path).
    """
    ai_prob  = 0.0
    cam_prob = 0.0
    ss_prob  = 0.0

    if isinstance(forensic_signals, dict):
        ai_prob  = forensic_signals.get("ai_probability",         0.0)
        cam_prob = forensic_signals.get("camera_probability",     0.0)
        ss_prob  = forensic_signals.get("screenshot_probability", 0.0)
    elif hasattr(forensic_signals, "ai_probability"):
        ai_prob  = getattr(forensic_signals, "ai_probability",         0.0)
        cam_prob = getattr(forensic_signals, "camera_probability",     0.0)
        ss_prob  = getattr(forensic_signals, "screenshot_probability", 0.0)

    # Screenshot → ambiguous, don't tip AI scale
    if ss_prob > 0.5:
        return 0.5

    total = ai_prob + cam_prob
    if total < 0.01:
        return 0.5
    return _clamp(ai_prob / total)


def _derive_metadata_score(forensic_signals) -> float:
    """
    Metadata absence is a weak AI indicator.
    Only used when has_trained_weights is False (fallback path).
    Returns 0.2 if camera metadata present, 0.55 if absent.
    (Conservative — many real photos lose EXIF via WhatsApp.)
    """
    if isinstance(forensic_signals, dict):
        has_meta = forensic_signals.get("metadata_detected", False)
    elif hasattr(forensic_signals, "metadata_detected"):
        has_meta = forensic_signals.metadata_detected
    else:
        has_meta = False
    return 0.20 if has_meta else 0.55


def _derive_frequency_score(resid_stats: dict, fft_stats: dict) -> float:
    """
    Heuristic frequency-domain AI probability.
    Only used when has_trained_weights is False.
    """
    mean_abs  = float(resid_stats.get("residual_mean_abs",  15.0))
    hf_ratio  = float(fft_stats.get("hf_ratio",             0.15))
    s_entropy = float(fft_stats.get("spectral_entropy",     12.0))

    energy_ai  = max(0.05, min(0.95, 1.0 - (mean_abs - 1.5) / 22.0))
    hf_ai      = max(0.05, min(0.95, 1.0 - (hf_ratio - 0.02) / 0.22))
    entropy_ai = max(0.05, min(0.95, 1.0 - (s_entropy - 8.0) / 10.0))

    return float(0.40 * energy_ai + 0.35 * hf_ai + 0.25 * entropy_ai)


def _select_weights(fusion_input: FusionInput) -> Dict[str, float]:
    """
    Choose the fusion weight profile.

    Trained model    → DL-only (CNN + residual + FFT, heuristics zeroed)
    Untrained model  → heuristic-blended (DL head is random)
    No DL model      → heuristic proxy only
    """
    if not fusion_input.dl_available:
        return FALLBACK_WEIGHTS_NO_DL

    if not fusion_input.has_trained_weights:
        return _UNTRAINED

    # Trained model — trust the DL branches exclusively
    return _DL_ONLY


def _build_dominant_signals(
    weights: Dict[str, float],
    scores: Dict[str, float],
) -> List[str]:
    contributions = [
        (k, weights.get(k, 0) * scores.get(k, 0.5)) for k in weights
        if weights.get(k, 0) > 0   # skip zeroed-out signals
    ]
    contributions.sort(key=lambda x: x[1], reverse=True)

    labels = {
        "cnn":       "Deep Learning — RGB image branch",
        "residual":  "Deep Learning — residual noise branch",
        "fft_dl":    "Deep Learning — FFT frequency branch",
        "frequency": "Heuristic frequency / spectral analysis",
        "metadata":  "EXIF metadata reliability",
    }

    signals = []
    for name, _contrib in contributions[:5]:
        score = scores.get(name, 0.5)
        label = labels.get(name, name)
        if score > 0.60:
            signals.append(f"{label}: AI indicators ({score:.0%})")
        elif score < 0.40:
            signals.append(f"{label}: Camera indicators ({1 - score:.0%})")
        else:
            signals.append(f"{label}: Ambiguous ({score:.0%})")

    return signals[:4]


# ── Public API ────────────────────────────────────────────────────────────────

def fuse(
    fusion_input: FusionInput,
    weights: Optional[Dict[str, float]] = None,
) -> FusionResult:
    """
    Main fusion entry point.

    When a trained model is loaded the result is determined entirely by the
    three DL branches (CNN / residual / FFT).  Heuristic and metadata scores
    are computed for diagnostics but carry zero weight in the final verdict.

    Args:
        fusion_input: All raw signal scores.
        weights:      Override default fusion weights (must sum to 1).

    Returns:
        FusionResult with final probabilities and UI-ready signals.
    """
    if weights is None:
        weights = _select_weights(fusion_input)

    # Normalize weights to sum to 1
    total_w = sum(weights.values())
    if total_w > 0:
        weights = {k: v / total_w for k, v in weights.items()}

    scores = {
        "cnn":       _clamp(fusion_input.cnn_score),
        "residual":  _clamp(fusion_input.residual_score),
        "fft_dl":    _clamp(fusion_input.fft_score),
        "frequency": _clamp(fusion_input.forensic_score),
        "metadata":  _clamp(fusion_input.metadata_score),
    }

    # Weighted average → AI probability
    ai_prob     = sum(weights.get(k, 0) * scores[k] for k in scores)
    ai_prob     = _clamp(ai_prob)
    camera_prob = 1.0 - ai_prob

    # Per-branch confidence (how far from 0.5)
    dl_confidence = _clamp(
        (abs(scores["cnn"] - 0.5) + abs(scores["residual"] - 0.5) + abs(scores["fft_dl"] - 0.5)) / 1.5,
        0.0, 1.0,
    ) if fusion_input.dl_available else 0.0

    forensic_confidence = _clamp(abs(scores["frequency"] - 0.5) * 2)

    certainties = {k: abs(scores[k] - 0.5) * 2 for k in scores}
    fusion_confidence = _clamp(
        sum(weights.get(k, 0) * certainties[k] for k in certainties)
    )

    dominant_signals = _build_dominant_signals(weights, scores)

    profile = "dl_only" if fusion_input.has_trained_weights else (
        "untrained" if fusion_input.dl_available else "heuristic_fallback"
    )
    logger.info(
        f"[Fusion] ai={ai_prob:.3f} cam={camera_prob:.3f} "
        f"dl_conf={dl_confidence:.3f} fus_conf={fusion_confidence:.3f} "
        f"profile={profile}"
    )

    return FusionResult(
        ai_probability=ai_prob,
        camera_probability=camera_prob,
        dl_confidence=dl_confidence,
        forensic_confidence=forensic_confidence,
        fusion_confidence=fusion_confidence,
        dominant_signals=dominant_signals,
        signal_breakdown={
            "cnn_score":        scores["cnn"],
            "residual_score":   scores["residual"],
            "fft_score":        scores["fft_dl"],
            "forensic_score":   scores["frequency"],
            "metadata_score":   scores["metadata"],
        },
        weights_used=weights,
    )


def build_fusion_input(
    dl_result,          # DLInferenceResult from ai_detector
    forensic_signals,   # ForensicSignals from forensic service
) -> FusionInput:
    """
    Construct a FusionInput from the two pipeline outputs.

    When the model has trained weights the forensic/metadata scores are
    computed for diagnostic reporting only — they carry zero weight in
    the fusion (see _DL_ONLY profile).
    """
    resid_stats     = getattr(dl_result, "residual_stats", {}) or {}
    fft_stats       = getattr(dl_result, "fft_stats",      {}) or {}
    forensic_score  = _derive_forensic_score(forensic_signals)
    metadata_score  = _derive_metadata_score(forensic_signals)
    frequency_score = _derive_frequency_score(resid_stats, fft_stats)

    # Blend forensic + frequency for the diagnostic slot only
    blended_freq = 0.50 * forensic_score + 0.50 * frequency_score

    return FusionInput(
        cnn_score=           getattr(dl_result, "cnn_score",      0.5),
        residual_score=      getattr(dl_result, "residual_score", 0.5),
        fft_score=           getattr(dl_result, "fft_score",      0.5),
        forensic_score=      blended_freq,
        metadata_score=      metadata_score,
        dl_available=        getattr(dl_result, "dl_available",         False),
        has_trained_weights= getattr(dl_result, "has_trained_weights",  False),
        heuristic_proxy=     getattr(dl_result, "heuristic_proxy",      False),
        residual_stats=      resid_stats,
        fft_stats=           fft_stats,
        detector_sub_scores={
            "cnn_score":       getattr(dl_result, "cnn_score",      0.5),
            "residual_score":  getattr(dl_result, "residual_score", 0.5),
            "fft_score":       getattr(dl_result, "fft_score",      0.5),
            "forensic_score":  forensic_score,
            "frequency_score": frequency_score,
            "metadata_score":  metadata_score,
        },
    )
