"""
Forensic Binary Dataset Pipeline
Supports multiple dataset formats for real-vs-AI binary classification.

Supported sources
─────────────────
1. Standard binary folder layout
     root/real/<images>   root/ai/<images>
     root/camera/<imgs>   root/generated/<imgs>
     root/REAL/<imgs>     root/FAKE/<imgs>

2. CIFAKE (Kaggle)
     CIFAKE/train/REAL/  CIFAKE/train/FAKE/
     CIFAKE/test/REAL/   CIFAKE/test/FAKE/

3. CSV / TSV manifest
     image_path,label      (label: 0=real, 1=ai  OR  "real"/"ai")

4. HuggingFace datasets  (requires `datasets` library)
     dataset_name, split, image_column, label_column

Each sample returns (original_tensor, residual_tensor, label).
The residual image is computed fresh per-sample using the same algorithm
as the inference pipeline (preprocess.py), so training and inference
operate on identical representations.
"""

import csv
import logging
import os
import random
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Union

import cv2
import numpy as np
import torch
from PIL import Image
from torch.utils.data import Dataset, DataLoader, WeightedRandomSampler

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# Constants
# ─────────────────────────────────────────────────────────────────────────────

REAL_IDX = 0
AI_IDX   = 1

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tiff", ".tif"}

# CIFAKE / standard "real" folder aliases
REAL_FOLDER_NAMES = {"real", "camera", "genuine", "authentic", "REAL", "live", "photo"}
AI_FOLDER_NAMES   = {"ai", "fake", "generated", "synthetic", "FAKE", "AI", "diffusion", "gan"}

TARGET_SIZE = (224, 224)

# Residual parameters must match inference/preprocess.py exactly
RESIDUAL_AMPLIFY = 6.0
BLUR_KERNEL      = (5, 5)
BLUR_SIGMA       = 1.2

# ImageNet normalisation
_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
_STD  = np.array([0.229, 0.224, 0.225], dtype=np.float32)


# ─────────────────────────────────────────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class DataConfig:
    """
    Describes where the training/validation data lives.
    At least one of the source options must be provided.
    """
    # Standard folder sources
    real_dirs:  List[str] = field(default_factory=list)  # dirs of real images
    ai_dirs:    List[str] = field(default_factory=list)  # dirs of AI images

    # Automatically-detected binary root (contains real/ and ai/ subfolders)
    root_dirs:  List[str] = field(default_factory=list)

    # CSV manifest: rows of (image_path, label)
    csv_files:  List[str] = field(default_factory=list)

    # HuggingFace dataset
    hf_dataset: Optional[str]      = None
    hf_split:   str                = "train"
    hf_image_col:  str             = "image"
    hf_label_col:  str             = "label"
    hf_label_map:  Dict[int, int]  = field(default_factory=dict)  # {hf_val: REAL/AI_IDX}

    # Split ratios (applied when val/test split requested)
    val_split:  float = 0.15
    test_split: float = 0.05

    # Optional per-source sample caps
    max_real: Optional[int] = None
    max_ai:   Optional[int] = None

    # Seed for reproducible splits
    seed: int = 42


# ─────────────────────────────────────────────────────────────────────────────
# Preprocessing helpers (identical to inference/preprocess.py)
# ─────────────────────────────────────────────────────────────────────────────

def _pil_to_array(pil_img: Image.Image, size: Tuple[int, int] = TARGET_SIZE) -> np.ndarray:
    arr = np.array(pil_img.resize(size, Image.LANCZOS), dtype=np.float32)
    return arr  # (H, W, 3) in [0, 255]


def _normalize(arr: np.ndarray) -> np.ndarray:
    """ImageNet normalize float32 (H, W, 3) → (3, H, W)."""
    arr = arr / 255.0
    arr = (arr - _MEAN) / _STD
    return arr.transpose(2, 0, 1).astype(np.float32)  # (3, H, W)


def _compute_residual(arr: np.ndarray) -> np.ndarray:
    """Compute amplified high-frequency residual. arr: (H, W, 3) float32 in [0,255]."""
    blurred = np.stack(
        [cv2.GaussianBlur(arr[:, :, c], BLUR_KERNEL, BLUR_SIGMA) for c in range(3)],
        axis=2,
    )
    residual = (arr - blurred) * RESIDUAL_AMPLIFY
    return np.clip(residual + 128.0, 0.0, 255.0).astype(np.float32)


def image_to_tensors(pil_img: Image.Image) -> Tuple[torch.Tensor, torch.Tensor]:
    """
    Convert a PIL image → (original_tensor, residual_tensor).
    Both are (3, 224, 224) float32, ImageNet-normalized.
    """
    arr = _pil_to_array(pil_img)
    orig_t  = torch.from_numpy(_normalize(arr))
    resid_t = torch.from_numpy(_normalize(_compute_residual(arr)))
    return orig_t, resid_t


# ─────────────────────────────────────────────────────────────────────────────
# Sample collector
# ─────────────────────────────────────────────────────────────────────────────

def _collect_images_from_dir(directory: Union[str, Path]) -> List[Path]:
    d = Path(directory)
    if not d.exists():
        logger.warning(f"[Dataset] Directory not found: {d}")
        return []
    imgs = [p for p in d.rglob("*") if p.suffix.lower() in IMAGE_EXTENSIONS]
    logger.info(f"[Dataset]   {d.name}: {len(imgs)} images")
    return imgs


def _detect_binary_root(root: Union[str, Path]) -> Tuple[List[Path], List[Path]]:
    """
    Auto-detect real/ai subfolders inside root.
    Returns (real_paths, ai_paths).
    """
    root = Path(root)
    real, ai = [], []
    for sub in root.iterdir():
        if not sub.is_dir():
            continue
        name = sub.name.lower()
        if sub.name in REAL_FOLDER_NAMES or name in {n.lower() for n in REAL_FOLDER_NAMES}:
            real.extend(_collect_images_from_dir(sub))
        elif sub.name in AI_FOLDER_NAMES or name in {n.lower() for n in AI_FOLDER_NAMES}:
            ai.extend(_collect_images_from_dir(sub))
    return real, ai


def _load_csv_manifest(csv_path: Union[str, Path]) -> List[Tuple[Path, int]]:
    """Parse a CSV with (image_path, label) rows. label can be int or string."""
    samples = []
    csv_path = Path(csv_path)
    with open(csv_path, newline="") as f:
        reader = csv.reader(f)
        header = next(reader, None)
        for row in reader:
            if len(row) < 2:
                continue
            img_path = Path(row[0].strip())
            raw_label = row[1].strip().lower()
            if raw_label in ("0", "real", "camera", "genuine"):
                label = REAL_IDX
            elif raw_label in ("1", "ai", "fake", "generated", "synthetic"):
                label = AI_IDX
            else:
                continue
            samples.append((img_path, label))
    logger.info(f"[Dataset] CSV {csv_path.name}: {len(samples)} samples")
    return samples


def _load_hf_dataset(config: DataConfig) -> List[Tuple[Path, int]]:
    """Load from HuggingFace datasets library. Images saved to /tmp."""
    try:
        from datasets import load_dataset
    except ImportError:
        logger.error("[Dataset] `datasets` library not installed. pip install datasets")
        return []

    import tempfile
    ds = load_dataset(config.hf_dataset, split=config.hf_split)
    tmp_dir = Path(tempfile.mkdtemp(prefix="hf_ds_"))
    samples = []
    label_map = config.hf_label_map

    for i, item in enumerate(ds):
        raw_label = item[config.hf_label_col]
        if label_map:
            label = label_map.get(raw_label)
            if label is None:
                continue
        else:
            label = int(raw_label)
            if label not in (REAL_IDX, AI_IDX):
                continue

        img = item[config.hf_image_col]
        if not isinstance(img, Image.Image):
            img = Image.fromarray(img)
        if img.mode != "RGB":
            img = img.convert("RGB")

        out = tmp_dir / f"{i}.jpg"
        img.save(out, "JPEG", quality=95)
        samples.append((out, label))

    logger.info(f"[Dataset] HF {config.hf_dataset}: {len(samples)} samples")
    return samples


def collect_all_samples(config: DataConfig) -> List[Tuple[Path, int]]:
    """Gather (path, label) pairs from all configured sources."""
    rng = random.Random(config.seed)

    real_paths: List[Path] = []
    ai_paths:   List[Path] = []

    # Explicit real/ai dirs
    for d in config.real_dirs:
        real_paths.extend(_collect_images_from_dir(d))
    for d in config.ai_dirs:
        ai_paths.extend(_collect_images_from_dir(d))

    # Auto-detect from root dirs
    for d in config.root_dirs:
        r, a = _detect_binary_root(d)
        real_paths.extend(r)
        ai_paths.extend(a)

    # Apply caps
    if config.max_real and len(real_paths) > config.max_real:
        rng.shuffle(real_paths)
        real_paths = real_paths[: config.max_real]
    if config.max_ai and len(ai_paths) > config.max_ai:
        rng.shuffle(ai_paths)
        ai_paths = ai_paths[: config.max_ai]

    samples: List[Tuple[Path, int]] = (
        [(p, REAL_IDX) for p in real_paths] +
        [(p, AI_IDX)   for p in ai_paths]
    )

    # CSV manifests
    for csv_file in config.csv_files:
        samples.extend(_load_csv_manifest(csv_file))

    # HuggingFace
    if config.hf_dataset:
        samples.extend(_load_hf_dataset(config))

    if not samples:
        raise ValueError(
            "No samples found. Check DataConfig: real_dirs, ai_dirs, root_dirs, or csv_files."
        )

    rng.shuffle(samples)

    n_real = sum(1 for _, l in samples if l == REAL_IDX)
    n_ai   = sum(1 for _, l in samples if l == AI_IDX)
    logger.info(f"[Dataset] Total: {len(samples)} — real={n_real} ai={n_ai}")
    return samples


def split_samples(
    samples: List[Tuple[Path, int]],
    val_split: float = 0.15,
    test_split: float = 0.05,
    seed: int = 42,
) -> Tuple[List, List, List]:
    """Stratified split into (train, val, test)."""
    rng = random.Random(seed)
    real = [s for s in samples if s[1] == REAL_IDX]
    ai   = [s for s in samples if s[1] == AI_IDX]

    def _split_one(lst):
        n     = len(lst)
        n_val  = max(1, int(n * val_split))
        n_test = max(1, int(n * test_split))
        rng.shuffle(lst)
        test  = lst[:n_test]
        val   = lst[n_test:n_test + n_val]
        train = lst[n_test + n_val:]
        return train, val, test

    r_tr, r_va, r_te = _split_one(real)
    a_tr, a_va, a_te = _split_one(ai)

    train = r_tr + a_tr; rng.shuffle(train)
    val   = r_va + a_va; rng.shuffle(val)
    test  = r_te + a_te; rng.shuffle(test)
    return train, val, test


# ─────────────────────────────────────────────────────────────────────────────
# Dataset
# ─────────────────────────────────────────────────────────────────────────────

class ForensicBinaryDataset(Dataset):
    """
    Binary real-vs-AI forensic dataset.
    Returns (original_tensor, residual_tensor, label).
    """

    def __init__(
        self,
        samples: List[Tuple[Path, int]],
        augment_fn=None,     # callable(pil_img, label) → pil_img
        validate: bool = False,
    ):
        self.samples    = samples
        self.augment_fn = augment_fn

        if validate:
            self.samples = self._validate(samples)

    @staticmethod
    def _validate(samples: List[Tuple[Path, int]]) -> List[Tuple[Path, int]]:
        valid = []
        for path, label in samples:
            try:
                with Image.open(path) as img:
                    img.verify()
                valid.append((path, label))
            except Exception:
                logger.warning(f"[Dataset] Skipping corrupt: {path}")
        logger.info(f"[Dataset] Validated: {len(valid)}/{len(samples)} OK")
        return valid

    def __len__(self) -> int:
        return len(self.samples)

    def __getitem__(self, idx: int) -> Tuple[torch.Tensor, torch.Tensor, int]:
        path, label = self.samples[idx]
        try:
            with Image.open(path) as img:
                pil_img = img.convert("RGB")
        except Exception as e:
            logger.error(f"[Dataset] Failed to load {path}: {e}")
            return (
                torch.zeros(3, 224, 224),
                torch.zeros(3, 224, 224),
                label,
            )

        # Apply forensic-safe augmentation BEFORE computing residual
        # (so the residual reflects the augmented image, not the original)
        if self.augment_fn is not None:
            pil_img = self.augment_fn(pil_img, label)

        orig_t, resid_t = image_to_tensors(pil_img)
        return orig_t, resid_t, label

    def class_weights(self) -> torch.Tensor:
        """Per-sample weights for WeightedRandomSampler (balance classes)."""
        n_real = sum(1 for _, l in self.samples if l == REAL_IDX)
        n_ai   = sum(1 for _, l in self.samples if l == AI_IDX)
        n_total = len(self.samples)
        w_real = n_total / (2 * max(n_real, 1))
        w_ai   = n_total / (2 * max(n_ai, 1))
        return torch.tensor(
            [w_real if l == REAL_IDX else w_ai for _, l in self.samples]
        )

    def label_counts(self) -> Dict[str, int]:
        return {
            "REAL_CAMERA":  sum(1 for _, l in self.samples if l == REAL_IDX),
            "AI_GENERATED": sum(1 for _, l in self.samples if l == AI_IDX),
        }


# ─────────────────────────────────────────────────────────────────────────────
# DataLoader factory
# ─────────────────────────────────────────────────────────────────────────────

def build_dataloaders(
    config: DataConfig,
    augment_fn=None,
    batch_size: int = 32,
    num_workers: int = 4,
    balance_train: bool = True,
    max_train_samples: Optional[int] = None,
    pin_memory: bool = True,
) -> Tuple[DataLoader, DataLoader, DataLoader]:
    """
    Build train, val, test DataLoaders from a DataConfig.

    Args:
        config             : DataConfig specifying data sources and split ratios
        augment_fn         : optional augmentation callable(pil, label) → pil
        batch_size         : mini-batch size
        num_workers        : DataLoader workers (set 0 on CPU to avoid overhead)
        balance_train      : use WeightedRandomSampler to balance classes
        max_train_samples  : cap training set size for debug runs (None = unlimited)
        pin_memory         : enable pinned memory (set False on CPU-only machines)

    Returns:
        (train_loader, val_loader, test_loader)
    """
    all_samples = collect_all_samples(config)
    train_s, val_s, test_s = split_samples(
        all_samples, config.val_split, config.test_split, config.seed
    )

    # Optionally cap the training set (debug / quick-validation mode)
    if max_train_samples is not None and len(train_s) > max_train_samples:
        rng = random.Random(config.seed)
        rng.shuffle(train_s)
        train_s = train_s[:max_train_samples]
        logger.info(f"[Dataset] max_train_samples={max_train_samples}: train capped to {len(train_s)}")

    train_ds = ForensicBinaryDataset(train_s, augment_fn=augment_fn, validate=False)
    val_ds   = ForensicBinaryDataset(val_s,   augment_fn=None,       validate=False)
    test_ds  = ForensicBinaryDataset(test_s,  augment_fn=None,       validate=False)

    logger.info(f"[Dataset] Train={len(train_ds)} Val={len(val_ds)} Test={len(test_ds)}")
    for split_name, ds in [("train", train_ds), ("val", val_ds), ("test", test_ds)]:
        logger.info(f"[Dataset]   {split_name}: {ds.label_counts()}")

    train_sampler = None
    shuffle_train = True
    if balance_train and len(train_ds) > 0:
        weights = train_ds.class_weights()
        train_sampler = WeightedRandomSampler(weights, num_samples=len(weights), replacement=True)
        shuffle_train = False

    train_loader = DataLoader(
        train_ds, batch_size=batch_size, sampler=train_sampler,
        shuffle=shuffle_train, num_workers=num_workers,
        pin_memory=pin_memory, drop_last=True, persistent_workers=num_workers > 0,
    )
    val_loader = DataLoader(
        val_ds, batch_size=batch_size, shuffle=False,
        num_workers=num_workers, pin_memory=pin_memory, drop_last=False,
        persistent_workers=num_workers > 0,
    )
    test_loader = DataLoader(
        test_ds, batch_size=batch_size, shuffle=False,
        num_workers=num_workers, pin_memory=pin_memory, drop_last=False,
        persistent_workers=num_workers > 0,
    )

    return train_loader, val_loader, test_loader
