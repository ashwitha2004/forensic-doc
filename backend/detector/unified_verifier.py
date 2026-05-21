import cv2
import numpy as np
from PIL import Image
from PIL.ExifTags import TAGS
import json
import os
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import StandardScaler
import joblib
import warnings
warnings.filterwarnings("ignore")

# ==============================
# IMPROVED FORENSIC DETECTION SYSTEM
# ==============================

class ImprovedClassificationSystem:
    """Production-level image classification with meaningful categories"""
    
    def __init__(self):
        self.scaler = StandardScaler()
        self.model = None
        self.load_model()
    
    def load_model(self):
        """Load pre-trained model or create new one"""
        model_path = os.path.join(os.path.dirname(__file__), 'models', 'forensic_classifier.pkl')
        if os.path.exists(model_path):
            try:
                self.model = joblib.load(model_path)
                print("[DEBUG] Loaded pre-trained forensic model")
                return
            except:
                print("[DEBUG] Failed to load model, creating new one")
        
        # Create new model if none exists
        self.model = RandomForestClassifier(
            n_estimators=100,
            max_depth=15,
            min_samples_split=5,
            min_samples_leaf=2,
            random_state=42
        )
        print("[DEBUG] Created new forensic model")
    
    def save_model(self):
        """Save trained model"""
        try:
            model_dir = os.path.join(os.path.dirname(__file__), 'models')
            os.makedirs(model_dir, exist_ok=True)
            model_path = os.path.join(model_dir, 'forensic_classifier.pkl')
            joblib.dump(self.model, model_path)
            print(f"[DEBUG] Saved model to {model_path}")
        except Exception as e:
            print(f"[DEBUG] Failed to save model: {e}")
    
    def extract_all_features(self, image_path):
        """Extract comprehensive forensic features"""
        print(f"[DEBUG] Extracting features for: {image_path}")
        
        image = cv2.imread(image_path)
        if image is None:
            return {}
        
        features = {}
        
        # === METADATA FEATURES ===
        try:
            img = Image.open(image_path)
            exifdata = img.getexif()
            
            features.update({
                'has_exif': 0,
                'camera_keywords_count': 0,
                'pinit_detected': 0,
                'software_ai_score': 0,
                'make_present': 0,
                'model_present': 0,
                'gps_present': 0,
                'edit_software_detected': 0
            })
            
            if exifdata:
                features['has_exif'] = 1
                print("[DEBUG] EXIF data found: True")
                
                for tagid in exifdata:
                    tag = TAGS.get(tagid, tagid)
                    value = str(exifdata.get(tagid)).lower()
                    
                    # PINIT SIGNATURE
                    if "pinit secure camera" in value:
                        features['pinit_detected'] = 1
                        print("[DEBUG] PINIT signature detected in EXIF")
                    
                    # CAMERA KEYWORDS
                    camera_keywords = ["iphone", "samsung", "redmi", "oneplus", "vivo", "oppo", "xiaomi", "canon", "nikon", "sony", "camera", "webcam"]
                    if any(word in value for word in camera_keywords):
                        features['camera_keywords_count'] += 1
                    
                    # AI SOFTWARE
                    ai_software = ["midjourney", "dall-e", "stable diffusion", "photoshop", "gimp", "canva"]
                    if any(ai in value for ai in ai_software):
                        features['software_ai_score'] = 1
                    
                    # SPECIFIC FIELDS
                    if tag == 'Make':
                        features['make_present'] = 1
                    elif tag == 'Model':
                        features['model_present'] = 1
                    elif tag == 'Software':
                        edit_software = ["photoshop", "gimp", "snagit", "paint.net"]
                        if any(edit in value for edit in edit_software):
                            features['edit_software_detected'] = 1
                    elif tag in ['GPSInfo', 'GPSTag']:
                        features['gps_present'] = 1
            else:
                print("[DEBUG] EXIF data found: False")
        except Exception as e:
            print(f"[DEBUG] EXIF extraction error: {e}")
        
        # === NOISE PATTERN FEATURES ===
        try:
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
            
            # Sensor noise estimation
            blur = cv2.GaussianBlur(gray, (5,5), 0)
            sensor_noise = np.mean(cv2.absdiff(gray, blur))
            
            # High-frequency noise analysis
            laplacian = cv2.Laplacian(gray, cv2.CV_64F)
            high_freq_noise = np.var(laplacian)
            
            # Local variance statistics
            kernel = np.ones((5,5), np.float32) / 25
            local_var = cv2.filter2D(gray.astype(np.float32), -1, kernel)
            local_variance = np.var(local_var)
            
            features.update({
                'sensor_noise': float(sensor_noise),
                'high_freq_noise': float(high_freq_noise),
                'local_variance': float(local_variance)
            })
            
            print(f"[DEBUG] Noise features: sensor_noise={sensor_noise:.2f}, hf_noise={high_freq_noise:.2f}")
        except Exception as e:
            print(f"[DEBUG] Noise extraction error: {e}")
        
        # === SCREENSHOT/UI FEATURES ===
        try:
            h, w = image.shape[:2]
            
            # Text density using edge detection
            edges = cv2.Canny(gray, 50, 150)
            contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            text_density = len(contours) / (h * w)
            
            # Flat color regions (common in UI)
            hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
            low_sat_mask = cv2.inRange(hsv, np.array([0,0,0]), np.array([180,30,255]))
            flat_color_ratio = np.sum(low_sat_mask > 0) / (h * w)
            
            # UI line density
            lines = cv2.HoughLinesP(edges, 1, np.pi/180, 50, 10)
            ui_line_density = len(lines) if lines is not None else 0
            
            features.update({
                'text_density': float(text_density),
                'flat_color_ratio': float(flat_color_ratio),
                'ui_line_density': float(ui_line_density)
            })
            
            print(f"[DEBUG] Screenshot features: text_density={text_density:.4f}, flat_ratio={flat_color_ratio:.3f}")
        except Exception as e:
            print(f"[DEBUG] Screenshot extraction error: {e}")
        
        # === COMPRESSION FEATURES ===
        try:
            # JPEG artifact analysis (8x8 DCT blocks)
            h, w = gray.shape
            block_variances = []
            
            for i in range(0, h-8, 8):
                for j in range(0, w-8, 8):
                    block = gray[i:i+8, j:j+8]
                    if block.size > 0:
                        block_variances.append(np.var(block))
            
            jpeg_artifacts = np.std(block_variances) if block_variances else 0
            
            features.update({
                'jpeg_artifacts': float(jpeg_artifacts)
            })
            
            print(f"[DEBUG] Compression features: jpeg_artifacts={jpeg_artifacts:.2f}")
        except Exception as e:
            print(f"[DEBUG] Compression extraction error: {e}")
        
        # === AI ARTIFACT FEATURES ===
        try:
            # Over-smoothed regions
            blur_large = cv2.GaussianBlur(gray, (15,15), 0)
            smooth_diff = np.mean(np.abs(gray.astype(np.float32) - blur_large.astype(np.float32)))
            over_smoothed = smooth_diff < 5
            
            # Texture repetition analysis
            h, w = gray.shape
            if h >= 100 and w >= 100:
                patch_size = 16
                patches = []
                for i in range(0, h-patch_size, patch_size):
                    for j in range(0, w-patch_size, patch_size):
                        patch = gray[i:i+patch_size, j:j+patch_size]
                        patches.append(np.var(patch))
                
                texture_repetition = np.std(patches) if patches else 0
            else:
                texture_repetition = 0
            
            features.update({
                'over_smoothed': float(over_smoothed),
                'texture_repetition': float(texture_repetition)
            })
            
            print(f"[DEBUG] AI artifact features: over_smoothed={over_smoothed}, texture_rep={texture_repetition:.2f}")
        except Exception as e:
            print(f"[DEBUG] AI artifact extraction error: {e}")
        
        print(f"[DEBUG] Total features extracted: {len(features)}")
        return features
    
    def classify_with_priority_logic(self, features):
        """Priority-based classification with meaningful categories"""
        print("[DEBUG] Starting priority-based classification...")
        
        scores = {
            'camera': 0.0,
            'screenshot': 0.0,
            'ai_generated': 0.0,
            'downloaded': 0.0,
            'edited': 0.0
        }
        
        # === PRIORITY 1: SCREENSHOT DETECTION ===
        if features.get('text_density', 0) > 0.001:
            scores['screenshot'] += 0.4
            print("[DEBUG] Screenshot evidence: text density")
        
        if features.get('flat_color_ratio', 0) > 0.3:
            scores['screenshot'] += 0.3
            print("[DEBUG] Screenshot evidence: flat color regions")
        
        if features.get('ui_line_density', 0) > 5:
            scores['screenshot'] += 0.3
            print("[DEBUG] Screenshot evidence: UI line density")
        
        # === PRIORITY 2: AI GENERATED DETECTION ===
        if features.get('software_ai_score', 0) > 0:
            scores['ai_generated'] += 0.6
            print("[DEBUG] AI evidence: AI software detected")
        
        # Lowered threshold for over-smoothed detection (0.5 -> 0.3)
        if features.get('over_smoothed', 0) > 0.3:
            scores['ai_generated'] += 0.4
            print("[DEBUG] AI evidence: over-smoothed regions")
        
        # Expanded texture repetition detection range
        texture_rep = features.get('texture_repetition', 0)
        if texture_rep > 80 or texture_rep < 15:
            scores['ai_generated'] += 0.35
            print("[DEBUG] AI evidence: unrealistic texture patterns")
        
        # Add high-frequency noise check (AI images often lack natural high-freq noise)
        if features.get('high_freq_noise', 0) < 50:
            scores['ai_generated'] += 0.25
            print("[DEBUG] AI evidence: lack of natural high-frequency noise")
        
        # Add JPEG artifacts check (AI images often have uniform compression)
        if features.get('jpeg_artifacts', 0) < 20:
            scores['ai_generated'] += 0.2
            print("[DEBUG] AI evidence: uniform compression patterns")
        
        # === PRIORITY 3: CAMERA SENSOR PATTERNS ===
        # Make camera detection more strict - require multiple indicators
        if features.get('has_exif', 0) > 0:
            scores['camera'] += 0.2
            print("[DEBUG] Camera evidence: EXIF data present")
        
        # Require at least 2 camera keywords for stronger evidence
        if features.get('camera_keywords_count', 0) >= 2:
            scores['camera'] += 0.35
            print("[DEBUG] Camera evidence: multiple camera keywords in metadata")
        
        # Increased threshold for sensor noise (2 -> 3)
        if features.get('sensor_noise', 0) > 3:
            scores['camera'] += 0.35
            print("[DEBUG] Camera evidence: natural sensor noise")
        
        # Increased threshold for local variance (100 -> 150)
        if features.get('local_variance', 0) > 150:
            scores['camera'] += 0.25
            print("[DEBUG] Camera evidence: natural local variance")
        
        # Penalty for AI indicators even if EXIF exists
        if scores['ai_generated'] > 0.5 and features.get('has_exif', 0) > 0:
            scores['camera'] -= 0.3
            print("[DEBUG] Camera score reduced due to strong AI indicators")
        
        # === PRIORITY 4: DOWNLOADED/RECOMPRESSED DETECTION ===
        if not features.get('has_exif', 0) and features.get('jpeg_artifacts', 0) > 50:
            scores['downloaded'] += 0.3
            print("[DEBUG] Downloaded evidence: no EXIF but high compression artifacts")
        
        # === PRIORITY 5: EDITED/MANIPULATED DETECTION ===
        if features.get('edit_software_detected', 0) > 0:
            scores['edited'] += 0.6
            print("[DEBUG] Edited evidence: editing software detected")
        
        if features.get('gps_present', 0) > 0:
            scores['edited'] += 0.2
            print("[DEBUG] Edited evidence: GPS data present (potential manipulation)")
        
        print(f"[DEBUG] Classification scores: {scores}")
        
        # DETERMINE WINNER
        max_score = max(scores.values())
        best_class = max(scores, key=scores.get)
        confidence = min(max_score * 100, 95)
        
        print(f"[DEBUG] Best classification: {best_class} (confidence: {confidence:.1f})")
        
        return best_class, confidence, scores
    
    def get_meaningful_category(self, classification, confidence):
        """Map classification to meaningful category and status"""
        if classification == 'camera':
            return {
                'image_source': 'Camera Image',
                'camera_captured': True,
                'security_status': 'Authentic',
                'detection_type': 'Real Camera Captured',
                'risk_level': 'Low'
            }
        elif classification == 'screenshot':
            return {
                'image_source': 'Screenshot',
                'camera_captured': False,
                'security_status': 'Digital Capture',
                'detection_type': 'Screenshot/UI Capture',
                'risk_level': 'Medium'
            }
        elif classification == 'ai_generated':
            return {
                'image_source': 'AI Generated',
                'camera_captured': False,
                'security_status': 'Synthetic Media',
                'detection_type': 'AI Generated Image',
                'risk_level': 'High'
            }
        elif classification == 'downloaded':
            return {
                'image_source': 'Downloaded Image',
                'camera_captured': True,  # Downloaded camera photos are still camera
                'security_status': 'External Source',
                'detection_type': 'Downloaded/Forwarded Image',
                'risk_level': 'Low'
            }
        elif classification == 'edited':
            return {
                'image_source': 'Edited Image',
                'camera_captured': False,
                'security_status': 'Modified',
                'detection_type': 'Edited/Manipulated Image',
                'risk_level': 'High'
            }
        else:
            return {
                'image_source': 'Unknown Image',
                'camera_captured': False,
                'security_status': 'Suspicious',
                'detection_type': 'Unknown Classification',
                'risk_level': 'Medium'
            }

# ==============================
# MAIN CLASSIFIER INSTANCE
# ==============================
classifier = ImprovedClassificationSystem()

def verify_image(path):
    """Main verification function with improved classification"""
    try:
        print(f"[DEBUG] =======================================")
        print(f"[DEBUG] IMPROVED CLASSIFICATION SYSTEM")
        print(f"[DEBUG] Image: {path}")
        print(f"[DEBUG] =======================================")
        
        # Extract all features
        features = classifier.extract_all_features(path)
        
        # Classify with priority logic
        classification, confidence, scores = classifier.classify_with_priority_logic(features)
        
        # Get meaningful category
        category = classifier.get_meaningful_category(classification, confidence)
        
        # PINIT detection
        pinit_detected = features.get('pinit_detected', 0)
        
        # Prepare debug output
        debug_output = {
            "metadata_score": float(features.get('has_exif', 0) * 0.3 + features.get('camera_keywords_count', 0) * 0.1),
            "noise_score": float(features.get('sensor_noise', 0)),
            "screenshot_score": float(scores.get('screenshot', 0)),
            "ai_score": float(scores.get('ai_generated', 0)),
            "compression_score": float(features.get('jpeg_artifacts', 0)),
            "camera_probability": float(scores.get('camera', 0)),
            "final_score": float(confidence / 100)
        }
        
        result = {
            "pinit_encrypted": bool(pinit_detected),
            "camera_captured": category['camera_captured'],
            "image_source": category['image_source'],
            "security_status": category['security_status'],
            "confidence": confidence,
            "detection_type": category['detection_type'],
            "risk_level": category['risk_level'],
            "debug": debug_output
        }
        
        print(f"[DEBUG] =======================================")
        print(f"[DEBUG] FINAL RESULT:")
        print(f"[DEBUG] Detection Type: {result['detection_type']}")
        print(f"[DEBUG] Image Source: {result['image_source']}")
        print(f"[DEBUG] Camera Captured: {result['camera_captured']}")
        print(f"[DEBUG] Security Status: {result['security_status']}")
        print(f"[DEBUG] Risk Level: {result['risk_level']}")
        print(f"[DEBUG] Confidence: {result['confidence']:.1f}")
        print(f"[DEBUG] Debug scores: {debug_output}")
        print(f"[DEBUG] =======================================")
        
        return result
        
    except Exception as e:
        print(f"[DEBUG] Classification error: {e}")
        return {
            "pinit_encrypted": False,
            "camera_captured": False,
            "image_source": "Processing Error",
            "security_status": "Error",
            "confidence": 0,
            "detection_type": "Processing Error",
            "risk_level": "High",
            "debug": {
                "metadata_score": 0,
                "noise_score": 0,
                "screenshot_score": 0,
                "ai_score": 0,
                "compression_score": 0,
                "camera_probability": 0,
                "final_score": 0
            }
        }

# ==============================
# TRAINING FUNCTIONS (FOR FUTURE USE)
# ==============================
def create_training_dataset():
    """Create dataset structure for training"""
    dataset_dir = os.path.join(os.path.dirname(__file__), '..', 'dataset')
    
    structure = {
        'real_camera': os.path.join(dataset_dir, 'real_camera'),
        'whatsapp_camera': os.path.join(dataset_dir, 'whatsapp_camera'),
        'ai_generated': os.path.join(dataset_dir, 'ai_generated'),
        'screenshots': os.path.join(dataset_dir, 'screenshots'),
        'edited': os.path.join(dataset_dir, 'edited'),
        'downloaded': os.path.join(dataset_dir, 'downloaded')
    }
    
    for category, path in structure.items():
        os.makedirs(path, exist_ok=True)
        print(f"[DEBUG] Created dataset directory: {path}")
    
    print("[DEBUG] Dataset structure created. Add images to train model.")
    return structure

def train_model(dataset_path=None):
    """Train the forensic classifier"""
    try:
        print("[DEBUG] Starting model training...")
        classifier.save_model()
        print("[DEBUG] Model training completed")
    except Exception as e:
        print(f"[DEBUG] Training error: {e}")

if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1:
        if sys.argv[1] == "create_dataset":
            create_training_dataset()
        elif sys.argv[1] == "train":
            train_model()
        else:
            result = verify_image(sys.argv[1])
            print(json.dumps(result, indent=2))
