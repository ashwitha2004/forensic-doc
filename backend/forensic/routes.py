"""
Forensic analysis API routes
FastAPI routes for image forensic analysis
"""

import logging
import tempfile
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, UploadFile, File, HTTPException, BackgroundTasks
from fastapi.responses import JSONResponse

from .service import ForensicService
from .schemas import ForensicResponse, ForensicRequest

logger = logging.getLogger(__name__)

# Create router
router = APIRouter(
    prefix="/api/forensic",
    tags=["forensic"],
    responses={404: {"description": "Not found"}}
)

# Initialize forensic service
forensic_service = ForensicService()


@router.post("/analyze", response_model=ForensicResponse)
async def analyze_image(
    image: UploadFile = File(..., description="Image file to analyze"),
    background_tasks: BackgroundTasks = None
):
    """
    Analyze uploaded image for forensic classification
    
    Args:
        image: Uploaded image file
        background_tasks: FastAPI background tasks for cleanup
        
    Returns:
        ForensicResponse with analysis results
    """
    logger.info(f"Received forensic analysis request: filename={image.filename}, content_type={image.content_type}, size={image.size}")
    # Validate file type
    allowed_extensions = {'.jpg', '.jpeg', '.png', '.webp'}
    
    # Handle missing filename
    if not image.filename:
        logger.error("No filename provided for uploaded file")
        raise HTTPException(
            status_code=400,
            detail=f"No filename provided. Allowed types: {', '.join(allowed_extensions)}"
        )
    
    file_extension = Path(image.filename).suffix.lower()
    
    if file_extension not in allowed_extensions:
        logger.error(f"Invalid file extension: {file_extension} from filename: {image.filename}")
        raise HTTPException(
            status_code=400,
            detail=f"File type {file_extension} not allowed. Allowed types: {', '.join(allowed_extensions)}"
        )
    
    # Validate file size (10MB limit)
    max_size = 10 * 1024 * 1024  # 10MB
    if image.size is None:
        logger.error("File size is None")
        raise HTTPException(
            status_code=400,
            detail="Unable to determine file size"
        )
    
    if image.size > max_size:
        logger.error(f"File size too large: {image.size} bytes (max: {max_size} bytes)")
        raise HTTPException(
            status_code=400,
            detail=f"File size exceeds {max_size // (1024*1024)}MB limit"
        )
    
    # Create temporary file
    temp_file = None
    try:
        # Create secure temporary file
        temp_file = forensic_service.validator.secure_temp_file(suffix=file_extension)
        
        # Write uploaded content to temp file
        with open(temp_file, "wb") as buffer:
            content = await image.read()
            buffer.write(content)
        
        # Perform forensic analysis
        result = await forensic_service.analyze_image(temp_file)
        
        # Schedule cleanup
        if background_tasks:
            background_tasks.add_task(forensic_service.validator.cleanup_temp_file, temp_file)
        else:
            # Cleanup immediately if no background tasks
            forensic_service.validator.cleanup_temp_file(temp_file)
        
        return result
        
    except HTTPException:
        # Re-raise HTTP exceptions
        if temp_file and temp_file.exists():
            forensic_service.validator.cleanup_temp_file(temp_file)
        raise
    
    except Exception as e:
        logger.error(f"Error in forensic analysis endpoint: {e}")
        
        # Cleanup on error
        if temp_file and temp_file.exists():
            forensic_service.validator.cleanup_temp_file(temp_file)
        
        raise HTTPException(
            status_code=500,
            detail=f"Forensic analysis failed: {str(e)}"
        )


@router.get("/detectors")
async def get_detector_info():
    """
    Get information about available forensic detectors
    
    Returns:
        Dictionary with detector information
    """
    try:
        return forensic_service.get_detector_details()
    except Exception as e:
        logger.error(f"Error getting detector info: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get detector information: {str(e)}"
        )


@router.post("/batch-analyze", response_model=List[ForensicResponse])
async def batch_analyze_images(
    images: List[UploadFile] = File(..., description="Multiple image files to analyze"),
    background_tasks: BackgroundTasks = None
):
    """
    Analyze multiple images in batch
    
    Args:
        images: List of uploaded image files
        background_tasks: FastAPI background tasks for cleanup
        
    Returns:
        List of ForensicResponse objects
    """
    # Validate batch size
    max_batch_size = 10
    if len(images) > max_batch_size:
        raise HTTPException(
            status_code=400,
            detail=f"Batch size exceeds limit of {max_batch_size} images"
        )
    
    # Validate each file
    allowed_extensions = {'.jpg', '.jpeg', '.png', '.webp'}
    max_size = 10 * 1024 * 1024  # 10MB
    
    temp_files = []
    try:
        # Create temporary files and validate
        for image in images:
            file_extension = Path(image.filename).suffix.lower()
            
            if file_extension not in allowed_extensions:
                raise HTTPException(
                    status_code=400,
                    detail=f"File {image.filename} has unsupported type {file_extension}"
                )
            
            if image.size > max_size:
                raise HTTPException(
                    status_code=400,
                    detail=f"File {image.filename} exceeds size limit"
                )
            
            # Create temp file
            temp_file = forensic_service.validator.secure_temp_file(suffix=file_extension)
            temp_files.append(temp_file)
            
            # Write content
            with open(temp_file, "wb") as buffer:
                content = await image.read()
                buffer.write(content)
        
        # Perform batch analysis
        results = await forensic_service.batch_analyze(temp_files)
        
        # Schedule cleanup
        if background_tasks:
            for temp_file in temp_files:
                background_tasks.add_task(forensic_service.validator.cleanup_temp_file, temp_file)
        else:
            # Cleanup immediately
            for temp_file in temp_files:
                forensic_service.validator.cleanup_temp_file(temp_file)
        
        return results
        
    except HTTPException:
        # Re-raise HTTP exceptions
        for temp_file in temp_files:
            forensic_service.validator.cleanup_temp_file(temp_file)
        raise
    
    except Exception as e:
        logger.error(f"Error in batch analysis endpoint: {e}")
        
        # Cleanup on error
        for temp_file in temp_files:
            forensic_service.validator.cleanup_temp_file(temp_file)
        
        raise HTTPException(
            status_code=500,
            detail=f"Batch analysis failed: {str(e)}"
        )


@router.get("/health")
async def health_check():
    """
    Health check endpoint for forensic service
    
    Returns:
        Health status
    """
    try:
        # Test if service is initialized properly
        detector_info = forensic_service.get_detector_details()
        
        return {
            "status": "healthy",
            "service": "forensic_analysis",
            "detectors_available": len(detector_info.get('detectors', {})),
            "version": "1.0.0"
        }
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return JSONResponse(
            status_code=503,
            content={
                "status": "unhealthy",
                "service": "forensic_analysis",
                "error": str(e)
            }
        )


@router.get("/stats")
async def get_analysis_stats():
    """
    Get analysis statistics (placeholder for future implementation)
    
    Returns:
        Analysis statistics
    """
    try:
        # This is a placeholder for future statistics collection
        return {
            "total_analyses": 0,
            "average_processing_time_ms": 0,
            "classification_distribution": {
                "Camera Captured": 0,
                "AI Generated": 0,
                "Screenshot": 0,
                "Unknown": 0
            },
            "average_confidence": 0.0,
            "note": "Statistics collection not yet implemented"
        }
    except Exception as e:
        logger.error(f"Error getting stats: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get statistics: {str(e)}"
        )
