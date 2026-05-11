"""
EXIF metadata detector for forensic analysis
Extracts and analyzes image metadata for camera detection
"""

import logging
from datetime import datetime
from pathlib import Path
from typing import Dict, Optional, Any
from PIL import Image, ExifTags
from PIL.ExifTags import TAGS, GPSTAGS

from ..schemas import EXIFMetadata

logger = logging.getLogger(__name__)


class EXIFDetector:
    """EXIF metadata extraction and analysis"""
    
    def __init__(self):
        self.camera_make_tags = ['Make', 'Camera Make']
        self.camera_model_tags = ['Model', 'Camera Model']
        self.iso_tags = ['ISO', 'ISOSpeedRatings', 'ExposureIndex']
        self.lens_tags = ['LensModel', 'LensInfo', 'Lens Specification']
        self.datetime_tags = ['DateTimeOriginal', 'CreateDate', 'DateTime']
        self.software_tags = ['Software', 'ProcessingSoftware']
        self.flash_tags = ['Flash']
    
    def extract_metadata(self, image_path: Path) -> EXIFMetadata:
        """
        Extract EXIF metadata from image
        
        Args:
            image_path: Path to image file
            
        Returns:
            EXIFMetadata object with extracted information
        """
        try:
            with Image.open(image_path) as img:
                exif_data = img._getexif()
                
                if not exif_data:
                    logger.info(f"No EXIF data found in {image_path}")
                    return EXIFMetadata(has_camera_metadata=False)
                
                # Parse EXIF data
                metadata_dict = {}
                for tag_id, value in exif_data.items():
                    tag = TAGS.get(tag_id, tag_id)
                    
                    # Handle nested EXIF data
                    if isinstance(value, dict):
                        nested_dict = {}
                        for nested_tag_id, nested_value in value.items():
                            nested_tag = TAGS.get(nested_tag_id, nested_tag_id)
                            nested_dict[nested_tag] = nested_value
                        metadata_dict[tag] = nested_dict
                    else:
                        metadata_dict[tag] = value
                
                # Extract specific camera metadata
                camera_make = self._extract_field(metadata_dict, self.camera_make_tags)
                camera_model = self._extract_field(metadata_dict, self.camera_model_tags)
                iso = self._extract_numeric_field(metadata_dict, self.iso_tags)
                lens_info = self._extract_field(metadata_dict, self.lens_tags)
                datetime_original = self._extract_datetime_field(metadata_dict, self.datetime_tags)
                software = self._extract_field(metadata_dict, self.software_tags)
                flash_fired = self._extract_flash_field(metadata_dict, self.flash_tags)
                
                # Determine if camera metadata exists
                has_camera_metadata = bool(camera_make or camera_model or iso or lens_info or datetime_original)
                
                logger.info(f"EXIF extraction complete for {image_path}: camera_metadata={has_camera_metadata}")
                
                return EXIFMetadata(
                    has_camera_metadata=has_camera_metadata,
                    camera_make=camera_make,
                    camera_model=camera_model,
                    iso=iso,
                    lens_info=lens_info,
                    datetime_original=datetime_original,
                    software=software,
                    flash_fired=flash_fired
                )
                
        except Exception as e:
            logger.error(f"Error extracting EXIF from {image_path}: {e}")
            return EXIFMetadata(has_camera_metadata=False)
    
    def _extract_field(self, metadata: Dict[str, Any], field_names: list) -> Optional[str]:
        """Extract field value from metadata using multiple possible tag names"""
        for field_name in field_names:
            if field_name in metadata:
                value = metadata[field_name]
                if isinstance(value, (str, int, float)):
                    return str(value)
                elif isinstance(value, bytes):
                    try:
                        return value.decode('utf-8')
                    except:
                        return str(value)
        return None
    
    def _extract_numeric_field(self, metadata: Dict[str, Any], field_names: list) -> Optional[int]:
        """Extract numeric field value"""
        for field_name in field_names:
            if field_name in metadata:
                value = metadata[field_name]
                if isinstance(value, (int, float)):
                    return int(value)
                elif isinstance(value, str) and value.isdigit():
                    return int(value)
                elif isinstance(value, (list, tuple)) and len(value) > 0:
                    # Some EXIF fields store values as arrays
                    try:
                        return int(value[0])
                    except:
                        continue
        return None
    
    def _extract_datetime_field(self, metadata: Dict[str, Any], field_names: list) -> Optional[datetime]:
        """Extract datetime field value"""
        for field_name in field_names:
            if field_name in metadata:
                value = metadata[field_name]
                if isinstance(value, str):
                    try:
                        # Try common datetime formats
                        formats = [
                            '%Y:%m:%d %H:%M:%S',
                            '%Y-%m-%d %H:%M:%S',
                            '%Y/%m/%d %H:%M:%S',
                            '%Y-%m-%d',
                            '%Y/%m/%d'
                        ]
                        for fmt in formats:
                            try:
                                return datetime.strptime(value, fmt)
                            except ValueError:
                                continue
                    except Exception:
                        continue
                elif isinstance(value, datetime):
                    return value
        return None
    
    def _extract_flash_field(self, metadata: Dict[str, Any], field_names: list) -> Optional[bool]:
        """Extract flash fired status"""
        for field_name in field_names:
            if field_name in metadata:
                value = metadata[field_name]
                if isinstance(value, int):
                    # Flash bit 0 indicates fired
                    return bool(value & 1)
                elif isinstance(value, str):
                    return 'fired' in value.lower()
        return None
    
    def analyze_camera_quality(self, metadata: EXIFMetadata) -> Dict[str, Any]:
        """
        Analyze quality of camera metadata
        
        Args:
            metadata: Extracted EXIF metadata
            
        Returns:
            Dictionary with quality analysis
        """
        if not metadata.has_camera_metadata:
            return {
                'quality_score': 0.0,
                'completeness': 0.0,
                'authenticity_indicators': []
            }
        
        # Check completeness of metadata
        fields = ['camera_make', 'camera_model', 'iso', 'lens_info', 'datetime_original']
        filled_fields = sum(1 for field in fields if getattr(metadata, field) is not None)
        completeness = filled_fields / len(fields)
        
        # Quality scoring based on metadata richness
        quality_score = 0.0
        
        # Basic camera info
        if metadata.camera_make and metadata.camera_model:
            quality_score += 0.3
        
        # Technical settings
        if metadata.iso:
            quality_score += 0.2
        
        # Lens information
        if metadata.lens_info:
            quality_score += 0.2
        
        # Original datetime
        if metadata.datetime_original:
            quality_score += 0.2
        
        # Software info (can indicate editing)
        if metadata.software:
            if any(editor in metadata.software.lower() for editor in ['photoshop', 'gimp', 'lightroom']):
                quality_score -= 0.1  # Penalize obvious editing software
            else:
                quality_score += 0.1
        
        # Flash info
        if metadata.flash_fired is not None:
            quality_score += 0.1
        
        # Authenticity indicators
        authenticity_indicators = []
        
        if metadata.camera_make and metadata.camera_model:
            authenticity_indicators.append("Camera device identified")
        
        if metadata.datetime_original:
            authenticity_indicators.append("Original capture timestamp present")
        
        if metadata.iso and metadata.iso > 0:
            authenticity_indicators.append("Camera settings detected")
        
        if metadata.lens_info:
            authenticity_indicators.append("Lens information present")
        
        return {
            'quality_score': min(quality_score, 1.0),
            'completeness': completeness,
            'authenticity_indicators': authenticity_indicators
        }
    
    def detect_suspicious_patterns(self, metadata: EXIFMetadata) -> Dict[str, Any]:
        """
        Detect suspicious patterns in metadata
        
        Args:
            metadata: Extracted EXIF metadata
            
        Returns:
            Dictionary with suspicious pattern analysis
        """
        suspicious_indicators = []
        risk_score = 0.0
        
        if not metadata.has_camera_metadata:
            suspicious_indicators.append("No camera metadata present")
            risk_score += 0.3
            return {
                'suspicious_indicators': suspicious_indicators,
                'risk_score': risk_score
            }
        
        # Check for suspicious software
        if metadata.software:
            suspicious_software = ['photoshop', 'gimp', 'paint', 'editor', 'ai', 'generated']
            if any(suspicious in metadata.software.lower() for suspicious in suspicious_software):
                suspicious_indicators.append(f"Suspicious software: {metadata.software}")
                risk_score += 0.4
        
        # Check for missing critical fields
        if not metadata.camera_make or not metadata.camera_model:
            suspicious_indicators.append("Missing camera make/model information")
            risk_score += 0.2
        
        # Check for unrealistic ISO values
        if metadata.iso:
            if metadata.iso == 0 or metadata.iso > 102400:  # Unusually high ISO
                suspicious_indicators.append(f"Unusual ISO value: {metadata.iso}")
                risk_score += 0.1
        
        # Check for future timestamps
        if metadata.datetime_original:
            if metadata.datetime_original > datetime.now():
                suspicious_indicators.append("Future timestamp detected")
                risk_score += 0.5
        
        return {
            'suspicious_indicators': suspicious_indicators,
            'risk_score': min(risk_score, 1.0)
        }
