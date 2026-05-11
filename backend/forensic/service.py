"""
Forensic analysis service
Main service that combines all detectors and provides final classification
"""

import logging
import time
from pathlib import Path
from typing import Dict, Any, Optional
import numpy as np

from .schemas import ForensicResponse, ForensicSignals
from .detectors import (
    EXIFDetector,
    CameraDetector,
    ScreenshotDetector,
    AIDetector,
    ImageValidator,
    ImageProcessor
)

logger = logging.getLogger(__name__)


class ForensicService:
    """Main forensic analysis service"""
    
    def __init__(self):
        self.exif_detector = EXIFDetector()
        self.camera_detector = CameraDetector()
        self.screenshot_detector = ScreenshotDetector()
        self.ai_detector = AIDetector()
        self.validator = ImageValidator()
        self.processor = ImageProcessor()
        
        # Detection priority order (higher priority overrides lower)
        self.detection_priority = {
            'Screenshot': 4,
            'AI Generated': 3,
            'Camera Captured': 2,
            'Unknown': 1
        }
        
        # Confidence thresholds
        self.min_confidence_threshold = 0.3
        self.high_confidence_threshold = 0.7
    
    async def analyze_image(self, image_path: Path) -> ForensicResponse:
        """
        Perform complete forensic analysis on uploaded image
        
        Args:
            image_path: Path to uploaded image file
            
        Returns:
            ForensicResponse with complete analysis results
        """
        start_time = time.time()
        
        try:
            # Validate image file
            is_valid, error_message = self.validator.validate_file(image_path)
            if not is_valid:
                logger.error(f"Image validation failed: {error_message}")
                return ForensicResponse(
                    success=False,
                    prediction="Unknown",
                    confidence=0.0,
                    signals=ForensicSignals(
                        metadata_detected=False,
                        camera_probability=0.0,
                        ai_probability=0.0,
                        screenshot_probability=0.0
                    ),
                    error_message=error_message
                )
            
            # Extract EXIF metadata
            exif_metadata = self.exif_detector.extract_metadata(image_path)
            
            # Run all detectors
            camera_result = self.camera_detector.analyze(image_path, exif_metadata)
            screenshot_result = self.screenshot_detector.analyze(image_path)
            ai_result = self.ai_detector.analyze(image_path)
            
            # Combine results using decision fusion
            final_prediction, final_confidence, signals = self._decision_fusion(
                camera_result,
                screenshot_result,
                ai_result,
                exif_metadata
            )
            
            processing_time = (time.time() - start_time) * 1000  # Convert to milliseconds
            
            logger.info(f"Forensic analysis completed in {processing_time:.2f}ms: {final_prediction} ({final_confidence:.2f}%)")
            
            return ForensicResponse(
                success=True,
                prediction=final_prediction,
                confidence=final_confidence,
                signals=signals,
                processing_time_ms=processing_time
            )
            
        except Exception as e:
            logger.error(f"Error in forensic analysis: {e}")
            processing_time = (time.time() - start_time) * 1000
            
            return ForensicResponse(
                success=False,
                prediction="Unknown",
                confidence=0.0,
                signals=ForensicSignals(
                    metadata_detected=False,
                    camera_probability=0.0,
                    ai_probability=0.0,
                    screenshot_probability=0.0
                ),
                processing_time_ms=processing_time,
                error_message=f"Analysis failed: {str(e)}"
            )
        
        finally:
            # Cleanup temporary file
            self.validator.cleanup_temp_file(image_path)
    
    def _decision_fusion(
        self,
        camera_result,
        screenshot_result,
        ai_result,
        exif_metadata
    ) -> tuple[str, float, ForensicSignals]:
        """
        Fuse results from all detectors to make final decision
        
        Args:
            camera_result: Camera detection result
            screenshot_result: Screenshot detection result
            ai_result: AI detection result
            exif_metadata: EXIF metadata
            
        Returns:
            Tuple of (prediction, confidence, signals)
        """
        # Extract probabilities
        camera_prob = camera_result.probability
        screenshot_prob = screenshot_result.probability
        ai_prob = ai_result.probability
        
        # Normalize probabilities to ensure they sum to 1
        total_prob = camera_prob + screenshot_prob + ai_prob
        if total_prob > 0:
            camera_prob /= total_prob
            screenshot_prob /= total_prob
            ai_prob /= total_prob
        else:
            # If all detectors failed, assign equal weights
            camera_prob = screenshot_prob = ai_prob = 1.0 / 3.0
        
        # Apply priority-based decision making
        predictions = []
        
        # Add predictions with their priority and confidence
        if screenshot_prob > 0.3:
            predictions.append({
                'type': 'Screenshot',
                'priority': self.detection_priority['Screenshot'],
                'confidence': screenshot_prob,
                'detector_confidence': screenshot_result.confidence
            })
        
        if ai_prob > 0.3:
            predictions.append({
                'type': 'AI Generated',
                'priority': self.detection_priority['AI Generated'],
                'confidence': ai_prob,
                'detector_confidence': ai_result.confidence
            })
        
        if camera_prob > 0.3:
            predictions.append({
                'type': 'Camera Captured',
                'priority': self.detection_priority['Camera Captured'],
                'confidence': camera_prob,
                'detector_confidence': camera_result.confidence
            })
        
        # Select final prediction based on priority and confidence
        if predictions:
            # Sort by priority (descending) then by confidence (descending)
            predictions.sort(key=lambda x: (x['priority'], x['confidence']), reverse=True)
            final_prediction = predictions[0]['type']
            
            # Calculate final confidence using weighted average
            final_confidence = predictions[0]['confidence'] * predictions[0]['detector_confidence']
            final_confidence = max(final_confidence, self.min_confidence_threshold)
        else:
            # No clear prediction
            final_prediction = "Unknown"
            final_confidence = 0.1
        
        # Convert confidence to percentage
        final_confidence_percent = final_confidence * 100
        
        # Create signals object
        signals = ForensicSignals(
            metadata_detected=exif_metadata.has_camera_metadata,
            camera_probability=camera_prob,
            ai_probability=ai_prob,
            screenshot_probability=screenshot_prob
        )
        
        return final_prediction, final_confidence_percent, signals
    
    def _calculate_weighted_confidence(
        self,
        camera_result,
        screenshot_result,
        ai_result,
        exif_metadata
    ) -> float:
        """
        Calculate weighted confidence based on detector confidence and metadata
        
        Args:
            camera_result: Camera detection result
            screenshot_result: Screenshot detection result
            ai_result: AI detection result
            exif_metadata: EXIF metadata
            
        Returns:
            Weighted confidence score (0-1)
        """
        confidences = []
        weights = []
        
        # Camera detector weight
        if camera_result.confidence > 0:
            weight = 0.4
            if exif_metadata.has_camera_metadata:
                weight += 0.2  # Boost confidence with EXIF data
            confidences.append(camera_result.confidence)
            weights.append(weight)
        
        # Screenshot detector weight
        if screenshot_result.confidence > 0:
            confidences.append(screenshot_result.confidence)
            weights.append(0.3)
        
        # AI detector weight
        if ai_result.confidence > 0:
            confidences.append(ai_result.confidence)
            weights.append(0.3)
        
        if not confidences:
            return 0.1
        
        # Calculate weighted average
        total_weight = sum(weights)
        if total_weight > 0:
            weighted_confidence = sum(c * w for c, w in zip(confidences, weights)) / total_weight
        else:
            weighted_confidence = sum(confidences) / len(confidences)
        
        return min(weighted_confidence, 1.0)
    
    def _analyze_detection_consistency(
        self,
        camera_result,
        screenshot_result,
        ai_result
    ) -> Dict[str, Any]:
        """
        Analyze consistency between different detectors
        
        Args:
            camera_result: Camera detection result
            screenshot_result: Screenshot detection result
            ai_result: AI detection result
            
        Returns:
            Dictionary with consistency analysis
        """
        probabilities = {
            'camera': camera_result.probability,
            'screenshot': screenshot_result.probability,
            'ai': ai_result.probability
        }
        
        # Find dominant prediction
        dominant_type = max(probabilities, key=probabilities.get)
        dominant_prob = probabilities[dominant_type]
        
        # Calculate consistency (how much the dominant prediction stands out)
        other_probs = [v for k, v in probabilities.items() if k != dominant_type]
        avg_other_prob = sum(other_probs) / len(other_probs) if other_probs else 0
        
        consistency_score = dominant_prob - avg_other_prob
        
        return {
            'dominant_type': dominant_type,
            'dominant_probability': dominant_prob,
            'average_other_probability': avg_other_prob,
            'consistency_score': consistency_score,
            'is_consistent': consistency_score > 0.2
        }
    
    async def batch_analyze(self, image_paths: list[Path]) -> list[ForensicResponse]:
        """
        Analyze multiple images in batch
        
        Args:
            image_paths: List of image file paths
            
        Returns:
            List of ForensicResponse objects
        """
        results = []
        
        for image_path in image_paths:
            try:
                result = await self.analyze_image(image_path)
                results.append(result)
            except Exception as e:
                logger.error(f"Error analyzing {image_path}: {e}")
                results.append(ForensicResponse(
                    success=False,
                    prediction="Unknown",
                    confidence=0.0,
                    signals=ForensicSignals(
                        metadata_detected=False,
                        camera_probability=0.0,
                        ai_probability=0.0,
                        screenshot_probability=0.0
                    ),
                    error_message=f"Batch analysis failed: {str(e)}"
                ))
        
        return results
    
    def get_detector_details(self) -> Dict[str, Any]:
        """
        Get details about available detectors
        
        Returns:
            Dictionary with detector information
        """
        return {
            'detectors': {
                'exif': {
                    'name': 'EXIF Metadata Detector',
                    'description': 'Extracts and analyzes camera metadata',
                    'capabilities': ['camera_make', 'camera_model', 'iso', 'lens_info', 'datetime']
                },
                'camera': {
                    'name': 'Camera Detector',
                    'description': 'Analyzes image characteristics for camera capture detection',
                    'capabilities': ['noise_analysis', 'laplacian_variance', 'sensor_patterns']
                },
                'screenshot': {
                    'name': 'Screenshot Detector',
                    'description': 'Detects UI elements and screenshot characteristics',
                    'capabilities': ['edge_density', 'text_density', 'ui_indicators', 'flat_regions']
                },
                'ai': {
                    'name': 'AI Generator Detector',
                    'description': 'Identifies AI-generated image characteristics',
                    'capabilities': ['smoothing_detection', 'texture_artifacts', 'frequency_analysis', 'pattern_analysis']
                }
            },
            'priority_order': list(self.detection_priority.keys()),
            'confidence_thresholds': {
                'minimum': self.min_confidence_threshold,
                'high': self.high_confidence_threshold
            }
        }
