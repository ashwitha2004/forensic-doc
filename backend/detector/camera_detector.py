import cv2
import numpy as np
from PIL import Image
from PIL.ExifTags import TAGS

camera_keywords = [
    "iphone",
    "samsung",
    "redmi",
    "oneplus",
    "vivo",
    "oppo",
    "xiaomi",
    "canon",
    "nikon",
    "sony",
    "camera",
    "webcam"
]

def detect_camera_origin(path):
    try:
        image = cv2.imread(path)
        
        if image is None:
            return {
                "camera_captured": False,
                "image_source": "Invalid Image",
                "security_status": "Error",
                "confidence": 0
            }

        score = 0

        # ====================================
        # IMAGE SIZE CHECK
        # ====================================
        height, width = image.shape[:2]
        
        if width >= 500 and height >= 500:
            score += 15

        # ====================================
        # METADATA CHECK
        # ====================================
        metadata_found = False
        
        try:
            img = Image.open(path)
            exifdata = img.getexif()
            
            for tagid in exifdata:
                tag = TAGS.get(tagid, tagid)
                value = str(exifdata.get(tagid)).lower()
                
                if any(word in value for word in camera_keywords):
                    metadata_found = True
                    score += 35
        except:
            pass

        # ====================================
        # IMAGE NOISE ANALYSIS
        # ====================================
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        blur = cv2.GaussianBlur(gray, (5,5), 0)
        noise = np.mean(cv2.absdiff(gray, blur))
        
        # Real camera images contain natural sensor noise
        if noise > 2:
            score += 20

        # ====================================
        # EDGE DENSITY ANALYSIS
        # ====================================
        edges = cv2.Canny(gray, 100, 200)
        edge_density = np.sum(edges > 0) / edges.size
        
        # Screenshots usually sharp
        # Camera photos softer
        if edge_density < 0.22:
            score += 20

        # ====================================
        # COLOR VARIATION
        # ====================================
        color_std = np.std(image)
        
        if color_std > 20:
            score += 10

        # ====================================
        # JPEG COMPRESSION PATTERN
        # ====================================
        compression_score = np.std(gray)
        
        if compression_score > 25:
            score += 10

        # ====================================
        # FINAL DECISION
        # ====================================
        # Lower threshold for WhatsApp/webcam images
        is_camera = score >= 35

        if is_camera:
            return {
                "camera_captured": True,
                "image_source": "Camera Captured Image",
                "security_status": "Authentic",
                "confidence": min(score, 95)
            }

        return {
            "camera_captured": False,
            "image_source": "AI / Synthetic / Non-Camera Image",
            "security_status": "Suspicious",
            "confidence": 70
        }

    except Exception as e:
        print("Camera Detection Error:", e)
        return {
            "camera_captured": False,
            "image_source": "Processing Error",
            "security_status": "Error",
            "confidence": 0
        }
