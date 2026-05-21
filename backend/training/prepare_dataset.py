"""
Dataset Preparation Script  (v4 — high-quality real + photorealistic AI)
=========================================================================
Downloads and organises training data for the dual-branch AI detector.

WHY we replaced CIFAR-10
-------------------------
CIFAR-10 images are 32x32 pixels.  When upscaled to 224x224 for training
the bilinear interpolation fills the residual/noise branch with smooth
upscale artefacts, not real sensor noise.  The model learns wrong noise
characteristics and fails on genuine camera photos.

REAL image sources  (full-resolution camera photos)
----------------------------------------------------
  Primary:   COCO 2017 val  (5 000 high-res real-world photos)
             Direct download: images.cocodataset.org/zips/val2017.zip
             Typical size: 640x480 — 3 000x2 000  (no upscale artefacts)

  Secondary: Flickr30k  via HuggingFace streaming  (nlphuji/flickr30k)
             31 000 high-res photographs from Flickr cameras
             col='image'

  Tertiary:  Flickr8k  via HuggingFace streaming  (jxie/flickr8k)
             8 000 real photographs — fallback if Flickr30k fails

AI-GENERATED image sources
--------------------------
  Primary:   poloclub/diffusiondb  via direct ZIP download
             Parts 1-15  (~1 000 SD-1.5 images per part)
             URL: huggingface.co/datasets/poloclub/diffusiondb/resolve/main/images/

  Secondary: bitmind/ai-image-detection  via HuggingFace streaming
             240 000+ AI images from SD, MidJourney, DALL-E, GAN
             label=1 subset used (AI-generated images only)
             col='image', label=1

Manual override
---------------
Place images directly (skips all downloads):
    backend/datasets/real/   -- camera JPEGs (.jpg / .png)
    backend/datasets/ai/     -- AI-generated JPEGs

Quick start
-----------
    # Clear old CIFAR images and download fresh high-quality data:
    python -m training.prepare_dataset --clear-cifar

    # Full run (COCO + DiffusionDB, ~2.5 GB download):
    python -m training.prepare_dataset --max-real 5000 --max-ai 5000

    # Debug / small test:
    python -m training.prepare_dataset --max-real 200 --max-ai 200

    # Probe sources first:
    python -m training.prepare_dataset --probe

    # Check existing counts:
    python -m training.prepare_dataset --summary-only
"""

from __future__ import annotations

import argparse
import io
import logging
import os
import random
import sys
import urllib.request
import zipfile
from pathlib import Path
from typing import List, Optional, Tuple

# ── Force UTF-8 output on Windows ─────────────────────────────────────────────
if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

os.environ.setdefault("PYTHONIOENCODING", "utf-8")
os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("prepare_dataset")

# ── Paths ─────────────────────────────────────────────────────────────────────
_HERE    = Path(__file__).resolve().parent
_BACKEND = _HERE.parent
REAL_DIR = _BACKEND / "datasets" / "real"
AI_DIR   = _BACKEND / "datasets" / "ai"
CACHE    = _BACKEND / "datasets" / ".cache"

IMG_EXTS = {".jpg", ".jpeg", ".png", ".webp"}

# ── PIL ───────────────────────────────────────────────────────────────────────
try:
    from PIL import Image as _PILImage
    PIL_OK = True
except ImportError:
    PIL_OK = False
    logger.warning("Pillow not installed.  Run:  pip install Pillow")


# ─────────────────────────────────────────────────────────────────────────────
# Shared helpers
# ─────────────────────────────────────────────────────────────────────────────

def _ensure_dirs() -> None:
    REAL_DIR.mkdir(parents=True, exist_ok=True)
    AI_DIR.mkdir(parents=True, exist_ok=True)
    CACHE.mkdir(parents=True, exist_ok=True)
    logger.info(f"Real dir : {REAL_DIR}")
    logger.info(f"AI dir   : {AI_DIR}")


def _count(d: Path) -> int:
    if not d.exists():
        return 0
    return sum(1 for f in d.iterdir() if f.suffix.lower() in IMG_EXTS)


def _save_img(
    img,
    path: Path,
    size: Optional[Tuple[int, int]] = (512, 512),
) -> bool:
    """
    Save a PIL Image.  Default size (512, 512) preserves camera noise better
    than the old 128x128 used for CIFAR — the training pipeline resizes to
    224x224 anyway, but starting from 512 means genuine high-frequency noise
    survives rather than bilinear-upscale artefacts.
    """
    if not PIL_OK:
        return False
    try:
        if not isinstance(img, _PILImage.Image):
            img = _PILImage.open(io.BytesIO(img)) if isinstance(img, (bytes, bytearray)) \
                  else _PILImage.fromarray(img)
        if img.mode != "RGB":
            img = img.convert("RGB")
        if size:
            # Thumbnail keeps aspect ratio; paste on square canvas
            img.thumbnail(size, _PILImage.LANCZOS)
            canvas = _PILImage.new("RGB", size, (0, 0, 0))
            x = (size[0] - img.width)  // 2
            y = (size[1] - img.height) // 2
            canvas.paste(img, (x, y))
            img = canvas
        img.save(str(path), "JPEG", quality=95, optimize=True)
        return True
    except Exception as e:
        logger.debug(f"_save_img failed: {e}")
        return False


def _progress(current: int, total: int, label: str = "") -> None:
    bar_len = 36
    filled  = int(bar_len * current / max(total, 1))
    bar     = "#" * filled + "." * (bar_len - filled)
    pct     = 100.0 * current / max(total, 1)
    print(f"\r  [{bar}] {pct:5.1f}%  {current}/{total}  {label}",
          end="", flush=True)


def _sample_filenames(d: Path, n: int = 5) -> List[str]:
    files = sorted(f.name for f in d.iterdir() if f.suffix.lower() in IMG_EXTS)
    return files[:n]


def _require_datasets():
    try:
        import datasets as _ds
        return _ds
    except ImportError:
        logger.error(
            "HuggingFace 'datasets' not installed.\n"
            "  Run:  pip install datasets"
        )
        return None


# ─────────────────────────────────────────────────────────────────────────────
# Cleanup — remove old CIFAR-10 images
# ─────────────────────────────────────────────────────────────────────────────

def clear_cifar_images() -> int:
    """
    Remove CIFAR-10 images from the real directory.

    CIFAR-10 images are 32x32 pixels. When upscaled to 224x224 during
    training they produce smooth bilinear artefacts in the residual branch
    rather than real camera sensor noise.  This confuses the forensic
    detector and degrades accuracy.

    Removes files matching: cifar10_*.jpg  and  wa_cifar10_*.jpg
    Returns number of files removed.
    """
    removed = 0
    for pattern in ("cifar10_*.jpg", "wa_cifar10_*.jpg", "cifar10_*.png"):
        for f in REAL_DIR.glob(pattern):
            try:
                f.unlink()
                removed += 1
            except Exception as e:
                logger.debug(f"Could not remove {f.name}: {e}")
    if removed:
        logger.info(f"[CLEAN] Removed {removed} CIFAR-10 images from {REAL_DIR.name}/")
    else:
        logger.info("[CLEAN] No CIFAR-10 images found to remove.")
    return removed


# ─────────────────────────────────────────────────────────────────────────────
# Source A — COCO 2017 val  (REAL images — primary)
# ─────────────────────────────────────────────────────────────────────────────

COCO_VAL_URL   = "http://images.cocodataset.org/zips/val2017.zip"
COCO_TRAIN_URL = "http://images.cocodataset.org/zips/train2017.zip"  # 18 GB — use carefully


def download_coco_real(max_images: int, use_train: bool = False) -> int:
    """
    Download COCO 2017 val photos (5 000 diverse real-world images, ~780 MB).
    These are genuine photographs taken by people — correct resolution,
    real sensor noise, authentic EXIF metadata.

    Args:
        max_images: Maximum number of images to copy to REAL_DIR.
        use_train:  If True, download the 18 GB train set instead (118k images).

    Returns number saved.
    """
    if not PIL_OK:
        logger.error("Pillow required for COCO download.")
        return 0

    url     = COCO_TRAIN_URL if use_train else COCO_VAL_URL
    subset  = "train2017" if use_train else "val2017"
    zip_p   = CACHE / f"coco_{subset}.zip"
    extract = CACHE / subset

    if not extract.exists():
        size_hint = "~18 GB" if use_train else "~780 MB"
        logger.info(f"Downloading COCO 2017 {subset} ({size_hint})...")
        try:
            urllib.request.urlretrieve(
                url, str(zip_p),
                reporthook=lambda c, b, t: _progress(min(c * b, t), t, f"COCO {subset}"),
            )
            print()
            logger.info(f"Extracting {zip_p.name}...")
            with zipfile.ZipFile(str(zip_p), "r") as z:
                z.extractall(str(CACHE))
            zip_p.unlink(missing_ok=True)
            logger.info(f"[OK] COCO {subset} extracted to {extract}")
        except Exception as e:
            logger.error(f"COCO download failed: {e}")
            zip_p.unlink(missing_ok=True)
            return 0
    else:
        logger.info(f"Using cached COCO {subset} at {extract}")

    offset = _count(REAL_DIR)
    copied = 0
    imgs   = sorted(extract.glob("*.jpg"))
    random.shuffle(imgs)   # random order for diversity

    for f in imgs:
        if copied >= max_images:
            break
        dest = REAL_DIR / f"coco_{offset + copied:07d}.jpg"
        if dest.exists():
            copied += 1
            continue
        try:
            with _PILImage.open(f) as im:
                # Save at native resolution (no resize) — preserves sensor noise
                _save_img(im, dest, size=None)
            copied += 1
            if copied % 500 == 0:
                _progress(copied, max_images, "COCO")
        except Exception:
            continue

    print()
    logger.info(f"[OK] COCO: {copied} real photos saved.")
    return copied


# ─────────────────────────────────────────────────────────────────────────────
# Source B — Flickr30k / Flickr8k  (REAL images — secondary)
# ─────────────────────────────────────────────────────────────────────────────

FLICKR_REPOS = [
    ("nlphuji/flickr30k", "test",  "image"),   # 31 000 Flickr photos
    ("jxie/flickr8k",     "train", "image"),   # 8 000 Flickr photos — fallback
]


def download_flickr_real(max_images: int) -> int:
    """
    Stream high-resolution real photographs from Flickr30k (or Flickr8k) via
    HuggingFace datasets.  These are genuine camera photos with authentic noise.

    Returns number saved.
    """
    ds_mod = _require_datasets()
    if ds_mod is None or not PIL_OK:
        return 0

    logger.info(f"Streaming up to {max_images} real photos from Flickr...")

    for repo, split, img_col in FLICKR_REPOS:
        logger.info(f"  Trying {repo} ...")
        try:
            ds = ds_mod.load_dataset(repo, split=split, streaming=True)
        except Exception as e:
            logger.warning(f"  [FAIL] {repo}: {str(e)[:100]}")
            continue

        offset = _count(REAL_DIR)
        saved  = 0

        try:
            for i, sample in enumerate(ds):
                if saved >= max_images:
                    break
                try:
                    raw_img = sample.get(img_col)
                    if raw_img is None:
                        continue
                    path = REAL_DIR / f"flickr_{offset + saved:07d}.jpg"
                    if not path.exists() and _save_img(raw_img, path, size=None):
                        saved += 1
                    elif path.exists():
                        saved += 1
                    if saved % 200 == 0 and saved > 0:
                        _progress(saved, max_images, repo.split("/")[-1])
                except Exception as e:
                    logger.debug(f"  sample {i}: {e}")
        except Exception as e:
            logger.warning(f"  Stream error: {e}")

        print()
        if saved > 0:
            logger.info(f"  [OK] {repo}: {saved} real photos saved.")
            return saved
        logger.warning(f"  [FAIL] {repo}: 0 images saved.")

    logger.warning("All Flickr sources failed.")
    return 0


# ─────────────────────────────────────────────────────────────────────────────
# Source C — DiffusionDB  (AI images — primary, direct ZIP download)
# ─────────────────────────────────────────────────────────────────────────────

DIFFUSIONDB_BASE = (
    "https://huggingface.co/datasets/poloclub/diffusiondb"
    "/resolve/main/images/part-{part:06d}.zip"
)
# 15 parts = up to ~15 000 Stable-Diffusion 1.5 images
# Parts 1-5 cached from earlier test run; 6-15 downloaded fresh
DIFFUSIONDB_PARTS = list(range(1, 16))


def _download_zip_to_ai(zip_url: str, part_id: int, max_images: int) -> int:
    """
    Download one DiffusionDB ZIP part, extract WEBP/PNG images, save to AI_DIR.
    Returns number of images saved from this part.
    """
    if not PIL_OK:
        return 0

    zip_cache = CACHE / f"diffusiondb_part{part_id:06d}.zip"

    if not zip_cache.exists():
        logger.info(f"  Downloading {zip_url} ...")
        try:
            def _report(count, block, total):
                if total > 0:
                    _progress(min(count * block, total), total, f"part {part_id:06d}")

            urllib.request.urlretrieve(zip_url, str(zip_cache), reporthook=_report)
            print()
        except Exception as e:
            logger.warning(f"  [FAIL] {zip_url}: {e}")
            if zip_cache.exists():
                zip_cache.unlink()
            return 0
    else:
        logger.info(f"  Using cached {zip_cache.name}")

    offset = _count(AI_DIR)
    saved  = 0

    try:
        with zipfile.ZipFile(str(zip_cache), "r") as zf:
            img_entries = [
                name for name in zf.namelist()
                if Path(name).suffix.lower() in {".webp", ".jpg", ".jpeg", ".png"}
            ]
            random.shuffle(img_entries)

            for name in img_entries:
                if saved >= max_images:
                    break
                path = AI_DIR / f"diffusiondb_{offset + saved:07d}.jpg"
                if path.exists():
                    saved += 1
                    continue
                try:
                    raw = zf.read(name)
                    img = _PILImage.open(io.BytesIO(raw))
                    if _save_img(img, path, size=(512, 512)):
                        saved += 1
                except Exception as e:
                    logger.debug(f"  {name}: {e}")

    except zipfile.BadZipFile:
        logger.warning(f"  Bad ZIP: {zip_cache.name} — removing from cache.")
        zip_cache.unlink(missing_ok=True)

    logger.info(f"  Part {part_id:06d}: {saved} AI images saved.")
    return saved


def download_diffusiondb_ai(max_images: int) -> int:
    """
    Download Stable Diffusion images from DiffusionDB via direct ZIP URL.
    Uses up to 15 parts for variety (different prompts, styles, subjects).
    Returns total images saved.
    """
    if not PIL_OK:
        logger.error("Pillow required for DiffusionDB download.")
        return 0

    logger.info(f"Downloading up to {max_images} AI images from DiffusionDB "
                f"(parts 1-{len(DIFFUSIONDB_PARTS)})...")

    total = 0
    for part in DIFFUSIONDB_PARTS:
        remaining = max_images - total
        if remaining <= 0:
            break
        url   = DIFFUSIONDB_BASE.format(part=part)
        saved = _download_zip_to_ai(url, part_id=part, max_images=remaining)
        total += saved
        if saved == 0 and total == 0 and part >= 3:
            logger.warning("  Multiple parts failed — DiffusionDB may be unreachable.")
            break

    logger.info(f"DiffusionDB total: {total} AI images.")
    return total


# ─────────────────────────────────────────────────────────────────────────────
# Source D — bitmind/ai-image-detection  (AI images — secondary, photorealistic)
# ─────────────────────────────────────────────────────────────────────────────

def download_bitmind_ai(max_images: int) -> int:
    """
    Stream AI images from bitmind/ai-image-detection via HuggingFace.

    This dataset contains ~240k AI images generated by SD, DALL-E, MidJourney,
    StyleGAN and others — covering photorealistic faces, scenes, and objects
    that DiffusionDB (mostly fantasy prompts) lacks.

    label=1 → AI-generated  (label=0 → real, used only if needed)
    """
    ds_mod = _require_datasets()
    if ds_mod is None or not PIL_OK:
        return 0

    logger.info(f"Streaming up to {max_images} AI images from bitmind/ai-image-detection...")
    try:
        ds = ds_mod.load_dataset(
            "bitmind/ai-image-detection",
            split="train",
            streaming=True,
        )
    except Exception as e:
        logger.warning(f"  [FAIL] bitmind/ai-image-detection: {str(e)[:120]}")
        return 0

    offset = _count(AI_DIR)
    saved  = 0

    try:
        for i, sample in enumerate(ds):
            if saved >= max_images:
                break
            # Only use AI-generated images (label=1)
            if sample.get("label", 1) != 1:
                continue
            try:
                img  = sample.get("image")
                if img is None:
                    continue
                path = AI_DIR / f"bitmind_{offset + saved:07d}.jpg"
                if not path.exists() and _save_img(img, path, size=(512, 512)):
                    saved += 1
                elif path.exists():
                    saved += 1
                if saved % 200 == 0 and saved > 0:
                    _progress(saved, max_images, "bitmind")
            except Exception as e:
                logger.debug(f"  sample {i}: {e}")
    except Exception as e:
        logger.warning(f"  Stream error: {e}")

    print()
    if saved > 0:
        logger.info(f"  [OK] bitmind/ai-image-detection: {saved} AI images saved.")
    else:
        logger.warning("  [FAIL] bitmind/ai-image-detection: 0 images saved.")
    return saved


# ─────────────────────────────────────────────────────────────────────────────
# WhatsApp-style compression augmentation
# ─────────────────────────────────────────────────────────────────────────────

def apply_whatsapp_compression(src_dir: Path, pct: float = 0.30) -> int:
    """
    Re-save pct% of images at JPEG quality 45-65 to simulate WhatsApp compression.
    This teaches the model to handle compressed camera photos, not just pristine ones.
    """
    if not PIL_OK:
        return 0
    files   = [f for f in src_dir.iterdir()
               if f.suffix.lower() in {".jpg", ".jpeg"} and not f.name.startswith("wa_")]
    targets = random.sample(files, min(int(len(files) * pct), len(files)))
    saved   = 0
    for fp in targets:
        dest = fp.parent / f"wa_{fp.name}"
        if dest.exists():
            continue
        try:
            with _PILImage.open(fp) as im:
                im.convert("RGB").save(str(dest), "JPEG", quality=random.randint(45, 65))
            saved += 1
        except Exception:
            continue
    logger.info(f"WhatsApp aug: {saved} recompressed copies in {src_dir.name}/")
    return saved


# ─────────────────────────────────────────────────────────────────────────────
# Probe
# ─────────────────────────────────────────────────────────────────────────────

def probe_sources() -> None:
    """Test each source and report availability."""
    ds_mod = _require_datasets()
    print("\n  Probing dataset sources...\n")

    def _try_hf(repo: str, split: str, img_col: str) -> Tuple[bool, str]:
        if ds_mod is None:
            return False, "'datasets' not installed"
        try:
            it   = iter(ds_mod.load_dataset(repo, split=split, streaming=True))
            s    = next(it)
            cols = list(s.keys())
            img  = s.get(img_col)
            size = getattr(img, "size", type(img).__name__)
            return True, f"cols={cols[:5]}  first_img_size={size}"
        except Exception as e:
            return False, str(e).split("\n")[0][:120]

    def _try_url(url: str) -> Tuple[bool, str]:
        req = urllib.request.Request(url, method="HEAD")
        req.add_header("User-Agent", "Mozilla/5.0")
        try:
            with urllib.request.urlopen(req, timeout=8) as r:
                cl = r.headers.get("Content-Length", "?")
                ct = r.headers.get("Content-Type", "?")
                return True, f"HTTP {r.status}  size={cl}  type={ct}"
        except Exception as e:
            return False, str(e)[:100]

    rows = [
        # Real sources
        ("URL", "COCO 2017 val  (real primary)",
         lambda: _try_url(COCO_VAL_URL)),
        ("HF",  "nlphuji/flickr30k  (real secondary)",
         lambda: _try_hf("nlphuji/flickr30k", "test", "image")),
        ("HF",  "jxie/flickr8k  (real tertiary)",
         lambda: _try_hf("jxie/flickr8k", "train", "image")),
        # AI sources
        ("URL", "DiffusionDB part-000001  (AI primary)",
         lambda: _try_url(DIFFUSIONDB_BASE.format(part=1))),
        ("URL", "DiffusionDB part-000006  (AI variety)",
         lambda: _try_url(DIFFUSIONDB_BASE.format(part=6))),
        ("HF",  "bitmind/ai-image-detection  (AI secondary, photorealistic)",
         lambda: _try_hf("bitmind/ai-image-detection", "train", "image")),
    ]

    for kind, label, fn in rows:
        ok, msg = fn()
        status = "[OK]  " if ok else "[FAIL]"
        print(f"  {status}  [{kind}]  {label:<52}  {msg}")

    print()


# ─────────────────────────────────────────────────────────────────────────────
# Validation
# ─────────────────────────────────────────────────────────────────────────────

def validate_dataset(abort_if_empty: bool = True) -> Tuple[int, int]:
    real_n = _count(REAL_DIR)
    ai_n   = _count(AI_DIR)

    if abort_if_empty and (real_n == 0 or ai_n == 0):
        msg = (
            "\n" + "=" * 58 + "\n"
            "  DATASET EMPTY -- cannot proceed with training.\n"
            f"  Real images : {real_n}\n"
            f"  AI images   : {ai_n}\n\n"
            "  Troubleshooting:\n"
            "  1. Run --probe to see which sources are reachable.\n"
            "  2. Check your internet connection.\n"
            "  3. Try a small test:  --max-real 100 --max-ai 100\n"
            "  4. Place images manually:\n"
            "       backend/datasets/real/  (camera JPEGs)\n"
            "       backend/datasets/ai/    (AI-generated JPEGs)\n"
            + "=" * 58
        )
        logger.error(msg)
        sys.exit(1)

    return real_n, ai_n


# ─────────────────────────────────────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────────────────────────────────────

def print_summary(show_samples: bool = True) -> None:
    real_n = _count(REAL_DIR)
    ai_n   = _count(AI_DIR)
    total  = real_n + ai_n

    # Count by source prefix
    def _src_counts(d: Path) -> dict:
        counts: dict = {}
        for f in d.iterdir():
            if f.suffix.lower() not in IMG_EXTS:
                continue
            prefix = f.name.split("_")[0] if "_" in f.name else "unknown"
            counts[prefix] = counts.get(prefix, 0) + 1
        return counts

    print()
    print("=" * 60)
    print("  Dataset Summary")
    print("=" * 60)
    print(f"  Real images : {real_n:>7,}   {REAL_DIR}")
    if real_n > 0:
        for src, n in sorted(_src_counts(REAL_DIR).items()):
            print(f"    {src:<15} {n:>6,}")
    print(f"  AI images   : {ai_n:>7,}   {AI_DIR}")
    if ai_n > 0:
        for src, n in sorted(_src_counts(AI_DIR).items()):
            print(f"    {src:<15} {n:>6,}")
    print(f"  Total       : {total:>7,}")
    print("=" * 60)

    if total == 0:
        qual = "[ERROR] No images -- run without --summary-only to download."
    elif total < 500:
        qual = "[WARN]  Very small -- accuracy <75%."
    elif total < 2_000:
        qual = "[WARN]  Small -- expect ~75-85% accuracy."
    elif total < 6_000:
        qual = "[OK]    Reasonable -- expect ~85-90% accuracy."
    else:
        qual = "[GOOD]  Large dataset -- expect 90%+ accuracy."

    print(f"\n  {qual}\n")

    if show_samples and total > 0:
        rfiles = _sample_filenames(REAL_DIR)
        afiles = _sample_filenames(AI_DIR)
        if rfiles:
            print("  Sample real files:")
            for name in rfiles:
                print(f"    {name}")
        if afiles:
            print("  Sample AI files:")
            for name in afiles:
                print(f"    {name}")
        print()

    if total > 0:
        print("  Next step -- train the model:")
        print()
        print("    cd backend")
        print("    python -m training.train \\")
        print("        --real-dirs datasets/real \\")
        print("        --ai-dirs   datasets/ai \\")
        print("        --output    inference/checkpoints \\")
        print("        --epochs 30 --batch-size 16")
        print()


# ─────────────────────────────────────────────────────────────────────────────
# CLI
# ─────────────────────────────────────────────────────────────────────────────

def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Download high-quality real + AI images for the forensic detector.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # First run (clear old CIFAR data and download fresh):
  python -m training.prepare_dataset --clear-cifar --max-real 5000 --max-ai 5000

  # Quick test:
  python -m training.prepare_dataset --max-real 200 --max-ai 200

  # Check existing dataset:
  python -m training.prepare_dataset --summary-only

  # Probe sources:
  python -m training.prepare_dataset --probe
""",
    )
    p.add_argument("--max-real",        type=int, default=5_000,
                   help="Target real image count  (default: 5000)")
    p.add_argument("--max-ai",          type=int, default=5_000,
                   help="Target AI image count    (default: 5000)")
    p.add_argument("--clear-cifar",     action="store_true",
                   help="Remove existing CIFAR-10 images before downloading "
                        "(recommended on first run)")
    p.add_argument("--no-whatsapp-aug", action="store_true",
                   help="Skip WhatsApp JPEG recompression augmentation")
    p.add_argument("--probe",           action="store_true",
                   help="Probe each source and report status, then exit")
    p.add_argument("--summary-only",    action="store_true",
                   help="Print dataset counts only, do not download")
    return p.parse_args()


def main() -> None:
    args = _parse_args()
    _ensure_dirs()

    if args.probe:
        probe_sources()
        return

    if args.summary_only:
        print_summary()
        return

    if not PIL_OK:
        logger.error("Pillow not installed.  Run:  pip install Pillow")
        sys.exit(1)

    # ── Step 0: clear old CIFAR images ────────────────────────────────────────
    if args.clear_cifar:
        logger.info("\nStep 0 -- Removing CIFAR-10 images (too small for noise analysis)...")
        clear_cifar_images()

    existing_real = _count(REAL_DIR)
    existing_ai   = _count(AI_DIR)
    logger.info(f"Existing -- real: {existing_real}, AI: {existing_ai}")

    # ── Step 1: COCO 2017 val for real images (primary) ───────────────────────
    need_real = max(0, args.max_real - existing_real)
    if need_real > 0:
        logger.info(f"\nStep 1/4 -- Downloading {need_real} real photos (COCO 2017 val)...")
        saved = download_coco_real(max_images=need_real)
        if saved == 0:
            logger.warning("  COCO failed — trying Flickr as fallback...")
            download_flickr_real(max_images=need_real)
    else:
        logger.info("Step 1/4 -- Real target already met.")

    # ── Step 2: Flickr top-up (if COCO did not meet target) ──────────────────
    need_real = max(0, args.max_real - _count(REAL_DIR))
    if need_real > 0:
        logger.info(f"\nStep 2/4 -- Top-up {need_real} real photos from Flickr...")
        download_flickr_real(max_images=need_real)
    else:
        logger.info("Step 2/4 -- Real target met after COCO.")

    # ── Step 3: DiffusionDB for AI images (primary) ───────────────────────────
    need_ai = max(0, args.max_ai - _count(AI_DIR))
    if need_ai > 0:
        logger.info(f"\nStep 3/4 -- Downloading {need_ai} AI images (DiffusionDB ZIPs)...")
        saved = download_diffusiondb_ai(max_images=need_ai)
        if saved < need_ai // 2:
            # DiffusionDB partial failure — try bitmind for the rest
            remaining = max(0, args.max_ai - _count(AI_DIR))
            if remaining > 0:
                logger.info(f"  Trying bitmind/ai-image-detection for {remaining} more...")
                download_bitmind_ai(max_images=remaining)
    else:
        logger.info("Step 3/4 -- AI target already met.")

    # ── Step 4: bitmind top-up for photorealistic variety ────────────────────
    # Aim for 30% of AI images from bitmind (photorealistic) if possible
    ai_total    = _count(AI_DIR)
    bitmind_n   = sum(1 for f in AI_DIR.iterdir()
                      if f.name.startswith("bitmind_"))
    bitmind_pct = bitmind_n / max(ai_total, 1)
    if bitmind_pct < 0.25 and ai_total > 0:
        want_bitmind = int(ai_total * 0.25) - bitmind_n
        if want_bitmind > 0:
            logger.info(f"\nStep 4/4 -- Adding {want_bitmind} photorealistic AI images "
                        f"(bitmind, currently {bitmind_pct:.0%} of AI set)...")
            download_bitmind_ai(max_images=want_bitmind)
    else:
        logger.info("Step 4/4 -- Photorealistic AI coverage adequate.")

    # ── WhatsApp augmentation ─────────────────────────────────────────────────
    if not args.no_whatsapp_aug:
        logger.info("\nApplying WhatsApp compression augmentation...")
        apply_whatsapp_compression(REAL_DIR, pct=0.30)
        apply_whatsapp_compression(AI_DIR,   pct=0.30)

    # ── Validate and report ───────────────────────────────────────────────────
    logger.info("\nValidating dataset...")
    validate_dataset(abort_if_empty=True)
    print_summary(show_samples=True)


if __name__ == "__main__":
    main()
