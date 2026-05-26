"""
Probability Calibration
──────────────────────────────────────────────────────────────────────────────
Temperature Scaling (Guo et al. 2017):
  p_calibrated = softmax(logits / T)

  T > 1 → softer (more uncertain) predictions  — use when model is overconfident
  T < 1 → sharper predictions                  — rare
  T = 1 → no change (uncalibrated)

Fitting:
  Minimise NLL on validation set over T ∈ (0, 5] using LBFGS.

Confidence normalization:
  After temperature scaling, optionally map the raw AI probability through
  a calibration curve learned on the validation set to ensure the output
  probability p matches the empirical frequency of AI images in that bucket.
──────────────────────────────────────────────────────────────────────────────
"""

import logging
from typing import Optional, Tuple

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import DataLoader

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Temperature Scaler
# ─────────────────────────────────────────────────────────────────────────────

class TemperatureScaler(nn.Module):
    """
    A single learnable temperature parameter applied to model logits.
    Keeps the model weights frozen; only optimises T.
    """

    def __init__(self, init_temperature: float = 1.0):
        super().__init__()
        self.temperature = nn.Parameter(
            torch.tensor([init_temperature], dtype=torch.float32)
        )

    def forward(self, logits: torch.Tensor) -> torch.Tensor:
        return logits / self.temperature.clamp(min=0.05)

    def calibrate_proba(self, logits: torch.Tensor) -> torch.Tensor:
        """Return calibrated probabilities."""
        return F.softmax(self.forward(logits), dim=1)

    @property
    def T(self) -> float:
        return float(self.temperature.item())


def calibrate_temperature(
    model: nn.Module,
    val_loader: DataLoader,
    device: str,
    max_iter: int = 50,
    lr: float = 0.01,
) -> float:
    """
    Fit a temperature scalar on the validation set using LBFGS.

    Args:
        model       : trained DualBranchForensicNet (weights frozen during fitting)
        val_loader  : DataLoader yielding (orig, resid, labels)
        device      : "cuda" or "cpu"
        max_iter    : LBFGS iterations
        lr          : learning rate for LBFGS

    Returns:
        Optimal temperature T (float)
    """
    model.eval()
    scaler = TemperatureScaler().to(device)
    optimizer = torch.optim.LBFGS(
        [scaler.temperature], lr=lr, max_iter=max_iter
    )

    # Collect all logits and labels in a single pass (no backprop through model)
    all_logits, all_labels = [], []
    with torch.no_grad():
        for orig, resid, labels in val_loader:
            orig   = orig.to(device)
            resid  = resid.to(device)
            labels = labels.to(device)
            logits = model(orig, resid)
            all_logits.append(logits)
            all_labels.append(labels)

    logits_all = torch.cat(all_logits)
    labels_all = torch.cat(all_labels)

    def _eval_closure():
        optimizer.zero_grad()
        scaled_logits = scaler(logits_all)
        loss = F.cross_entropy(scaled_logits, labels_all)
        loss.backward()
        return loss

    optimizer.step(_eval_closure)

    T = scaler.T
    T = float(np.clip(T, 0.3, 5.0))   # safety clamp

    # Verify improvement
    with torch.no_grad():
        nll_before = F.cross_entropy(logits_all, labels_all).item()
        nll_after  = F.cross_entropy(logits_all / T, labels_all).item()

    logger.info(
        f"[Calibration] T={T:.4f}  NLL {nll_before:.4f} → {nll_after:.4f}"
        + (" (worse — reverting to T=1.0)" if nll_after > nll_before else "")
    )

    return T if nll_after <= nll_before else 1.0


# ─────────────────────────────────────────────────────────────────────────────
# Confidence normalizer (isotonic / Platt-like post-processing)
# ─────────────────────────────────────────────────────────────────────────────

class ConfidenceNormalizer:
    """
    Bin-wise empirical calibration.
    Maps raw AI probability → calibrated probability using isotonic regression
    on the validation set.

    After fitting, `transform(p)` returns a probability that better matches
    the true fraction of AI images in that probability bucket.
    """

    def __init__(self, n_bins: int = 20):
        self.n_bins = n_bins
        self._fitted = False
        self._bin_edges: Optional[np.ndarray]  = None
        self._bin_means: Optional[np.ndarray]  = None

    def fit(self, probs_ai: np.ndarray, labels: np.ndarray) -> "ConfidenceNormalizer":
        """
        probs_ai : (N,) raw AI probability from model
        labels   : (N,) ground truth  0=real  1=ai
        """
        from sklearn.isotonic import IsotonicRegression

        ir = IsotonicRegression(out_of_bounds="clip")
        ir.fit(probs_ai, labels)
        self._ir = ir
        self._fitted = True
        logger.info("[ConfidenceNormalizer] Isotonic regression fitted.")
        return self

    def transform(self, probs_ai: np.ndarray) -> np.ndarray:
        if not self._fitted:
            return probs_ai
        return self._ir.predict(probs_ai).clip(0.0, 1.0)

    def transform_scalar(self, p: float) -> float:
        return float(self.transform(np.array([p]))[0])


def compute_calibration_error(
    probs_ai: np.ndarray,
    labels: np.ndarray,
    n_bins: int = 15,
) -> Tuple[float, np.ndarray, np.ndarray]:
    """
    Compute Expected Calibration Error (ECE).

    Returns:
        ece              : scalar ECE value
        bin_confidences  : mean confidence per bin
        bin_accuracies   : mean accuracy per bin
    """
    bin_edges  = np.linspace(0, 1, n_bins + 1)
    ece        = 0.0
    bin_conf   = []
    bin_acc    = []

    for i in range(n_bins):
        lo, hi = bin_edges[i], bin_edges[i + 1]
        mask = (probs_ai >= lo) & (probs_ai < hi)
        if mask.sum() == 0:
            bin_conf.append(0.0)
            bin_acc.append(0.0)
            continue
        conf = probs_ai[mask].mean()
        acc  = labels[mask].mean()
        ece += abs(conf - acc) * mask.sum() / len(labels)
        bin_conf.append(float(conf))
        bin_acc.append(float(acc))

    return float(ece), np.array(bin_conf), np.array(bin_acc)


def apply_calibration(
    raw_ai_prob: float,
    temperature: float = 1.0,
    raw_logits: Optional[Tuple[float, float]] = None,
) -> float:
    """
    Apply temperature-based calibration to a scalar AI probability.

    If raw_logits (logit_real, logit_ai) are available, apply temperature
    to logits then softmax (more accurate).
    If only probability is available, approximate via log-odds rescaling.
    """
    if raw_logits is not None:
        l_real, l_ai = raw_logits
        l_real /= temperature
        l_ai   /= temperature
        exp_r  = np.exp(l_real - max(l_real, l_ai))
        exp_a  = np.exp(l_ai   - max(l_real, l_ai))
        return float(exp_a / (exp_r + exp_a + 1e-12))

    # Log-odds approximation when logits are not available
    p = np.clip(raw_ai_prob, 1e-6, 1 - 1e-6)
    log_odds = np.log(p / (1 - p)) / temperature
    return float(1 / (1 + np.exp(-log_odds)))
