"""
Evaluation Module — Dual-Branch Forensic Detector
──────────────────────────────────────────────────────────────────────────────
Can be run standalone or called by the API endpoint /evaluate-model.

Usage:
    python evaluate.py \
        --checkpoint backend/inference/checkpoints/forensic_detector.pth \
        --real-dirs datasets/test/real \
        --ai-dirs   datasets/test/ai \
        --output    evaluation_results.json
──────────────────────────────────────────────────────────────────────────────
"""

import argparse
import json
import logging
import sys
from pathlib import Path
from typing import Dict, List, Optional

import numpy as np
import torch
from torch.utils.data import DataLoader

_BACKEND = Path(__file__).resolve().parent.parent
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from training.dual_branch_model import DualBranchForensicNet, ARCHITECTURE, CLASS_NAMES
from training.dataset import DataConfig, build_dataloaders, ForensicBinaryDataset, collect_all_samples, split_samples
from training.calibration import apply_calibration, compute_calibration_error

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")


# ─────────────────────────────────────────────────────────────────────────────
# Checkpoint loading
# ─────────────────────────────────────────────────────────────────────────────

def load_checkpoint(
    checkpoint_path: str,
    device: Optional[str] = None,
) -> tuple:
    """
    Load model and metadata from a checkpoint file.

    Returns:
        (model, temperature, metadata_dict)
    """
    if device is None:
        device = "cuda" if torch.cuda.is_available() else "cpu"

    path = Path(checkpoint_path)
    if not path.exists():
        raise FileNotFoundError(f"Checkpoint not found: {path}")

    ckpt = torch.load(str(path), map_location=device)

    # Architecture must match DualBranchForensicNet
    arch = ckpt.get("architecture", "unknown")
    if arch != ARCHITECTURE:
        logger.warning(f"[Evaluate] Checkpoint architecture '{arch}' != '{ARCHITECTURE}'")

    model = DualBranchForensicNet(pretrained=False).to(device)
    state = ckpt.get("model_state_dict", ckpt)
    model.load_state_dict(state, strict=True)
    model.eval()

    temperature = float(ckpt.get("temperature", 1.0))
    metadata = {
        "epoch":        ckpt.get("epoch"),
        "architecture": arch,
        "class_names":  ckpt.get("class_names", CLASS_NAMES),
        "temperature":  temperature,
        "val_metrics":  ckpt.get("val_metrics", {}),
    }
    logger.info(f"[Evaluate] Loaded checkpoint from epoch {metadata['epoch']} (T={temperature:.4f})")
    return model, temperature, metadata


# ─────────────────────────────────────────────────────────────────────────────
# Inference pass
# ─────────────────────────────────────────────────────────────────────────────

@torch.no_grad()
def run_inference(
    model: DualBranchForensicNet,
    loader: DataLoader,
    device: str,
    temperature: float = 1.0,
) -> Dict[str, np.ndarray]:
    """
    Run a full inference pass over `loader`.

    Returns dict with:
        labels       : (N,) ground truth
        preds        : (N,) predictions
        probs_real   : (N,) calibrated REAL_CAMERA probability
        probs_ai     : (N,) calibrated AI_GENERATED probability
    """
    model.eval()
    all_labels, all_probs = [], []

    for orig, resid, labels in loader:
        orig  = orig.to(device)
        resid = resid.to(device)
        logits = model(orig, resid)               # (B, 2)
        probs  = torch.softmax(logits / temperature, dim=1).cpu().numpy()
        all_probs.extend(probs)
        all_labels.extend(labels.numpy())

    all_probs  = np.array(all_probs)   # (N, 2)
    all_labels = np.array(all_labels)  # (N,)
    all_preds  = all_probs.argmax(axis=1)

    return {
        "labels":     all_labels,
        "preds":      all_preds,
        "probs_real": all_probs[:, 0],
        "probs_ai":   all_probs[:, 1],
    }


# ─────────────────────────────────────────────────────────────────────────────
# Metrics computation
# ─────────────────────────────────────────────────────────────────────────────

def compute_full_metrics(inference_output: Dict) -> Dict:
    """
    Compute accuracy, precision, recall, F1, ROC-AUC, FPR, and ECE.

    Priority metric: false_positive_rate (real → AI errors).
    """
    from sklearn.metrics import (
        accuracy_score, precision_score, recall_score,
        f1_score, roc_auc_score, confusion_matrix,
        classification_report, average_precision_score,
    )

    labels   = inference_output["labels"]
    preds    = inference_output["preds"]
    probs_ai = inference_output["probs_ai"]

    # Core metrics
    acc  = float(accuracy_score(labels, preds))
    prec = float(precision_score(labels, preds, zero_division=0))
    rec  = float(recall_score(labels, preds, zero_division=0))
    f1   = float(f1_score(labels, preds, zero_division=0))

    try:
        auc = float(roc_auc_score(labels, probs_ai))
    except Exception:
        auc = 0.0

    try:
        ap = float(average_precision_score(labels, probs_ai))
    except Exception:
        ap = 0.0

    cm = confusion_matrix(labels, preds, labels=[0, 1])
    if cm.size == 4:
        tn, fp, fn, tp = cm.ravel()
    else:
        tn = fp = fn = tp = 0

    fpr = float(fp) / max(int(fp + tn), 1)   # false positive rate
    fnr = float(fn) / max(int(fn + tp), 1)   # false negative rate

    # Per-class
    report = classification_report(labels, preds, target_names=CLASS_NAMES, output_dict=True, zero_division=0)

    # Calibration error
    ece, _, _ = compute_calibration_error(probs_ai, labels)

    return {
        "accuracy":            acc,
        "precision":           prec,
        "recall":              rec,
        "f1":                  f1,
        "roc_auc":             auc,
        "average_precision":   ap,
        "false_positive_rate": fpr,
        "false_negative_rate": fnr,
        "expected_calibration_error": float(ece),
        "confusion_matrix": cm.tolist(),
        "TP": int(tp), "TN": int(tn), "FP": int(fp), "FN": int(fn),
        "total_samples": int(len(labels)),
        "real_samples":  int(np.sum(labels == 0)),
        "ai_samples":    int(np.sum(labels == 1)),
        "per_class": {
            "REAL_CAMERA":  report.get("REAL_CAMERA", {}),
            "AI_GENERATED": report.get("AI_GENERATED", {}),
        },
    }


# ─────────────────────────────────────────────────────────────────────────────
# Threshold sweep (find optimal operating point)
# ─────────────────────────────────────────────────────────────────────────────

def find_optimal_threshold(
    probs_ai: np.ndarray,
    labels: np.ndarray,
    max_fpr: float = 0.05,
) -> Dict:
    """
    Sweep the classification threshold and find the point that maximises F1
    while keeping FPR ≤ max_fpr.

    Returns:
        {threshold, f1, fpr, fnr, precision, recall}
    """
    best = {"threshold": 0.5, "f1": 0.0, "fpr": 1.0, "fnr": 1.0}

    for t in np.linspace(0.3, 0.95, 130):
        preds   = (probs_ai >= t).astype(int)
        tp = int(((preds == 1) & (labels == 1)).sum())
        fp = int(((preds == 1) & (labels == 0)).sum())
        fn = int(((preds == 0) & (labels == 1)).sum())
        tn = int(((preds == 0) & (labels == 0)).sum())

        fpr = fp / max(fp + tn, 1)
        fnr = fn / max(fn + tp, 1)
        prec = tp / max(tp + fp, 1)
        rec  = tp / max(tp + fn, 1)
        f1   = 2 * prec * rec / max(prec + rec, 1e-9)

        if fpr <= max_fpr and f1 > best["f1"]:
            best = {
                "threshold": float(t),
                "f1":        float(f1),
                "fpr":       float(fpr),
                "fnr":       float(fnr),
                "precision": float(prec),
                "recall":    float(rec),
            }

    return best


# ─────────────────────────────────────────────────────────────────────────────
# Main evaluation function (called by API and CLI)
# ─────────────────────────────────────────────────────────────────────────────

def evaluate(
    checkpoint_path: str,
    real_dirs: List[str] = None,
    ai_dirs:   List[str] = None,
    root_dirs: List[str] = None,
    csv_files: List[str] = None,
    batch_size: int = 32,
    num_workers: int = 2,
    max_fpr_target: float = 0.05,
    device: Optional[str] = None,
) -> Dict:
    """
    Full evaluation pipeline.

    Args:
        checkpoint_path : path to .pth checkpoint
        real_dirs       : directories with real images
        ai_dirs         : directories with AI images
        root_dirs       : root dirs with real/ and ai/ sub-folders
        csv_files       : CSV manifest files
        batch_size      : inference batch size
        num_workers     : DataLoader workers
        max_fpr_target  : threshold sweep target max FPR
        device          : "cuda" / "cpu" / None (auto)

    Returns:
        Full evaluation dict ready for JSON serialization.
    """
    if device is None:
        device = "cuda" if torch.cuda.is_available() else "cpu"

    model, temperature, ckpt_meta = load_checkpoint(checkpoint_path, device)

    # Build test dataset from all provided dirs (no train/val split here)
    config = DataConfig(
        real_dirs = real_dirs or [],
        ai_dirs   = ai_dirs   or [],
        root_dirs = root_dirs or [],
        csv_files = csv_files or [],
    )

    all_samples = collect_all_samples(config)
    dataset = ForensicBinaryDataset(all_samples, augment_fn=None, validate=False)

    loader = DataLoader(
        dataset,
        batch_size=batch_size,
        shuffle=False,
        num_workers=num_workers,
        pin_memory=True,
    )

    logger.info(f"[Evaluate] {len(dataset)} samples, T={temperature:.4f}")
    inference_output = run_inference(model, loader, device, temperature)

    metrics = compute_full_metrics(inference_output)
    optimal = find_optimal_threshold(
        inference_output["probs_ai"],
        inference_output["labels"],
        max_fpr=max_fpr_target,
    )

    result = {
        "checkpoint":       str(checkpoint_path),
        "architecture":     ckpt_meta["architecture"],
        "temperature":      temperature,
        "device":           device,
        **metrics,
        "optimal_threshold": optimal,
        "checkpoint_meta":  ckpt_meta,
    }
    return result


# ─────────────────────────────────────────────────────────────────────────────
# CLI
# ─────────────────────────────────────────────────────────────────────────────

def _parse_args():
    p = argparse.ArgumentParser(description="Evaluate forensic AI detector checkpoint")
    p.add_argument("--checkpoint", required=True, help="Path to .pth checkpoint")
    p.add_argument("--real-dirs",  nargs="+", default=[], metavar="DIR")
    p.add_argument("--ai-dirs",    nargs="+", default=[], metavar="DIR")
    p.add_argument("--root-dirs",  nargs="+", default=[], metavar="DIR")
    p.add_argument("--csv-files",  nargs="+", default=[], metavar="CSV")
    p.add_argument("--batch-size", type=int, default=32)
    p.add_argument("--num-workers",type=int, default=2)
    p.add_argument("--max-fpr",    type=float, default=0.05,
                   help="Target max FPR for threshold sweep")
    p.add_argument("--output",     type=str, default=None,
                   help="JSON output file path")
    return p.parse_args()


def main():
    args = _parse_args()

    result = evaluate(
        checkpoint_path = args.checkpoint,
        real_dirs       = args.real_dirs,
        ai_dirs         = args.ai_dirs,
        root_dirs       = args.root_dirs,
        csv_files       = args.csv_files,
        batch_size      = args.batch_size,
        num_workers     = args.num_workers,
        max_fpr_target  = args.max_fpr,
    )

    # Print summary
    print("\n" + "=" * 60)
    print(f"  FORENSIC DETECTOR EVALUATION RESULTS")
    print("=" * 60)
    for key in ("accuracy", "precision", "recall", "f1", "roc_auc",
                "false_positive_rate", "false_negative_rate",
                "expected_calibration_error"):
        print(f"  {key:35s}: {result[key]:.4f}")
    print(f"\n  Confusion matrix (REAL=0, AI=1):")
    for row in result["confusion_matrix"]:
        print(f"    {row}")
    print(f"\n  Optimal threshold (FPR ≤ {args.max_fpr}):")
    opt = result["optimal_threshold"]
    print(f"    threshold={opt['threshold']:.3f}  FPR={opt['fpr']:.4f}  F1={opt['f1']:.4f}")
    print("=" * 60)

    if args.output:
        out = Path(args.output)
        out.parent.mkdir(parents=True, exist_ok=True)
        with open(out, "w") as f:
            json.dump(result, f, indent=2)
        print(f"\nResults saved to {out}")


if __name__ == "__main__":
    main()
