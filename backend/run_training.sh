#!/usr/bin/env bash
# ============================================================
#  PINIT — Full Training Pipeline  (Linux / macOS)
#  Run from: backend/
# ============================================================
set -euo pipefail

log() { echo -e "\n\033[1;34m[$1]\033[0m $2"; }
ok()  { echo -e "\033[1;32m✅ $1\033[0m"; }
err() { echo -e "\033[1;31m❌ $1\033[0m"; exit 1; }

# ── Step 0: guard ─────────────────────────────────────────────────────────────
command -v python3 >/dev/null 2>&1 || command -v python >/dev/null 2>&1 \
    || err "python not found. Install Python 3.9+ and try again."
PY=$(command -v python3 2>/dev/null || command -v python)

# ── Step 1: install deps ──────────────────────────────────────────────────────
log "1/4" "Installing / verifying training dependencies..."
$PY -m pip install --quiet datasets pillow scikit-learn tensorboard

# PyTorch — try CUDA first, fall back to CPU-only
$PY -c "import torch; assert torch.cuda.is_available()" 2>/dev/null && GPU=1 || GPU=0
if [ "$GPU" -eq 0 ]; then
    $PY -m pip install --quiet torch torchvision --index-url https://download.pytorch.org/whl/cpu
fi

# ── Step 2: download dataset ──────────────────────────────────────────────────
log "2/4" "Downloading dataset (CIFAKE from HuggingFace)..."
echo "    This downloads ~10 000 real + ~10 000 AI images."
echo "    First run takes 10-20 minutes depending on connection."

$PY -m training.prepare_dataset --max-real 10000 --max-ai 10000

# ── Step 3: train ─────────────────────────────────────────────────────────────
log "3/4" "Training dual-branch EfficientNet-B0..."

if [ "$GPU" -eq 1 ]; then
    DEVICE_MSG="GPU detected — using CUDA"
    BATCH=32; EPOCHS=30; WORKERS=4
else
    DEVICE_MSG="No GPU — training on CPU (consider reducing epochs)"
    BATCH=8; EPOCHS=15; WORKERS=2
fi
echo "    $DEVICE_MSG"

$PY -m training.train \
    --real-dirs datasets/real \
    --ai-dirs   datasets/ai \
    --output    inference/checkpoints \
    --epochs    "$EPOCHS" \
    --batch-size "$BATCH" \
    --fp-weight 2.5 \
    --num-workers "$WORKERS"

# ── Step 4: verify ────────────────────────────────────────────────────────────
log "4/4" "Verifying checkpoint..."
CKPT="inference/checkpoints/forensic_detector.pth"
if [ -f "$CKPT" ]; then
    SIZE=$(du -sh "$CKPT" | cut -f1)
    ok "Checkpoint saved: $CKPT  ($SIZE)"
    echo ""
    echo "  Restart the FastAPI backend to load the new model:"
    echo "    uvicorn main:app --reload --port 8000"
    echo ""
    echo "  Verify at: http://127.0.0.1:8000/api/inference/model-info"
    echo "  Expected:  { \"has_trained_weights\": true, \"backend\": \"pytorch\" }"
else
    err "Checkpoint not found — training may not have completed."
fi
