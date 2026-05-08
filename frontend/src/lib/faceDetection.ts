import * as tf from "@tensorflow/tfjs";
import * as blazeface from "@tensorflow-models/blazeface";

let model: blazeface.BlazeFaceModel | null = null;
let modelLoadingPromise: Promise<blazeface.BlazeFaceModel> | null = null;

/**
 * Load the BlazeFace model for face detection with proper error handling
 */
export async function loadFaceDetectionModel(): Promise<blazeface.BlazeFaceModel> {
  if (model) {
    return model;
  }
  
  if (modelLoadingPromise) {
    return modelLoadingPromise;
  }

  modelLoadingPromise = (async () => {
    try {
      console.log(' Initializing TensorFlow.js...');
      
      // Add timeout to prevent hanging
      const initTimeout = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('TensorFlow.js initialization timeout')), 10000);
      });
      
      await Promise.race([tf.ready(), initTimeout]);
      console.log(' TensorFlow.js ready, loading BlazeFace model...');
      
      // Set backend to CPU for better compatibility
      await tf.setBackend('cpu');
      console.log(' TensorFlow.js backend set to CPU');
      
      // Add timeout for model loading
      const modelTimeout = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('BlazeFace model loading timeout')), 15000);
      });
      
      model = await Promise.race([blazeface.load(), modelTimeout]) as blazeface.BlazeFaceModel;
      console.log(' Face detection model loaded successfully');
      return model;
    } catch (error) {
      console.error("Failed to load face detection model:", error);
      
      // Clean up on error
      model = null;
      modelLoadingPromise = null;
      
      // Provide more specific error message
      const errorMsg = error instanceof Error ? error.message : String(error);
      
      // Check for constructor errors (Y3, X3, etc.)
      if (errorMsg.includes('Y3') || errorMsg.includes('X3') || errorMsg.includes('constructor')) {
        console.error('🚨 Constructor Error Detected:', errorMsg);
        throw new Error(`TensorFlow.js constructor error: ${errorMsg}. Please restart the app.`);
      }
      
      // Check for memory issues
      if (errorMsg.includes('memory') || errorMsg.includes('out of memory')) {
        throw new Error(`Memory error: ${errorMsg}. Please close other apps and try again.`);
      }
      
      throw new Error(`Face detection model failed: ${errorMsg}`);
    }
  })();

  return modelLoadingPromise;
}

/**
 * Interface for face detection result
 */
export interface FaceDetectionResult {
  hasFace: boolean;
  faceCount: number;
  confidence: number;
  landmarks?: blazeface.NormalizedFace[];
  error?: string;
}

/**
 * Detect if a video frame contains exactly one face
 * @param video - The video element to analyze
 * @returns FaceDetectionResult with face detection status
 */
export async function detectFaceInVideo(video: HTMLVideoElement): Promise<FaceDetectionResult> {
  try {
    if (!model) {
      model = await loadFaceDetectionModel();
    }

    // Ensure video is ready
    if (video.readyState < 2) {
      return {
        hasFace: false,
        faceCount: 0,
        confidence: 0,
        error: "Video not ready",
      };
    }

    // Run face detection
    const predictions = await model.estimateFaces(video, false);

    // Check if exactly one face was detected
    if (!predictions || predictions.length === 0) {
      return {
        hasFace: false,
        faceCount: 0,
        confidence: 0,
        error: "No face detected. Please ensure your face is clearly visible.",
      };
    }

    if (predictions.length > 1) {
      return {
        hasFace: false,
        faceCount: predictions.length,
        confidence: 0,
        error: `Multiple faces detected (${predictions.length}). Only one face should be in the frame.`,
      };
    }

    const face = predictions[0];
    const confidence = face.probability?.[0] || 0;

    // Different thresholds based on use case
    // Registration: HIGH threshold (75%) - only perfect faces
    // Login: MEDIUM threshold (60%) - recognize known user
    // This prevents registration of partial faces (hair, side profiles)
    if (confidence < 0.60) {
      return {
        hasFace: false,
        faceCount: 1,
        confidence,
        error: `Face detection confidence too low (${Math.round(confidence * 100)}%). Please ensure good lighting and face is clearly visible.`,
      };
    }

    return {
      hasFace: true,
      faceCount: 1,
      confidence,
      landmarks: predictions,
    };
  } catch (error) {
    console.error("Face detection error:", error);
    return {
      hasFace: false,
      faceCount: 0,
      confidence: 0,
      error: "Face detection failed. Please try again.",
    };
  }
}

/**
 * Validate that only a face is in the frame (no other objects)
 * @param video - The video element to analyze
 * @param requiredConfidence - Minimum confidence threshold (0-1)
 * @returns true if valid face detected, false otherwise
 */
export async function validateFaceOnly(
  video: HTMLVideoElement,
  requiredConfidence: number = 0.75
): Promise<boolean> {
  const result = await detectFaceInVideo(video);
  return result.hasFace && result.confidence >= requiredConfidence;
}

/**
 * Check if face is suitable for REGISTRATION (perfect face detection)
 * Requires HIGH confidence and validates face landmarks
 */
export function isFaceSuitableForRegistration(result: FaceDetectionResult): boolean {
  // Confidence must be >= 75% for registration
  const MIN_REGISTRATION_CONFIDENCE = 0.75;
  if (!result.hasFace || result.confidence < MIN_REGISTRATION_CONFIDENCE) {
    return false;
  }
  
  // Validate landmarks exist and face is complete
  if (!result.landmarks || result.landmarks.length === 0) {
    return false;
  }
  
  const face = result.landmarks[0];
  // Check that major landmarks are detected (eyes, nose, mouth)
  if (!face.landmarks || Array.isArray(face.landmarks) && face.landmarks.length < 6) {
    return false;
  }
  
  return true;
}

/**
 * Get face quality score for display and decision-making
 */
export function getFaceQualityScore(result: FaceDetectionResult): { score: number; quality: string } {
  if (!result.hasFace) return { score: 0, quality: 'No face detected' };
  
  const confidencePercent = result.confidence * 100;
  let quality = 'Poor';
  
  if (confidencePercent >= 90) quality = 'Perfect';
  else if (confidencePercent >= 80) quality = 'Great';
  else if (confidencePercent >= 75) quality = 'Good';
  else if (confidencePercent >= 60) quality = 'Fair';
  else quality = 'Poor';
  
  return { score: Math.round(confidencePercent), quality };
}

/**
 * Clean up TensorFlow memory
 */
export async function disposeModels(): Promise<void> {
  try {
    if (model) {
      // BlazeFaceModel may not have dispose method, handle gracefully
      if ('dispose' in model && typeof model.dispose === 'function') {
        model.dispose();
      }
      model = null;
    }
    tf.disposeVariables();
  } catch (error) {
    console.warn('Error disposing models:', error);
    model = null;
  }
}
