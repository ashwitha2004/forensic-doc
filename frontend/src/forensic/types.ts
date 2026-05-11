/**
 * Forensic Analysis Types
 * Defines the structure for forensic detection results and classification
 */

export interface ForensicSignals {
  metadata_detected: boolean;
  camera_probability: number;
  ai_probability: number;
  screenshot_probability: number;
  edited_probability: number;
  pinit_encrypted: boolean;
}

export interface DetectorResult {
  detected: boolean;
  confidence: number;
  evidence: Record<string, any>;
  reasoning: string[];
}

export interface PINITDetectionResult extends DetectorResult {
  encrypted: boolean;
  watermark_detected: boolean;
  encryption_version?: string;
}

export interface CameraDetectionResult extends DetectorResult {
  exif_present: boolean;
  sensor_noise_level: number;
  natural_edges: boolean;
  jpeg_artifacts: boolean;
  chromatic_aberration: boolean;
}

export interface AIDetectionResult extends DetectorResult {
  oversmoothing: number;
  diffusion_artifacts: boolean;
  repetitive_patterns: boolean;
  frequency_anomaly: number;
  synthetic_noise: boolean;
}

export interface ScreenshotDetectionResult extends DetectorResult {
  ui_elements: boolean;
  text_density: number;
  screen_ratio: boolean;
  pixel_grid: boolean;
  histogram_flatness: number;
}

export interface EditedDetectionResult extends DetectorResult {
  lighting_inconsistency: boolean;
  cloning_artifacts: boolean;
  compositing_edges: boolean;
  filter_traces: boolean;
  recompression_artifacts: boolean;
  crop_boundaries: boolean;
}

export interface ForensicClassification {
  type: 'PINIT_ENCRYPTED' | 'CAMERA_CAPTURED' | 'AI_GENERATED' | 'SCREENSHOT' | 'EDITED_MANIPULATED' | 'UNKNOWN';
  confidence: number;
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  primary_evidence: string[];
  secondary_evidence: string[];
}

export interface ForensicAnalysisResult {
  success: boolean;
  classification: ForensicClassification;
  signals: ForensicSignals;
  processing_time_ms: number;
  technical_details: {
    pinit_detection: PINITDetectionResult;
    camera_detection: CameraDetectionResult;
    ai_detection: AIDetectionResult;
    screenshot_detection: ScreenshotDetectionResult;
    edited_detection: EditedDetectionResult;
  };
  error_message?: string;
}

export interface ForensicImage {
  file: File;
  dataUrl: string;
  filename: string;
  size: number;
  type: string;
}

export interface ForensicConfig {
  enable_pinit_detection: boolean;
  enable_camera_detection: boolean;
  enable_ai_detection: boolean;
  enable_screenshot_detection: boolean;
  enable_edited_detection: boolean;
  confidence_threshold: number;
  risk_thresholds: {
    low: number;
    medium: number;
    high: number;
  };
}

export const DEFAULT_FORENSIC_CONFIG: ForensicConfig = {
  enable_pinit_detection: true,
  enable_camera_detection: true,
  enable_ai_detection: true,
  enable_screenshot_detection: true,
  enable_edited_detection: true,
  confidence_threshold: 0.5,
  risk_thresholds: {
    low: 0.3,
    medium: 0.6,
    high: 0.8
  }
};

export const FORENSIC_PRIORITY_ORDER = [
  'PINIT_ENCRYPTED',
  'SCREENSHOT', 
  'AI_GENERATED',
  'CAMERA_CAPTURED',
  'EDITED_MANIPULATED',
  'UNKNOWN'
] as const;
