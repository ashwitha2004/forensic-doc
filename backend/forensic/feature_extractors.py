"""
Advanced Forensic Feature Extractors
Production-grade forensic analysis for image classification
"""

import cv2
import numpy as np
import torch
from PIL import Image
import exifread
import piexif
from pathlib import Path
import logging
from typing import Dict, Tuple, Optional, Any
from scipy import fft as sp_fft
from scipy.signal import welch
import warnings

# Suppress warnings
warnings.filterwarnings('ignore')
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class ForensicFeatureExtractor:
    """
    Advanced forensic feature extractor for image analysis
    Extracts comprehensive forensic features for ML classification
    """
    
    def __init__(self):
        self.feature_names = []
        self._setup_feature_names()
    
    def _setup_feature_names(self):
        """Initialize feature names list"""
        self.feature_names = [
            # EXIF Features
            'has_exif', 'exif_camera_make', 'exif_camera_model', 
            'exif_datetime', 'exif_software', 'exif_flash',
            
            # Sensor Noise Features (PRNU)
            'prnu_mean', 'prnu_std', 'prnu_skewness', 'prnu_kurtosis',
            
            # FFT Spectral Features
            'fft_mean', 'fft_std', 'fft_skewness', 'fft_kurtosis',
            'fft_peak_frequency', 'fft_spectral_entropy',
            
            # Compression Artifact Features
            'jpeg_quality_estimate', 'blockiness', 'ringing_artifacts',
            'mosquito_noise', 'quantization_table_variance',
            
            # Edge Features
            'edge_density', 'edge_smoothness', 'edge_uniformity',
            'edge_direction_variance', 'edge_transition_regularity',
            
            # Color Distribution Features
            'color_histogram_entropy', 'color_channel_correlation',
            'saturation_mean', 'saturation_std', 'hue_variance',
            
            # Texture Features
            'glcm_contrast', 'glcm_homogeneity', 'glcm_energy',
            'lbp_variance', 'texture_complexity',
            
            # Statistical Features
            'pixel_mean', 'pixel_std', 'pixel_skewness', 'pixel_kurtosis',
            'local_binary_pattern_variance'
        ]
    
    def extract_all_features(self, image_path: str) -> Dict[str, float]:
        """
        Extract all forensic features from an image
        """
        try:
            # Load image
            image = cv2.imread(image_path)
            if image is None:
                logger.error(f"Failed to load image: {image_path}")
                return self._get_zero_features()
            
            # Convert color spaces
            rgb_image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
            gray_image = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
            hsv_image = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
            
            # Extract all feature groups
            features = {}
            
            # 1. EXIF Features
            exif_features = self.extract_exif_features(image_path)
            features.update(exif_features)
            
            # 2. Sensor Noise Features (PRNU)
            noise_features = self.extract_sensor_noise_features(gray_image)
            features.update(noise_features)
            
            # 3. FFT Spectral Features
            fft_features = self.extract_fft_features(gray_image)
            features.update(fft_features)
            
            # 4. Compression Artifact Features
            compression_features = self.extract_compression_features(gray_image, image_path)
            features.update(compression_features)
            
            # 5. Edge Features
            edge_features = self.extract_edge_features(gray_image)
            features.update(edge_features)
            
            # 6. Color Distribution Features
            color_features = self.extract_color_features(rgb_image, hsv_image)
            features.update(color_features)
            
            # 7. Texture Features
            texture_features = self.extract_texture_features(gray_image)
            features.update(texture_features)
            
            # 8. Statistical Features
            stat_features = self.extract_statistical_features(gray_image)
            features.update(stat_features)
            
            # Validate features
            features = self._validate_features(features)
            
            return features
            
        except Exception as e:
            logger.error(f"Error extracting features from {image_path}: {e}")
            return self._get_zero_features()
    
    def extract_exif_features(self, image_path: str) -> Dict[str, float]:
        """Extract EXIF metadata features"""
        features = {}
        
        try:
            # Read EXIF data
            with open(image_path, 'rb') as f:
                tags = exifread.process_file(f)
            
            features['has_exif'] = float(len(tags) > 0)
            
            # Camera information
            features['exif_camera_make'] = float('Make' in tags)
            features['exif_camera_model'] = float('Model' in tags)
            features['exif_datetime'] = float('DateTime' in tags)
            features['exif_software'] = float('Software' in tags)
            features['exif_flash'] = float('Flash' in tags)
            
        except Exception as e:
            logger.debug(f"EXIF extraction failed: {e}")
            # Default to no EXIF
            features = {key: 0.0 for key in [
                'has_exif', 'exif_camera_make', 'exif_camera_model',
                'exif_datetime', 'exif_software', 'exif_flash'
            ]}
        
        return features
    
    def extract_sensor_noise_features(self, gray_image: np.ndarray) -> Dict[str, float]:
        """Extract Photo Response Non-Uniformity (PRNU) features"""
        try:
            # Estimate PRNU using wavelet denoising
            denoised = cv2.fastNlMeansDenoising(gray_image, None, h=10, templateWindowSize=7, searchWindowSize=21)
            prnu = gray_image.astype(np.float32) - denoised.astype(np.float32)
            
            # Statistical features of PRNU
            prnu_mean = np.mean(prnu)
            prnu_std = np.std(prnu)
            prnu_flattened = prnu.flatten()
            
            # Calculate skewness and kurtosis
            from scipy.stats import skew, kurtosis
            prnu_skewness = skew(prnu_flattened)
            prnu_kurtosis = kurtosis(prnu_flattened)
            
            features = {
                'prnu_mean': float(prnu_mean),
                'prnu_std': float(prnu_std),
                'prnu_skewness': float(prnu_skewness),
                'prnu_kurtosis': float(prnu_kurtosis)
            }
            
            return features
            
        except Exception as e:
            logger.debug(f"PRNU extraction failed: {e}")
            return {key: 0.0 for key in ['prnu_mean', 'prnu_std', 'prnu_skewness', 'prnu_kurtosis']}
    
    def extract_fft_features(self, gray_image: np.ndarray) -> Dict[str, float]:
        """Extract FFT spectral features"""
        try:
            # Apply 2D FFT
            fft_result = np.fft.fft2(gray_image)
            fft_magnitude = np.abs(fft_result)
            fft_shifted = np.fft.fftshift(fft_magnitude)
            
            # Remove DC component for better analysis
            fft_shifted[fft_shifted.shape[0]//2, fft_shifted.shape[1]//2] = 0
            
            # Statistical features
            fft_flattened = fft_shifted.flatten()
            fft_mean = np.mean(fft_flattened)
            fft_std = np.std(fft_flattened)
            
            # Skewness and kurtosis
            from scipy.stats import skew, kurtosis
            fft_skewness = skew(fft_flattened)
            fft_kurtosis = kurtosis(fft_flattened)
            
            # Peak frequency
            peak_idx = np.unravel_index(np.argmax(fft_shifted), fft_shifted.shape)
            center_y, center_x = fft_shifted.shape[0]//2, fft_shifted.shape[1]//2
            peak_frequency = np.sqrt((peak_idx[0] - center_y)**2 + (peak_idx[1] - center_x)**2)
            
            # Spectral entropy
            fft_normalized = fft_shifted / np.sum(fft_shifted)
            spectral_entropy = -np.sum(fft_normalized * np.log2(fft_normalized + 1e-10))
            
            features = {
                'fft_mean': float(fft_mean),
                'fft_std': float(fft_std),
                'fft_skewness': float(fft_skewness),
                'fft_kurtosis': float(fft_kurtosis),
                'fft_peak_frequency': float(peak_frequency),
                'fft_spectral_entropy': float(spectral_entropy)
            }
            
            return features
            
        except Exception as e:
            logger.debug(f"FFT extraction failed: {e}")
            return {key: 0.0 for key in [
                'fft_mean', 'fft_std', 'fft_skewness', 'fft_kurtosis',
                'fft_peak_frequency', 'fft_spectral_entropy'
            ]}
    
    def extract_compression_features(self, gray_image: np.ndarray, image_path: str) -> Dict[str, float]:
        """Extract compression artifact features"""
        try:
            # JPEG quality estimation
            jpeg_quality = self.estimate_jpeg_quality(image_path)
            
            # Blockiness detection (8x8 blocks for JPEG)
            h, w = gray_image.shape
            block_size = 8
            blockiness_scores = []
            
            for i in range(0, h - block_size, block_size):
                for j in range(0, w - block_size, block_size):
                    block = gray_image[i:i+block_size, j:j+block_size]
                    
                    # Calculate block boundaries
                    h_diff = np.mean(np.abs(np.diff(block, axis=0)))
                    v_diff = np.mean(np.abs(np.diff(block, axis=1)))
                    blockiness_scores.append((h_diff + v_diff) / 2)
            
            blockiness = np.mean(blockiness_scores) if blockiness_scores else 0
            
            # Ringing artifacts (Gibbs phenomenon)
            edges = cv2.Canny(gray_image, 50, 150)
            kernel = np.ones((3, 3), np.uint8)
            dilated_edges = cv2.dilate(edges, kernel, iterations=1)
            ringing = np.mean((dilated_edges - edges) > 0)
            
            # Mosquito noise around edges
            blurred = cv2.GaussianBlur(gray_image, (3, 3), 0)
            mosquito_noise = np.mean(np.abs(gray_image.astype(np.float32) - blurred.astype(np.float32)) * (edges > 0))
            
            # Quantization table variance (simplified)
            dct = cv2.dct(gray_image.astype(np.float32))
            quantization_variance = np.var(dct[:8, :8])  # Low-frequency DCT coefficients
            
            features = {
                'jpeg_quality_estimate': float(jpeg_quality),
                'blockiness': float(blockiness),
                'ringing_artifacts': float(ringing),
                'mosquito_noise': float(mosquito_noise),
                'quantization_table_variance': float(quantization_variance)
            }
            
            return features
            
        except Exception as e:
            logger.debug(f"Compression feature extraction failed: {e}")
            return {key: 0.0 for key in [
                'jpeg_quality_estimate', 'blockiness', 'ringing_artifacts',
                'mosquito_noise', 'quantization_table_variance'
            ]}
    
    def extract_edge_features(self, gray_image: np.ndarray) -> Dict[str, float]:
        """Extract edge-related features"""
        try:
            # Multiple edge detectors
            edges_canny = cv2.Canny(gray_image, 50, 150)
            edges_sobel = cv2.Sobel(gray_image, cv2.CV_64F, 1, 1, ksize=3)
            edges_laplacian = cv2.Laplacian(gray_image, cv2.CV_64F)
            
            # Edge density
            edge_density = np.sum(edges_canny > 0) / edges_canny.size
            
            # Edge smoothness (gradient magnitude variance)
            gradient_magnitude = np.sqrt(edges_sobel**2)
            edge_smoothness = np.std(gradient_magnitude)
            
            # Edge uniformity
            edge_uniformity = 1 - (np.std(edges_canny) / 255)
            
            # Edge direction variance
            gradient_x = cv2.Sobel(gray_image, cv2.CV_64F, 1, 0, ksize=3)
            gradient_y = cv2.Sobel(gray_image, cv2.CV_64F, 0, 1, ksize=3)
            gradient_direction = np.arctan2(gradient_y, gradient_x)
            edge_direction_variance = np.var(gradient_direction)
            
            # Edge transition regularity
            edge_transitions = np.diff(edges_canny.flatten())
            edge_transition_regularity = 1 - (np.std(edge_transitions) / (np.mean(np.abs(edge_transitions)) + 1e-10))
            
            features = {
                'edge_density': float(edge_density),
                'edge_smoothness': float(edge_smoothness),
                'edge_uniformity': float(edge_uniformity),
                'edge_direction_variance': float(edge_direction_variance),
                'edge_transition_regularity': float(edge_transition_regularity)
            }
            
            return features
            
        except Exception as e:
            logger.debug(f"Edge feature extraction failed: {e}")
            return {key: 0.0 for key in [
                'edge_density', 'edge_smoothness', 'edge_uniformity',
                'edge_direction_variance', 'edge_transition_regularity'
            ]}
    
    def extract_color_features(self, rgb_image: np.ndarray, hsv_image: np.ndarray) -> Dict[str, float]:
        """Extract color distribution features"""
        try:
            # Color histogram entropy
            hist_r = cv2.calcHist([rgb_image], [0], None, [256], [0, 256])
            hist_g = cv2.calcHist([rgb_image], [1], None, [256], [0, 256])
            hist_b = cv2.calcHist([rgb_image], [2], None, [256], [0, 256])
            
            # Normalize histograms
            hist_r = hist_r / np.sum(hist_r)
            hist_g = hist_g / np.sum(hist_g)
            hist_b = hist_b / np.sum(hist_b)
            
            # Calculate entropy
            entropy_r = -np.sum(hist_r * np.log2(hist_r + 1e-10))
            entropy_g = -np.sum(hist_g * np.log2(hist_g + 1e-10))
            entropy_b = -np.sum(hist_b * np.log2(hist_b + 1e-10))
            color_histogram_entropy = (entropy_r + entropy_g + entropy_b) / 3
            
            # Color channel correlation
            correlation_rg = np.corrcoef(rgb_image[:,:,0].flatten(), rgb_image[:,:,1].flatten())[0,1]
            correlation_rb = np.corrcoef(rgb_image[:,:,0].flatten(), rgb_image[:,:,2].flatten())[0,1]
            correlation_gb = np.corrcoef(rgb_image[:,:,1].flatten(), rgb_image[:,:,2].flatten())[0,1]
            color_channel_correlation = np.nanmean([correlation_rg, correlation_rb, correlation_gb])
            
            # Saturation features
            saturation = hsv_image[:,:,1]
            saturation_mean = np.mean(saturation)
            saturation_std = np.std(saturation)
            
            # Hue variance
            hue = hsv_image[:,:,0]
            hue_variance = np.var(hue)
            
            features = {
                'color_histogram_entropy': float(color_histogram_entropy),
                'color_channel_correlation': float(color_channel_correlation),
                'saturation_mean': float(saturation_mean),
                'saturation_std': float(saturation_std),
                'hue_variance': float(hue_variance)
            }
            
            return features
            
        except Exception as e:
            logger.debug(f"Color feature extraction failed: {e}")
            return {key: 0.0 for key in [
                'color_histogram_entropy', 'color_channel_correlation',
                'saturation_mean', 'saturation_std', 'hue_variance'
            ]}
    
    def extract_texture_features(self, gray_image: np.ndarray) -> Dict[str, float]:
        """Extract texture features using GLCM and LBP"""
        try:
            # Gray Level Co-occurrence Matrix (GLCM)
            from skimage.feature import greycomatrix, greycoprops
            
            # Reduce gray levels for GLCM
            gray_reduced = (gray_image // 32).astype(np.uint8)
            
            # Calculate GLCM
            glcm = greycomatrix(gray_reduced, distances=[1], angles=[0, np.pi/4, np.pi/2, 3*np.pi/4], levels=8, symmetric=True, normed=True)
            
            # GLCM properties
            glcm_contrast = np.mean(greycoprops(glcm, 'contrast'))
            glcm_homogeneity = np.mean(greycoprops(glcm, 'homogeneity'))
            glcm_energy = np.mean(greycoprops(glcm, 'energy'))
            
            # Local Binary Pattern (LBP)
            from skimage.feature import local_binary_pattern
            lbp = local_binary_pattern(gray_image, P=8, R=1, method='uniform')
            lbp_variance = np.var(lbp)
            
            # Texture complexity (fractal dimension approximation)
            resized_128 = cv2.resize(gray_image, (128, 128))
            resized_64 = cv2.resize(gray_image, (64, 64))
            texture_complexity = np.var(resized_128) / (np.var(resized_64) + 1e-10)
            
            features = {
                'glcm_contrast': float(glcm_contrast),
                'glcm_homogeneity': float(glcm_homogeneity),
                'glcm_energy': float(glcm_energy),
                'lbp_variance': float(lbp_variance),
                'texture_complexity': float(texture_complexity)
            }
            
            return features
            
        except Exception as e:
            logger.debug(f"Texture feature extraction failed: {e}")
            return {key: 0.0 for key in [
                'glcm_contrast', 'glcm_homogeneity', 'glcm_energy',
                'lbp_variance', 'texture_complexity'
            ]}
    
    def extract_statistical_features(self, gray_image: np.ndarray) -> Dict[str, float]:
        """Extract statistical features from pixel values"""
        try:
            pixels = gray_image.flatten()
            
            # Basic statistics
            pixel_mean = np.mean(pixels)
            pixel_std = np.std(pixels)
            
            # Higher order moments
            from scipy.stats import skew, kurtosis
            pixel_skewness = skew(pixels)
            pixel_kurtosis = kurtosis(pixels)
            
            # Local Binary Pattern variance (simplified)
            lbp_simple = self._simple_lbp(gray_image)
            local_binary_pattern_variance = np.var(lbp_simple)
            
            features = {
                'pixel_mean': float(pixel_mean),
                'pixel_std': float(pixel_std),
                'pixel_skewness': float(pixel_skewness),
                'pixel_kurtosis': float(pixel_kurtosis),
                'local_binary_pattern_variance': float(local_binary_pattern_variance)
            }
            
            return features
            
        except Exception as e:
            logger.debug(f"Statistical feature extraction failed: {e}")
            return {key: 0.0 for key in [
                'pixel_mean', 'pixel_std', 'pixel_skewness', 'pixel_kurtosis',
                'local_binary_pattern_variance'
            ]}
    
    def _simple_lbp(self, image: np.ndarray, radius: int = 1, n_points: int = 8) -> np.ndarray:
        """Simple Local Binary Pattern implementation"""
        h, w = image.shape
        lbp = np.zeros((h, w), dtype=np.uint8)
        
        for i in range(radius, h - radius):
            for j in range(radius, w - radius):
                center = image[i, j]
                binary_string = ""
                
                for n in range(n_points):
                    angle = 2 * np.pi * n / n_points
                    x = i + radius * np.cos(angle)
                    y = j + radius * np.sin(angle)
                    
                    x, y = int(round(x)), int(round(y))
                    
                    if 0 <= x < h and 0 <= y < w:
                        binary_string += "1" if image[x, y] >= center else "0"
                    else:
                        binary_string += "0"
                
                lbp[i, j] = int(binary_string, 2)
        
        return lbp
    
    def estimate_jpeg_quality(self, image_path: str) -> float:
        """Estimate JPEG quality using quantization tables"""
        try:
            # This is a simplified estimation
            # In production, use more sophisticated methods
            img = cv2.imread(image_path)
            if img is None:
                return 0.0
            
            # Convert to grayscale and apply DCT
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
            dct = cv2.dct(gray.astype(np.float32))
            
            # Analyze quantization in frequency domain
            high_freq_energy = np.sum(np.abs(dct[8:32, 8:32]))
            total_energy = np.sum(np.abs(dct))
            
            # Higher quality images have more high-frequency content
            quality_estimate = (high_freq_energy / (total_energy + 1e-10)) * 100
            
            return min(max(quality_estimate, 0), 100)
            
        except:
            return 50.0  # Default to medium quality
    
    def _validate_features(self, features: Dict[str, float]) -> Dict[str, float]:
        """Validate and clean features"""
        validated = {}
        
        for key in self.feature_names:
            value = features.get(key, 0.0)
            
            # Handle NaN and infinite values
            if np.isnan(value) or np.isinf(value):
                value = 0.0
            
            # Clip extreme values
            value = np.clip(value, -1e6, 1e6)
            
            validated[key] = float(value)
        
        return validated
    
    def _get_zero_features(self) -> Dict[str, float]:
        """Return zero features for error cases"""
        return {key: 0.0 for key in self.feature_names}
    
    def get_feature_vector(self, features: Dict[str, float]) -> np.ndarray:
        """Convert features dictionary to numpy array"""
        return np.array([features[key] for key in self.feature_names])
    
    def get_feature_names(self) -> list:
        """Get list of feature names"""
        return self.feature_names.copy()


# Test the extractor
if __name__ == "__main__":
    extractor = ForensicFeatureExtractor()
    
    # Test with a sample image (if available)
    test_image = "test_image.jpg"
    if Path(test_image).exists():
        features = extractor.extract_all_features(test_image)
        
        print("Extracted Features:")
        for key, value in features.items():
            print(f"  {key}: {value:.4f}")
        
        print(f"\nFeature vector shape: {len(features)} features")
    else:
        print(f"Test image {test_image} not found")
