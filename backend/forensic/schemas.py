"""
Pydantic schemas for forensic analysis API
"""

from pydantic import BaseModel, Field
from typing import Optional, Dict, Any
from datetime import datetime


class ForensicRequest(BaseModel):
    """Request schema for forensic analysis"""
    pass  # Will use multipart form data for image upload


class ForensicSignals(BaseModel):
    """Forensic detection signals"""
    metadata_detected: bool = Field(..., description="Whether metadata was detected")
    camera_probability: float = Field(..., ge=0, le=1, description="Camera capture probability")
    ai_probability: float = Field(..., ge=0, le=1, description="AI generation probability")
    screenshot_probability: float = Field(..., ge=0, le=1, description="Screenshot probability")


class ForensicResponse(BaseModel):
    """Response schema for forensic analysis"""
    success: bool = Field(..., description="Analysis success status")
    prediction: str = Field(..., description="Final classification result")
    confidence: float = Field(..., ge=0, le=100, description="Confidence percentage")
    signals: ForensicSignals = Field(..., description="Detailed forensic signals")
    processing_time_ms: Optional[float] = Field(None, description="Processing time in milliseconds")
    error_message: Optional[str] = Field(None, description="Error message if analysis failed")


class EXIFMetadata(BaseModel):
    """EXIF metadata structure"""
    has_camera_metadata: bool = Field(..., description="Whether camera metadata exists")
    camera_make: Optional[str] = Field(None, description="Camera manufacturer")
    camera_model: Optional[str] = Field(None, description="Camera model")
    iso: Optional[int] = Field(None, description="ISO setting")
    lens_info: Optional[str] = Field(None, description="Lens information")
    datetime_original: Optional[datetime] = Field(None, description="Original capture datetime")
    software: Optional[str] = Field(None, description="Software used")
    flash_fired: Optional[bool] = Field(None, description="Whether flash was used")


class DetectorResult(BaseModel):
    """Base result for all detectors"""
    probability: float = Field(..., ge=0, le=1, description="Detection probability")
    confidence: float = Field(..., ge=0, le=1, description="Detection confidence")
    metadata: Optional[Dict[str, Any]] = Field(None, description="Additional detector metadata")


class CameraDetectionResult(DetectorResult):
    """Camera detection specific result"""
    noise_variance: Optional[float] = Field(None, description="Noise variance analysis")
    laplacian_score: Optional[float] = Field(None, description="Laplacian variance score")


class ScreenshotDetectionResult(DetectorResult):
    """Screenshot detection specific result"""
    edge_density: Optional[float] = Field(None, description="Edge density score")
    text_density: Optional[float] = Field(None, description="Text density approximation")
    flat_regions: Optional[float] = Field(None, description="Flat UI regions percentage")


class AIDetectionResult(DetectorResult):
    """AI detection specific result"""
    frequency_analysis: Optional[Dict[str, float]] = Field(None, description="Frequency domain analysis")
    smoothing_score: Optional[float] = Field(None, description="Oversmoothing detection score")
    texture_artifacts: Optional[float] = Field(None, description="Texture artifact detection")
