"""
Dual-Branch EfficientNet-B0 — Shared Model Architecture
This file is the single source of truth for the model architecture.
Both training (backend/training/) and inference (backend/inference/model_loader.py)
import from here to guarantee state_dict key compatibility.

Classification task: binary
  0 = REAL_CAMERA
  1 = AI_GENERATED
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
import logging
from typing import Dict, Optional, Tuple

logger = logging.getLogger(__name__)

CLASS_NAMES = ["REAL_CAMERA", "AI_GENERATED"]
REAL_IDX = 0
AI_IDX = 1
FEATURE_DIM = 1280      # EfficientNet-B0 penultimate feature dim
ARCHITECTURE = "dual_branch_efficientnet_b0_v2"
ARCHITECTURE_DEBUG = "single_branch_mobilenetv3_small_debug"


def _build_backbone(pretrained: bool = True):
    """Return EfficientNet-B0 feature extractor (no classification head)."""
    try:
        from torchvision.models import efficientnet_b0, EfficientNet_B0_Weights
        weights = EfficientNet_B0_Weights.IMAGENET1K_V1 if pretrained else None
        net = efficientnet_b0(weights=weights)
    except (ImportError, TypeError):
        from torchvision.models import efficientnet_b0
        net = efficientnet_b0(pretrained=pretrained)

    # Remove the classification head; keep AdaptiveAvgPool inside Sequential
    # EfficientNet children: [features (Sequential), avgpool, classifier]
    # We want: features + avgpool → (B, 1280, 1, 1)
    feature_extractor = nn.Sequential(
        net.features,
        net.avgpool,
    )
    return feature_extractor


class DualBranchForensicNet(nn.Module):
    """
    Dual-branch EfficientNet-B0 for binary real-vs-AI classification.

    Both branches (original image + high-frequency residual image) share
    the same backbone weights (weight-tied encoder).

    Architecture:
      original  ─► backbone → (B, 1280) ─┐
                                          ├─ cat → (B, 2560) ─► head → (B, 2)
      residual  ─► backbone → (B, 1280) ─┘

    Forward returns raw logits (apply softmax externally for probabilities).
    """

    def __init__(self, pretrained: bool = True, dropout: float = 0.3):
        super().__init__()
        self.backbone = _build_backbone(pretrained)

        self.classifier = nn.Sequential(
            nn.Dropout(p=dropout),
            nn.Linear(FEATURE_DIM * 2, 512),
            nn.GELU(),
            nn.Dropout(p=dropout * 0.67),
            nn.Linear(512, 128),
            nn.GELU(),
            nn.Linear(128, 2),
        )
        self._init_head()

    def _init_head(self):
        for layer in self.classifier:
            if isinstance(layer, nn.Linear):
                nn.init.xavier_normal_(layer.weight)
                nn.init.zeros_(layer.bias)

    def extract_features(self, x: torch.Tensor) -> torch.Tensor:
        """Return (B, 1280) feature vector for one branch."""
        return self.backbone(x).flatten(1)

    def forward(self, original: torch.Tensor, residual: torch.Tensor) -> torch.Tensor:
        """
        Args:
            original : (B, 3, 224, 224) normalized original image
            residual : (B, 3, 224, 224) normalized residual image

        Returns:
            logits   : (B, 2)  [REAL_CAMERA, AI_GENERATED]
        """
        feat_orig  = self.extract_features(original)   # (B, 1280)
        feat_resid = self.extract_features(residual)   # (B, 1280)
        combined   = torch.cat([feat_orig, feat_resid], dim=1)  # (B, 2560)
        return self.classifier(combined)

    def predict_proba(
        self,
        original: torch.Tensor,
        residual: torch.Tensor,
        temperature: float = 1.0,
    ) -> torch.Tensor:
        """Calibrated probabilities via temperature scaling."""
        logits = self.forward(original, residual)
        return F.softmax(logits / temperature, dim=1)

    def get_info(self) -> Dict:
        total = sum(p.numel() for p in self.parameters())
        trainable = sum(p.numel() for p in self.parameters() if p.requires_grad)
        return {
            "architecture": ARCHITECTURE,
            "total_parameters": total,
            "trainable_parameters": trainable,
            "model_size_mb": round(total * 4 / 1024 / 1024, 2),
            "class_names": CLASS_NAMES,
        }


# ---------------------------------------------------------------------------
# Loss functions
# ---------------------------------------------------------------------------

class AsymmetricFocalLoss(nn.Module):
    """
    Focal loss with asymmetric class weights.
    Higher penalty on False Positives (real images classified as AI).
    This enforces the low-FPR requirement.

    Args:
        fp_weight  : extra penalty multiplier when real→AI (false positive)
        gamma      : focal modulation strength
    """

    def __init__(self, fp_weight: float = 2.5, gamma: float = 2.0):
        super().__init__()
        self.fp_weight = fp_weight
        self.gamma = gamma

    def forward(self, logits: torch.Tensor, targets: torch.Tensor) -> torch.Tensor:
        probs = F.softmax(logits, dim=1)                        # (B, 2)
        target_probs = probs.gather(1, targets.unsqueeze(1)).squeeze(1)  # (B,)

        # Focal term
        ce    = F.cross_entropy(logits, targets, reduction="none")  # (B,)
        pt    = torch.exp(-ce)
        focal = ((1 - pt) ** self.gamma) * ce                       # (B,)

        # Asymmetric: upweight when ground truth is REAL (0) but model says AI
        # i.e. false positive on the AI class
        is_real = (targets == REAL_IDX).float()
        ai_prob = probs[:, AI_IDX]
        fp_penalty = is_real * ai_prob * self.fp_weight

        loss = focal * (1 + fp_penalty)
        return loss.mean()


class FocalLoss(nn.Module):
    def __init__(self, gamma: float = 2.0, weight: Optional[torch.Tensor] = None):
        super().__init__()
        self.gamma = gamma
        self.weight = weight

    def forward(self, logits: torch.Tensor, targets: torch.Tensor) -> torch.Tensor:
        ce = F.cross_entropy(logits, targets, weight=self.weight, reduction="none")
        pt = torch.exp(-ce)
        return ((1 - pt) ** self.gamma * ce).mean()


# ---------------------------------------------------------------------------
# Early stopping
# ---------------------------------------------------------------------------

class EarlyStopping:
    """
    Stop training when monitored metric stops improving.
    Optionally monitor validation FPR rather than just loss.
    """

    def __init__(
        self,
        patience: int = 8,
        min_delta: float = 0.001,
        mode: str = "min",
    ):
        self.patience   = patience
        self.min_delta  = min_delta
        self.mode       = mode
        self.best_value = float("inf") if mode == "min" else float("-inf")
        self.counter    = 0
        self.best_state: Optional[Dict] = None

    def __call__(self, value: float, model: nn.Module) -> bool:
        improved = (
            (self.mode == "min" and value < self.best_value - self.min_delta) or
            (self.mode == "max" and value > self.best_value + self.min_delta)
        )
        if improved:
            self.best_value = value
            self.counter    = 0
            self.best_state = {k: v.clone() for k, v in model.state_dict().items()}
        else:
            self.counter += 1

        if self.counter >= self.patience:
            if self.best_state is not None:
                model.load_state_dict(self.best_state)
                logger.info("[EarlyStopping] Restored best weights.")
            return True  # trigger stop
        return False


# ---------------------------------------------------------------------------
# Factory
# ---------------------------------------------------------------------------

class DebugSingleBranchNet(nn.Module):
    """
    Lightweight single-branch MobileNetV3-Small classifier for CPU debug training.

    Designed to verify the full training → checkpoint → inference pipeline quickly
    on CPU without waiting hours for EfficientNet-B0 convergence.

    Key differences from DualBranchForensicNet:
      - MobileNetV3-Small backbone instead of EfficientNet-B0 (~2M vs ~5M params)
      - Single branch: ignores residual tensor, uses original image only
      - Simpler head: 576 → 128 → 2

    The forward() signature matches DualBranchForensicNet — both accept
    (original, residual) — so ForensicTrainer can use either model unchanged.

    Architecture:
      original ─► MobileNetV3-Small → (B, 576) ─► head → (B, 2)
      residual  ─ IGNORED
    """

    FEATURE_DIM = 576   # MobileNetV3-Small avgpool output

    def __init__(self, pretrained: bool = True, dropout: float = 0.2):
        super().__init__()
        try:
            from torchvision.models import mobilenet_v3_small, MobileNet_V3_Small_Weights
            weights = MobileNet_V3_Small_Weights.IMAGENET1K_V1 if pretrained else None
            net = mobilenet_v3_small(weights=weights)
        except (ImportError, TypeError):
            from torchvision.models import mobilenet_v3_small
            net = mobilenet_v3_small(pretrained=pretrained)

        # features → avgpool → (B, 576, 1, 1)
        self.backbone = nn.Sequential(net.features, net.avgpool)

        self.classifier = nn.Sequential(
            nn.Dropout(p=dropout),
            nn.Linear(self.FEATURE_DIM, 128),
            nn.GELU(),
            nn.Linear(128, 2),
        )
        self._init_head()

    def _init_head(self):
        for layer in self.classifier:
            if isinstance(layer, nn.Linear):
                nn.init.xavier_normal_(layer.weight)
                nn.init.zeros_(layer.bias)

    def forward(self, original: torch.Tensor, residual: torch.Tensor = None) -> torch.Tensor:
        """
        Args:
            original : (B, 3, 224, 224) — only this is used
            residual : accepted but ignored (keeps trainer interface compatible)
        Returns:
            logits   : (B, 2)
        """
        feat = self.backbone(original).flatten(1)   # (B, 576)
        return self.classifier(feat)

    def get_info(self) -> Dict:
        total = sum(p.numel() for p in self.parameters())
        trainable = sum(p.numel() for p in self.parameters() if p.requires_grad)
        return {
            "architecture":         ARCHITECTURE_DEBUG,
            "total_parameters":     total,
            "trainable_parameters": trainable,
            "model_size_mb":        round(total * 4 / 1024 / 1024, 2),
            "class_names":          CLASS_NAMES,
            "note":                 "CPU-debug model — single branch, MobileNetV3-Small",
        }


def build_model(pretrained: bool = True, device: Optional[str] = None) -> Tuple["DualBranchForensicNet", str]:
    """Create model and move to device."""
    import torch
    if device is None:
        device = "cuda" if torch.cuda.is_available() else "cpu"
    model = DualBranchForensicNet(pretrained=pretrained).to(device)
    logger.info(f"[Model] Dual-branch EfficientNet-B0 on {device}")
    logger.info(f"[Model] {model.get_info()}")
    return model, device
