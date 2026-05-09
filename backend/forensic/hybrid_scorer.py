"""
Hybrid Forensic + AI Scoring System
Combines CNN predictions with forensic feature analysis
"""

import torch
import numpy as np
from typing import Dict, Tuple, Optional
import logging
from dataclasses import dataclass

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@dataclass
class HybridConfig:
    """Configuration for hybrid scoring system"""
    # CNN weights for each class
    cnn_weights: Dict[str, float] = None
    
    # Forensic weights for each class
    forensic_weights: Dict[str, float] = None
    
    # Combination weights
    combination_weights: Dict[str, Dict[str, float]] = None
    
    # Classification thresholds
    thresholds: Dict[str, float] = None
    
    def __post_init__(self):
        """Initialize default values if not provided"""
        if self.cnn_weights is None:
            self.cnn_weights = {
                'camera': 0.6,
                'ai': 0.7,
                'screenshot': 0.5,
                'whatsapp': 0.4,
                'downloaded': 0.4
            }
        
        if self.forensic_weights is None:
            self.forensic_weights = {
                'camera': 0.4,
                'ai': 0.3,
                'screenshot': 0.5,
                'whatsapp': 0.6,
                'downloaded': 0.6
            }
        
        if self.combination_weights is None:
            self.combination_weights = {
                'camera': {'cnn': 0.6, 'forensic': 0.4},
                'ai': {'cnn': 0.7, 'forensic': 0.3},
                'screenshot': {'cnn': 0.5, 'forensic': 0.5},
                'whatsapp': {'cnn': 0.4, 'forensic': 0.6},
                'downloaded': {'cnn': 0.4, 'forensic': 0.6}
            }
        
        if self.thresholds is None:
            self.thresholds = {
                'ai': 60.0,
                'screenshot': 70.0,
                'whatsapp': 65.0,
                'downloaded': 65.0,
                'camera': 60.0
            }


class HybridScorer:
    """
    Hybrid scoring system that combines CNN and forensic analysis
    """
    
    def __init__(self, config: Optional[HybridConfig] = None):
        self.config = config or HybridConfig()
        self.class_names = ['camera', 'ai', 'screenshot', 'whatsapp', 'downloaded']
        
        logger.info("Initialized Hybrid Scorer:")
        logger.info(f"  CNN weights: {self.config.cnn_weights}")
        logger.info(f"  Forensic weights: {self.config.forensic_weights}")
        logger.info(f"  Thresholds: {self.config.thresholds}")
    
    def calculate_forensic_scores(self, forensic_features: Dict[str, float]) -> Dict[str, float]:
        """
        Calculate forensic-based scores for each class
        
        Args:
            forensic_features: Dictionary of forensic features
            
        Returns:
            Dictionary with forensic scores for each class
        """
        scores = {}
        
        # Camera indicators
        camera_score = 0.0
        if forensic_features.get('has_exif', 0) > 0:
            camera_score += 25
        if forensic_features.get('exif_camera_make', 0) > 0:
            camera_score += 15
        if forensic_features.get('exif_camera_model', 0) > 0:
            camera_score += 15
        
        # Natural sensor noise (good for camera)
        prnu_std = forensic_features.get('prnu_std', 0)
        if 0.45 < prnu_std < 1.8:
            camera_score += 20
        
        # Natural compression (good for camera)
        jpeg_quality = forensic_features.get('jpeg_quality_estimate', 50)
        if 70 < jpeg_quality < 95:
            camera_score += 15
        
        # Natural edge variation (good for camera)
        edge_smoothness = forensic_features.get('edge_smoothness', 0)
        if edge_smoothness < 0.82:
            camera_score += 10
        
        # AI indicators
        ai_score = 0.0
        
        # Unnatural edge smoothness (AI indicator)
        if edge_smoothness > 0.92:
            ai_score += 25
        
        # GAN frequency patterns
        fft_peak_frequency = forensic_features.get('fft_peak_frequency', 0)
        if fft_peak_frequency > 0.88:
            ai_score += 20
        
        # Perfect symmetry
        edge_uniformity = forensic_features.get('edge_uniformity', 0)
        if edge_uniformity > 0.90:
            ai_score += 15
        
        # Fake noise profile
        prnu_skewness = forensic_features.get('prnu_skewness', 0)
        if prnu_skewness < 0.15:
            ai_score += 15
        
        # Screenshot indicators
        screenshot_score = 0.0
        
        # High edge density (screenshot indicator)
        edge_density = forensic_features.get('edge_density', 0)
        if edge_density > 0.7:
            screenshot_score += 25
        
        # Blockiness (compression artifacts)
        blockiness = forensic_features.get('blockiness', 0)
        if blockiness > 0.5:
            screenshot_score += 20
        
        # Ringing artifacts
        ringing = forensic_features.get('ringing_artifacts', 0)
        if ringing > 0.3:
            screenshot_score += 15
        
        # WhatsApp indicators
        whatsapp_score = 0.0
        
        # High compression
        if jpeg_quality < 70:
            whatsapp_score += 25
        
        # Specific aspect ratios (WhatsApp common)
        aspect_ratio = forensic_features.get('aspect_ratio', 1.0)
        if 0.5 < aspect_ratio < 0.6 or 1.4 < aspect_ratio < 1.6:
            whatsapp_score += 20
        
        # Low texture complexity
        texture_complexity = forensic_features.get('texture_complexity', 0)
        if texture_complexity < 0.3:
            whatsapp_score += 15
        
        # Downloaded indicators
        downloaded_score = 0.0
        
        # Multiple compression signatures
        quantization_variance = forensic_features.get('quantization_table_variance', 0)
        if quantization_variance > 0.8:
            downloaded_score += 25
        
        # Missing EXIF
        if forensic_features.get('has_exif', 0) == 0:
            downloaded_score += 20
        
        # Inconsistent metadata
        if forensic_features.get('exif_datetime', 0) == 0:
            downloaded_score += 15
        
        # Normalize scores to 0-100
        scores = {
            'camera': min(camera_score, 100),
            'ai': min(ai_score, 100),
            'screenshot': min(screenshot_score, 100),
            'whatsapp': min(whatsapp_score, 100),
            'downloaded': min(downloaded_score, 100)
        }
        
        logger.debug(f"Forensic scores: {scores}")
        return scores
    
    def combine_scores(
        self,
        cnn_probabilities: Dict[str, float],
        forensic_scores: Dict[str, float]
    ) -> Dict[str, float]:
        """
        Combine CNN and forensic scores using weighted average
        
        Args:
            cnn_probabilities: CNN output probabilities (0-1)
            forensic_scores: Forensic analysis scores (0-100)
            
        Returns:
            Combined scores for each class
        """
        combined_scores = {}
        
        for class_name in self.class_names:
            cnn_prob = cnn_probabilities.get(class_name, 0.0) * 100  # Convert to 0-100
            forensic_score = forensic_scores.get(class_name, 0.0)
            
            # Get combination weights for this class
            weights = self.config.combination_weights.get(class_name, {'cnn': 0.5, 'forensic': 0.5})
            
            # Weighted combination
            combined_score = (
                cnn_prob * weights['cnn'] +
                forensic_score * weights['forensic']
            )
            
            combined_scores[class_name] = combined_score
        
        logger.debug(f"Combined scores: {combined_scores}")
        return combined_scores
    
    def classify_with_priority_rules(
        self,
        combined_scores: Dict[str, float]
    ) -> Tuple[str, float, Dict[str, float]]:
        """
        Apply priority-based classification rules
        
        Args:
            combined_scores: Combined scores for each class
            
        Returns:
            Tuple of (predicted_class, confidence, all_scores)
        """
        scores = combined_scores.copy()
        
        # Priority-based classification
        if scores['ai'] >= self.config.thresholds['ai']:
            predicted_class = 'ai'
            confidence = scores['ai']
        
        elif scores['screenshot'] >= self.config.thresholds['screenshot']:
            predicted_class = 'screenshot'
            confidence = scores['screenshot']
        
        elif scores['whatsapp'] >= self.config.thresholds['whatsapp']:
            predicted_class = 'whatsapp'
            confidence = scores['whatsapp']
        
        elif scores['downloaded'] >= self.config.thresholds['downloaded']:
            predicted_class = 'downloaded'
            confidence = scores['downloaded']
        
        elif scores['camera'] >= self.config.thresholds['camera']:
            predicted_class = 'camera'
            confidence = scores['camera']
        
        else:
            # Unknown case - pick highest score
            predicted_class = max(scores, key=scores.get)
            confidence = scores[predicted_class]
        
        return predicted_class, confidence, scores
    
    def analyze_image(
        self,
        cnn_probabilities: Dict[str, float],
        forensic_features: Dict[str, float]
    ) -> Dict[str, any]:
        """
        Complete hybrid analysis of an image
        
        Args:
            cnn_probabilities: CNN model output probabilities
            forensic_features: Extracted forensic features
            
        Returns:
            Complete analysis results
        """
        logger.info("[HYBRID] Starting hybrid analysis...")
        
        # Step 1: Calculate forensic scores
        forensic_scores = self.calculate_forensic_scores(forensic_features)
        logger.debug(f"[HYBRID] Forensic scores: {forensic_scores}")
        
        # Step 2: Combine with CNN probabilities
        combined_scores = self.combine_scores(cnn_probabilities, forensic_scores)
        logger.debug(f"[HYBRID] Combined scores: {combined_scores}")
        
        # Step 3: Apply priority rules for final classification
        predicted_class, confidence, all_scores = self.classify_with_priority_rules(combined_scores)
        logger.info(f"[HYBRID] Final classification: {predicted_class} ({confidence:.1f}% confidence)")
        
        # Step 4: Generate detailed analysis
        analysis = {
            'predicted_class': predicted_class,
            'confidence': confidence,
            'all_scores': all_scores,
            'cnn_probabilities': cnn_probabilities,
            'forensic_scores': forensic_scores,
            'classification_reasoning': self.generate_reasoning(
                predicted_class, cnn_probabilities, forensic_scores, combined_scores
            )
        }
        
        return analysis
    
    def generate_reasoning(
        self,
        predicted_class: str,
        cnn_probabilities: Dict[str, float],
        forensic_scores: Dict[str, float],
        combined_scores: Dict[str, float]
    ) -> Dict[str, str]:
        """
        Generate human-readable reasoning for the classification
        """
        reasoning = {}
        
        # CNN reasoning
        max_cnn_class = max(cnn_probabilities, key=cnn_probabilities.get)
        reasoning['cnn_reasoning'] = (
            f"CNN model predicts {max_cnn_class} with {cnn_probabilities[max_cnn_class]*100:.1f}% confidence"
        )
        
        # Forensic reasoning
        max_forensic_class = max(forensic_scores, key=forensic_scores.get)
        reasoning['forensic_reasoning'] = (
            f"Forensic analysis indicates {max_forensic_class} with {forensic_scores[max_forensic_class]:.1f}% score"
        )
        
        # Final reasoning
        reasoning['final_reasoning'] = (
            f"Final classification: {predicted_class} "
            f"(Combined score: {combined_scores[predicted_class]:.1f}%, "
            f"Threshold: {self.config.thresholds[predicted_class]:.1f}%)"
        )
        
        # Class-specific reasoning
        if predicted_class == 'ai':
            if forensic_scores['ai'] > 70:
                reasoning['specific_reasoning'] = "Strong AI indicators: unnatural edges, GAN patterns detected"
            else:
                reasoning['specific_reasoning'] = "Moderate AI indicators combined with CNN prediction"
        
        elif predicted_class == 'camera':
            if forensic_scores['camera'] > 70:
                reasoning['specific_reasoning'] = "Strong camera indicators: EXIF data, natural sensor noise"
            else:
                reasoning['specific_reasoning'] = "Moderate camera indicators combined with CNN prediction"
        
        elif predicted_class == 'screenshot':
            reasoning['specific_reasoning'] = "Screenshot indicators: high edge density, compression artifacts"
        
        elif predicted_class == 'whatsapp':
            reasoning['specific_reasoning'] = "WhatsApp indicators: high compression, typical aspect ratios"
        
        elif predicted_class == 'downloaded':
            reasoning['specific_reasoning'] = "Downloaded indicators: missing EXIF, re-compression artifacts"
        
        return reasoning
    
    def batch_analyze(
        self,
        batch_cnn_probs: list,
        batch_forensic_features: list
    ) -> list:
        """
        Analyze a batch of images
        
        Args:
            batch_cnn_probs: List of CNN probability dictionaries
            batch_forensic_features: List of forensic feature dictionaries
            
        Returns:
            List of analysis results
        """
        results = []
        
        for cnn_probs, forensic_feats in zip(batch_cnn_probs, batch_forensic_features):
            analysis = self.analyze_image(cnn_probs, forensic_feats)
            results.append(analysis)
        
        return results
    
    def get_debug_info(
        self,
        cnn_probabilities: Dict[str, float],
        forensic_features: Dict[str, float]
    ) -> Dict[str, any]:
        """
        Get detailed debug information for analysis
        """
        forensic_scores = self.calculate_forensic_scores(forensic_features)
        combined_scores = self.combine_scores(cnn_probabilities, forensic_scores)
        
        debug_info = {
            'cnn_probabilities': {k: f"{v*100:.1f}%" for k, v in cnn_probabilities.items()},
            'forensic_scores': {k: f"{v:.1f}" for k, v in forensic_scores.items()},
            'combined_scores': {k: f"{v:.1f}" for k, v in combined_scores.items()},
            'thresholds': self.config.thresholds,
            'combination_weights': self.config.combination_weights,
            'key_forensic_features': {
                'has_exif': forensic_features.get('has_exif', 0),
                'prnu_std': forensic_features.get('prnu_std', 0),
                'edge_smoothness': forensic_features.get('edge_smoothness', 0),
                'jpeg_quality_estimate': forensic_features.get('jpeg_quality_estimate', 50),
                'blockiness': forensic_features.get('blockiness', 0),
                'fft_peak_frequency': forensic_features.get('fft_peak_frequency', 0)
            }
        }
        
        return debug_info


# Test the hybrid scorer
if __name__ == "__main__":
    # Create test data
    cnn_probs = {
        'camera': 0.15,
        'ai': 0.05,
        'screenshot': 0.10,
        'whatsapp': 0.20,
        'downloaded': 0.50
    }
    
    forensic_features = {
        'has_exif': 1.0,
        'prnu_std': 0.8,
        'edge_smoothness': 0.7,
        'jpeg_quality_estimate': 85,
        'blockiness': 0.2,
        'fft_peak_frequency': 0.3
    }
    
    # Test analysis
    scorer = HybridScorer()
    analysis = scorer.analyze_image(cnn_probs, forensic_features)
    
    print("Hybrid Analysis Results:")
    print(f"  Predicted Class: {analysis['predicted_class']}")
    print(f"  Confidence: {analysis['confidence']:.1f}%")
    print(f"  All Scores: {analysis['all_scores']}")
    
    print("\nReasoning:")
    for key, value in analysis['classification_reasoning'].items():
        print(f"  {key}: {value}")
    
    print("\nDebug Info:")
    debug_info = scorer.get_debug_info(cnn_probs, forensic_features)
    for key, value in debug_info.items():
        print(f"  {key}: {value}")
