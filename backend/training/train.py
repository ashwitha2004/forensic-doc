"""
Training Script -- Dual-Branch EfficientNet-B0 Binary Forensic Detector
------------------------------------------------------------------------------
Usage:
    python -m training.train \
        --real-dirs datasets/real \
        --ai-dirs   datasets/ai \
        --output    backend/inference/checkpoints \
        --epochs    50 \
        --batch-size 32

    # OR with a root dir that has real/ and ai/ sub-folders:
    python -m training.train --root-dirs datasets/CIFAKE/train

Priority: minimise False Positives (real photos classified as AI).

------------------------------------------------------------------------------
CPU DEBUG MODE (fast pipeline verification, ~3-8 min for epoch 1):
------------------------------------------------------------------------------
    python -m training.train \
        --real-dirs datasets/real \
        --ai-dirs   datasets/ai \
        --output    inference/checkpoints \
        --epochs 1 \
        --batch-size 4 \
        --num-workers 0 \
        --max-train-samples 200 \
        --disable-augmentations \
        --debug-small-model

    --debug-small-model    : MobileNetV3-Small (single branch) instead of
                             EfficientNet-B0 dual-branch -- ~10x faster on CPU
    --max-train-samples N  : cap training set at N samples (default: unlimited)
    --disable-augmentations: resize+normalize only; skip residual augmentations
    --num-workers 0        : no subprocess workers (essential for Windows CPU)

    Once the checkpoint pipeline is verified, remove these flags and run
    with the full dataset for production training.
------------------------------------------------------------------------------
"""

import argparse
import json
import logging
import sys
import time
from contextlib import nullcontext
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim
try:
    from torch.amp import GradScaler as _GradScaler
    def GradScaler(enabled: bool = True):
        return _GradScaler("cuda", enabled=enabled)
except ImportError:
    from torch.cuda.amp import GradScaler as _LegacyGradScaler
    def GradScaler(enabled: bool = True):
        return _LegacyGradScaler(enabled=enabled)

try:
    from torch.amp import autocast as _amp_autocast
    def _make_autocast(device_type: str, enabled: bool):
        return _amp_autocast(device_type=device_type, enabled=enabled)
except ImportError:
    from torch.cuda.amp import autocast as _cuda_autocast
    def _make_autocast(device_type: str, enabled: bool):
        if enabled and device_type == "cuda":
            return _cuda_autocast(enabled=True)
        return nullcontext()

from torch.utils.tensorboard import SummaryWriter

# Make the parent directory importable so inference/ can be found
_REPO_BACKEND = Path(__file__).resolve().parent.parent
if str(_REPO_BACKEND) not in sys.path:
    sys.path.insert(0, str(_REPO_BACKEND))

from training.dual_branch_model import (
    DualBranchForensicNet,
    DebugSingleBranchNet,
    AsymmetricFocalLoss,
    FocalLoss,
    EarlyStopping,
    ARCHITECTURE,
    ARCHITECTURE_DEBUG,
    CLASS_NAMES,
)
from training.dataset import DataConfig, build_dataloaders
from training.augmentations import build_train_augmentation
from training.calibration import TemperatureScaler, calibrate_temperature

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
    handlers=[logging.StreamHandler()],
)
logger = logging.getLogger("train")

CHECKPOINT_FILENAME = "forensic_detector.pth"

# How often to print per-batch progress during training
_LOG_EVERY_N_BATCHES = 5


# -----------------------------------------------------------------------------
# Metrics helpers
# -----------------------------------------------------------------------------

def _compute_metrics(
    labels: np.ndarray,
    preds: np.ndarray,
    probs_ai: np.ndarray,
) -> Dict:
    from sklearn.metrics import (
        accuracy_score, precision_score, recall_score,
        f1_score, roc_auc_score, confusion_matrix,
    )

    acc  = accuracy_score(labels, preds)
    prec = precision_score(labels, preds, zero_division=0)
    rec  = recall_score(labels, preds, zero_division=0)
    f1   = f1_score(labels, preds, zero_division=0)

    try:
        auc = roc_auc_score(labels, probs_ai)
    except Exception:
        auc = 0.0

    cm = confusion_matrix(labels, preds, labels=[0, 1])
    tn, fp, fn, tp = cm.ravel() if cm.size == 4 else (0, 0, 0, 0)
    fpr = fp / max(fp + tn, 1)

    return {
        "accuracy":   float(acc),
        "precision":  float(prec),
        "recall":     float(rec),
        "f1":         float(f1),
        "roc_auc":    float(auc),
        "false_positive_rate": float(fpr),
        "confusion_matrix": cm.tolist(),
        "TP": int(tp), "TN": int(tn), "FP": int(fp), "FN": int(fn),
    }


# -----------------------------------------------------------------------------
# Training loop
# -----------------------------------------------------------------------------

class ForensicTrainer:

    def __init__(
        self,
        model,
        train_loader,
        val_loader,
        test_loader,
        device: str,
        output_dir: Path,
        fp_weight: float = 2.5,
        label_smoothing: float = 0.05,
        use_amp: bool = False,
        log_every_n_batches: int = _LOG_EVERY_N_BATCHES,
    ):
        self.model        = model
        self.train_loader = train_loader
        self.val_loader   = val_loader
        self.test_loader  = test_loader
        self.device       = device
        self.output_dir   = output_dir
        self.use_amp      = use_amp
        self.log_every    = log_every_n_batches
        self.output_dir.mkdir(parents=True, exist_ok=True)

        # Asymmetric focal loss: penalises real->AI errors harder
        self.criterion = AsymmetricFocalLoss(fp_weight=fp_weight, gamma=2.0)

        # GradScaler: only useful on CUDA with AMP
        self.scaler = GradScaler(enabled=use_amp)

        self.writer = SummaryWriter(
            output_dir / "tensorboard" / datetime.now().strftime("%Y%m%d_%H%M%S")
        )

        self.best_fpr      = 1.0
        self.best_f1       = 0.0
        self.best_metrics: Dict = {}
        self.history: List[Dict] = []

        logger.info(f"[Trainer] FP weight={fp_weight}, label_smoothing={label_smoothing}")
        logger.info(f"[Trainer] AMP/autocast enabled: {use_amp}")
        logger.info(f"[Trainer] Output dir: {output_dir}")

    def _run_epoch(
        self,
        loader,
        training: bool,
        optimizer=None,
        scheduler=None,
        epoch_num: int = 0,
    ) -> Tuple[float, Dict]:
        self.model.train(training)
        total_loss = 0.0
        all_preds, all_labels, all_probs = [], [], []

        n_batches = len(loader)
        device_type = "cuda" if self.device == "cuda" else "cpu"

        for batch_idx, (orig, resid, labels) in enumerate(loader):
            # Startup timing: log when the very first batch is received
            if batch_idx == 0 and training and epoch_num == 1:
                logger.info(f"[Trainer] First batch received (epoch {epoch_num}). "
                            f"Batch size={orig.shape[0]}, shape={list(orig.shape)}")

            orig   = orig.to(self.device, non_blocking=True)
            resid  = resid.to(self.device, non_blocking=True)
            labels = labels.to(self.device, non_blocking=True)

            amp_ctx = _make_autocast(device_type, self.use_amp)
            with amp_ctx:
                logits = self.model(orig, resid)
                loss   = self.criterion(logits, labels)

            if training and optimizer:
                optimizer.zero_grad(set_to_none=True)
                self.scaler.scale(loss).backward()
                self.scaler.unscale_(optimizer)
                nn.utils.clip_grad_norm_(self.model.parameters(), max_norm=1.0)
                self.scaler.step(optimizer)
                self.scaler.update()

            total_loss += loss.item()
            probs  = torch.softmax(logits, dim=1).detach().cpu().numpy()
            preds  = probs.argmax(axis=1)
            all_preds.extend(preds)
            all_labels.extend(labels.cpu().numpy())
            all_probs.extend(probs[:, 1])  # AI probability

            # Per-batch progress logging (training only)
            if training and self.log_every > 0 and (batch_idx + 1) % self.log_every == 0:
                running_loss = total_loss / (batch_idx + 1)
                logger.info(
                    f"  [Epoch {epoch_num}] Batch {batch_idx + 1}/{n_batches} "
                    f"| loss={loss.item():.4f} (avg={running_loss:.4f})"
                )

        avg_loss = total_loss / max(len(loader), 1)
        metrics  = _compute_metrics(
            np.array(all_labels),
            np.array(all_preds),
            np.array(all_probs),
        )
        return avg_loss, metrics

    def train(
        self,
        num_epochs: int = 50,
        lr: float = 3e-5,
        weight_decay: float = 1e-4,
        warmup_epochs: int = 3,
        patience: int = 10,
        save_every: int = 5,
    ):
        optimizer = optim.AdamW(
            self.model.parameters(), lr=lr, weight_decay=weight_decay, betas=(0.9, 0.999)
        )

        def _lr_lambda(ep):
            if ep < warmup_epochs:
                return (ep + 1) / warmup_epochs
            prog = (ep - warmup_epochs) / max(num_epochs - warmup_epochs, 1)
            return 0.5 * (1 + np.cos(np.pi * prog))  # cosine annealing

        scheduler = optim.lr_scheduler.LambdaLR(optimizer, _lr_lambda)

        # Monitor validation FPR (primary) + F1 (secondary) for early stopping
        stopper = EarlyStopping(patience=patience, min_delta=0.002, mode="min")

        logger.info(f"[Trainer] Starting training: {num_epochs} epochs on {self.device}")
        logger.info(f"[Trainer] Train batches={len(self.train_loader)}  "
                    f"Val batches={len(self.val_loader)}")

        for epoch in range(num_epochs):
            t0 = time.time()

            # Train
            tr_loss, tr_met = self._run_epoch(
                self.train_loader, training=True,
                optimizer=optimizer, scheduler=scheduler,
                epoch_num=epoch + 1,
            )

            # Validate
            val_loss, val_met = self._run_epoch(
                self.val_loader, training=False, epoch_num=epoch + 1,
            )

            scheduler.step()
            epoch_t = time.time() - t0

            # TensorBoard
            self.writer.add_scalar("Loss/train", tr_loss, epoch)
            self.writer.add_scalar("Loss/val",   val_loss, epoch)
            for k in ("accuracy", "f1", "roc_auc", "false_positive_rate"):
                self.writer.add_scalar(f"Val/{k}", val_met[k], epoch)
            self.writer.add_scalar("LR", scheduler.get_last_lr()[0], epoch)

            # Epoch summary
            logger.info(
                f"Ep {epoch+1:03d}/{num_epochs} | "
                f"loss {tr_loss:.4f}->{val_loss:.4f} | "
                f"acc={val_met['accuracy']:.3f} f1={val_met['f1']:.3f} "
                f"fpr={val_met['false_positive_rate']:.3f} "
                f"auc={val_met['roc_auc']:.3f} | "
                f"{epoch_t:.1f}s"
            )

            self.history.append({
                "epoch": epoch + 1,
                "train_loss": tr_loss,
                "val_loss": val_loss,
                **val_met,
            })

            # Checkpoint -- save best based on: lowest FPR at acceptable F1
            is_best = (
                val_met["false_positive_rate"] < self.best_fpr
                and val_met["f1"] >= max(self.best_f1 * 0.95, 0.5)
            )
            if is_best:
                self.best_fpr     = val_met["false_positive_rate"]
                self.best_f1      = val_met["f1"]
                self.best_metrics = val_met
                self._save(epoch, val_met, is_best=True)
                logger.info(f"  New best -- FPR={self.best_fpr:.3f}  F1={self.best_f1:.3f}")

            if (epoch + 1) % save_every == 0:
                self._save(epoch, val_met, is_best=False)

            # Early stopping on FPR
            if stopper(val_met["false_positive_rate"], self.model):
                logger.info(f"[Trainer] Early stop at epoch {epoch+1}")
                break

        # Always save a final checkpoint so the pipeline always produces output
        self._save(epoch, val_met if self.history else {}, is_best=False)

        self.writer.close()
        self._save_history()

        logger.info(f"[Trainer] Done. Best FPR={self.best_fpr:.4f}  F1={self.best_f1:.4f}")
        return self.best_metrics or (self.history[-1] if self.history else {})

    def _save(self, epoch: int, metrics: Dict, is_best: bool):
        # Detect architecture name from model type
        arch = (
            ARCHITECTURE_DEBUG if isinstance(self.model, DebugSingleBranchNet)
            else ARCHITECTURE
        )
        ckpt = {
            "epoch":            epoch + 1,
            "architecture":     arch,
            "class_names":      CLASS_NAMES,
            "model_state_dict": self.model.state_dict(),
            "val_metrics":      metrics,
            "temperature":      1.0,        # placeholder; updated by calibration step
        }
        path = self.output_dir / CHECKPOINT_FILENAME
        torch.save(ckpt, path)
        if is_best:
            logger.info(f"  Saved checkpoint -> {path}")

    def _save_history(self):
        with open(self.output_dir / "training_history.json", "w") as f:
            json.dump(self.history, f, indent=2)

    def run_test_evaluation(self) -> Dict:
        """Evaluate on the held-out test set and return full metrics."""
        _, test_met = self._run_epoch(self.test_loader, training=False)
        logger.info(
            f"[Test] acc={test_met['accuracy']:.4f} "
            f"f1={test_met['f1']:.4f} "
            f"fpr={test_met['false_positive_rate']:.4f} "
            f"auc={test_met['roc_auc']:.4f}"
        )
        path = self.output_dir / "test_metrics.json"
        with open(path, "w") as f:
            json.dump(test_met, f, indent=2)
        return test_met


# -----------------------------------------------------------------------------
# CLI entry-point
# -----------------------------------------------------------------------------

def _parse_args():
    p = argparse.ArgumentParser(
        description="Train forensic AI detector (dual-branch EfficientNet or debug MobileNet)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
CPU DEBUG MODE (fast pipeline check, ~3-8 min):
  python -m training.train \\
      --real-dirs datasets/real --ai-dirs datasets/ai \\
      --output inference/checkpoints \\
      --epochs 1 --batch-size 4 --num-workers 0 \\
      --max-train-samples 200 \\
      --disable-augmentations --debug-small-model
""",
    )

    # Data
    p.add_argument("--real-dirs",  nargs="+", default=[], metavar="DIR",
                   help="Directories containing REAL camera images")
    p.add_argument("--ai-dirs",    nargs="+", default=[], metavar="DIR",
                   help="Directories containing AI-generated images")
    p.add_argument("--root-dirs",  nargs="+", default=[], metavar="DIR",
                   help="Root dirs with real/ and ai/ sub-folders (CIFAKE layout, etc.)")
    p.add_argument("--csv-files",  nargs="+", default=[], metavar="CSV",
                   help="CSV manifest files (image_path,label)")
    p.add_argument("--hf-dataset", type=str, default=None,
                   help="HuggingFace dataset name (requires `datasets` package)")
    p.add_argument("--max-real",   type=int, default=None, help="Cap on real samples")
    p.add_argument("--max-ai",     type=int, default=None, help="Cap on AI samples")
    p.add_argument("--val-split",  type=float, default=0.15)
    p.add_argument("--test-split", type=float, default=0.05)
    p.add_argument("--seed",       type=int, default=42)

    # Training
    p.add_argument("--epochs",      type=int,   default=50)
    p.add_argument("--batch-size",  type=int,   default=32)
    p.add_argument("--lr",          type=float, default=3e-5)
    p.add_argument("--weight-decay",type=float, default=1e-4)
    p.add_argument("--fp-weight",   type=float, default=2.5,
                   help="Penalty multiplier for false positives (real->AI errors)")
    p.add_argument("--warmup",      type=int,   default=3,
                   help="LR warmup epochs")
    p.add_argument("--patience",    type=int,   default=10,
                   help="Early stopping patience (epochs)")
    p.add_argument("--save-every",  type=int,   default=5)
    p.add_argument("--num-workers", type=int,   default=4)

    # Debug / lightweight mode
    p.add_argument("--max-train-samples", type=int, default=None,
                   help="Limit training set size for quick debugging (default: unlimited)")
    p.add_argument("--disable-augmentations", action="store_true",
                   help="Skip heavy augmentations, use only resize+normalize")
    p.add_argument("--debug-small-model", action="store_true",
                   help=(
                       "Use MobileNetV3-Small single-branch model instead of "
                       "EfficientNet-B0 dual-branch. ~10x faster on CPU. "
                       "Also disables AMP/autocast and augmentations automatically."
                   ))

    # Output
    p.add_argument("--output",  type=str, default="backend/inference/checkpoints",
                   help="Checkpoint output directory")
    p.add_argument("--resume",  type=str, default=None,
                   help="Resume from checkpoint path")
    p.add_argument("--no-calibrate", action="store_true",
                   help="Skip temperature calibration after training")

    return p.parse_args()


def main():
    args = _parse_args()

    if not any([args.real_dirs, args.ai_dirs, args.root_dirs, args.csv_files, args.hf_dataset]):
        logger.error(
            "No data source specified. Use --real-dirs / --ai-dirs / --root-dirs / --csv-files"
        )
        sys.exit(1)

    device     = "cuda" if torch.cuda.is_available() else "cpu"
    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)

    # --debug-small-model implies disable-augmentations
    disable_aug = args.disable_augmentations or args.debug_small_model

    # AMP and pin_memory only make sense on CUDA
    use_amp    = (device == "cuda")
    pin_memory = (device == "cuda")

    logger.info("=" * 60)
    logger.info(f"[Setup] Device      : {device}")
    logger.info(f"[Setup] AMP         : {use_amp}")
    logger.info(f"[Setup] pin_memory  : {pin_memory}")
    logger.info(f"[Setup] Debug model : {args.debug_small_model}")
    logger.info(f"[Setup] Augmentations disabled: {disable_aug}")
    if args.max_train_samples:
        logger.info(f"[Setup] max_train_samples: {args.max_train_samples}")
    logger.info("=" * 60)

    # ── Build model ───────────────────────────────────────────────────────────
    t_model_start = time.time()
    if args.debug_small_model:
        logger.info("[Setup] Loading DebugSingleBranchNet (MobileNetV3-Small)...")
        model = DebugSingleBranchNet(pretrained=True).to(device)
        logger.info(f"[Setup] Debug model info: {model.get_info()}")
    else:
        logger.info("[Setup] Loading DualBranchForensicNet (EfficientNet-B0)...")
        model = DualBranchForensicNet(pretrained=True).to(device)
        logger.info(f"[Setup] Model info: {model.get_info()}")
    logger.info(f"[Timing] Model load: {time.time() - t_model_start:.2f}s")

    start_epoch = 0
    if args.resume:
        ckpt = torch.load(args.resume, map_location=device)
        model.load_state_dict(ckpt["model_state_dict"])
        start_epoch = ckpt.get("epoch", 0)
        logger.info(f"Resumed from {args.resume} at epoch {start_epoch}")

    # ── Build dataset ─────────────────────────────────────────────────────────
    t_ds_start = time.time()
    logger.info("[Timing] Starting dataset collection...")

    config = DataConfig(
        real_dirs  = args.real_dirs,
        ai_dirs    = args.ai_dirs,
        root_dirs  = args.root_dirs,
        csv_files  = args.csv_files,
        hf_dataset = args.hf_dataset,
        val_split  = args.val_split,
        test_split = args.test_split,
        max_real   = args.max_real,
        max_ai     = args.max_ai,
        seed       = args.seed,
    )

    augment_fn = None if disable_aug else build_train_augmentation(p_augment=0.85)
    if augment_fn is None:
        logger.info("[Setup] Augmentations: DISABLED (resize+normalize only)")
    else:
        logger.info("[Setup] Augmentations: ENABLED")

    logger.info("[Timing] Building DataLoaders...")
    t_dl_start = time.time()

    train_loader, val_loader, test_loader = build_dataloaders(
        config,
        augment_fn          = augment_fn,
        batch_size          = args.batch_size,
        num_workers         = args.num_workers,
        balance_train       = True,
        max_train_samples   = args.max_train_samples,
        pin_memory          = pin_memory,
    )

    t_dl_done = time.time()
    logger.info(f"[Timing] Dataset collect: {t_dl_done - t_ds_start:.2f}s")
    logger.info(f"[Timing] DataLoader init: {t_dl_done - t_dl_start:.2f}s")
    logger.info(f"[Timing] Train batches={len(train_loader)}  "
                f"Val batches={len(val_loader)}  Test batches={len(test_loader)}")

    # ── Measure first batch load time ─────────────────────────────────────────
    logger.info("[Timing] Loading first batch...")
    t_batch_start = time.time()
    _first_batch = next(iter(train_loader))
    t_batch_done = time.time()
    logger.info(f"[Timing] First batch load: {t_batch_done - t_batch_start:.2f}s  "
                f"(shape: {list(_first_batch[0].shape)})")
    del _first_batch

    # ── Warm up: measure first forward pass ───────────────────────────────────
    logger.info("[Timing] First forward pass (warm-up)...")
    model.eval()
    t_fwd_start = time.time()
    with torch.no_grad():
        _dummy = torch.zeros(args.batch_size, 3, 224, 224, device=device)
        _ = model(_dummy, _dummy)
    t_fwd_done = time.time()
    logger.info(f"[Timing] First forward pass: {t_fwd_done - t_fwd_start:.2f}s")
    del _dummy

    total_startup_s = t_fwd_done - t_model_start
    logger.info(f"[Timing] Total startup (model+data+warmup): {total_startup_s:.1f}s")
    logger.info("=" * 60)

    # ── Train ─────────────────────────────────────────────────────────────────
    trainer = ForensicTrainer(
        model               = model,
        train_loader        = train_loader,
        val_loader          = val_loader,
        test_loader         = test_loader,
        device              = device,
        output_dir          = output_dir,
        fp_weight           = args.fp_weight,
        use_amp             = use_amp,
        log_every_n_batches = _LOG_EVERY_N_BATCHES,
    )
    best_metrics = trainer.train(
        num_epochs    = args.epochs,
        lr            = args.lr,
        weight_decay  = args.weight_decay,
        warmup_epochs = args.warmup,
        patience      = args.patience,
        save_every    = args.save_every,
    )

    # ── Test evaluation ───────────────────────────────────────────────────────
    test_metrics = trainer.run_test_evaluation()

    # ── Temperature calibration ───────────────────────────────────────────────
    if not args.no_calibrate:
        logger.info("[Calibration] Fitting temperature scaler on validation set...")
        try:
            temperature = calibrate_temperature(model, val_loader, device)
            # Update checkpoint with fitted temperature
            ckpt_path = output_dir / CHECKPOINT_FILENAME
            if ckpt_path.exists():
                ckpt = torch.load(str(ckpt_path), map_location="cpu")
                ckpt["temperature"] = temperature
                torch.save(ckpt, ckpt_path)
                logger.info(f"[Calibration] Temperature T={temperature:.4f} saved to checkpoint.")
        except Exception as e:
            logger.warning(f"[Calibration] Skipped: {e}")

    logger.info("=" * 60)
    logger.info(f"Training complete.  Checkpoint: {output_dir / CHECKPOINT_FILENAME}")
    logger.info(f"Best val  -- FPR={best_metrics.get('false_positive_rate', '?')}  "
                f"F1={best_metrics.get('f1', '?')}  "
                f"AUC={best_metrics.get('roc_auc', '?')}")
    logger.info(f"Test      -- acc={test_metrics.get('accuracy', '?')}  "
                f"F1={test_metrics.get('f1', '?')}")
    if args.debug_small_model:
        logger.info("")
        logger.info("[DEBUG] Pipeline verified successfully with MobileNetV3-Small.")
        logger.info("[DEBUG] For production training, remove --debug-small-model")
        logger.info("[DEBUG] and re-run with the full dataset.")
    logger.info("=" * 60)


if __name__ == "__main__":
    main()
