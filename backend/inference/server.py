"""
FastAPI Inference Server for Forensic Image Classification
Production-grade API with comprehensive forensic analysis
"""

from fastapi import FastAPI, File, UploadFile, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import torch
import numpy as np
from PIL import Image
import io
import cv2
import logging
from pathlib import Path
import asyncio
import time
from typing import Dict, Optional, List
import json
import uvicorn
from datetime import datetime

# Import our modules
from model import create_model
from forensic.feature_extractors import ForensicFeatureExtractor
from forensic.hybrid_scorer import HybridScorer

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('inference.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="Forensic Image Classification API",
    description="Production-grade AI-powered forensic image analysis",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global variables
model = None
device = None
forensic_extractor = None
hybrid_scorer = None

class AnalysisRequest(BaseModel):
    """Request model for analysis"""
    include_forensic_features: bool = True
    include_debug_info: bool = False
    confidence_threshold: float = 0.5

class AnalysisResponse(BaseModel):
    """Response model for analysis"""
    success: bool
    image_source: str
    confidence: float
    ai_probability: float
    camera_probability: float
    screenshot_probability: float
    whatsapp_probability: float
    downloaded_probability: float
    forensic_scores: Optional[Dict[str, float]] = None
    metadata_analysis: Optional[Dict[str, any]] = None
    security_status: str
    processing_time: float
    debug_info: Optional[Dict[str, any]] = None
    error: Optional[str] = None

class HealthResponse(BaseModel):
    """Health check response"""
    status: str
    model_loaded: bool
    device: str
    timestamp: str

def load_model():
    """Load model and initialize components"""
    global model, device, forensic_extractor, hybrid_scorer
    
    try:
        # Determine device
        device = 'cuda' if torch.cuda.is_available() else 'cpu'
        logger.info(f"Using device: {device}")
        
        # Load model
        model_path = Path("outputs/checkpoints/best_model.pth")
        if not model_path.exists():
            logger.warning(f"Model not found at {model_path}, using default model")
            model, device = create_model(device=device)
        else:
            model, device = create_model(device=device)
            checkpoint = torch.load(model_path, map_location=device)
            model.load_state_dict(checkpoint['model_state_dict'])
            model.eval()
            logger.info(f"Model loaded from {model_path}")
        
        # Initialize forensic extractor
        forensic_extractor = ForensicFeatureExtractor()
        
        # Initialize hybrid scorer
        hybrid_scorer = HybridScorer()
        
        logger.info("Model and components loaded successfully")
        return True
        
    except Exception as e:
        logger.error(f"Failed to load model: {e}")
        return False

def preprocess_image(image_bytes: bytes) -> tuple:
    """Preprocess uploaded image for inference"""
    try:
        # Load image
        image = Image.open(io.BytesIO(image_bytes))
        
        # Convert to RGB if necessary
        if image.mode != 'RGB':
            image = image.convert('RGB')
        
        # Resize to 224x224
        image = image.resize((224, 224), Image.LANCZOS)
        
        # Convert to tensor
        image_array = np.array(image, dtype=np.float32)
        
        # Normalize (ImageNet stats)
        mean = np.array([0.485, 0.456, 0.406])
        std = np.array([0.229, 0.224, 0.225])
        image_array = (image_array / 255.0 - mean) / std
        
        # Convert to tensor and add batch dimension
        image_tensor = torch.from_numpy(image_array.transpose(2, 0, 1)).unsqueeze(0)
        
        return image_tensor, image
        
    except Exception as e:
        logger.error(f"Image preprocessing failed: {e}")
        raise HTTPException(status_code=400, detail=f"Invalid image: {e}")

def extract_forensic_features_from_image(image: Image.Image) -> Dict[str, float]:
    """Extract forensic features from PIL Image"""
    try:
        # Save image temporarily for feature extraction
        temp_path = "temp_image.jpg"
        image.save(temp_path, "JPEG", quality=95)
        
        # Extract features
        features = forensic_extractor.extract_all_features(temp_path)
        
        # Clean up
        Path(temp_path).unlink(missing_ok=True)
        
        return features
        
    except Exception as e:
        logger.error(f"Forensic feature extraction failed: {e}")
        return {}

@app.on_event("startup")
async def startup_event():
    """Initialize on startup"""
    logger.info("Starting Forensic Image Classification API")
    
    if not load_model():
        logger.error("Failed to initialize model")
        return
    
    logger.info("API startup complete")

@app.get("/", response_model=Dict)
async def root():
    """Root endpoint"""
    return {
        "message": "Forensic Image Classification API",
        "version": "1.0.0",
        "docs": "/docs",
        "health": "/health"
    }

@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint"""
    return HealthResponse(
        status="healthy" if model is not None else "unhealthy",
        model_loaded=model is not None,
        device=device or "unknown",
        timestamp=datetime.now().isoformat()
    )

@app.post("/analyze-image", response_model=AnalysisResponse)
async def analyze_image(
    file: UploadFile = File(..., description="Image file to analyze"),
    include_forensic_features: bool = True,
    include_debug_info: bool = False,
    confidence_threshold: float = 0.5
):
    """
    Analyze uploaded image for forensic classification
    
    Args:
        file: Image file (JPEG, PNG, etc.)
        include_forensic_features: Whether to include forensic analysis
        include_debug_info: Whether to include debug information
        confidence_threshold: Minimum confidence threshold
        
    Returns:
        Comprehensive analysis results
    """
    
    start_time = time.time()
    
    try:
        # Validate file
        if not file.content_type or not file.content_type.startswith('image/'):
            raise HTTPException(status_code=400, detail="Invalid file type")
        
        # Read image
        image_bytes = await file.read()
        
        # Preprocess image
        image_tensor, pil_image = preprocess_image(image_bytes)
        image_tensor = image_tensor.to(device)
        
        logger.info(f"[API] Processing image: {file.filename}")
        logger.info(f"[API] Image size: {len(image_bytes)} bytes")
        logger.info(f"[API] Content type: {file.content_type}")
        
        # CNN inference
        with torch.no_grad():
            cnn_outputs = model(image_tensor)
            cnn_probabilities = cnn_outputs['probabilities'].cpu().numpy()[0]
        
        # Convert to dictionary
        class_names = ['camera', 'ai', 'screenshot', 'whatsapp', 'downloaded']
        cnn_probs_dict = {
            class_names[i]: float(cnn_probabilities[i]) 
            for i in range(len(class_names))
        }
        
        logger.info(f"[API] CNN probabilities: {cnn_probs_dict}")
        
        # Forensic analysis (if requested)
        forensic_scores = None
        metadata_analysis = None
        debug_info = None
        
        if include_forensic_features:
            # Extract forensic features
            forensic_features = extract_forensic_features_from_image(pil_image)
            
            # Calculate forensic scores
            forensic_scores = hybrid_scorer.calculate_forensic_scores(forensic_features)
            
            # Create metadata analysis
            metadata_analysis = {
                'exif_available': forensic_features.get('has_exif', 0) > 0,
                'image_dimensions': f"{pil_image.size[0]}x{pil_image.size[1]}",
                'file_size_bytes': len(image_bytes),
                'aspect_ratio': forensic_features.get('aspect_ratio', 0),
                'jpeg_quality_estimate': forensic_features.get('jpeg_quality_estimate', 0),
                'compression_artifacts': forensic_features.get('blockiness', 0),
                'edge_density': forensic_features.get('edge_density', 0),
                'sensor_noise_level': forensic_features.get('prnu_std', 0)
            }
            
            logger.info(f"[API] Forensic scores: {forensic_scores}")
        
        # Hybrid analysis
        if forensic_scores is not None:
            hybrid_analysis = hybrid_scorer.analyze_image(cnn_probs_dict, forensic_features)
            final_class = hybrid_analysis['predicted_class']
            final_confidence = hybrid_analysis['confidence']
            
            if include_debug_info:
                debug_info = hybrid_scorer.get_debug_info(cnn_probs_dict, forensic_features)
        else:
            # Use only CNN results
            final_class = max(cnn_probs_dict, key=cnn_probs_dict.get)
            final_confidence = cnn_probs_dict[final_class]
        
        # Map to UI format
        image_source_map = {
            'camera': 'Camera Image',
            'ai': 'AI Generated',
            'screenshot': 'Screenshot',
            'whatsapp': 'WhatsApp Image',
            'downloaded': 'Downloaded Image'
        }
        
        security_status_map = {
            'camera': 'Authentic Camera Capture',
            'ai': 'AI Generated Content',
            'screenshot': 'Screen Captured',
            'whatsapp': 'WhatsApp Forwarded',
            'downloaded': 'External Source'
        }
        
        # Calculate processing time
        processing_time = time.time() - start_time
        
        # Create response
        response = AnalysisResponse(
            success=True,
            image_source=image_source_map.get(final_class, 'Unknown'),
            confidence=final_confidence,
            ai_probability=cnn_probs_dict.get('ai', 0.0) * 100,
            camera_probability=cnn_probs_dict.get('camera', 0.0) * 100,
            screenshot_probability=cnn_probs_dict.get('screenshot', 0.0) * 100,
            whatsapp_probability=cnn_probs_dict.get('whatsapp', 0.0) * 100,
            downloaded_probability=cnn_probs_dict.get('downloaded', 0.0) * 100,
            forensic_scores=forensic_scores,
            metadata_analysis=metadata_analysis,
            security_status=security_status_map.get(final_class, 'Unknown'),
            processing_time=processing_time,
            debug_info=debug_info
        )
        
        logger.info(f"[API] Final classification: {final_class} ({final_confidence:.1f}%)")
        logger.info(f"[API] Processing time: {processing_time:.3f}s")
        
        return response
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[API] Analysis failed: {e}")
        return AnalysisResponse(
            success=False,
            image_source="Unknown",
            confidence=0.0,
            ai_probability=0.0,
            camera_probability=0.0,
            screenshot_probability=0.0,
            whatsapp_probability=0.0,
            downloaded_probability=0.0,
            forensic_scores=None,
            metadata_analysis=None,
            security_status="Analysis Failed",
            processing_time=time.time() - start_time,
            debug_info=None,
            error=str(e)
        )

@app.post("/batch-analyze")
async def batch_analyze(
    files: List[UploadFile] = File(..., description="Multiple image files to analyze"),
    include_forensic_features: bool = True,
    include_debug_info: bool = False
):
    """
    Analyze multiple images in batch
    """
    
    if len(files) > 10:  # Limit batch size
        raise HTTPException(status_code=400, detail="Maximum 10 files allowed per batch")
    
    start_time = time.time()
    results = []
    
    logger.info(f"[API] Batch analysis started: {len(files)} files")
    
    for i, file in enumerate(files):
        try:
            # Read and process each file
            image_bytes = await file.read()
            image_tensor, pil_image = preprocess_image(image_bytes)
            image_tensor = image_tensor.to(device)
            
            # CNN inference
            with torch.no_grad():
                cnn_outputs = model(image_tensor)
                cnn_probabilities = cnn_outputs['probabilities'].cpu().numpy()[0]
            
            class_names = ['camera', 'ai', 'screenshot', 'whatsapp', 'downloaded']
            cnn_probs_dict = {
                class_names[i]: float(cnn_probabilities[i]) 
                for i in range(len(class_names))
            }
            
            # Simple classification (no forensic for batch)
            final_class = max(cnn_probs_dict, key=cnn_probs_dict.get)
            final_confidence = cnn_probs_dict[final_class]
            
            result = {
                'filename': file.filename,
                'success': True,
                'predicted_class': final_class,
                'confidence': final_confidence,
                'probabilities': cnn_probs_dict
            }
            
            results.append(result)
            logger.info(f"[API] Batch file {i+1}/{len(files)}: {final_class} ({final_confidence:.1f}%)")
            
        except Exception as e:
            logger.error(f"[API] Batch file {i+1} failed: {e}")
            results.append({
                'filename': file.filename,
                'success': False,
                'error': str(e)
            })
    
    processing_time = time.time() - start_time
    
    logger.info(f"[API] Batch analysis completed: {processing_time:.3f}s")
    
    return {
        'success': True,
        'results': results,
        'total_files': len(files),
        'successful_files': sum(1 for r in results if r.get('success', False)),
        'processing_time': processing_time
    }

@app.get("/model-info")
async def get_model_info():
    """Get model information"""
    if model is None:
        raise HTTPException(status_code=503, detail="Model not loaded")
    
    model_info = model.get_model_info()
    
    return {
        'model_info': model_info,
        'device': device,
        'supported_formats': ['JPEG', 'PNG', 'BMP', 'TIFF', 'WEBP'],
        'max_file_size': 50 * 1024 * 1024,  # 50MB
        'classes': ['camera', 'ai', 'screenshot', 'whatsapp', 'downloaded'],
        'api_version': '1.0.0'
    }

@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    """Global exception handler"""
    logger.error(f"Unhandled exception: {exc}")
    return JSONResponse(
        status_code=500,
        content={
            'success': False,
            'error': 'Internal server error',
            'detail': str(exc)
        }
    )

def main():
    """Main function to run the server"""
    import argparse
    
    parser = argparse.ArgumentParser(description='Forensic Image Classification API Server')
    parser.add_argument('--host', type=str, default='0.0.0.0', help='Host to bind to')
    parser.add_argument('--port', type=int, default=8000, help='Port to bind to')
    parser.add_argument('--workers', type=int, default=1, help='Number of worker processes')
    parser.add_argument('--reload', action='store_true', help='Enable auto-reload for development')
    
    args = parser.parse_args()
    
    logger.info(f"Starting server on {args.host}:{args.port}")
    
    if args.reload:
        # Development mode with auto-reload
        uvicorn.run(
            "server:app",
            host=args.host,
            port=args.port,
            reload=True,
            log_level="info"
        )
    else:
        # Production mode
        uvicorn.run(
            "server:app",
            host=args.host,
            port=args.port,
            workers=args.workers,
            log_level="info"
        )

if __name__ == "__main__":
    main()
