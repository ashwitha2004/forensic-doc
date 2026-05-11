"""
Camera detector for forensic analysis
Analyzes image characteristics to determine if image was captured by a camera
"""

import logging
from pathlib import Path
from typing import Dict, Any, Optional
import numpy as np
import cv2

from ..schemas import CameraDetectionResult
from .utils import ImageProcessor, ImageValidator

logger = logging.getLogger(__name__)


class CameraDetector:
    """Camera capture detection using image analysis"""
    
    def __init__(self):
        self.processor = ImageProcessor()
        
        # Camera detection thresholds
        self.min_laplacian_variance = 50.0  # Minimum expected for natural images
        self.max_laplacian_variance = 1000.0  # Maximum reasonable value
        self.min_noise_variance = 1.0  # Minimum sensor noise
        self.max_noise_variance = 100.0  # Maximum reasonable noise
        
    def analyze(self, image_path: Path, exif_metadata=None) -> CameraDetectionResult:
        """
        Analyze image for camera capture characteristics
        
        Args:
            image_path: Path to image file
            exif_metadata: Optional EXIF metadata from EXIFDetector
            
        Returns:
            CameraDetectionResult with analysis results
        """
        try:
            # Load image
            image = self.processor.load_image_safely(image_path)
            if image is None:
                logger.error(f"Failed to load image for camera detection: {image_path}")
                return CameraDetectionResult(probability=0.0, confidence=0.0)
            
            # Extract camera-specific features
            laplacian_score = self.processor.calculate_laplacian_variance(image)
            noise_variance = self.processor.calculate_noise_variance(image)
            
            # Calculate camera probability based on multiple factors
            camera_probability = self._calculate_camera_probability(
                laplacian_score, 
                noise_variance, 
                exif_metadata
            )
            
            # Calculate overall confidence
            confidence = self._calculate_confidence(
                laplacian_score, 
                noise_variance, 
                exif_metadata
            )
            
            logger.info(f"Camera detection for {image_path}: probability={camera_probability:.3f}, confidence={confidence:.3f}")
            
            return CameraDetectionResult(
                probability=camera_probability,
                confidence=confidence,
                noise_variance=noise_variance,
                laplacian_score=laplacian_score,
                metadata={
                    'analysis_method': 'heuristic_noise_analysis',
                    'features_used': ['laplacian_variance', 'noise_variance', 'exif_signals']
                }
            )
            
        except Exception as e:
            logger.error(f"Error in camera detection for {image_path}: {e}")
            return CameraDetectionResult(probability=0.0, confidence=0.0)
    
    def _calculate_camera_probability(
        self, 
        laplacian_score: float, 
        noise_variance: float, 
        exif_metadata=None
    ) -> float:
        """
        Calculate probability that image was captured by camera
        
        Args:
            laplacian_score: Laplacian variance score
            noise_variance: Noise variance estimate
            exif_metadata: Optional EXIF metadata
            
        Returns:
            Camera probability (0-1)
        """
        probability = 0.0
        
        # Laplacian variance analysis
        laplacian_score_normalized = self._normalize_laplacian_score(laplacian_score)
        probability += laplacian_score_normalized * 0.4
        
        # Noise variance analysis
        noise_score_normalized = self._normalize_noise_variance(noise_variance)
        probability += noise_score_normalized * 0.3
        
        # EXIF metadata contribution
        if exif_metadata and exif_metadata.has_camera_metadata:
            exif_score = 0.3
            # Bonus points for complete metadata
            if exif_metadata.camera_make and exif_metadata.camera_model:
                exif_score += 0.1
            if exif_metadata.iso and exif_metadata.datetime_original:
                exif_score += 0.1
            probability += min(exif_score, 0.3)
        else:
            # Penalty for missing EXIF
            probability -= 0.1
        
        return max(0.0, min(1.0, probability))
    
    def _normalize_laplacian_score(self, laplacian_score: float) -> float:
        """
        Normalize Laplacian variance score to 0-1 range
        
        Args:
            laplacian_score: Raw Laplacian variance
            
        Returns:
            Normalized score (0-1)
        """
        if laplacian_score < self.min_laplacian_variance:
            # Too low - likely artificially smooth
            return 0.0
        elif laplacian_score > self.max_laplacian_variance:
            # Too high - likely noise or artifacts
            return 0.3
        else:
            # Good range for natural images
            normalized = (laplacian_score - self.min_laplacian_variance) / (self.max_laplacian_variance - self.min_laplacian_variance)
            # Apply sigmoid-like curve for better discrimination
            return 1.0 / (1.0 + np.exp(-10 * (normalized - 0.5)))
    
    def _normalize_noise_variance(self, noise_variance: float) -> float:
        """
        Normalize noise variance to 0-1 range
        
        Args:
            noise_variance: Raw noise variance
            
        Returns:
            Normalized score (0-1)
        """
        if noise_variance < self.min_noise_variance:
            # Too low - likely artificially generated
            return 0.0
        elif noise_variance > self.max_noise_variance:
            # Too high - likely corrupted or processed
            return 0.2
        else:
            # Good range for natural sensor noise
            normalized = (noise_variance - self.min_noise_variance) / (self.max_noise_variance - self.min_noise_variance)
            return normalized
    
    def _calculate_confidence(
        self, 
        laplacian_score: float, 
        noise_variance: float, 
        exif_metadata=None
    ) -> float:
        """
        Calculate confidence in the camera detection result
        
        Args:
            laplacian_score: Laplacian variance score
            noise_variance: Noise variance estimate
            exif_metadata: Optional EXIF metadata
            
        Returns:
            Confidence score (0-1)
        """
        confidence = 0.0
        
        # Feature consistency check
        laplacian_confidence = 0.0
        if self.min_laplacian_variance <= laplacian_score <= self.max_laplacian_variance:
            laplacian_confidence = 0.8
        elif laplacian_score > 0:
            laplacian_confidence = 0.3
        
        noise_confidence = 0.0
        if self.min_noise_variance <= noise_variance <= self.max_noise_variance:
            noise_confidence = 0.8
        elif noise_variance > 0:
            noise_confidence = 0.3
        
        confidence += laplacian_confidence * 0.5
        confidence += noise_confidence * 0.3
        
        # EXIF metadata confidence
        if exif_metadata:
            if exif_metadata.has_camera_metadata:
                confidence += 0.2
            else:
                confidence += 0.1  # Still some confidence without EXIF
        else:
            confidence += 0.05
        
        return min(confidence, 1.0)
    
    def analyze_sensor_patterns(self, image: np.ndarray) -> Dict[str, Any]:
        """
        Analyze sensor-specific patterns (placeholder for future PRNU integration)
        
        Args:
            image: Input image array
            
        Returns:
            Dictionary with sensor pattern analysis
        """
        # This is a placeholder for future PRNU (Photo Response Non-Uniformity) analysis
        # Currently implements basic pattern detection
        
        try:
            # Convert to grayscale
            if len(image.shape) == 3:
                gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY)
            else:
                gray = image
            
            # Basic pattern analysis
            h, w = gray.shape
            
            # Analyze periodic patterns (potential sensor artifacts)
            fft = np.fft.fft2(gray)
            fft_shift = np.fft.fftshift(fft)
            magnitude = np.abs(fft_shift)
            
            # Look for regular patterns in frequency domain
            center_h, center_w = h // 2, w // 2
            
            # Sample frequency domain for patterns
            sample_region = magnitude[center_h-50:center_h+50, center_w-50:center_w+50]
            pattern_score = np.std(sample_region) / np.mean(sample_region) if np.mean(sample_region) > 0 else 0
            
            return {
                'pattern_score': float(pattern_score),
                'has_periodic_patterns': pattern_score > 0.1,
                'sensor_artifacts_detected': pattern_score > 0.2,
                'note': 'Basic pattern analysis - PRNU integration planned for future'
            }
            
        except Exception as e:
            logger.error(f"Error in sensor pattern analysis: {e}")
            return {
                'pattern_score': 0.0,
                'has_periodic_patterns': False,
                'sensor_artifacts_detected': False,
                'error': str(e)
            }
    
    def detect_compression_artifacts(self, image: np.ndarray) -> Dict[str, Any]:
        """
        Detect compression artifacts that may indicate processing
        
        Args:
            image: Input image array
            
        Returns:
            Dictionary with compression artifact analysis
        """
        try:
            # Convert to grayscale
            if len(image.shape) == 3:
                gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY)
            else:
                gray = image
            
            # Detect JPEG compression artifacts (8x8 blocks)
            h, w = gray.shape
            
            # Calculate blockiness metric
            blockiness_score = 0.0
            block_size = 8
            
            # Horizontal block boundaries
            for i in range(block_size, h, block_size):
                if i < h:
                    diff = np.abs(gray[i-1, :] - gray[i, :])
                    blockiness_score += np.mean(diff)
            
            # Vertical block boundaries  
            for j in range(block_size, w, block_size):
                if j < w:
                    diff = np.abs(gray[:, j-1] - gray[:, j])
                    blockiness_score += np.mean(diff)
            
            # Normalize
            total_boundaries = (h // block_size - 1) * w + (w // block_size - 1) * h
            if total_boundaries > 0:
                blockiness_score /= total_boundaries
            
            # Detect DCT artifacts in frequency domain
            fft = np.fft.fft2(gray)
            fft_shift = np.fft.fftshift(fft)
            magnitude = np.abs(fft_shift)
            
            # Look for DCT grid patterns
            center_h, center_w = h // 2, w // 2
            dct_grid_region = magnitude[center_h-32:center_w+32, center_w-32:center_w+32]
            
            # Calculate grid-like pattern strength
            grid_score = 0.0
            for i in range(0, 64, 8):
                for j in range(0, 64, 8):
                    if i < dct_grid_region.shape[0] and j < dct_grid_region.shape[1]:
                        grid_score += dct_grid_region[i, j]
            
            return {
                'blockiness_score': float(blockiness_score),
                'has_compression_artifacts': blockiness_score > 5.0,
                'dct_grid_score': float(grid_score),
                'compression_level': 'high' if blockiness_score > 10.0 else 'medium' if blockiness_score > 5.0 else 'low'
            }
            
        except Exception as e:
            logger.error(f"Error in compression artifact detection: {e}")
            return {
                'blockiness_score': 0.0,
                'has_compression_artifacts': False,
                'dct_grid_score': 0.0,
                'compression_level': 'unknown',
                'error': str(e)
            }
