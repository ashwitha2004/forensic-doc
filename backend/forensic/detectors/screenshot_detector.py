"""
Screenshot detector for forensic analysis
Analyzes image characteristics to determine if image is a screenshot
"""

import logging
from pathlib import Path
from typing import Dict, Any, Optional
import numpy as np
import cv2

from ..schemas import ScreenshotDetectionResult
from .utils import ImageProcessor

logger = logging.getLogger(__name__)


class ScreenshotDetector:
    """Screenshot detection using image analysis"""
    
    def __init__(self):
        self.processor = ImageProcessor()
        
        # Screenshot detection thresholds
        self.min_edge_density = 100.0  # Minimum edge density for UI elements
        self.max_edge_density = 500.0  # Maximum reasonable edge density
        self.min_text_density = 0.05   # Minimum text density ratio
        self.max_flat_region_ratio = 0.3  # Maximum flat regions for natural images
        
    def analyze(self, image_path: Path) -> ScreenshotDetectionResult:
        """
        Analyze image for screenshot characteristics
        
        Args:
            image_path: Path to image file
            
        Returns:
            ScreenshotDetectionResult with analysis results
        """
        try:
            # Load image
            image = self.processor.load_image_safely(image_path)
            if image is None:
                logger.error(f"Failed to load image for screenshot detection: {image_path}")
                return ScreenshotDetectionResult(probability=0.0, confidence=0.0)
            
            # Extract screenshot-specific features
            edge_density = self._calculate_edge_density(image)
            text_density = self._estimate_text_density(image)
            flat_regions = self._detect_flat_regions(image)
            ui_indicators = self._detect_ui_indicators(image)
            
            # Calculate screenshot probability
            screenshot_probability = self._calculate_screenshot_probability(
                edge_density, 
                text_density, 
                flat_regions, 
                ui_indicators
            )
            
            # Calculate confidence
            confidence = self._calculate_confidence(
                edge_density, 
                text_density, 
                flat_regions, 
                ui_indicators
            )
            
            logger.info(f"Screenshot detection for {image_path}: probability={screenshot_probability:.3f}, confidence={confidence:.3f}")
            
            return ScreenshotDetectionResult(
                probability=screenshot_probability,
                confidence=confidence,
                edge_density=edge_density,
                text_density=text_density,
                flat_regions=flat_regions,
                metadata={
                    'analysis_method': 'heuristic_ui_analysis',
                    'features_used': ['edge_density', 'text_density', 'flat_regions', 'ui_indicators'],
                    'ui_indicators': ui_indicators
                }
            )
            
        except Exception as e:
            logger.error(f"Error in screenshot detection for {image_path}: {e}")
            return ScreenshotDetectionResult(probability=0.0, confidence=0.0)
    
    def _calculate_edge_density(self, image: np.ndarray) -> float:
        """
        Calculate edge density using Canny edge detection
        
        Args:
            image: Input image array
            
        Returns:
            Edge density score
        """
        try:
            # Convert to grayscale
            if len(image.shape) == 3:
                gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY)
            else:
                gray = image
            
            # Apply Canny edge detection
            edges = cv2.Canny(gray, 50, 150)
            
            # Calculate edge density (percentage of edge pixels)
            edge_pixels = np.sum(edges > 0)
            total_pixels = edges.shape[0] * edges.shape[1]
            edge_density = (edge_pixels / total_pixels) * 1000  # Scale for better discrimination
            
            return float(edge_density)
            
        except Exception as e:
            logger.error(f"Error calculating edge density: {e}")
            return 0.0
    
    def _estimate_text_density(self, image: np.ndarray) -> float:
        """
        Estimate text density using morphological operations
        
        Args:
            image: Input image array
            
        Returns:
            Text density ratio (0-1)
        """
        try:
            # Convert to grayscale
            if len(image.shape) == 3:
                gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY)
            else:
                gray = image
            
            # Apply adaptive threshold to find text-like regions
            binary = cv2.adaptiveThreshold(
                gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, 
                cv2.THRESH_BINARY_INV, 11, 2
            )
            
            # Use morphological operations to identify text-like structures
            kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
            opened = cv2.morphologyEx(binary, cv2.MORPH_OPEN, kernel)
            
            # Find connected components (potential text characters)
            num_labels, labels, stats, centroids = cv2.connectedComponentsWithStats(opened)
            
            # Filter small components (noise)
            min_area = 10  # Minimum area for text characters
            text_components = 0
            total_text_area = 0
            
            for i in range(1, num_labels):  # Skip background (label 0)
                area = stats[i, cv2.CC_STAT_AREA]
                if area >= min_area and area <= 1000:  # Reasonable text character size
                    text_components += 1
                    total_text_area += area
            
            # Calculate text density
            total_pixels = gray.shape[0] * gray.shape[1]
            text_density = total_text_area / total_pixels
            
            return float(text_density)
            
        except Exception as e:
            logger.error(f"Error estimating text density: {e}")
            return 0.0
    
    def _detect_flat_regions(self, image: np.ndarray) -> float:
        """
        Detect large flat regions typical of UI interfaces
        
        Args:
            image: Input image array
            
        Returns:
            Flat region ratio (0-1)
        """
        try:
            # Convert to grayscale
            if len(image.shape) == 3:
                gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY)
            else:
                gray = image
            
            h, w = gray.shape
            
            # Ensure image is not too small for analysis
            if h < 30 or w < 30:
                return 0.0
            
            # Calculate local variance to find flat regions
            kernel_size = min(15, min(h, w) // 4)  # Adaptive kernel size
            if kernel_size < 3:
                kernel_size = 3
            
            kernel = np.ones((kernel_size, kernel_size), np.float32) / (kernel_size * kernel_size)
            
            # Calculate local mean and variance
            mean = cv2.filter2D(gray.astype(np.float32), -1, kernel)
            sqr_mean = cv2.filter2D((gray.astype(np.float32))**2, -1, kernel)
            variance = sqr_mean - mean**2
            
            # Find flat regions (low variance)
            flat_threshold = 10.0  # Low variance indicates flat regions
            flat_mask = variance < flat_threshold
            
            # Calculate flat region ratio
            flat_pixels = np.sum(flat_mask)
            total_pixels = h * w
            flat_ratio = flat_pixels / total_pixels if total_pixels > 0 else 0.0
            
            return float(flat_ratio)
            
        except Exception as e:
            logger.error(f"Error detecting flat regions: {e}")
            return 0.0
    
    def _detect_ui_indicators(self, image: np.ndarray) -> Dict[str, Any]:
        """
        Detect UI-specific indicators
        
        Args:
            image: Input image array
            
        Returns:
            Dictionary with UI indicator analysis
        """
        try:
            # Convert to grayscale
            if len(image.shape) == 3:
                gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY)
            else:
                gray = image
            
            h, w = gray.shape
            
            # Ensure image is not too small for analysis
            if h < 100 or w < 100:
                return {
                    'horizontal_lines': 0,
                    'vertical_lines': 0,
                    'rectangular_elements': 0,
                    'has_common_screen_ratio': False,
                    'ui_structure_score': 0.0
                }
            
            # Detect straight horizontal and vertical lines (UI borders)
            edges = cv2.Canny(gray, 50, 150)
            
            # Use safer HoughLines parameters
            lines_h = cv2.HoughLinesP(
                edges, 
                1, np.pi/2, 50, minLineLength=min(30, w//4), maxLineGap=10
            )
            
            lines_v = cv2.HoughLinesP(
                edges, 
                1, 0, 50, minLineLength=min(30, h//4), maxLineGap=10
            )
            
            horizontal_lines = len(lines_h) if lines_h is not None else 0
            vertical_lines = len(lines_v) if lines_v is not None else 0
            
            # Detect rectangular shapes (buttons, windows)
            contours, _ = cv2.findContours(
                cv2.Canny(gray, 50, 150), 
                cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
            )
            
            rectangular_contours = 0
            for contour in contours:
                approx = cv2.approxPolyDP(contour, 0.02 * cv2.arcLength(contour, True), True)
                if len(approx) == 4:  # Rectangle
                    rectangular_contours += 1
            
            # Check for common UI aspect ratios
            aspect_ratios = [w/h, h/w]
            common_ui_ratios = [16/9, 16/10, 4/3, 3/2, 1.0]  # Common screen ratios
            has_common_ratio = any(abs(ratio - common) < 0.1 for ratio in aspect_ratios for common in common_ui_ratios)
            
            return {
                'horizontal_lines': horizontal_lines,
                'vertical_lines': vertical_lines,
                'rectangular_elements': rectangular_contours,
                'has_common_screen_ratio': has_common_ratio,
                'ui_structure_score': (horizontal_lines + vertical_lines + rectangular_contours) / 100.0
            }
            
        except Exception as e:
            logger.error(f"Error detecting UI indicators: {e}")
            return {
                'horizontal_lines': 0,
                'vertical_lines': 0,
                'rectangular_elements': 0,
                'has_common_screen_ratio': False,
                'ui_structure_score': 0.0
            }
    
    def _calculate_screenshot_probability(
        self, 
        edge_density: float, 
        text_density: float, 
        flat_regions: float, 
        ui_indicators: Dict[str, Any]
    ) -> float:
        """
        Calculate probability that image is a screenshot
        
        Args:
            edge_density: Edge density score
            text_density: Text density ratio
            flat_regions: Flat region ratio
            ui_indicators: UI indicator analysis
            
        Returns:
            Screenshot probability (0-1)
        """
        probability = 0.0
        
        # Edge density contribution
        if edge_density > self.min_edge_density:
            edge_score = min(edge_density / self.max_edge_density, 1.0) * 0.25
            probability += edge_score
        
        # Text density contribution
        if text_density > self.min_text_density:
            text_score = min(text_density * 10, 1.0) * 0.25
            probability += text_score
        
        # Flat regions contribution (UI interfaces often have flat regions)
        if flat_regions > 0.1:
            flat_score = min(flat_regions / self.max_flat_region_ratio, 1.0) * 0.2
            probability += flat_score
        
        # UI indicators contribution
        ui_score = 0.0
        if ui_indicators['horizontal_lines'] > 5:
            ui_score += 0.1
        if ui_indicators['vertical_lines'] > 5:
            ui_score += 0.1
        if ui_indicators['rectangular_elements'] > 3:
            ui_score += 0.1
        if ui_indicators['has_common_screen_ratio']:
            ui_score += 0.1
        if ui_indicators['ui_structure_score'] > 0.1:
            ui_score += 0.1
        
        probability += min(ui_score, 0.3)
        
        return max(0.0, min(1.0, probability))
    
    def _calculate_confidence(
        self, 
        edge_density: float, 
        text_density: float, 
        flat_regions: float, 
        ui_indicators: Dict[str, Any]
    ) -> float:
        """
        Calculate confidence in screenshot detection
        
        Args:
            edge_density: Edge density score
            text_density: Text density ratio
            flat_regions: Flat region ratio
            ui_indicators: UI indicator analysis
            
        Returns:
            Confidence score (0-1)
        """
        confidence = 0.0
        
        # Feature consistency check
        edge_confidence = 0.0
        if self.min_edge_density <= edge_density <= self.max_edge_density:
            edge_confidence = 0.8
        elif edge_density > 0:
            edge_confidence = 0.4
        
        text_confidence = 0.0
        if text_density > self.min_text_density:
            text_confidence = 0.8
        elif text_density > 0:
            text_confidence = 0.3
        
        flat_confidence = 0.0
        if flat_regions > 0.05:
            flat_confidence = 0.6
        elif flat_regions > 0:
            flat_confidence = 0.2
        
        ui_confidence = 0.0
        total_ui_indicators = (
            (1 if ui_indicators['horizontal_lines'] > 0 else 0) +
            (1 if ui_indicators['vertical_lines'] > 0 else 0) +
            (1 if ui_indicators['rectangular_elements'] > 0 else 0) +
            (1 if ui_indicators['has_common_screen_ratio'] else 0)
        )
        if total_ui_indicators >= 3:
            ui_confidence = 0.8
        elif total_ui_indicators >= 2:
            ui_confidence = 0.5
        elif total_ui_indicators >= 1:
            ui_confidence = 0.2
        
        # Weighted confidence calculation
        confidence += edge_confidence * 0.3
        confidence += text_confidence * 0.3
        confidence += flat_confidence * 0.2
        confidence += ui_confidence * 0.2
        
        return min(confidence, 1.0)
    
    def analyze_color_patterns(self, image: np.ndarray) -> Dict[str, Any]:
        """
        Analyze color patterns common in UI interfaces
        
        Args:
            image: Input image array
            
        Returns:
            Dictionary with color pattern analysis
        """
        try:
            if len(image.shape) != 3:
                return {'error': 'Color analysis requires RGB image'}
            
            # Analyze color distribution
            h, w, c = image.shape
            
            # Calculate color histogram
            hist_r = cv2.calcHist([image], [0], None, [256], [0, 256])
            hist_g = cv2.calcHist([image], [1], None, [256], [0, 256])
            hist_b = cv2.calcHist([image], [2], None, [256], [0, 256])
            
            # Find dominant colors
            dominant_colors = []
            for channel, hist, color_name in [(0, hist_r, 'Red'), (1, hist_g, 'Green'), (2, hist_b, 'Blue')]:
                peak_idx = np.argmax(hist)
                dominant_colors.append({
                    'channel': color_name,
                    'value': int(peak_idx),
                    'frequency': int(hist[peak_idx])
                })
            
            # Check for UI-like color patterns (limited palette, high contrast)
            unique_colors = len(np.unique(image.reshape(-1, 3), axis=0))
            color_diversity = unique_colors / (h * w)
            
            # Calculate color contrast
            gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY)
            contrast = np.std(gray)
            
            return {
                'dominant_colors': dominant_colors,
                'unique_colors': int(unique_colors),
                'color_diversity': float(color_diversity),
                'contrast': float(contrast),
                'likely_ui_colors': color_diversity < 0.1 and contrast > 50
            }
            
        except Exception as e:
            logger.error(f"Error in color pattern analysis: {e}")
            return {'error': str(e)}
