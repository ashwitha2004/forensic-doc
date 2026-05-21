@echo off
REM ============================================================
REM  PINIT — Full Training Pipeline  (Windows)
REM  Run from: backend\
REM ============================================================
setlocal enabledelayedexpansion

REM ── Step 0: check Python ─────────────────────────────────────────────────────
where python >nul 2>&1
if errorlevel 1 (
    echo ERROR: python not found. Install Python 3.9+ and add it to PATH.
    exit /b 1
)
echo Python: OK

REM ── Step 1: install deps ─────────────────────────────────────────────────────
echo.
echo [1/5] Installing / verifying training dependencies...
pip install Pillow datasets scikit-learn tensorboard --quiet
if errorlevel 1 (
    echo WARNING: Some pip installs failed. Trying to continue...
)

REM Try to install PyTorch with CUDA first, fall back to CPU-only
python -c "import torch; torch.cuda.is_available()" >nul 2>&1
if errorlevel 1 (
    echo Installing PyTorch...
    pip install torch torchvision --index-url https://download.pytorch.org/whl/cu118 --quiet 2>nul
    if errorlevel 1 (
        pip install torch torchvision --quiet
    )
)
pip install torchvision --quiet 2>nul

REM ── Step 2: probe sources ────────────────────────────────────────────────────
echo.
echo [2/5] Probing HuggingFace dataset sources...
python -m training.prepare_dataset --probe
if errorlevel 1 (
    echo WARNING: Probe failed. Continuing anyway - download will try all sources.
)

REM ── Step 3: download dataset ─────────────────────────────────────────────────
echo.
echo [3/5] Downloading dataset...
echo       Target: 10,000 real + 10,000 AI images
echo       Sources tried in order: wangrongsheng/cifake, cifake,
echo       uoft-cs/cifar10 (real top-up), poloclub/diffusiondb (AI top-up)
echo.
python -m training.prepare_dataset --max-real 10000 --max-ai 10000
if errorlevel 1 (
    echo.
    echo ERROR: Dataset preparation failed or dataset is empty.
    echo.
    echo Troubleshooting:
    echo   1. Check your internet connection.
    echo   2. Run with a small test first:
    echo      python -m training.prepare_dataset --max-real 200 --max-ai 200
    echo   3. Or place images manually:
    echo      backend\datasets\real\  (camera photos as .jpg/.png)
    echo      backend\datasets\ai\    (AI-generated images as .jpg/.png)
    echo   4. Then skip to training:
    echo      python -m training.train --real-dirs datasets/real --ai-dirs datasets/ai
    echo                               --output inference/checkpoints --epochs 30
    exit /b 1
)

REM ── Step 4: train ────────────────────────────────────────────────────────────
echo.
echo [4/5] Training dual-branch EfficientNet-B0...

REM Detect GPU
set HAS_GPU=0
python -c "import torch; assert torch.cuda.is_available(); print('GPU: ' + torch.cuda.get_device_name(0))" 2>nul
if not errorlevel 1 set HAS_GPU=1

if "%HAS_GPU%"=="1" (
    echo Using GPU acceleration.
    set BATCH=32
    set EPOCHS=30
    set WORKERS=4
) else (
    echo No GPU detected — training on CPU.
    echo Tip: reduce --epochs 15 and --batch-size 8 to finish faster on CPU.
    set BATCH=8
    set EPOCHS=15
    set WORKERS=0
)

python -m training.train ^
    --real-dirs datasets/real ^
    --ai-dirs   datasets/ai ^
    --output    inference/checkpoints ^
    --epochs    %EPOCHS% ^
    --batch-size %BATCH% ^
    --fp-weight 2.5 ^
    --num-workers %WORKERS%

if errorlevel 1 (
    echo ERROR: Training failed. Check logs above.
    exit /b 1
)

REM ── Step 5: verify ───────────────────────────────────────────────────────────
echo.
echo [5/5] Verifying checkpoint...
if exist "inference\checkpoints\forensic_detector.pth" (
    echo.
    echo ============================================================
    echo  SUCCESS — Training complete!
    echo.
    echo  Checkpoint: backend\inference\checkpoints\forensic_detector.pth
    echo.
    echo  Restart the FastAPI backend to load trained weights:
    echo    uvicorn main:app --reload --port 8000
    echo.
    echo  Verify at:
    echo    http://127.0.0.1:8000/api/inference/model-info
    echo  Expected:
    echo    { "has_trained_weights": true, "backend": "pytorch" }
    echo ============================================================
) else (
    echo WARNING: Checkpoint not found at inference\checkpoints\forensic_detector.pth
    echo Training may not have completed successfully.
    exit /b 1
)

endlocal
