# Production-Grade AI Image Forensic Training Pipeline

## Overview

This is a comprehensive ML-powered forensic image classification system that replaces heuristic-only approaches with advanced hybrid AI detection. The system combines CNN predictions with forensic feature analysis for accurate classification of:

- **Real camera images**
- **AI-generated images** 
- **Screenshots**
- **WhatsApp/compressed images**
- **Downloaded/re-encoded images**

## Architecture

```
backend/
├── datasets/              # Training/validation data
├── models/                # Trained model checkpoints
├── training/              # Training pipeline
│   ├── dataset.py         # Dataset loader with validation
│   ├── model.py           # EfficientNet-B3 CNN model
│   ├── train.py           # Training script with metrics
│   └── export_model.py    # Model export utilities
├── forensic/              # Forensic analysis
│   ├── feature_extractors.py  # Advanced feature extraction
│   ├── hybrid_scorer.py      # Hybrid scoring system
│   └── debug_system.py       # Comprehensive debugging
├── inference/             # Production API
│   └── server.py          # FastAPI inference server
└── outputs/               # Training outputs and exports
```

## Key Features

### 🧠 **Hybrid AI Detection**
- **EfficientNet-B3** CNN with transfer learning
- **50+ forensic features** including PRNU, FFT, compression artifacts
- **Priority-based classification** with configurable thresholds
- **Multi-format export**: ONNX, TensorFlow.js, TorchScript

### 🔍 **Advanced Forensic Analysis**
- **EXIF metadata extraction** with camera make/model detection
- **Sensor noise analysis** (PRNU - Photo Response Non-Uniformity)
- **FFT spectral analysis** for GAN pattern detection
- **Compression artifact detection** for screenshot/WhatsApp identification
- **Edge and texture analysis** for AI vs camera differentiation

### 📊 **Production-Grade Training**
- **Focal Loss** and **Label Smoothing** for class imbalance
- **Mixed precision training** for GPU efficiency
- **Early stopping** with checkpoint restoration
- **TensorBoard integration** with comprehensive metrics
- **Confusion matrix** and per-class F1-score tracking

### 🚀 **High-Performance Inference**
- **FastAPI server** with async processing
- **Batch analysis** support for multiple images
- **Comprehensive health checks** and monitoring
- **Detailed debug logging** with performance metrics

## Quick Start

### 1. Install Dependencies

```bash
cd backend
pip install -r requirements_ml.txt
```

### 2. Prepare Dataset

Organize your data in ImageFolder format:

```
datasets/
├── train/
│   ├── camera/      # Real camera photos
│   ├── ai/           # AI-generated images
│   ├── screenshot/   # Screenshots
│   ├── whatsapp/     # WhatsApp images
│   └── downloaded/   # Downloaded images
└── val/
    ├── camera/
    ├── ai/
    ├── screenshot/
    ├── whatsapp/
    └── downloaded/
```

### 3. Train Model

```bash
# Basic training
python training/train.py \
    --train-dir datasets/train \
    --val-dir datasets/val \
    --epochs 100 \
    --batch-size 32 \
    --lr 1e-4

# Advanced training with focal loss
python training/train.py \
    --train-dir datasets/train \
    --val-dir datasets/val \
    --epochs 100 \
    --loss focal \
    --scheduler cosine \
    --experiment-name forensic_production
```

### 4. Export Model

```bash
# Export to all formats
python training/export_model.py \
    --model-path outputs/checkpoints/best_model.pth \
    --output-dir outputs

# Export specific formats
python training/export_model.py \
    --model-path outputs/checkpoints/best_model.pth \
    --output-dir outputs \
    --input-shape 1 3 224 224
```

### 5. Start Inference Server

```bash
# Development mode
python inference/server.py --reload --port 8000

# Production mode
python inference/server.py --workers 4 --port 8000
```

## API Usage

### Analyze Single Image

```bash
curl -X POST "http://localhost:8000/analyze-image" \
  -H "Content-Type: multipart/form-data" \
  -F "file=@image.jpg" \
  -F "include_forensic_features=true" \
  -F "include_debug_info=false"
```

**Response:**
```json
{
  "success": true,
  "image_source": "Camera Image",
  "confidence": 78.5,
  "ai_probability": 5.2,
  "camera_probability": 85.7,
  "screenshot_probability": 3.1,
  "whatsapp_probability": 2.8,
  "downloaded_probability": 3.2,
  "forensic_scores": {
    "camera": 75.0,
    "ai": 15.0,
    "screenshot": 10.0,
    "whatsapp": 20.0,
    "downloaded": 5.0
  },
  "metadata_analysis": {
    "exif_available": true,
    "image_dimensions": "3024x4032",
    "file_size_bytes": 2048576,
    "aspect_ratio": 0.75,
    "jpeg_quality_estimate": 85.0,
    "compression_artifacts": 0.2,
    "edge_density": 0.15,
    "sensor_noise_level": 0.8
  },
  "security_status": "Authentic Camera Capture",
  "processing_time": 0.245
}
```

### Batch Analysis

```bash
curl -X POST "http://localhost:8000/batch-analyze" \
  -H "Content-Type: multipart/form-data" \
  -F "files=@image1.jpg" \
  -F "files=@image2.jpg" \
  -F "files=@image3.jpg"
```

## Performance Targets

### 🎯 **Classification Accuracy**
- **Camera detection**: >90% accuracy
- **AI detection**: >90% accuracy  
- **Screenshot detection**: >85% accuracy
- **WhatsApp detection**: >85% accuracy
- **Downloaded detection**: >85% accuracy
- **Overall accuracy**: >85%

### ⚡ **Inference Performance**
- **Single image**: <500ms processing time
- **Batch processing**: <2s for 10 images
- **Memory usage**: <2GB per inference
- **GPU utilization**: >80% for batch processing

### 🔧 **Robustness**
- **Recompression resistant**: Maintains accuracy after JPEG re-encoding
- **Screenshot detection**: Works across different screen resolutions
- **WhatsApp detection**: Identifies WhatsApp compression signatures
- **Cross-platform**: Works on iOS, Android, Windows, macOS images

## Model Configuration

### Hybrid Scoring Weights

```python
# CNN vs Forensic weighting
combination_weights = {
    'camera': {'cnn': 0.6, 'forensic': 0.4},
    'ai': {'cnn': 0.7, 'forensic': 0.3},
    'screenshot': {'cnn': 0.5, 'forensic': 0.5},
    'whatsapp': {'cnn': 0.4, 'forensic': 0.6},
    'downloaded': {'cnn': 0.4, 'forensic': 0.6}
}
```

### Classification Thresholds

```python
thresholds = {
    'ai': 60.0,        # AI >= 60%
    'screenshot': 70.0,  # Screenshot >= 70%
    'whatsapp': 65.0,   # WhatsApp >= 65%
    'downloaded': 65.0, # Downloaded >= 65%
    'camera': 60.0       # Camera >= 60%
}
```

## Forensic Features

### 📊 **EXIF Analysis**
- Camera make/model detection
- DateTime and software information
- Flash usage detection
- GPS location availability

### 🔬 **Sensor Noise (PRNU)**
- Natural sensor noise patterns
- Noise variance and distribution
- Skewness and kurtosis analysis

### 📡 **FFT Spectral Analysis**
- Frequency domain analysis
- GAN pattern detection
- Spectral entropy calculation
- Peak frequency identification

### 🗜️ **Compression Artifacts**
- JPEG quality estimation
- Blockiness detection
- Ringing artifacts
- Quantization table analysis

### 📐 **Edge Analysis**
- Edge density calculation
- Edge smoothness measurement
- Edge uniformity assessment
- Direction variance analysis

### 🎨 **Color & Texture**
- Color histogram entropy
- Channel correlation analysis
- GLCM texture features
- Local Binary Patterns

## Debugging & Monitoring

### 📊 **Performance Metrics**
- Processing time per stage
- Memory usage tracking
- CPU/GPU utilization
- Stage execution frequency

### 🔍 **Debug Logging**
- Detailed forensic score breakdown
- CNN probability analysis
- Hybrid combination reasoning
- Threshold application logging

### 📈 **Visualization**
- Training curves (loss/accuracy)
- Confusion matrices
- Performance plots
- Feature distribution charts

## Integration with Frontend

### 1. Update Frontend Configuration

```typescript
// Update API endpoint
const API_BASE_URL = 'http://localhost:8000';

// Update result interface
interface ForensicResult {
  image_source: string;
  confidence: number;
  ai_probability: number;
  camera_probability: number;
  screenshot_probability: number;
  whatsapp_probability: number;
  downloaded_probability: number;
  forensic_scores?: Record<string, number>;
  metadata_analysis?: {
    exif_available: boolean;
    image_dimensions: string;
    jpeg_quality_estimate: number;
    // ... other metadata
  };
  security_status: string;
  processing_time: number;
}
```

### 2. Replace Heuristic Logic

```typescript
// Remove old heuristic analysis
// Replace with API calls to new ML system

const analyzeImage = async (imageData: string) => {
  const response = await fetch(`${API_BASE_URL}/analyze-image`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image: imageData,
      include_forensic_features: true,
      include_debug_info: false
    })
  });
  
  return await response.json();
};
```

## Deployment

### Docker Deployment

```dockerfile
FROM python:3.9-slim

WORKDIR /app
COPY requirements_ml.txt .
RUN pip install -r requirements_ml.txt

COPY . .
EXPOSE 8000

CMD ["python", "inference/server.py", "--workers", "4", "--port", "8000"]
```

### Production Configuration

```bash
# Environment variables
export MODEL_PATH=/app/models/best_model.pth
export GPU_MEMORY_LIMIT=4096
export MAX_BATCH_SIZE=32
export LOG_LEVEL=INFO
```

## Troubleshooting

### Common Issues

1. **CUDA Out of Memory**
   - Reduce batch size
   - Enable gradient accumulation
   - Use mixed precision training

2. **Poor Validation Accuracy**
   - Check dataset quality and balance
   - Adjust learning rate
   - Try different loss functions (focal vs label smoothing)

3. **Slow Inference**
   - Enable model quantization
   - Use ONNX runtime
   - Optimize forensic feature extraction

4. **Inconsistent Results**
   - Check random seed settings
   - Verify data preprocessing
   - Review forensic feature calculation

### Performance Optimization

```python
# Enable mixed precision
scaler = torch.cuda.amp.GradScaler()

# Use ONNX for inference
ort_session = ort.InferenceSession("model.onnx")

# Optimize forensic extraction
# Pre-allocate arrays, use vectorized operations
```

## Contributing

1. **Dataset Enhancement**: Add more diverse training data
2. **Feature Engineering**: Improve forensic feature extractors
3. **Model Architecture**: Experiment with different backbones
4. **Performance Optimization**: Improve inference speed and accuracy

## License

This ML pipeline is designed for production use in forensic image analysis applications.
