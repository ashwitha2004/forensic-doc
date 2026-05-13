/**
 * REDESIGNED FORENSIC DETECTION SYSTEM
 * Focus on actual IMAGE TYPE classification, not delivery method
 * Target types: Camera Captured, AI Generated, Screenshot, Edited/Manipulated, Unknown
 */

import { ImageMetadata } from './imageAnalysis';

// Types
export interface AIGeneratedDetection {
  probability: number;
  reasons: string[];
}

export interface CameraOriginalDetection {
  detected: boolean;
  confidence: number;
  reasons: string[];
  exifData: boolean;
  cameraManufacturer?: string;
}

export interface ScreenshotDetection {
  detected: boolean;
  confidence: number;
  reasons: string[];
}

export interface EditedManipulatedDetection {
  detected: boolean;
  confidence: number;
  reasons: string[];
  manipulationType?: 'cropping' | 'filtering' | 'compositing' | 'enhancement' | 'unknown';
}

export interface ForensicAnalysisResult {
  imageType: 'camera' | 'ai' | 'screenshot' | 'edited' | 'unknown';
  confidence: number;
  aiProbability: number;
  cameraProbability: number;
  screenshotProbability: number;
  editedProbability: number;
  downloadedProbability: number;
  whatsappProbability: number;
  securityStatus: string;
  imageSource: string;
  cameraCaptured: boolean;
}

/**
 * ENHANCED AI DETECTION - Focus on synthetic content indicators
 */
export async function detectAIGenerated(
  base64Data: string,
  metadata: ImageMetadata
): Promise<AIGeneratedDetection> {
  console.log("[AI] Starting AI detection analysis...");
  
  const reasons: string[] = [];
  let aiScore = 0;
  
  try {
    console.log("[AI] ===========================================");
    console.log("[AI] AI DETECTION - INDIVIDUAL SCORES");
    console.log("[AI] ===========================================");
    
    // 1. Repeated texture patterns (GAN artifacts)
    const textureScore = await analyzeRepeatedPatterns(base64Data);
    if (textureScore > 0.82) {
      aiScore += 25;
      reasons.push("Repeated GAN-like patterns");
      console.log(`[AI] ✅ Repeated patterns: ${textureScore.toFixed(3)} > 0.82 (+25 points)`);
    } else {
      console.log(`[AI] ❌ Low repeated patterns: ${textureScore.toFixed(3)} <= 0.82 (+0 points)`);
    }
    
    // 2. Unnatural edge smoothness
    const edgeScore = await analyzeEdgeSmoothness(base64Data);
    if (edgeScore > 0.92) {
      aiScore += 20;
      reasons.push("Artificial edge smoothness");
      console.log(`[AI] ✅ Unnatural edge smoothness: ${edgeScore.toFixed(3)} > 0.92 (+20 points)`);
    } else {
      console.log(`[AI] ❌ Natural edge smoothness: ${edgeScore.toFixed(3)} <= 0.92 (+0 points)`);
    }
    
    // 3. GAN frequency patterns
    const frequencyScore = await analyzeFrequencySpectrum(base64Data);
    if (frequencyScore > 0.88) {
      aiScore += 25;
      reasons.push("GAN frequency artifacts");
      console.log(`[AI] ✅ GAN frequency patterns: ${frequencyScore.toFixed(3)} > 0.88 (+25 points)`);
    } else {
      console.log(`[AI] ❌ Natural frequency spectrum: ${frequencyScore.toFixed(3)} <= 0.88 (+0 points)`);
    }
    
    // 4. Perfect symmetry
    const symmetryScore = await analyzeSymmetry(base64Data);
    if (symmetryScore > 0.90) {
      aiScore += 15;
      reasons.push("Artificial symmetry");
      console.log(`[AI] ✅ Perfect symmetry: ${symmetryScore.toFixed(3)} > 0.90 (+15 points)`);
    } else {
      console.log(`[AI] ❌ Natural symmetry: ${symmetryScore.toFixed(3)} <= 0.90 (+0 points)`);
    }
    
    // 5. Fake noise profile
    const noiseScore = await analyzeNoiseDistribution(base64Data);
    if (noiseScore < 0.15) {
      aiScore += 15;
      reasons.push("Synthetic noise profile");
      console.log(`[AI] ✅ Fake noise profile: ${noiseScore.toFixed(3)} < 0.15 (+15 points)`);
    } else {
      console.log(`[AI] ❌ Natural noise distribution: ${noiseScore.toFixed(3)} >= 0.15 (+0 points)`);
    }
    
    console.log("[AI] ===========================================");
    console.log("[AI] AI DETECTION - FINAL RESULTS");
    console.log("[AI] ===========================================");
    
  } catch (error) {
    console.warn("[AI] ⚠️ AI detection analysis failed:", error);
    reasons.push("AI detection analysis failed");
  }
  
  // Cap at 100
  aiScore = Math.min(aiScore, 100);
  
  console.log(`[AI] Final AI Score: ${aiScore}/100`);
  console.log(`[AI] Probability: ${aiScore}%`);
  console.log(`[AI] Detection reasons:`, reasons);
  
  return {
    probability: aiScore,
    reasons
  };
}

/**
 * ENHANCED CAMERA DETECTION - Focus on natural image characteristics
 */
export async function detectCameraOriginal(
  base64Data: string,
  metadata: ImageMetadata
): Promise<CameraOriginalDetection> {
  console.log("[CAMERA] Starting camera detection analysis...");
  console.log("[CAMERA] Input metadata:", {
    hasExif: metadata.hasExif,
    dimensions: `${metadata.dimensions.width}x${metadata.dimensions.height}`,
    filename: metadata.filename,
    fileSize: metadata.fileSize
  });
  
  const reasons: string[] = [];
  let cameraScore = 0;
  let detected = false;
  
  try {
    console.log("[CAMERA] ===========================================");
    console.log("[CAMERA] CAMERA DETECTION - INDIVIDUAL SCORES");
    console.log("[CAMERA] ===========================================");
    
    // 1. Natural sensor noise (strong camera indicator)
    const sensorNoiseScore = await analyzeSensorNoise(base64Data);
    if (sensorNoiseScore > 0.45 && sensorNoiseScore < 1.8) {
      cameraScore += 25;
      reasons.push("Natural sensor noise");
      console.log(`[CAMERA] ✅ Natural sensor noise: ${sensorNoiseScore.toFixed(3)} (+25 points)`);
    } else {
      console.log(`[CAMERA] ❌ Artificial sensor noise: ${sensorNoiseScore.toFixed(3)} (+0 points)`);
    }
    
    // 2. CFA interpolation traces (camera sensor patterns)
    const cfaScore = await analyzeCFAInterpolation(base64Data);
    if (cfaScore > 0.6) {
      cameraScore += 20;
      reasons.push("CFA interpolation traces");
      console.log(`[CAMERA] ✅ CFA interpolation: ${cfaScore.toFixed(3)} (+20 points)`);
    } else {
      console.log(`[CAMERA] ❌ No CFA traces: ${cfaScore.toFixed(3)} (+0 points)`);
    }
    
    // 3. Natural JPEG quantization consistency
    const jpegScore = await analyzeNaturalJPEG(base64Data);
    if (jpegScore.isNatural && jpegScore.consistency > 0.7) {
      cameraScore += 20;
      reasons.push("Natural JPEG compression");
      console.log(`[CAMERA] ✅ Natural JPEG: ${jpegScore.consistency.toFixed(3)} (+20 points)`);
    } else {
      console.log(`[CAMERA] ❌ Artificial JPEG compression (+0 points)`);
    }
    
    // 4. Chromatic aberration (lens imperfections)
    const aberrationScore = await analyzeChromaticAberration(base64Data);
    if (aberrationScore > 0.3) {
      cameraScore += 15;
      reasons.push("Chromatic aberration detected");
      console.log(`[CAMERA] ✅ Chromatic aberration: ${aberrationScore.toFixed(3)} (+15 points)`);
    } else {
      console.log(`[CAMERA] ❌ No chromatic aberration: ${aberrationScore.toFixed(3)} (+0 points)`);
    }
    
    // 5. Natural edge randomness
    const edgeScore = await analyzeEdgeRandomness(base64Data);
    if (edgeScore < 0.82) {
      cameraScore += 10;
      reasons.push("Natural edge transitions");
      console.log(`[CAMERA] ✅ Natural edges: ${edgeScore.toFixed(3)} (+10 points)`);
    } else {
      console.log(`[CAMERA] ❌ Unnatural edge smoothness: ${edgeScore.toFixed(3)} (+0 points)`);
    }
    
    // 6. EXIF presence (bonus, not primary)
    if (metadata.hasExif && metadata.exifData) {
      cameraScore += 10;
      reasons.push("Camera EXIF metadata");
      console.log(`[CAMERA] ✅ Camera EXIF metadata (+10 points)`);
    } else {
      console.log(`[CAMERA] ❌ No camera EXIF metadata (+0 points)`);
    }
    
    console.log("[CAMERA] ===========================================");
    console.log("[CAMERA] CAMERA DETECTION - FINAL RESULTS");
    console.log("[CAMERA] ===========================================");
    
  } catch (error) {
    console.warn("[CAMERA] ⚠️ Camera detection analysis failed:", error);
    reasons.push("Camera detection analysis failed");
  }
  
  // Cap at 100
  cameraScore = Math.min(cameraScore, 100);
  
  detected = cameraScore >= 50;  // Higher threshold for camera detection
  
  console.log(`[CAMERA] Final Camera Score: ${cameraScore}/100`);
  console.log(`[CAMERA] Camera Score vs Threshold: ${cameraScore} >= 50 = ${detected ? 'PASS' : 'FAIL'}`);
  console.log(`[CAMERA] FINAL DECISION - ${detected ? 'DETECTED' : 'NOT DETECTED'} - Confidence: ${cameraScore}%`);
  console.log("[CAMERA] Detection reasons:", reasons);
  
  return {
    detected,
    confidence: cameraScore,
    reasons,
    exifData: metadata.hasExif,
    cameraManufacturer: metadata.exifData?.Make
  };
}

/**
 * BALANCED SCREENSHOT DETECTION - Reduced over-detection
 */
export async function detectScreenshot(
  base64Data: string,
  metadata: ImageMetadata
): Promise<ScreenshotDetection> {
  console.log("[SCREENSHOT] Starting screenshot detection analysis...");
  
  const reasons: string[] = [];
  let screenshotScore = 0;
  let detected = false;
  
  try {
    console.log("[SCREENSHOT] ===========================================");
    console.log("[SCREENSHOT] SCREENSHOT DETECTION - INDIVIDUAL SCORES");
    console.log("[SCREENSHOT] ===========================================");
    
    const { width, height } = metadata.dimensions;
    
    // 1. Screen resolution matching (REDUCED from 40 to 10 points)
    if (isScreenResolution(width, height)) {
      screenshotScore += 10;
      reasons.push("Screen resolution match");
      console.log(`[SCREENSHOT] ✅ Screen resolution: ${width}x${height} (+10 points)`);
    } else {
      console.log(`[SCREENSHOT] ❌ No screen resolution match: ${width}x${height} (+0 points)`);
    }
    
    // 2. Screen aspect ratio (REDUCED from 30 to 15 points)
    if (isScreenAspectRatio(width, height)) {
      screenshotScore += 15;
      reasons.push("Screen aspect ratio");
      console.log(`[SCREENSHOT] ✅ Screen aspect ratio: ${(width/height).toFixed(2)} (+15 points)`);
    } else {
      console.log(`[SCREENSHOT] ❌ No screen aspect ratio match: ${(width/height).toFixed(2)} (+0 points)`);
    }
    
    // 3. Missing EXIF (REDUCED from 20 to 5 points)
    if (!metadata.hasExif) {
      screenshotScore += 5;
      reasons.push("Missing EXIF metadata");
      console.log(`[SCREENSHOT] ✅ Missing EXIF (+5 points)`);
    } else {
      console.log(`[SCREENSHOT] ❌ Camera EXIF metadata present (+0 points)`);
    }
    
    // 4. UI elements detection (INCREASED from 10 to 25 points)
    const uiScore = await analyzeUIElements(base64Data);
    if (uiScore > 0.7) {
      screenshotScore += 25;
      reasons.push("Strong UI elements detected");
      console.log(`[SCREENSHOT] ✅ Strong UI elements: ${uiScore.toFixed(3)} (+25 points)`);
    } else if (uiScore > 0.4) {
      screenshotScore += 10;
      reasons.push("Weak UI elements detected");
      console.log(`[SCREENSHOT] ✅ Weak UI elements: ${uiScore.toFixed(3)} (+10 points)`);
    } else {
      console.log(`[SCREENSHOT] ❌ No UI elements: ${uiScore.toFixed(3)} (+0 points)`);
    }
    
    // 5. Screen pixel patterns (NEW - 20 points)
    const pixelScore = await analyzeScreenPixelPatterns(base64Data);
    if (pixelScore > 0.6) {
      screenshotScore += 20;
      reasons.push("Screen pixel patterns");
      console.log(`[SCREENSHOT] ✅ Screen pixel patterns: ${pixelScore.toFixed(3)} (+20 points)`);
    } else {
      console.log(`[SCREENSHOT] ❌ No screen pixel patterns: ${pixelScore.toFixed(3)} (+0 points)`);
    }
    
    // 6. Sharp text rendering (NEW - 15 points)
    const textScore = await analyzeSharpText(base64Data);
    if (textScore > 0.8) {
      screenshotScore += 15;
      reasons.push("Sharp text rendering");
      console.log(`[SCREENSHOT] ✅ Sharp text: ${textScore.toFixed(3)} (+15 points)`);
    } else {
      console.log(`[SCREENSHOT] ❌ No sharp text: ${textScore.toFixed(3)} (+0 points)`);
    }
    
    // 7. OS capture artifacts (NEW - 10 points)
    const osScore = await analyzeOSArtifacts(base64Data);
    if (osScore > 0.5) {
      screenshotScore += 10;
      reasons.push("OS capture artifacts");
      console.log(`[SCREENSHOT] ✅ OS artifacts: ${osScore.toFixed(3)} (+10 points)`);
    } else {
      console.log(`[SCREENSHOT] ❌ No OS artifacts: ${osScore.toFixed(3)} (+0 points)`);
    }
    
    console.log("[SCREENSHOT] ===========================================");
    console.log("[SCREENSHOT] SCREENSHOT DETECTION - FINAL RESULTS");
    console.log("[SCREENSHOT] ===========================================");
    
  } catch (error) {
    console.warn("[SCREENSHOT] ⚠️ Screenshot detection failed:", error);
    reasons.push("Screenshot detection failed");
  }
  
  screenshotScore = Math.min(screenshotScore, 100);
  detected = screenshotScore >= 70;  // Higher threshold for screenshot detection
  
  console.log(`[SCREENSHOT] Final Screenshot Score: ${screenshotScore}/100`);
  console.log(`[SCREENSHOT] Screenshot Score vs Threshold: ${screenshotScore} >= 70 = ${detected ? 'PASS' : 'FAIL'}`);
  console.log(`[SCREENSHOT] FINAL DECISION - ${detected ? 'DETECTED' : 'NOT DETECTED'} - Confidence: ${screenshotScore}%`);
  console.log("[SCREENSHOT] Detection reasons:", reasons);
  
  return {
    detected,
    confidence: screenshotScore,
    reasons
  };
}

/**
 * EDITED/MANIPULATED DETECTION - NEW
 */
export async function detectEditedManipulated(
  base64Data: string,
  metadata: ImageMetadata
): Promise<EditedManipulatedDetection> {
  console.log("[EDITED] Starting edited/manipulated detection analysis...");
  
  const reasons: string[] = [];
  let editedScore = 0;
  let detected = false;
  let manipulationType: EditedManipulatedDetection['manipulationType'] = 'unknown';
  
  try {
    console.log("[EDITED] ===========================================");
    console.log("[EDITED] EDITED DETECTION - INDIVIDUAL SCORES");
    console.log("[EDITED] ===========================================");
    
    // 1. Inconsistent lighting (25 points)
    const lightingScore = await analyzeLightingInconsistency(base64Data);
    if (lightingScore > 0.7) {
      editedScore += 25;
      reasons.push("Inconsistent lighting detected");
      console.log(`[EDITED] ✅ Inconsistent lighting: ${lightingScore.toFixed(3)} (+25 points)`);
    } else {
      console.log(`[EDITED] ❌ Consistent lighting: ${lightingScore.toFixed(3)} (+0 points)`);
    }
    
    // 2. Cloning/repetition artifacts (20 points)
    const cloningScore = await analyzeCloningArtifacts(base64Data);
    if (cloningScore > 0.6) {
      editedScore += 20;
      reasons.push("Cloning or repetition artifacts");
      console.log(`[EDITED] ✅ Cloning artifacts: ${cloningScore.toFixed(3)} (+20 points)`);
    } else {
      console.log(`[EDITED] ❌ No cloning artifacts: ${cloningScore.toFixed(3)} (+0 points)`);
    }
    
    // 3. Filter traces (20 points)
    const filterScore = await analyzeFilterTraces(base64Data);
    if (filterScore > 0.8) {
      editedScore += 20;
      manipulationType = 'filtering';
      reasons.push("Heavy filter application detected");
      console.log(`[EDITED] ✅ Filter traces: ${filterScore.toFixed(3)} (+20 points)`);
    } else {
      console.log(`[EDITED] ❌ No filter traces: ${filterScore.toFixed(3)} (+0 points)`);
    }
    
    // 4. Cropping boundaries (15 points)
    const cropScore = await analyzeCroppingBoundaries(base64Data);
    if (cropScore > 0.5) {
      editedScore += 15;
      if (!manipulationType || manipulationType === 'unknown') manipulationType = 'cropping';
      reasons.push("Cropping boundaries detected");
      console.log(`[EDITED] ✅ Cropping boundaries: ${cropScore.toFixed(3)} (+15 points)`);
    } else {
      console.log(`[EDITED] ❌ No cropping boundaries: ${cropScore.toFixed(3)} (+0 points)`);
    }
    
    // 5. Compositing edges (15 points)
    const compositeScore = await analyzeCompositingEdges(base64Data);
    if (compositeScore > 0.6) {
      editedScore += 15;
      manipulationType = 'compositing';
      reasons.push("Compositing edge artifacts");
      console.log(`[EDITED] ✅ Compositing edges: ${compositeScore.toFixed(3)} (+15 points)`);
    } else {
      console.log(`[EDITED] ❌ No compositing edges: ${compositeScore.toFixed(3)} (+0 points)`);
    }
    
    // 6. Enhanced noise patterns (5 points)
    const noiseScore = await analyzeEnhancedNoise(base64Data);
    if (noiseScore > 0.9) {
      editedScore += 5;
      manipulationType = 'enhancement';
      reasons.push("Enhanced noise patterns");
      console.log(`[EDITED] ✅ Enhanced noise: ${noiseScore.toFixed(3)} (+5 points)`);
    } else {
      console.log(`[EDITED] ❌ Natural noise: ${noiseScore.toFixed(3)} (+0 points)`);
    }
    
    console.log("[EDITED] ===========================================");
    console.log("[EDITED] EDITED DETECTION - FINAL RESULTS");
    console.log("[EDITED] ===========================================");
    
  } catch (error) {
    console.warn("[EDITED] ⚠️ Edited detection failed:", error);
    reasons.push("Edited detection failed");
  }
  
  editedScore = Math.min(editedScore, 100);
  detected = editedScore >= 50;  // Medium threshold for edited detection
  
  console.log(`[EDITED] Final Edited Score: ${editedScore}/100`);
  console.log(`[EDITED] Edited Score vs Threshold: ${editedScore} >= 50 = ${detected ? 'PASS' : 'FAIL'}`);
  console.log(`[EDITED] FINAL DECISION - ${detected ? 'DETECTED' : 'NOT DETECTED'} - Confidence: ${editedScore}%`);
  console.log(`[EDITED] Manipulation type: ${manipulationType}`);
  console.log("[EDITED] Detection reasons:", reasons);
  
  return {
    detected,
    confidence: editedScore,
    reasons,
    manipulationType
  };
}

/**
 * MAIN FORENSIC ANALYSIS FUNCTION - REDESIGNED
 * Priority order: Screenshot > AI Generated > Camera Captured > Edited/Manipulated > Unknown
 */
export async function performForensicAnalysis(
  base64Data: string,
  metadata: ImageMetadata
): Promise<ForensicAnalysisResult> {
  console.log("[FORENSIC] Starting complete forensic analysis...");
  console.log("[FORENSIC] ===========================================");
  console.log("[FORENSIC] FORENSIC ANALYSIS - INDIVIDUAL SCORES");
  console.log("[FORENSIC] ===========================================");
  
  // Run all detection analyses in parallel
  const [screenshotResult, aiResult, cameraResult, editedResult] = await Promise.all([
    detectScreenshot(base64Data, metadata),
    detectAIGenerated(base64Data, metadata),
    detectCameraOriginal(base64Data, metadata),
    detectEditedManipulated(base64Data, metadata)
  ]);
  
  console.log("[FORENSIC] ===========================================");
  console.log("[FORENSIC] FORENSIC ANALYSIS - RAW RESULTS");
  console.log("[FORENSIC] ===========================================");
  console.log(`[FORENSIC] Screenshot: ${screenshotResult.detected ? 'YES' : 'NO'} (${screenshotResult.confidence}% confidence)`);
  console.log(`[FORENSIC] AI Generated: ${aiResult.probability}% probability`);
  console.log(`[FORENSIC] Camera Original: ${cameraResult.detected ? 'YES' : 'NO'} (${cameraResult.confidence}% confidence)`);
  console.log(`[FORENSIC] Edited/Manipulated: ${editedResult.detected ? 'YES' : 'NO'} (${editedResult.confidence}% confidence)`);
  
  // ============================================================
  // BINARY CLASSIFICATION MODE — Camera vs AI only
  // ------------------------------------------------------------
  // Screenshot / Edited / Downloaded / WhatsApp detectors still
  // run above (for diagnostics and to keep their result fields
  // populated for any internal consumer), but they are NO LONGER
  // part of the final classification. The previous 5-way priority
  // cascade was causing legitimate camera images to be misclassified
  // as Screenshot whenever those detectors fired weakly.
  //
  // Final classification rule:
  //   * If AI signals are stronger AND clear the AI threshold -> 'ai'
  //   * If Camera signals are stronger AND clear the Camera threshold -> 'camera'
  //   * Otherwise -> 'unknown' (UI renders "Unable To Verify")
  // ============================================================

  let adjustedCameraScore = cameraResult.confidence;
  const aiScore = aiResult.probability;

  console.log("[FORENSIC] ===========================================");
  console.log("[FORENSIC] AI vs CAMERA SUPPRESSION (binary mode)");
  console.log("[FORENSIC] ===========================================");

  // AI suppression of camera score is still meaningful in binary mode:
  // AI-generated images can score high on naturalness, so when AI evidence
  // is strong we down-weight the camera signal to avoid AI->camera flips.
  if (aiScore >= 40) {
    adjustedCameraScore -= 35;
    console.log(`[FORENSIC] AI suppression: Camera score reduced by 35 (AI: ${aiScore} >= 40)`);
  }
  // Screenshot suppression removed — Screenshot no longer affects classification.

  // Ensure score doesn't go negative
  adjustedCameraScore = Math.max(0, adjustedCameraScore);

  console.log(`[FORENSIC] Final scores - AI: ${aiScore}, Camera: ${adjustedCameraScore}`);
  console.log(`[FORENSIC] (Internal-only, non-classifying: Screenshot: ${screenshotResult.confidence}, Edited: ${editedResult.confidence})`);

  // The imageType union still includes 'screenshot' and 'edited' so that
  // any internal code reading the type union continues to compile. The
  // binary classifier below will only ever produce 'camera' | 'ai' | 'unknown'.
  let imageType: 'camera' | 'ai' | 'screenshot' | 'edited' | 'unknown' = 'unknown';
  let confidence = 0;

  const AI_THRESHOLD = 40;
  const CAMERA_THRESHOLD = 50;

  console.log("[FORENSIC] ===========================================");
  console.log("[FORENSIC] BINARY CLASSIFICATION (Camera vs AI)");
  console.log("[FORENSIC] ===========================================");

  if (aiScore >= AI_THRESHOLD && aiScore >= adjustedCameraScore) {
    imageType = 'ai';
    confidence = aiScore;
    console.log(`[FORENSIC] Classified as AI Generated: ai=${aiScore} >= ${AI_THRESHOLD} and >= camera=${adjustedCameraScore}`);
  } else if (adjustedCameraScore >= CAMERA_THRESHOLD && adjustedCameraScore > aiScore) {
    imageType = 'camera';
    confidence = adjustedCameraScore;
    console.log(`[FORENSIC] Classified as Camera: camera=${adjustedCameraScore} >= ${CAMERA_THRESHOLD} and > ai=${aiScore}`);
  } else {
    // Neither side cleared its threshold strongly enough — fall back to
    // 'unknown'. UI surfaces this as "Unable To Verify".
    imageType = 'unknown';
    confidence = Math.max(aiScore, adjustedCameraScore);
    console.log(`[FORENSIC] Classified as Unknown: ai=${aiScore}, camera=${adjustedCameraScore} (neither threshold met)`);
  }
  
  // UI RESULT MAPPING
  const uiResult = {
    ai: {
      source: "AI Generated",
      camera: false,
      status: "Synthetic AI Generated Image"
    },
    camera: {
      source: "Camera Captured",
      camera: true,
      status: "Authentic Camera Capture"
    },
    screenshot: {
      source: "Screenshot",
      camera: false,
      status: "Screen Captured Content"
    },
    edited: {
      source: "Edited Image",
      camera: false,
      status: "Manipulated or Edited Image"
    },
    unknown: {
      source: "Unknown",
      camera: false,
      status: "Unable To Verify"
    }
  };
  
  console.log("[FORENSIC] ===========================================");
  console.log("[FORENSIC] FINAL CLASSIFICATION RESULTS");
  console.log("[FORENSIC] ===========================================");
  console.log(`[FORENSIC] Image Type: ${imageType}`);
  console.log(`[FORENSIC] Confidence: ${confidence}%`);
  console.log(`[FORENSIC] Security Status: ${uiResult[imageType].status}`);
  console.log(`[FORENSIC] Final scores - AI: ${aiScore}, Camera: ${adjustedCameraScore} (Screenshot/Edited shown for diagnostics only: ${screenshotResult.confidence}/${editedResult.confidence})`);

  const result = uiResult[imageType];

  return {
    imageType,
    confidence,
    aiProbability: aiScore,
    cameraProbability: adjustedCameraScore,
    // The fields below are populated for diagnostics / internal consumers but
    // do NOT influence final classification in binary mode.
    screenshotProbability: screenshotResult.confidence,
    editedProbability: editedResult.confidence,
    downloadedProbability: 0, // Not implemented yet (Phase 3)
    whatsappProbability: 0,   // Not implemented yet (Phase 3)
    securityStatus: result.status,
    imageSource: result.source,
    cameraCaptured: result.camera
  };
}

// ============================================
// HELPER ANALYSIS FUNCTIONS - ENHANCED
// ============================================

// AI Detection Helper Functions
//
// Phase 3 (AI-side): every analyzer below is now a real pixel-level
// forensic computation. Math.random() is fully eliminated from the
// active classification path (camera + AI). Each function uses
// loadImageDataFromBase64() defined further below (hoisted because
// it is an `async function` declaration).
//
// Techniques used here, mapped to your "advanced techniques allowed" list:
//   * FFT/DCT-like spectral analysis via high-pass vs low-pass energy ratio
//   * Block self-similarity (NCC) for diffusion / GAN repetition artifacts
//   * Sobel-gradient smoothness for over-smoothed diffusion output
//   * Horizontal-mirror symmetry for AI compositional bias
//   * Laplacian noise-distribution σ for missing sensor-noise floor
// Consumer thresholds inside detectAIGenerated() are intentionally untouched.

/**
 * Block self-similarity via mean-removed normalized cross-correlation
 * between deterministically-sampled 16x16 block pairs. Diffusion / GAN
 * outputs leak inter-patch correlation that natural photos do not.
 */
async function analyzeRepeatedPatterns(base64Data: string): Promise<number> {
  try {
    const img = await loadImageDataFromBase64(base64Data);
    if (!img) return 0;
    const { data, width, height } = img;
    if (width < 64 || height < 64) return 0;
    const lum = (i: number) => 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];

    const blockSize = 16;
    const numPairs = 60;
    let totalSim = 0;
    let count = 0;

    for (let p = 0; p < numPairs; p++) {
      // Deterministic pseudo-random sampling (reproducible across calls)
      const ax = (p * 137) % Math.max(1, width - blockSize);
      const ay = (p * 257) % Math.max(1, height - blockSize);
      const bx = (p * 419 + 31) % Math.max(1, width - blockSize);
      const by = (p * 521 + 71) % Math.max(1, height - blockSize);
      // Skip overlapping pairs
      if (Math.abs(ax - bx) < blockSize && Math.abs(ay - by) < blockSize) continue;

      const blockA: number[] = [];
      const blockB: number[] = [];
      let sumA = 0;
      let sumB = 0;
      for (let dy = 0; dy < blockSize; dy++) {
        for (let dx = 0; dx < blockSize; dx++) {
          const va = lum(((ay + dy) * width + (ax + dx)) * 4);
          const vb = lum(((by + dy) * width + (bx + dx)) * 4);
          blockA.push(va);
          blockB.push(vb);
          sumA += va;
          sumB += vb;
        }
      }
      const meanA = sumA / blockA.length;
      const meanB = sumB / blockB.length;

      let dot = 0;
      let sqA = 0;
      let sqB = 0;
      for (let i = 0; i < blockA.length; i++) {
        const a = blockA[i] - meanA;
        const b = blockB[i] - meanB;
        dot += a * b;
        sqA += a * a;
        sqB += b * b;
      }
      if (sqA < 1 || sqB < 1) continue; // flat blocks — uninformative
      totalSim += Math.abs(dot / Math.sqrt(sqA * sqB));
      count++;
    }

    if (count < 10) return 0;
    const meanSim = totalSim / count;
    // Natural photos: meanSim ~0.05-0.20. Diffusion / GAN: 0.30-0.55.
    // Subtract natural baseline; scale so >0.82 fires when meanSim ≈ 0.48+.
    return Math.min(0.9, Math.max(0, (meanSim - 0.15) * 2.5));
  } catch (error) {
    console.warn('[AI] Repeated-pattern analysis failed:', error);
    return 0;
  }
}

/**
 * Edge over-smoothness via Sobel-gradient mean magnitude on luminance.
 * Diffusion outputs (DALL·E, SD, Midjourney, Flux) commonly have
 * suppressed high-frequency edge energy.
 */
async function analyzeEdgeSmoothness(base64Data: string): Promise<number> {
  try {
    const img = await loadImageDataFromBase64(base64Data);
    if (!img) return 0;
    const { data, width, height } = img;
    const stepY = Math.max(1, Math.floor(height / 200));
    const stepX = Math.max(1, Math.floor(width / 200));
    const lum = (i: number) => 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];

    let sumMag = 0;
    let count = 0;
    for (let y = stepY; y < height - stepY; y += stepY) {
      for (let x = stepX; x < width - stepX; x += stepX) {
        const iC = (y * width + x) * 4;
        const iR = (y * width + (x + 1)) * 4;
        const iD = ((y + 1) * width + x) * 4;
        const gx = lum(iR) - lum(iC);
        const gy = lum(iD) - lum(iC);
        sumMag += Math.sqrt(gx * gx + gy * gy);
        count++;
      }
    }
    if (count < 100) return 0;
    const mean = sumMag / count;
    // Real photos: mean ~5-30. AI smooth: mean <3.
    // Calibrated so >0.92 (AI threshold) fires when mean < ~2.4.
    return Math.max(0, Math.min(0.95, 1 - mean / 30));
  } catch (error) {
    console.warn('[AI] Edge smoothness analysis failed:', error);
    return 0;
  }
}

/**
 * High-frequency-energy deficit (FFT-proxy via 3x3 high-pass residual
 * vs local-mean low-frequency channel). Natural images follow ≈1/f²
 * power-spectrum decay; diffusion strips high-frequency content.
 */
async function analyzeFrequencySpectrum(base64Data: string): Promise<number> {
  try {
    const img = await loadImageDataFromBase64(base64Data);
    if (!img) return 0;
    const { data, width, height } = img;
    const stepY = Math.max(1, Math.floor(height / 150));
    const stepX = Math.max(1, Math.floor(width / 150));
    const lum = (i: number) => 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];

    let hfSqSum = 0;
    let lfSqSum = 0;
    let count = 0;
    for (let y = 2; y < height - 2; y += stepY) {
      for (let x = 2; x < width - 2; x += stepX) {
        let avg = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            avg += lum(((y + dy) * width + (x + dx)) * 4);
          }
        }
        avg /= 9;
        const center = lum((y * width + x) * 4);
        const hf = center - avg; // high-pass residual
        hfSqSum += hf * hf;
        lfSqSum += avg * avg;
        count++;
      }
    }
    if (count === 0) return 0;
    const hfRMS = Math.sqrt(hfSqSum / count);
    const lfRMS = Math.sqrt(lfSqSum / count);
    const ratio = lfRMS > 1 ? hfRMS / lfRMS : 0;
    // Natural: ratio ~0.03-0.15.  AI smooth: ratio ~0.005-0.02.
    // Calibrated so >0.88 (AI threshold) fires when ratio < ~0.015.
    return Math.max(0, Math.min(0.95, 1 - ratio * 8));
  } catch (error) {
    console.warn('[AI] Frequency spectrum analysis failed:', error);
    return 0;
  }
}

/**
 * Horizontal mirror symmetry, normalized by the image's own pixel
 * deviation so it doesn't fire on low-contrast scenes. AI compositions
 * (centered subjects, generated faces, logos) skew abnormally symmetric.
 */
async function analyzeSymmetry(base64Data: string): Promise<number> {
  try {
    const img = await loadImageDataFromBase64(base64Data);
    if (!img) return 0;
    const { data, width, height } = img;
    if (width < 16) return 0;
    const lum = (i: number) => 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];

    const half = Math.floor(width / 2);
    const stepY = Math.max(1, Math.floor(height / 200));
    const stepX = Math.max(1, Math.floor(half / 100));

    let absDiffSum = 0;
    let deviationSum = 0;
    let count = 0;
    for (let y = 0; y < height; y += stepY) {
      for (let x = 0; x < half - 1; x += stepX) {
        const left = lum((y * width + x) * 4);
        const right = lum((y * width + (width - 1 - x)) * 4);
        absDiffSum += Math.abs(left - right);
        deviationSum += Math.abs(left - 128);
        count++;
      }
    }
    if (count === 0) return 0;
    const meanDiff = absDiffSum / count;
    const meanDev = deviationSum / count;
    if (meanDev < 1) return 0;
    const ratio = meanDiff / meanDev;
    // Conservative: only near-perfect symmetry produces a high score.
    // ratio 0   → 0.95  ratio 0.1 → 0.85  ratio 0.3 → 0.65  ratio 1 → 0
    return Math.max(0, Math.min(0.95, 1 - ratio));
  } catch (error) {
    console.warn('[AI] Symmetry analysis failed:', error);
    return 0;
  }
}

/**
 * Noise-distribution analyzer (consumer expects LOW score for synthetic
 * "no-noise" content; threshold inside detectAIGenerated is < 0.15).
 * Computes σ of a 5-tap Laplacian high-pass residual on luminance.
 * Real cameras carry sensor read-out noise; diffusion outputs do not.
 */
async function analyzeNoiseDistribution(base64Data: string): Promise<number> {
  try {
    const img = await loadImageDataFromBase64(base64Data);
    if (!img) return 0.5;
    const { data, width, height } = img;
    const stepY = Math.max(1, Math.floor(height / 200));
    const stepX = Math.max(1, Math.floor(width / 200));
    const lum = (i: number) => 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];

    const residuals: number[] = [];
    for (let y = 1; y < height - 1; y += stepY) {
      for (let x = 1; x < width - 1; x += stepX) {
        const iC = (y * width + x) * 4;
        const iL = (y * width + (x - 1)) * 4;
        const iR = (y * width + (x + 1)) * 4;
        const iU = ((y - 1) * width + x) * 4;
        const iD = ((y + 1) * width + x) * 4;
        residuals.push(Math.abs(4 * lum(iC) - lum(iL) - lum(iR) - lum(iU) - lum(iD)));
      }
    }
    if (residuals.length < 100) return 0.5;
    const mean = residuals.reduce((a, b) => a + b, 0) / residuals.length;
    const variance = residuals.reduce((s, v) => s + (v - mean) ** 2, 0) / residuals.length;
    const sigma = Math.sqrt(Math.max(0, variance));
    // Real camera sensor noise: sigma 10-40 -> score 0.20-0.80 (above 0.15)
    // AI synthetic: sigma <5 -> score <0.10 (below 0.15 → +15 AI bonus)
    return Math.min(1, sigma / 50);
  } catch (error) {
    console.warn('[AI] Noise distribution analysis failed:', error);
    return 0.5;
  }
}

// Camera Detection Helper Functions
//
// Phase 2 (camera-only): the four camera-side analyzers below have been
// replaced with real pixel-level forensic computations, adapted from the
// production-grade implementations already present in this codebase:
//   - frontend/src/forensic/detectors/cameraDetector.ts
//   - frontend/src/lib/forensicsUtils.ts
// Their function signatures, return ranges, and consumer thresholds inside
// detectCameraOriginal() are intentionally unchanged so this is a drop-in
// upgrade with no architectural side effects.

/**
 * Shared private helper — loads a base64/data-URL image into an ImageData
 * buffer for pixel-level analysis. Returns null in non-browser environments
 * (SSR/tests) so callers can safely return their conservative fallback.
 */
async function loadImageDataFromBase64(
  base64Data: string
): Promise<{ data: Uint8ClampedArray; width: number; height: number } | null> {
  if (typeof Image === 'undefined' || typeof document === 'undefined') {
    return null;
  }
  return new Promise((resolve) => {
    const img = new Image();
    const timeout = setTimeout(() => resolve(null), 5000);
    img.onload = () => {
      clearTimeout(timeout);
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        resolve({ data: imageData.data, width: canvas.width, height: canvas.height });
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => {
      clearTimeout(timeout);
      resolve(null);
    };
    img.src = base64Data.startsWith('data:') ? base64Data : `data:image/jpeg;base64,${base64Data}`;
  });
}

/**
 * Real sensor-noise estimator (replaces Math.random placeholder).
 * Computes the standard deviation of a 5-tap Laplacian high-pass on
 * luminance — a classic noise-floor metric that ignores scene contrast.
 * Returns a 0–2 normalized score; consumer threshold band is 0.45–1.8.
 */
async function analyzeSensorNoise(base64Data: string): Promise<number> {
  try {
    const img = await loadImageDataFromBase64(base64Data);
    if (!img) return 0;
    const { data, width, height } = img;
    const stepY = Math.max(1, Math.floor(height / 200));
    const stepX = Math.max(1, Math.floor(width / 200));
    const lum = (idx: number) =>
      0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];

    const laplacians: number[] = [];
    for (let y = stepY; y < height - stepY; y += stepY) {
      for (let x = stepX; x < width - stepX; x += stepX) {
        const iC = (y * width + x) * 4;
        const iL = (y * width + (x - 1)) * 4;
        const iR = (y * width + (x + 1)) * 4;
        const iU = ((y - 1) * width + x) * 4;
        const iD = ((y + 1) * width + x) * 4;
        const lap = Math.abs(4 * lum(iC) - lum(iL) - lum(iR) - lum(iU) - lum(iD));
        laplacians.push(lap);
      }
    }
    if (laplacians.length < 10) return 0;

    const mean = laplacians.reduce((a, b) => a + b, 0) / laplacians.length;
    const variance =
      laplacians.reduce((s, v) => s + (v - mean) ** 2, 0) / laplacians.length;
    const sigma = Math.sqrt(Math.max(0, variance));

    // Calibrated so that real camera shots (sigma 15–40) land in the
    // consumer's 0.45–1.8 "natural sensor noise" band, while AI-smoothed
    // images (sigma < 8) fall below 0.32 and lose the +25 camera bonus.
    return Math.min(2, sigma / 25);
  } catch (error) {
    console.warn('[Camera] sensor noise analysis failed:', error);
    return 0;
  }
}

/**
 * Real CFA-interpolation proxy (replaces Math.random placeholder).
 * Camera output is demosaiced from a Bayer color-filter array, which
 * imposes strong local horizontal-neighbour color correlation that
 * survives most legitimate workflows (camera->save, camera->WhatsApp,
 * camera->download). This implementation samples adjacent-pixel pairs
 * and returns the fraction whose mean per-channel difference is small.
 * Adapted from cameraDetector.ts analyzeCFAPattern().
 */
async function analyzeCFAInterpolation(base64Data: string): Promise<number> {
  try {
    const img = await loadImageDataFromBase64(base64Data);
    if (!img) return 0;
    const { data, width, height } = img;
    const stepY = Math.max(1, Math.floor(height / 100));
    const stepX = Math.max(1, Math.floor(width / 100));

    let smooth = 0;
    let count = 0;
    for (let y = stepY; y < height - stepY; y += stepY) {
      for (let x = stepX; x < width - stepX - 1; x += stepX) {
        const i0 = (y * width + x) * 4;
        const i1 = (y * width + x + 1) * 4;
        const dR = Math.abs(data[i0] - data[i1]);
        const dG = Math.abs(data[i0 + 1] - data[i1 + 1]);
        const dB = Math.abs(data[i0 + 2] - data[i1 + 2]);
        if ((dR + dG + dB) / 3 < 25) smooth++;
        count++;
      }
    }
    if (count === 0) return 0;
    // Camera images typically score 0.6–0.85 here, clearing the >0.6 bonus.
    return smooth / count;
  } catch (error) {
    console.warn('[Camera] CFA interpolation analysis failed:', error);
    return 0;
  }
}

/**
 * Real natural-JPEG detector (replaces Math.random placeholder).
 * JPEG compression divides the image into 8×8 blocks; boundary columns
 * (x % 8 === 0) accumulate higher inter-pixel differences than interior
 * columns. Cameras produce a moderate, even ratio (~1.4–2.0); over-
 * compressed re-uploads push the ratio past 2.5; non-JPEG content
 * (PNG, screenshots saved as PNG) yields ratio ≈ 1.0. Returns the
 * existing { isNatural, consistency } shape so the consumer rule
 * `isNatural && consistency > 0.7` stays valid unchanged.
 */
async function analyzeNaturalJPEG(
  base64Data: string
): Promise<{ isNatural: boolean; consistency: number }> {
  try {
    const img = await loadImageDataFromBase64(base64Data);
    if (!img) return { isNatural: false, consistency: 0 };
    const { data, width, height } = img;

    // Mean column-to-column luminance diff at every x position
    const colDiff = new Array<number>(width).fill(0);
    const sampleRows = Math.min(200, height);
    const stepY = Math.max(1, Math.floor(height / sampleRows));
    let rowCount = 0;

    for (let y = 0; y < height; y += stepY) {
      for (let x = 1; x < width; x++) {
        const i0 = (y * width + (x - 1)) * 4;
        const i1 = (y * width + x) * 4;
        const l0 =
          0.299 * data[i0] + 0.587 * data[i0 + 1] + 0.114 * data[i0 + 2];
        const l1 =
          0.299 * data[i1] + 0.587 * data[i1 + 1] + 0.114 * data[i1 + 2];
        colDiff[x] += Math.abs(l1 - l0);
      }
      rowCount++;
    }
    if (rowCount === 0) return { isNatural: false, consistency: 0 };
    for (let x = 0; x < width; x++) colDiff[x] /= rowCount;

    let boundarySum = 0;
    let boundaryCount = 0;
    let interiorSum = 0;
    let interiorCount = 0;
    for (let x = 8; x < width - 1; x++) {
      if (x % 8 === 0) {
        boundarySum += colDiff[x];
        boundaryCount++;
      } else {
        interiorSum += colDiff[x];
        interiorCount++;
      }
    }
    if (boundaryCount === 0 || interiorCount === 0) {
      return { isNatural: false, consistency: 0 };
    }
    const boundaryAvg = boundarySum / boundaryCount;
    const interiorAvg = interiorSum / interiorCount;
    const ratio = interiorAvg > 0 ? boundaryAvg / interiorAvg : 0;

    // ratio ≤ 1.05  → no JPEG periodicity (likely PNG or uncompressed source)
    // 1.1–2.5      → natural JPEG band
    // > 2.5        → over-compressed (still tagged JPEG-like, but isNatural=false)
    const isJpegLike = ratio > 1.1;
    const isNatural = isJpegLike && ratio < 2.5;
    // Mapped so natural camera JPEGs (ratio ~1.5) cleanly clear the
    // consumer's > 0.7 consistency threshold.
    const consistency = Math.min(1, Math.max(0, (ratio - 1.05) / 0.45));

    return { isNatural, consistency };
  } catch (error) {
    console.warn('[Camera] JPEG analysis failed:', error);
    return { isNatural: false, consistency: 0 };
  }
}

/**
 * Real chromatic-aberration detector. Lens physics causes R and B
 * channels to refract slightly differently from G at high-contrast
 * boundaries — a fringing artifact that real cameras exhibit and AI /
 * screenshots / pure-digital sources do not.
 *
 * Algorithm: at strong luminance edges, measure the per-channel gradient
 * divergence (how much R and B disagree with G's direction-of-change),
 * normalized by the local gradient magnitude. Average over edge pixels.
 */
async function analyzeChromaticAberration(base64Data: string): Promise<number> {
  try {
    const img = await loadImageDataFromBase64(base64Data);
    if (!img) return 0;
    const { data, width, height } = img;
    const stepY = Math.max(1, Math.floor(height / 200));
    const stepX = Math.max(1, Math.floor(width / 200));
    const lum = (i: number) => 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];

    let chromaSum = 0;
    let edgeCount = 0;
    for (let y = stepY; y < height - stepY; y += stepY) {
      for (let x = stepX; x < width - stepX; x += stepX) {
        const iC = (y * width + x) * 4;
        const iR = (y * width + (x + 1)) * 4;
        const iD = ((y + 1) * width + x) * 4;
        const gx = lum(iR) - lum(iC);
        const gy = lum(iD) - lum(iC);
        const gradMag = Math.sqrt(gx * gx + gy * gy);
        if (gradMag <= 20) continue; // only strong edges contribute

        // Per-channel gradient (sum of x- and y-direction differences)
        const rGrad = (data[iR] - data[iC]) + (data[iD] - data[iC]);
        const gGrad = (data[iR + 1] - data[iC + 1]) + (data[iD + 1] - data[iC + 1]);
        const bGrad = (data[iR + 2] - data[iC + 2]) + (data[iD + 2] - data[iC + 2]);

        // R and B divergence from G's direction-of-change (lens-CA fingerprint)
        const chromaDiverge = Math.abs(rGrad - gGrad) + Math.abs(bGrad - gGrad);
        chromaSum += chromaDiverge / (gradMag + 1);
        edgeCount++;
      }
    }
    if (edgeCount < 20) return 0;
    const meanChroma = chromaSum / edgeCount;
    // Calibrated: real camera CA typically yields mean 1.0-1.7 → score 0.3-0.5.
    // AI / pure-digital sources score < 0.2 (no physical lens involved).
    return Math.min(0.5, meanChroma * 0.3);
  } catch (error) {
    console.warn('[Camera] Chromatic aberration analysis failed:', error);
    return 0;
  }
}

/**
 * Real edge-uniformity score (replaces Math.random placeholder).
 * Camera content has varied edge magnitudes (high coefficient of variation);
 * AI-generated / over-smoothed content has uniform edges (low CV).
 *
 * Returns a 0–1 "uniformity" score where LOWER means more natural — matching
 * the existing consumer rule `edgeScore < 0.82 → camera bonus`, which we
 * leave untouched. Adapted from forensicsUtils.ts edgeCoherence and
 * cameraDetector.ts analyzeEdgeCharacteristics.
 */
async function analyzeEdgeRandomness(base64Data: string): Promise<number> {
  try {
    const img = await loadImageDataFromBase64(base64Data);
    if (!img) return 0.5;
    const { data, width, height } = img;
    const stepY = Math.max(1, Math.floor(height / 200));
    const stepX = Math.max(1, Math.floor(width / 200));
    const lum = (idx: number) =>
      0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];

    const magnitudes: number[] = [];
    for (let y = stepY; y < height - stepY; y += stepY) {
      for (let x = stepX; x < width - stepX; x += stepX) {
        const iC = (y * width + x) * 4;
        const iR = (y * width + (x + 1)) * 4;
        const iD = ((y + 1) * width + x) * 4;
        const gx = lum(iR) - lum(iC);
        const gy = lum(iD) - lum(iC);
        const m = Math.sqrt(gx * gx + gy * gy);
        if (m > 5) magnitudes.push(m); // ignore flat regions
      }
    }
    if (magnitudes.length < 10) return 0.5;

    const mean = magnitudes.reduce((a, b) => a + b, 0) / magnitudes.length;
    const variance =
      magnitudes.reduce((s, v) => s + (v - mean) ** 2, 0) / magnitudes.length;
    const cv = mean > 0 ? Math.sqrt(variance) / mean : 0;

    // CV ~ 0.6–1.2 for natural photos → uniformity 0.2–0.6 → comfortably
    // below 0.82 (camera bonus fires). CV < 0.2 for AI-smoothed → uniformity
    // > 0.86 → no camera bonus.
    return 1 - Math.min(1, cv / 1.5);
  } catch (error) {
    console.warn('[Camera] edge randomness analysis failed:', error);
    return 0.5;
  }
}

// Screenshot Detection Helper Functions
async function analyzeUIElements(base64Data: string): Promise<number> {
  try {
    // Simplified UI element detection
    return Math.random() * 0.8; // Placeholder implementation
  } catch (error) {
    console.warn("UI elements analysis failed:", error);
    return 0;
  }
}

async function analyzeScreenPixelPatterns(base64Data: string): Promise<number> {
  try {
    // Simplified screen pixel pattern analysis
    return Math.random() * 0.7; // Placeholder implementation
  } catch (error) {
    console.warn("Screen pixel patterns analysis failed:", error);
    return 0;
  }
}

async function analyzeSharpText(base64Data: string): Promise<number> {
  try {
    // Simplified sharp text analysis
    return Math.random() * 0.9; // Placeholder implementation
  } catch (error) {
    console.warn("Sharp text analysis failed:", error);
    return 0;
  }
}

async function analyzeOSArtifacts(base64Data: string): Promise<number> {
  try {
    // Simplified OS capture artifacts analysis
    return Math.random() * 0.6; // Placeholder implementation
  } catch (error) {
    console.warn("OS artifacts analysis failed:", error);
    return 0;
  }
}

// Edited/Manipulated Detection Helper Functions
async function analyzeLightingInconsistency(base64Data: string): Promise<number> {
  try {
    // Simplified lighting inconsistency analysis
    return Math.random() * 0.8; // Placeholder implementation
  } catch (error) {
    console.warn("Lighting inconsistency analysis failed:", error);
    return 0;
  }
}

async function analyzeCloningArtifacts(base64Data: string): Promise<number> {
  try {
    // Simplified cloning artifacts analysis
    return Math.random() * 0.7; // Placeholder implementation
  } catch (error) {
    console.warn("Cloning artifacts analysis failed:", error);
    return 0;
  }
}

async function analyzeFilterTraces(base64Data: string): Promise<number> {
  try {
    // Simplified filter traces analysis
    return Math.random() * 0.9; // Placeholder implementation
  } catch (error) {
    console.warn("Filter traces analysis failed:", error);
    return 0;
  }
}

async function analyzeCroppingBoundaries(base64Data: string): Promise<number> {
  try {
    // Simplified cropping boundaries analysis
    return Math.random() * 0.6; // Placeholder implementation
  } catch (error) {
    console.warn("Cropping boundaries analysis failed:", error);
    return 0;
  }
}

async function analyzeCompositingEdges(base64Data: string): Promise<number> {
  try {
    // Simplified compositing edges analysis
    return Math.random() * 0.7; // Placeholder implementation
  } catch (error) {
    console.warn("Compositing edges analysis failed:", error);
    return 0;
  }
}

async function analyzeEnhancedNoise(base64Data: string): Promise<number> {
  try {
    // Simplified enhanced noise analysis
    return Math.random() * 0.95; // Placeholder implementation
  } catch (error) {
    console.warn("Enhanced noise analysis failed:", error);
    return 0;
  }
}

// Legacy Helper Functions (kept for compatibility)
async function analyzeImageQuality(base64Data: string): Promise<{ perfection: number }> {
  return { perfection: Math.random() * 0.8 };
}

async function analyzeTextureSimplicity(base64Data: string): Promise<number> {
  return Math.random() * 0.6;
}

async function analyzeColorUniformity(base64Data: string): Promise<number> {
  return Math.random() * 0.5;
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

function isStandardAIDimension(width: number, height: number): boolean {
  return (width === 512 && height === 512) || 
         (width === 1024 && height === 1024) ||
         (width === 256 && height === 256);
}

function isCameraFilename(filename: string): boolean {
  const cameraPatterns = [
    /IMG_\d{4}/,      // iPhone: IMG_1234
    /DSC_\d{4}/,      // Sony: DSC_1234
    /P\d{5}/,         // Canon: P12345
    /_\d{4}\./,       // Generic: _1234.
    /\d{8}_\d{6}/     // Timestamp: 20231201_143022
  ];
  return cameraPatterns.some(pattern => pattern.test(filename));
}

function isScreenResolution(width: number, height: number): boolean {
  const screenResolutions = [
    [1920, 1080], [1366, 768], [1536, 864], [1440, 900],
    [1280, 720], [1600, 900], [2560, 1440], [3840, 2160],
    [1563, 1600], [1600, 1563] // Common mobile resolutions
  ];
  return screenResolutions.some(([w, h]) => (width === w && height === h) || (width === h && height === w));
}

function isScreenAspectRatio(width: number, height: number): boolean {
  const ratio = width / height;
  const commonRatios = [16/9, 16/10, 4/3, 3/2, 1.78, 1.6, 1.33, 1.5];
  return commonRatios.some(r => Math.abs(ratio - r) < 0.1);
}

console.log("✅ Redesigned Forensic Detection System Loaded");
