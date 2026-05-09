import cv2
import numpy as np
from PIL import Image
from PIL.ExifTags import TAGS
from .camera_detector import detect_camera_origin

camera_keywords = [
    "iphone", "samsung", "redmi", "oneplus", "vivo", "oppo", "xiaomi",
    "canon", "nikon", "sony", "webcam", "camera"
]

def verify_image(path):
    try:
        image = cv2.imread(path)
        if image is None:
            return {
                "pinit_encrypted": False, "camera_captured": False,
                "image_source": "Invalid Image", "security_status": "Error", "confidence": 0
            }
        
        pinit_detected = False

        # METADATA CHECK
        try:
            img = Image.open(path)
            exifdata = img.getexif()
            for tagid in exifdata:
                value = str(exifdata.get(tagid)).lower()
                if "pinit secure camera" in value:
                    pinit_detected = True
        except:
            pass

        # USE IMPROVED CAMERA DETECTION
        camera_result = detect_camera_origin(path)
        is_camera = camera_result["camera_captured"]

        # FINAL RESULT
        if is_camera:
            source = "Camera Image"
            security = "Authentic"
            confidence = camera_result.get("confidence", 85)
        else:
            source = "Non-Camera Image"
            security = "Suspicious"
            confidence = camera_result.get("confidence", 70)

        return {
            "pinit_encrypted": pinit_detected, 
            "camera_captured": is_camera,
            "image_source": source, 
            "security_status": security, 
            "confidence": confidence
        }
    except Exception as e:
        print("Verification Error:", e)
        return {
            "pinit_encrypted": False, "camera_captured": False,
            "image_source": "Processing Error", "security_status": "Error", "confidence": 0
        }
