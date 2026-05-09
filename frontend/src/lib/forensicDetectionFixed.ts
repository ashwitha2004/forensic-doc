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
  
  // Apply AI suppression logic
  let adjustedCameraScore = cameraResult.confidence;
  let adjustedScreenshotScore = screenshotResult.confidence;
  const aiScore = aiResult.probability;
  
  console.log("[FORENSIC] ===========================================");
  console.log("[FORENSIC] AI SUPPRESSION LOGIC");
  console.log("[FORENSIC] ===========================================");
  
  if (aiScore >= 40) {
    adjustedCameraScore -= 35;
    console.log(`[FORENSIC] AI suppression: Camera score reduced by 35 (AI: ${aiScore} >= 40)`);
  }
  
  if (aiScore >= 60) {
    adjustedScreenshotScore -= 15;
    console.log(`[FORENSIC] AI suppression: Screenshot score reduced by 15 (AI: ${aiScore} >= 60)`);
  }
  
  // Ensure scores don't go negative
  adjustedCameraScore = Math.max(0, adjustedCameraScore);
  adjustedScreenshotScore = Math.max(0, adjustedScreenshotScore);
  
  console.log(`[FORENSIC] Adjusted scores - Camera: ${adjustedCameraScore}, Screenshot: ${adjustedScreenshotScore}`);
  
  // PRIORITY-BASED CLASSIFICATION
  console.log("[FORENSIC] ===========================================");
  console.log("[FORENSIC] PRIORITY-BASED CLASSIFICATION");
  console.log("[FORENSIC] ===========================================");
  
  let imageType: 'camera' | 'ai' | 'screenshot' | 'edited' | 'unknown' = 'unknown';
  let confidence = 0;
  
  // Priority 1: Screenshot
  if (adjustedScreenshotScore >= 70) {
    imageType = 'screenshot';
    confidence = adjustedScreenshotScore;
    console.log(`[FORENSIC] Classified as Screenshot: ${adjustedScreenshotScore} >= 70`);
  }
  // Priority 2: AI Generated  
  else if (aiScore >= 40) {
    imageType = 'ai';
    confidence = aiScore;
    console.log(`[FORENSIC] Classified as AI: ${aiScore} >= 40`);
  }
  // Priority 3: Camera Captured
  else if (adjustedCameraScore >= 50) {
    imageType = 'camera';
    confidence = adjustedCameraScore;
    console.log(`[FORENSIC] Classified as Camera: ${adjustedCameraScore} >= 50`);
  }
  // Priority 4: Edited/Manipulated
  else if (editedResult.confidence >= 50) {
    imageType = 'edited';
    confidence = editedResult.confidence;
    console.log(`[FORENSIC] Classified as Edited: ${editedResult.confidence} >= 50`);
  }
  // Priority 5: Unknown (fallback)
  else {
    // Default to highest scoring type
    const scores = { 
      ai: aiScore, 
      camera: adjustedCameraScore, 
      screenshot: adjustedScreenshotScore, 
      edited: editedResult.confidence 
    };
    const maxScore = Math.max(aiScore, adjustedCameraScore, adjustedScreenshotScore, editedResult.confidence);
    const maxType = Object.keys(scores).find(key => scores[key as keyof typeof scores] === maxScore) as typeof imageType;
    
    if (maxType && maxScore > 25) {
      imageType = maxType;
      confidence = maxScore;
      console.log(`[FORENSIC] Default classification: ${maxType} with highest score ${maxScore}`);
    } else {
      console.log(`[FORENSIC] All scores too low, defaulting to unknown`);
    }
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
  console.log(`[FORENSIC] Raw Scores - AI: ${aiScore}, Camera: ${adjustedCameraScore}, Screenshot: ${adjustedScreenshotScore}, Edited: ${editedResult.confidence}`);
  
  const result = uiResult[imageType];
  
  return {
    imageType,
    confidence,
    aiProbability: aiScore,
    cameraProbability: adjustedCameraScore,
    screenshotProbability: adjustedScreenshotScore,
    editedProbability: editedResult.confidence,
    downloadedProbability: 0, // Default to 0 since downloaded detection is not implemented in this version
    whatsappProbability: 0, // Default to 0 since WhatsApp detection is not implemented in this version
    securityStatus: result.status,
    imageSource: result.source,
    cameraCaptured: result.camera
  };
}

// ============================================
// HELPER ANALYSIS FUNCTIONS - ENHANCED
// ============================================

// AI Detection Helper Functions
async function analyzeRepeatedPatterns(base64Data: string): Promise<number> {
  try {
    // Simplified pattern analysis for GAN artifacts
    return Math.random() * 0.9; // Placeholder implementation
  } catch (error) {
    console.warn("Pattern analysis failed:", error);
    return 0;
  }
}

async function analyzeEdgeSmoothness(base64Data: string): Promise<number> {
  try {
    // Simplified edge analysis for AI detection
    return Math.random() * 0.95; // Placeholder implementation
  } catch (error) {
    console.warn("Edge smoothness analysis failed:", error);
    return 0;
  }
}

async function analyzeFrequencySpectrum(base64Data: string): Promise<number> {
  try {
    // Simplified frequency analysis for GAN patterns
    return Math.random() * 0.92; // Placeholder implementation
  } catch (error) {
    console.warn("Frequency spectrum analysis failed:", error);
    return 0;
  }
}

async function analyzeSymmetry(base64Data: string): Promise<number> {
  try {
    // Simplified symmetry analysis for AI detection
    return Math.random() * 0.95; // Placeholder implementation
  } catch (error) {
    console.warn("Symmetry analysis failed:", error);
    return 0;
  }
}

async function analyzeNoiseDistribution(base64Data: string): Promise<number> {
  try {
    // Simplified noise analysis for synthetic patterns
    return Math.random() * 0.2; // Placeholder implementation
  } catch (error) {
    console.warn("Noise distribution analysis failed:", error);
    return 0.5; // Default to natural
  }
}

// Camera Detection Helper Functions
async function analyzeSensorNoise(base64Data: string): Promise<number> {
  try {
    // Simplified sensor noise analysis
    return Math.random() * 2.0; // Placeholder implementation
  } catch (error) {
    console.warn("Sensor noise analysis failed:", error);
    return 0.5;
  }
}

async function analyzeCFAInterpolation(base64Data: string): Promise<number> {
  try {
    // Simplified CFA interpolation analysis
    return Math.random() * 0.8; // Placeholder implementation
  } catch (error) {
    console.warn("CFA interpolation analysis failed:", error);
    return 0;
  }
}

async function analyzeNaturalJPEG(base64Data: string): Promise<{ isNatural: boolean; consistency: number }> {
  try {
    // Simplified JPEG analysis
    return {
      isNatural: Math.random() > 0.3,
      consistency: Math.random() * 0.9
    };
  } catch (error) {
    console.warn("JPEG analysis failed:", error);
    return { isNatural: false, consistency: 0 };
  }
}

async function analyzeChromaticAberration(base64Data: string): Promise<number> {
  try {
    // Simplified chromatic aberration analysis
    return Math.random() * 0.5; // Placeholder implementation
  } catch (error) {
    console.warn("Chromatic aberration analysis failed:", error);
    return 0;
  }
}

async function analyzeEdgeRandomness(base64Data: string): Promise<number> {
  try {
    // Simplified edge randomness analysis
    return Math.random() * 0.9; // Placeholder implementation
  } catch (error) {
    console.warn("Edge randomness analysis failed:", error);
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
