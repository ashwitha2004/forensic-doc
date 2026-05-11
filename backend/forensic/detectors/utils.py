"""
Utility functions for forensic analysis
Image validation, processing, and common operations
"""

import os
import tempfile
import logging
from pathlib import Path
from typing import Tuple, Optional, Union
from PIL import Image, ExifTags
import cv2
import numpy as np

logger = logging.getLogger(__name__)


class ImageValidator:
    """Secure image validation and processing utilities"""
    
    ALLOWED_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.webp'}
    MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB
    
    @staticmethod
    def validate_file(file_path: Union[str, Path]) -> Tuple[bool, str]:
        """
        Validate uploaded image file
        
        Args:
            file_path: Path to uploaded file
            
        Returns:
            Tuple of (is_valid, error_message)
        """
        try:
            file_path = Path(file_path)
            
            # Check file size
            if file_path.stat().st_size > ImageValidator.MAX_FILE_SIZE:
                return False, f"File size exceeds {ImageValidator.MAX_FILE_SIZE // (1024*1024)}MB limit"
            
            # Check extension
            if file_path.suffix.lower() not in ImageValidator.ALLOWED_EXTENSIONS:
                return False, f"File type {file_path.suffix} not allowed. Allowed: {', '.join(ImageValidator.ALLOWED_EXTENSIONS)}"
            
            # Verify it's actually an image
            try:
                with Image.open(file_path) as img:
                    img.verify()
            except Exception as e:
                return False, f"Invalid image file: {str(e)}"
            
            # Re-open to check if image can be loaded
            try:
                with Image.open(file_path) as img:
                    img.load()
            except Exception as e:
                return False, f"Corrupted image file: {str(e)}"
            
            return True, ""
            
        except Exception as e:
            return False, f"Validation error: {str(e)}"
    
    @staticmethod
    def secure_temp_file(suffix: str = None) -> Path:
        """Create secure temporary file"""
        temp_dir = Path(tempfile.gettempdir())
        temp_file = tempfile.NamedTemporaryFile(
            dir=temp_dir,
            suffix=suffix or '.jpg',
            delete=False
        )
        temp_file.close()
        return Path(temp_file.name)
    
    @staticmethod
    def cleanup_temp_file(file_path: Union[str, Path]) -> None:
        """Safely remove temporary file"""
        try:
            file_path = Path(file_path)
            if file_path.exists():
                file_path.unlink()
        except Exception as e:
            logger.warning(f"Failed to cleanup temp file {file_path}: {e}")


class ImageProcessor:
    """Image processing utilities for forensic analysis"""
    
    @staticmethod
    def load_image_safely(file_path: Union[str, Path]) -> Optional[np.ndarray]:
        """
        Safely load image using OpenCV
        
        Args:
            file_path: Path to image file
            
        Returns:
            OpenCV image array or None if failed
        """
        try:
            # Read image
            img = cv2.imread(str(file_path))
            if img is None:
                logger.error(f"Failed to load image: {file_path}")
                return None
            
            # Convert BGR to RGB for consistency
            img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
            return img_rgb
            
        except Exception as e:
            logger.error(f"Error loading image {file_path}: {e}")
            return None
    
    @staticmethod
    def load_image_pil(file_path: Union[str, Path]) -> Optional[Image.Image]:
        """
        Load image using PIL for metadata extraction
        
        Args:
            file_path: Path to image file
            
        Returns:
            PIL Image or None if failed
        """
        try:
            img = Image.open(file_path)
            return img
        except Exception as e:
            logger.error(f"Error loading PIL image {file_path}: {e}")
            return None
    
    @staticmethod
    def normalize_image(image: np.ndarray) -> np.ndarray:
        """
        Normalize image to 0-1 range
        
        Args:
            image: Input image array
            
        Returns:
            Normalized image array
        """
        if image.dtype != np.float32:
            image = image.astype(np.float32)
        return image / 255.0
    
    @staticmethod
    def resize_image(image: np.ndarray, target_size: Tuple[int, int] = (512, 512)) -> np.ndarray:
        """
        Resize image maintaining aspect ratio
        
        Args:
            image: Input image array
            target_size: Target size (width, height)
            
        Returns:
            Resized image array
        """
        try:
            if image is None or len(image.shape) == 0:
                logger.error("Invalid image provided for resizing")
                return np.zeros((target_size[1], target_size[0], 3), dtype=np.uint8)
            
            h, w = image.shape[:2]
            target_w, target_h = target_size
            
            # Ensure minimum size
            if h < 1 or w < 1:
                logger.error(f"Invalid image dimensions: {h}x{w}")
                return np.zeros((target_size[1], target_size[0], 3), dtype=np.uint8)
            
            # Calculate scaling factor
            scale = min(target_w / w, target_h / h)
            new_w, new_h = max(1, int(w * scale)), max(1, int(h * scale))
            
            # Resize image
            resized = cv2.resize(image, (new_w, new_h), interpolation=cv2.INTER_AREA)
            
            # Pad to target size if needed
            if new_w != target_w or new_h != target_h:
                pad_w = target_w - new_w
                pad_h = target_h - new_h
                padded = cv2.copyMakeBorder(
                    resized, 
                    0, pad_h, 0, pad_w,
                    cv2.BORDER_CONSTANT,
                    value=[0, 0, 0] if len(resized.shape) == 3 else 0
                )
                return padded
            
            return resized
            
        except Exception as e:
            logger.error(f"Error resizing image: {e}")
            return np.zeros((target_size[1], target_size[0], 3), dtype=np.uint8)
    
    @staticmethod
    def calculate_laplacian_variance(image: np.ndarray) -> float:
        """
        Calculate Laplacian variance for blur/noise detection
        
        Args:
            image: Input image array
            
        Returns:
            Laplacian variance score
        """
        try:
            if image is None or len(image.shape) == 0:
                logger.error("Invalid image provided for Laplacian variance")
                return 0.0
            
            # Convert to grayscale if needed
            if len(image.shape) == 3:
                gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY)
            else:
                gray = image
            
            h, w = gray.shape
            
            # Ensure minimum size
            if h < 3 or w < 3:
                logger.error(f"Image too small for Laplacian variance: {h}x{w}")
                return 0.0
            
            # Calculate Laplacian variance
            laplacian = cv2.Laplacian(gray, cv2.CV_64F)
            variance = laplacian.var()
            
            return float(variance)
            
        except Exception as e:
            logger.error(f"Error calculating Laplacian variance: {e}")
            return 0.0
    
    @staticmethod
    def calculate_noise_variance(image: np.ndarray) -> float:
        """
        Estimate noise variance in image
        
        Args:
            image: Input image array
            
        Returns:
            Noise variance estimate
        """
        try:
            # Convert to grayscale if needed
            if len(image.shape) == 3:
                gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY)
            else:
                gray = image
            
            # Use median filter to estimate noise
            median = cv2.medianBlur(gray, 5)
            noise = cv2.absdiff(gray, median)
            
            # Calculate variance of noise
            noise_variance = np.var(noise)
            
            return float(noise_variance)
            
        except Exception as e:
            logger.error(f"Error calculating noise variance: {e}")
            return 0.0
    
    @staticmethod
    def extract_frequency_features(image: np.ndarray) -> dict:
        """
        Extract frequency domain features
        
        Args:
            image: Input image array
            
        Returns:
            Dictionary of frequency features
        """
        try:
            # Convert to grayscale if needed
            if len(image.shape) == 3:
                gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY)
            else:
                gray = image
            
            # Apply FFT
            f_transform = np.fft.fft2(gray)
            f_shift = np.fft.fftshift(f_transform)
            magnitude = np.abs(f_shift)
            
            # Calculate frequency statistics
            h, w = magnitude.shape
            center_h, center_w = h // 2, w // 2
            
            # High frequency energy (edges, details)
            high_freq_mask = np.zeros_like(magnitude, dtype=bool)
            high_freq_mask[:center_h-10, :] = True
            high_freq_mask[center_h+10:, :] = True
            high_freq_mask[:, :center_w-10] = True
            high_freq_mask[:, center_w+10:] = True
            high_freq_mask[center_h-10:center_h+10, center_w-10:center_w+10] = False
            
            high_freq_energy = np.sum(magnitude[high_freq_mask])
            total_energy = np.sum(magnitude)
            high_freq_ratio = high_freq_energy / total_energy if total_energy > 0 else 0
            
            # Low frequency energy (smooth areas)
            low_freq_mask = np.zeros_like(magnitude, dtype=bool)
            low_freq_mask[center_h-10:center_h+10, center_w-10:center_w+10] = True
            
            low_freq_energy = np.sum(magnitude[low_freq_mask])
            low_freq_ratio = low_freq_energy / total_energy if total_energy > 0 else 0
            
            return {
                'high_frequency_ratio': float(high_freq_ratio),
                'low_frequency_ratio': float(low_freq_ratio),
                'total_energy': float(total_energy)
            }
            
        except Exception as e:
            logger.error(f"Error extracting frequency features: {e}")
            return {
                'high_frequency_ratio': 0.0,
                'low_frequency_ratio': 0.0,
                'total_energy': 0.0
            }
