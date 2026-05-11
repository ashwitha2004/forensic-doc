"""
AI detector for forensic analysis
Analyzes image characteristics to determine if image is AI-generated
"""

import logging
from pathlib import Path
from typing import Dict, Any, Optional
import numpy as np
import cv2

from ..schemas import AIDetectionResult
from .utils import ImageProcessor

logger = logging.getLogger(__name__)


class AIDetector:
    """AI-generated image detection using heuristic analysis"""
    
    def __init__(self):
        self.processor = ImageProcessor()
        
        # AI detection thresholds
        self.min_smoothing_score = 0.3  # Minimum smoothing for AI detection
        self.max_texture_uniformity = 0.8  # Maximum texture uniformity
        self.min_frequency_anomaly = 0.2  # Minimum frequency domain anomaly
        
    def analyze(self, image_path: Path) -> AIDetectionResult:
        """
        Analyze image for AI generation characteristics
        
        Args:
            image_path: Path to image file
            
        Returns:
            AIDetectionResult with analysis results
        """
        try:
            # Load and preprocess image
            image = self.processor.load_image_safely(image_path)
            if image is None:
                logger.error(f"Failed to load image for AI detection: {image_path}")
                return AIDetectionResult(probability=0.0, confidence=0.0)
            
            # Preprocess for analysis
            processed_image = self._preprocess_image(image)
            
            # Extract AI-specific features
            smoothing_score = self._detect_oversmoothing(processed_image)
            texture_artifacts = self._detect_texture_artifacts(processed_image)
            frequency_analysis = self._analyze_frequency_domain(processed_image)
            pattern_analysis = self._analyze_repetitive_patterns(processed_image)
            
            # Calculate AI probability
            ai_probability = self._calculate_ai_probability(
                smoothing_score,
                texture_artifacts,
                frequency_analysis,
                pattern_analysis
            )
            
            # Calculate confidence
            confidence = self._calculate_confidence(
                smoothing_score,
                texture_artifacts,
                frequency_analysis,
                pattern_analysis
            )
            
            logger.info(f"AI detection for {image_path}: probability={ai_probability:.3f}, confidence={confidence:.3f}")
            
            return AIDetectionResult(
                probability=ai_probability,
                confidence=confidence,
                frequency_analysis=frequency_analysis,
                smoothing_score=smoothing_score,
                texture_artifacts=texture_artifacts,
                metadata={
                    'analysis_method': 'heuristic_frequency_analysis',
                    'features_used': ['smoothing', 'texture_artifacts', 'frequency_domain', 'repetitive_patterns'],
                    'pattern_analysis': pattern_analysis
                }
            )
            
        except Exception as e:
            logger.error(f"Error in AI detection for {image_path}: {e}")
            return AIDetectionResult(probability=0.0, confidence=0.0)
    
    def _preprocess_image(self, image: np.ndarray) -> np.ndarray:
        """
        Preprocess image for AI detection analysis
        
        Args:
            image: Input image array
            
        Returns:
            Preprocessed image array
        """
        try:
            # Normalize image
            normalized = self.processor.normalize_image(image)
            
            # Resize to standard size for consistency
            resized = self.processor.resize_image(normalized, (512, 512))
            
            return resized
            
        except Exception as e:
            logger.error(f"Error in image preprocessing: {e}")
            return image
    
    def _detect_oversmoothing(self, image: np.ndarray) -> float:
        """
        Detect oversmoothing common in AI-generated images
        
        Args:
            image: Preprocessed image array
            
        Returns:
            Smoothing score (0-1)
        """
        try:
            # Convert to grayscale if needed
            if len(image.shape) == 3:
                gray = cv2.cvtColor((image * 255).astype(np.uint8), cv2.COLOR_RGB2GRAY)
            else:
                gray = (image * 255).astype(np.uint8)
            
            # Calculate local variance map
            kernel_size = 5
            kernel = np.ones((kernel_size, kernel_size), np.float32) / (kernel_size * kernel_size)
            
            # Local mean and variance
            mean = cv2.filter2D(gray.astype(np.float32), -1, kernel)
            sqr_mean = cv2.filter2D((gray.astype(np.float32))**2, -1, kernel)
            variance = sqr_mean - mean**2
            
            # Calculate smoothing metrics
            avg_variance = np.mean(variance)
            std_variance = np.std(variance)
            
            # High variance indicates natural texture, low variance suggests smoothing
            # Normalize to 0-1 where higher values indicate more smoothing
            smoothing_score = 1.0 / (1.0 + avg_variance / 100.0)
            
            # Additional smoothing detection using gradient analysis
            grad_x = cv2.Sobel(gray, cv2.CV_64F, 1, 0, ksize=3)
            grad_y = cv2.Sobel(gray, cv2.CV_64F, 0, 1, ksize=3)
            gradient_magnitude = np.sqrt(grad_x**2 + grad_y**2)
            
            avg_gradient = np.mean(gradient_magnitude)
            gradient_smoothing = 1.0 / (1.0 + avg_gradient / 10.0)
            
            # Combine smoothing indicators
            combined_smoothing = (smoothing_score + gradient_smoothing) / 2.0
            
            return float(combined_smoothing)
            
        except Exception as e:
            logger.error(f"Error detecting oversmoothing: {e}")
            return 0.0
    
    def _detect_texture_artifacts(self, image: np.ndarray) -> float:
        """
        Detect texture artifacts common in AI-generated images
        
        Args:
            image: Preprocessed image array
            
        Returns:
            Texture artifact score (0-1)
        """
        try:
            # Convert to grayscale if needed
            if len(image.shape) == 3:
                gray = cv2.cvtColor((image * 255).astype(np.uint8), cv2.COLOR_RGB2GRAY)
            else:
                gray = (image * 255).astype(np.uint8)
            
            # Apply Gabor filters to detect texture patterns
            # AI images often have unusual texture patterns
            gabor_responses = []
            
            # Multiple orientations and frequencies
            for theta in [0, 45, 90, 135]:
                theta_rad = theta * np.pi / 180
                for frequency in [0.1, 0.3, 0.5]:
                    kernel = cv2.getGaborKernel((31, 31), 5, theta_rad, frequency, 0.5, 0, ktype=cv2.CV_32F)
                    filtered = cv2.filter2D(gray, cv2.CV_8UC3, kernel)
                    gabor_responses.append(np.std(filtered))
            
            # Analyze texture consistency
            texture_variance = np.var(gabor_responses)
            texture_mean = np.mean(gabor_responses)
            
            # AI images often have inconsistent texture patterns
            artifact_score = min(texture_variance / (texture_mean + 1e-6), 1.0)
            
            # Additional texture analysis using Local Binary Patterns
            lbp = self._calculate_lbp(gray)
            lbp_variance = np.var(lbp)
            
            # High LBP variance can indicate AI artifacts
            lbp_score = min(lbp_variance / 1000.0, 1.0)
            
            # Combine texture indicators
            combined_artifacts = (artifact_score + lbp_score) / 2.0
            
            return float(combined_artifacts)
            
        except Exception as e:
            logger.error(f"Error detecting texture artifacts: {e}")
            return 0.0
    
    def _calculate_lbp(self, image: np.ndarray, radius: int = 1, n_points: int = 8) -> np.ndarray:
        """
        Calculate Local Binary Pattern for texture analysis
        
        Args:
            image: Grayscale image
            radius: LBP radius
            n_points: Number of points in LBP
            
        Returns:
            LBP image
        """
        try:
            h, w = image.shape
            lbp = np.zeros_like(image)
            
            for i in range(radius, h - radius):
                for j in range(radius, w - radius):
                    center = image[i, j]
                    binary_string = ""
                    
                    for point in range(n_points):
                        angle = 2 * np.pi * point / n_points
                        x = i + radius * np.cos(angle)
                        y = j + radius * np.sin(angle)
                        
                        # Bilinear interpolation
                        x1, y1 = int(x), int(y)
                        x2, y2 = min(x1 + 1, h - 1), min(y1 + 1, w - 1)
                        
                        dx, dy = x - x1, y - y1
                        pixel_value = (
                            (1 - dx) * (1 - dy) * image[x1, y1] +
                            dx * (1 - dy) * image[x2, y1] +
                            (1 - dx) * dy * image[x1, y2] +
                            dx * dy * image[x2, y2]
                        )
                        
                        binary_string += "1" if pixel_value >= center else "0"
                    
                    lbp[i, j] = int(binary_string, 2)
            
            return lbp
            
        except Exception as e:
            logger.error(f"Error calculating LBP: {e}")
            return np.zeros_like(image)
    
    def _analyze_frequency_domain(self, image: np.ndarray) -> Dict[str, float]:
        """
        Analyze frequency domain characteristics
        
        Args:
            image: Preprocessed image array
            
        Returns:
            Dictionary with frequency analysis results
        """
        try:
            # Get frequency features from utility
            freq_features = self.processor.extract_frequency_features(image)
            
            # Additional frequency analysis for AI detection
            if len(image.shape) == 3:
                gray = cv2.cvtColor((image * 255).astype(np.uint8), cv2.COLOR_RGB2GRAY)
            else:
                gray = (image * 255).astype(np.uint8)
            
            # FFT analysis
            f_transform = np.fft.fft2(gray)
            f_shift = np.fft.fftshift(f_transform)
            magnitude = np.abs(f_shift)
            
            # Analyze frequency distribution
            h, w = magnitude.shape
            center_h, center_w = h // 2, w // 2
            
            # Radial frequency analysis
            radial_profile = []
            max_radius = min(center_h, center_w)
            
            for r in range(0, max_radius, 10):
                if r == 0:
                    radial_profile.append(magnitude[center_h, center_w])
                else:
                    # Create circular mask
                    y, x = np.ogrid[:h, :w]
                    mask = (x - center_w)**2 + (y - center_h)**2 <= r**2
                    prev_mask = (x - center_w)**2 + (y - center_h)**2 <= (r-10)**2
                    ring_mask = mask & ~prev_mask
                    
                    if np.any(ring_mask):
                        radial_profile.append(np.mean(magnitude[ring_mask]))
                    else:
                        radial_profile.append(0)
            
            # Calculate frequency anomalies
            if len(radial_profile) > 1:
                freq_gradient = np.gradient(radial_profile)
                freq_anomaly = np.std(freq_gradient) / (np.mean(np.abs(freq_gradient)) + 1e-6)
            else:
                freq_anomaly = 0.0
            
            return {
                'high_frequency_ratio': freq_features['high_frequency_ratio'],
                'low_frequency_ratio': freq_features['low_frequency_ratio'],
                'total_energy': freq_features['total_energy'],
                'frequency_anomaly': float(freq_anomaly),
                'radial_profile_mean': float(np.mean(radial_profile)) if radial_profile else 0.0
            }
            
        except Exception as e:
            logger.error(f"Error in frequency domain analysis: {e}")
            return {
                'high_frequency_ratio': 0.0,
                'low_frequency_ratio': 0.0,
                'total_energy': 0.0,
                'frequency_anomaly': 0.0,
                'radial_profile_mean': 0.0
            }
    
    def _analyze_repetitive_patterns(self, image: np.ndarray) -> Dict[str, Any]:
        """
        Analyze repetitive patterns common in AI-generated images
        
        Args:
            image: Preprocessed image array
            
        Returns:
            Dictionary with pattern analysis results
        """
        try:
            if len(image.shape) == 3:
                gray = cv2.cvtColor((image * 255).astype(np.uint8), cv2.COLOR_RGB2GRAY)
            else:
                gray = (image * 255).astype(np.uint8)
            
            h, w = gray.shape
            
            # Ensure image is not too small for analysis
            if h < 64 or w < 64:
                return {
                    'repetitive_peaks': 0,
                    'pattern_regularity': 0.0,
                    'has_repetitive_patterns': False
                }
            
            # Auto-correlation analysis for repetitive patterns
            # Use a safer approach with template matching
            template_size = min(32, h // 4, w // 4)
            if template_size < 8:
                return {
                    'repetitive_peaks': 0,
                    'pattern_regularity': 0.0,
                    'has_repetitive_patterns': False
                }
            
            # Extract template from center
            start_h = (h - template_size) // 2
            start_w = (w - template_size) // 2
            template = gray[start_h:start_h + template_size, start_w:start_w + template_size]
            
            # Find matches using template matching
            correlation = cv2.matchTemplate(gray, template, cv2.TM_CCORR_NORMED)
            
            # Find peaks in correlation (indicating repetitive patterns)
            threshold = 0.7
            peaks = []
            
            # Only search in valid correlation area
            corr_h, corr_w = correlation.shape
            for i in range(max(0, corr_h // 2), min(corr_h, corr_h // 2 + 100)):
                for j in range(max(0, corr_w // 2), min(corr_w, corr_w // 2 + 100)):
                    if i < corr_h and j < corr_w and correlation[i, j] > threshold:
                        peaks.append((i, j, correlation[i, j]))
            
            # Analyze pattern regularity
            if len(peaks) > 0:
                peak_positions = np.array([[p[0], p[1]] for p in peaks])
                peak_distances = []
                
                for i in range(len(peak_positions)):
                    for j in range(i + 1, len(peak_positions)):
                        dist = np.linalg.norm(peak_positions[i] - peak_positions[j])
                        peak_distances.append(dist)
                
                if peak_distances:
                    distance_variance = np.var(peak_distances)
                    pattern_regularity = 1.0 / (1.0 + distance_variance / 100.0)
                else:
                    pattern_regularity = 0.0
            else:
                pattern_regularity = 0.0
            
            return {
                'repetitive_peaks': len(peaks),
                'pattern_regularity': float(pattern_regularity),
                'has_repetitive_patterns': len(peaks) > 5 and pattern_regularity > 0.5
            }
            
        except Exception as e:
            logger.error(f"Error analyzing repetitive patterns: {e}")
            return {
                'repetitive_peaks': 0,
                'pattern_regularity': 0.0,
                'has_repetitive_patterns': False
            }
    
    def _calculate_ai_probability(
        self,
        smoothing_score: float,
        texture_artifacts: float,
        frequency_analysis: Dict[str, float],
        pattern_analysis: Dict[str, Any]
    ) -> float:
        """
        Calculate probability that image is AI-generated
        
        Args:
            smoothing_score: Oversmoothing detection score
            texture_artifacts: Texture artifact score
            frequency_analysis: Frequency domain analysis
            pattern_analysis: Repetitive pattern analysis
            
        Returns:
            AI probability (0-1)
        """
        probability = 0.0
        
        # Smoothing contribution
        if smoothing_score > self.min_smoothing_score:
            probability += smoothing_score * 0.3
        
        # Texture artifacts contribution
        if texture_artifacts > 0.2:
            probability += min(texture_artifacts, 1.0) * 0.25
        
        # Frequency domain contribution
        freq_anomaly = frequency_analysis.get('frequency_anomaly', 0.0)
        if freq_anomaly > self.min_frequency_anomaly:
            probability += min(freq_anomaly / 2.0, 1.0) * 0.25
        
        # Repetitive patterns contribution
        if pattern_analysis.get('has_repetitive_patterns', False):
            probability += 0.2
        
        return max(0.0, min(1.0, probability))
    
    def _calculate_confidence(
        self,
        smoothing_score: float,
        texture_artifacts: float,
        frequency_analysis: Dict[str, float],
        pattern_analysis: Dict[str, Any]
    ) -> float:
        """
        Calculate confidence in AI detection
        
        Args:
            smoothing_score: Oversmoothing detection score
            texture_artifacts: Texture artifact score
            frequency_analysis: Frequency domain analysis
            pattern_analysis: Repetitive pattern analysis
            
        Returns:
            Confidence score (0-1)
        """
        confidence = 0.0
        
        # Feature consistency check
        smoothing_confidence = min(smoothing_score * 2, 1.0) if smoothing_score > 0 else 0.0
        texture_confidence = min(texture_artifacts * 2, 1.0) if texture_artifacts > 0 else 0.0
        
        freq_anomaly = frequency_analysis.get('frequency_anomaly', 0.0)
        frequency_confidence = min(freq_anomaly, 1.0) if freq_anomaly > 0 else 0.0
        
        pattern_confidence = 0.5 if pattern_analysis.get('has_repetitive_patterns', False) else 0.0
        
        # Weighted confidence calculation
        confidence += smoothing_confidence * 0.3
        confidence += texture_confidence * 0.3
        confidence += frequency_confidence * 0.25
        confidence += pattern_confidence * 0.15
        
        return min(confidence, 1.0)
