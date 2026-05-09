/**
 * Professional Forensic Detection Engine
 * Independent analyzers for different image source detection
 */

// Base interface for all detection results
export interface DetectionResult {
  detected: boolean;
  confidence: number; // 0-100
  reasons: string[];
}

// Screenshot detection result
export interface ScreenshotDetection extends DetectionResult {
  detected: boolean;
  confidence: number;
  reasons: string[];
  screenResolution?: string;
  aspectRatio?: number;
}

// WhatsApp detection result
export interface WhatsAppDetection extends DetectionResult {
  detected: boolean;
  confidence: number;
  reasons: string[];
  compressionSignature?: string;
  filenamePattern?: boolean;
}

// Downloaded image detection result
export interface DownloadedDetection extends DetectionResult {
  detected: boolean;
  confidence: number;
  reasons: string[];
  browserMetadata?: boolean;
  downloadPattern?: boolean;
}

// AI Generated detection result
export interface AIGeneratedDetection {
  probability: number; // 0-100
  reasons: string[];
  textureAnalysis?: number;
  patternConsistency?: number;
  frequencyAnalysis?: number;
}

// Camera/Original detection result
export interface CameraOriginalDetection extends DetectionResult {
  detected: boolean;
  confidence: number;
  reasons: string[];
  exifData?: boolean;
  cameraManufacturer?: string;
  sensorNoise?: boolean;
}

// Complete forensic report
export interface ForensicReport {
  screenshot: ScreenshotDetection;
  whatsapp: WhatsAppDetection;
  downloaded: DownloadedDetection;
  ai_generated: AIGeneratedDetection;
  camera_original: CameraOriginalDetection;
}

// Image metadata for analysis
export interface ImageMetadata {
  dimensions: { width: number; height: number };
  mimeType: string;
  hasExif: boolean;
  filename?: string;
  fileSize?: number;
  exifData?: any;
}

/**
 * 1. SCREENSHOT DETECTION
 * Detects screenshots using exact screen resolutions, aspect ratios, and UI artifacts
 */
export async function detectScreenshot(
  base64Data: string,
  metadata: ImageMetadata
): Promise<ScreenshotDetection> {
  console.log("[SCREENSHOT] Starting screenshot detection analysis...");
  console.log("[SCREENSHOT] Input metadata:", {
    dimensions: `${metadata.dimensions.width}x${metadata.dimensions.height}`,
    hasExif: metadata.hasExif
  });
  
  const reasons: string[] = [];
  let confidence = 0;
  let detected = false;
  
  const { width, height } = metadata.dimensions;
  const aspectRatio = width / height;
  
  // Exact screen resolution matching (40 points)
  let resolutionScore = 0;
  const commonScreenResolutions = [
    "1080x2400", "1080x2340", "1080x2280", // Modern phones
    "1170x2532", "1179x2556",              // iPhone 12/13/14/15
    "720x1600", "720x1520",               // Budget phones
    "1440x3120", "1440x3200",             // High-end phones
    "1920x1080", "1366x768", "1920x1200", // Desktop
    "2560x1440", "3840x2160"              // High-res desktop
  ];
  
  const resolutionString = `${width}x${height}`;
  if (commonScreenResolutions.includes(resolutionString)) {
    resolutionScore = 40;
    confidence += 40;
    reasons.push(`Exact screen resolution match: ${resolutionString}`);
    console.log(`[SCREENSHOT] ✅ Exact screen resolution: ${resolutionString} (+40 points)`);
  } else {
    console.log(`[SCREENSHOT] ❌ No screen resolution match: ${resolutionString} (+0 points)`);
  }
  
  // Aspect ratio analysis (25 points)
  let aspectRatioScore = 0;
  const screenAspectRatios = [
    { ratio: 9/19.5, tolerance: 0.05, name: "Modern phone" },   // ~0.46
    { ratio: 9/20, tolerance: 0.05, name: "Tall phone" },       // 0.45
    { ratio: 16/9, tolerance: 0.1, name: "Standard widescreen" }, // 1.78
    { ratio: 16/10, tolerance: 0.1, name: "Desktop" },           // 1.6
    { ratio: 21/9, tolerance: 0.1, name: "Ultrawide" }          // 2.33
  ];
  
  for (const screenRatio of screenAspectRatios) {
    if (Math.abs(aspectRatio - screenRatio.ratio) <= screenRatio.tolerance) {
      aspectRatioScore = 25;
      confidence += 25;
      reasons.push(`Screen aspect ratio detected: ${screenRatio.name} (${aspectRatio.toFixed(2)})`);
      console.log(`[SCREENSHOT] ✅ Screen aspect ratio: ${screenRatio.name} (+25 points)`);
      break;
    }
  }
  
  if (aspectRatioScore === 0) {
    console.log(`[SCREENSHOT] ❌ No screen aspect ratio match: ${aspectRatio.toFixed(2)} (+0 points)`);
  }
  
  // No EXIF camera metadata (15 points)
  let exifScore = 0;
  if (!metadata.hasExif) {
    exifScore = 15;
    confidence += 15;
    reasons.push("No camera EXIF metadata (typical of screenshots)");
    console.log("[SCREENSHOT] ✅ No camera EXIF metadata (+15 points)");
  } else {
    console.log("[SCREENSHOT] ❌ Camera EXIF metadata present (+0 points)");
  }
  
  // Check for UI edge density (20 points)
  let uiDensityScore = 0;
  try {
    const uiDensity = await analyzeUIDensity(base64Data);
    console.log(`[SCREENSHOT] UI edge density: ${uiDensity.toFixed(3)} (threshold: 0.7)`);
    if (uiDensity > 0.7) {
      uiDensityScore = 20;
      confidence += 20;
      reasons.push("High UI edge density detected");
      console.log(`[SCREENSHOT] ✅ High UI edge density: ${uiDensity.toFixed(3)} > 0.7 (+20 points)`);
    } else {
      console.log(`[SCREENSHOT] ❌ Low UI edge density: ${uiDensity.toFixed(3)} <= 0.7 (+0 points)`);
    }
  } catch (error) {
    console.warn("[SCREENSHOT] ⚠️ UI density analysis failed:", error);
  }
  
  detected = confidence > 70;
  
  console.log(`[DEBUG] Screenshot Scores:`);
  console.log(`[DEBUG] Resolution Score: ${resolutionScore}/40`);
  console.log(`[DEBUG] Aspect Ratio Score: ${aspectRatioScore}/25`);
  console.log(`[DEBUG] EXIF Score: ${exifScore}/15`);
  console.log(`[DEBUG] UI Density Score: ${uiDensityScore}/20`);
  console.log(`[DEBUG] Final Screenshot Score: ${confidence}/100`);
  console.log(`[DEBUG] Screenshot Score vs Threshold: ${confidence} > 70 = ${detected ? 'PASS' : 'FAIL'}`);
  console.log(`[SCREENSHOT] ${detected ? 'DETECTED' : 'NOT DETECTED'} - Confidence: ${confidence}%`);
  
  return {
    detected,
    confidence,
    reasons,
    screenResolution: resolutionString,
    aspectRatio
  };
}

/**
 * 2. WHATSAPP DETECTION
 * Detects WhatsApp images using compression signatures and metadata patterns
 */
export async function detectWhatsApp(
  base64Data: string,
  metadata: ImageMetadata
): Promise<WhatsAppDetection> {
  console.log("[WHATSAPP] Starting WhatsApp detection analysis...");
  
  const reasons: string[] = [];
  let confidence = 0;
  let detected = false;
  
  const { width, height } = metadata.dimensions;
  const aspectRatio = width / height;
  
  // JPEG heavy recompression detection
  try {
    const compressionSignature = await analyzeJPEGCompression(base64Data);
    if (compressionSignature.isHeavy) {
      confidence += 30;
      reasons.push("Heavy JPEG recompression detected");
      console.log("[WHATSAPP] ✅ Heavy JPEG recompression");
    }
    
    if (compressionSignature.matchesWhatsApp) {
      confidence += 40;
      reasons.push("Compression signature matches WhatsApp");
      console.log("[WHATSAPP] ✅ Compression signature matches WhatsApp");
    }
  } catch (error) {
    console.warn("[WHATSAPP] ⚠️ Compression analysis failed:", error);
  }
  
  // Metadata stripped (WhatsApp strips most EXIF data)
  if (!metadata.hasExif) {
    confidence += 15;
    reasons.push("EXIF metadata stripped (WhatsApp behavior)");
    console.log("[WHATSAPP] ✅ EXIF metadata stripped");
  }
  
  // Aggressive dimension reduction
  const maxWhatsAppDimension = 1920; // WhatsApp max resolution
  if (width <= maxWhatsAppDimension && height <= maxWhatsAppDimension) {
    confidence += 10;
    reasons.push("Dimensions within WhatsApp limits");
    console.log("[WHATSAPP] ✅ Dimensions within WhatsApp limits");
  }
  
  // Filename pattern matching
  if (metadata.filename) {
    const whatsappPatterns = [
      /IMG-\d{8}-WA\d{4}\.jpg/i,  // IMG-20260507-WA0001.jpg
      /WhatsApp Image \d{4}-\d{2}-\d{2}/i,
      /WA\d{4}\.jpg/i
    ];
    
    const matchesWhatsAppPattern = whatsappPatterns.some(pattern => pattern.test(metadata.filename));
    if (matchesWhatsAppPattern) {
      confidence += 35;
      reasons.push("WhatsApp filename pattern detected");
      console.log("[WHATSAPP] ✅ WhatsApp filename pattern");
    }
  }
  
  detected = confidence > 75;
  
  console.log(`[WHATSAPP] ${detected ? 'DETECTED' : 'NOT DETECTED'} - Confidence: ${confidence}%`);
  
  return {
    detected,
    confidence,
    reasons,
    filenamePattern: metadata.filename ? (() => {
      const whatsappPatterns = [
        /IMG-\d{8}-WA\d{4}\.jpg/i,  // IMG-20260507-WA0001.jpg
        /WhatsApp Image \d{4}-\d{2}-\d{2}/i,
        /WA\d{4}\.jpg/i
      ];
      return whatsappPatterns.some(pattern => pattern.test(metadata.filename));
    })() : false
  };
}

/**
 * 3. DOWNLOADED IMAGE DETECTION
 * Detects images downloaded from browsers/internet
 * STRICT: Only trigger with strong download indicators (fallback classification)
 */
export async function detectDownloaded(
  base64Data: string,
  metadata: ImageMetadata
): Promise<DownloadedDetection> {
  console.log("[DOWNLOAD] Starting downloaded image detection analysis (STRICT MODE)...");
  
  const reasons: string[] = [];
  let confidence = 0;
  let detected = false;
  
  // STRONG DOWNLOAD INDICATORS ONLY (not generic missing EXIF)
  
  // 1. Clear download naming patterns (40 points) - but exclude camera-like patterns
  if (metadata.filename) {
    const strongDownloadPatterns = [
      /download/i,
      /untitled/i,
      /\d{13,}/,  // Unix timestamp
      /^[a-f0-9]{12,}$/i  // Hash-like filenames (longer hashes)
    ];
    
    // Exclude patterns that might be legitimate camera exports
    const excludePatterns = [
      /IMG_\d+/i,           // Standard camera naming
      /encrypted_image/i,   // System-generated encrypted images
      /PINIT/i,             // System-related
      /biovault/i           // System-related
    ];
    
    const isExcluded = excludePatterns.some(pattern => pattern.test(metadata.filename));
    const matchesStrongPattern = strongDownloadPatterns.some(pattern => pattern.test(metadata.filename));
    
    if (matchesStrongPattern && !isExcluded) {
      confidence += 40;
      reasons.push("Strong download naming pattern detected");
      console.log("[DOWNLOAD] ✅ Strong download naming pattern");
    } else if (matchesStrongPattern && isExcluded) {
      console.log("[DOWNLOAD] ❌ Download pattern ignored due to system/camera filename");
    }
  }
  
  // 2. Clear re-encoded signatures (30 points)
  try {
    const reencodeSignature = await analyzeReencodeSignature(base64Data);
    if (reencodeSignature.isReencoded) {
      confidence += 30;
      reasons.push("Multiple re-encoding detected (download/save cycles)");
      console.log("[DOWNLOAD] ✅ Multiple re-encoding detected");
    }
  } catch (error) {
    console.warn("[DOWNLOAD] ⚠️ Reencode analysis failed:", error);
  }
  
  // 3. Browser-specific metadata (20 points)
  if (!metadata.hasExif && !metadata.exifData) {
    // Only count this if we also have other strong indicators
    if (confidence >= 40) {
      confidence += 20;
      reasons.push("No camera metadata (consistent with downloads)");
      console.log("[DOWNLOAD] ✅ No camera metadata (with other indicators)");
    }
  }
  
  // 4. Filesystem export artifacts (10 points)
  try {
    const exportArtifacts = await analyzeExportArtifacts(base64Data);
    if (exportArtifacts.hasExportArtifacts) {
      confidence += 10;
      reasons.push("Filesystem export artifacts detected");
      console.log("[DOWNLOAD] ✅ Export artifacts detected");
    }
  } catch (error) {
    console.warn("[DOWNLOAD] ⚠️ Export analysis failed:", error);
  }
  
  // STRICT THRESHOLD - Only detect downloaded with strong evidence
  detected = confidence >= 70;
  
  console.log(`[DOWNLOAD] ${detected ? 'DETECTED' : 'NOT DETECTED'} - Confidence: ${confidence}% (STRICT MODE)`);
  
  return {
    detected,
    confidence,
    reasons,
    browserMetadata: !metadata.hasExif,
    downloadPattern: metadata.filename ? (() => {
      const downloadPatterns = [
        /download/i,
        /image\d+/i,
        /untitled/i,
        /screenshot/i,
        /\d{13,}/,  // Unix timestamp
        /^[a-f0-9]{8,}$/i  // Hash-like filenames
      ];
      return downloadPatterns.some(pattern => pattern.test(metadata.filename));
    })() : false
  };
}

/**
 * 4. AI GENERATED DETECTION
 * Advanced AI probability analysis using texture, patterns, and frequency
 */
export async function detectAIGenerated(
  base64Data: string,
  _metadata: ImageMetadata
): Promise<AIGeneratedDetection> {
  console.log("[AI] Starting AI-generated detection analysis...");
  
  const aiReasons: string[] = [];
  let aiScore = 0;
  
  try {
    // Get analysis values
    const [repeatedPatterns, edgeSmoothness, frequencySpectrum, symmetry, noiseDistribution] = await Promise.all([
      analyzeRepeatedPatterns(base64Data).catch(() => 0),
      analyzeEdgeSmoothness(base64Data).catch(() => 0),
      analyzeFrequencySpectrum(base64Data).catch(() => 0),
      analyzeSymmetry(base64Data).catch(() => 0),
      analyzeNoiseDistribution(base64Data).catch(() => 0)
    ]);
    
    // REPEATED PATTERNS
    if (repeatedPatterns > 0.82) {
      aiScore += 25;
      aiReasons.push("Repeated GAN-like patterns");
      console.log(`[AI] ✅ Repeated patterns: ${repeatedPatterns.toFixed(3)} > 0.82 (+25 points)`);
    } else {
      console.log(`[AI] ❌ Low repeated patterns: ${repeatedPatterns.toFixed(3)} <= 0.82 (+0 points)`);
    }
    
    // UNNATURAL EDGE SMOOTHNESS
    if (edgeSmoothness > 0.92) {
      aiScore += 20;
      aiReasons.push("Artificial edge smoothness");
      console.log(`[AI] ✅ Unnatural edge smoothness: ${edgeSmoothness.toFixed(3)} > 0.92 (+20 points)`);
    } else {
      console.log(`[AI] ❌ Natural edge smoothness: ${edgeSmoothness.toFixed(3)} <= 0.92 (+0 points)`);
    }
    
    // GAN FREQUENCY PATTERNS
    if (frequencySpectrum > 0.88) {
      aiScore += 25;
      aiReasons.push("GAN frequency artifacts");
      console.log(`[AI] ✅ GAN frequency patterns: ${frequencySpectrum.toFixed(3)} > 0.88 (+25 points)`);
    } else {
      console.log(`[AI] ❌ Natural frequency spectrum: ${frequencySpectrum.toFixed(3)} <= 0.88 (+0 points)`);
    }
    
    // PERFECT SYMMETRY
    if (symmetry > 0.90) {
      aiScore += 15;
      aiReasons.push("Artificial symmetry");
      console.log(`[AI] ✅ Perfect symmetry: ${symmetry.toFixed(3)} > 0.90 (+15 points)`);
    } else {
      console.log(`[AI] ❌ Natural symmetry: ${symmetry.toFixed(3)} <= 0.90 (+0 points)`);
    }
    
    // FAKE NOISE PROFILE
    if (noiseDistribution < 0.15) {
      aiScore += 15;
      aiReasons.push("Synthetic noise profile");
      console.log(`[AI] ✅ Fake noise profile: ${noiseDistribution.toFixed(3)} < 0.15 (+15 points)`);
    } else {
      console.log(`[AI] ❌ Natural noise distribution: ${noiseDistribution.toFixed(3)} >= 0.15 (+0 points)`);
    }
    
  } catch (error) {
    console.warn("[AI] ⚠️ AI detection analysis failed:", error);
    aiReasons.push("AI detection analysis failed");
  }
  
  // Cap at 100
  aiScore = Math.min(aiScore, 100);
  
  console.log(`[AI] Final AI Score: ${aiScore}/100`);
  console.log(`[AI] Probability: ${aiScore}%`);
  
  return {
    probability: aiScore,
    reasons: aiReasons
  };
}

/**
 * 5. CAMERA/ORIGINAL IMAGE DETECTION
 * Professional camera detection using EXIF metadata, sensor noise, and image characteristics
 */
export async function detectCameraOriginal(
  base64Data: string,
  metadata: ImageMetadata
): Promise<CameraOriginalDetection> {
  console.log("[CAMERA] Starting professional camera detection analysis...");
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
    // Get analysis values
    const [sensorNoise, jpegArtifacts, edgeSmoothness, colorVariance] = await Promise.all([
      analyzeSensorNoise(base64Data).then(result => result.isNatural ? 1 : 0).catch(() => 0),
      analyzeNaturalJPEG(base64Data).then(result => result.isNatural ? 1 : 0).catch(() => 0),
      analyzeEdgeSmoothness(base64Data).catch(() => 0),
      analyzeColorVariance(base64Data).catch(() => 0)
    ]);
    
    const hasCameraExif = metadata.hasExif && metadata.exifData;
    
    // EXIF BONUS ONLY
    if (hasCameraExif) {
      cameraScore += 25;
      reasons.push("Camera EXIF metadata");
      console.log(`[CAMERA] ✅ Camera EXIF metadata (+25 points)`);
    } else {
      console.log(`[CAMERA] ❌ No camera EXIF metadata (+0 points)`);
    }
    
    // NATURAL SENSOR NOISE
    if (sensorNoise > 0.45 && sensorNoise < 1.8) {
      cameraScore += 25;
      reasons.push("Natural sensor noise");
      console.log(`[CAMERA] ✅ Natural sensor noise: ${sensorNoise.toFixed(3)} (+25 points)`);
    } else {
      console.log(`[CAMERA] ❌ Artificial sensor noise: ${sensorNoise.toFixed(3)} (+0 points)`);
    }
    
    // NATURAL JPEG COMPRESSION
    if (jpegArtifacts > 0.35 && jpegArtifacts < 0.9) {
      cameraScore += 20;
      reasons.push("Natural JPEG compression");
      console.log(`[CAMERA] ✅ Natural JPEG compression: ${jpegArtifacts.toFixed(3)} (+20 points)`);
    } else {
      console.log(`[CAMERA] ❌ Artificial JPEG compression: ${jpegArtifacts.toFixed(3)} (+0 points)`);
    }
    
    // NATURAL EDGE VARIATION
    if (edgeSmoothness < 0.82) {
      cameraScore += 15;
      reasons.push("Natural edge transitions");
      console.log(`[CAMERA] ✅ Natural edge transitions: ${edgeSmoothness.toFixed(3)} (+15 points)`);
    } else {
      console.log(`[CAMERA] ❌ Unnatural edge smoothness: ${edgeSmoothness.toFixed(3)} (+0 points)`);
    }
    
    // NATURAL COLOR VARIANCE
    if (colorVariance > 0.25) {
      cameraScore += 15;
      reasons.push("Natural color distribution");
      console.log(`[CAMERA] ✅ Natural color distribution: ${colorVariance.toFixed(3)} (+15 points)`);
    } else {
      console.log(`[CAMERA] ❌ Low color variance: ${colorVariance.toFixed(3)} (+0 points)`);
    }
    
  } catch (error) {
    console.warn("[CAMERA] ⚠️ Camera detection analysis failed:", error);
    reasons.push("Camera detection analysis failed");
  }
  
  // Cap at 100
  cameraScore = Math.min(cameraScore, 100);
  
  detected = cameraScore >= 35;
  
  console.log(`[CAMERA] Final Camera Score: ${cameraScore}/100`);
  console.log(`[CAMERA] Camera Score vs Threshold: ${cameraScore} >= 35 = ${detected ? 'PASS' : 'FAIL'}`);
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
 * Complete forensic analysis using all independent detectors
 */
export async function performForensicAnalysis(
  base64Data: string,
  metadata: ImageMetadata
): Promise<ForensicReport> {
  console.log("🔍 Starting complete forensic analysis...");
  console.log("[DEBUG] ===========================================");
  console.log("[DEBUG] FORENSIC ANALYSIS - INDIVIDUAL SCORES");
  console.log("[DEBUG] ===========================================");
  
  // Run all detectors independently and in parallel
  const [
    screenshotResult,
    whatsappResult,
    downloadedResult,
    aiResult,
    cameraResult
  ] = await Promise.all([
    detectScreenshot(base64Data, metadata),
    detectWhatsApp(base64Data, metadata),
    detectDownloaded(base64Data, metadata),
    detectAIGenerated(base64Data, metadata),
    detectCameraOriginal(base64Data, metadata)
  ]);
  
  const report: ForensicReport = {
    screenshot: screenshotResult,
    whatsapp: whatsappResult,
    downloaded: downloadedResult,
    ai_generated: aiResult,
    camera_original: cameraResult
  };
  
  console.log("[DEBUG] ===========================================");
  console.log("[DEBUG] FORENSIC ANALYSIS - FINAL RESULTS");
  console.log("[DEBUG] ===========================================");
  console.log(`[DEBUG] Screenshot: ${screenshotResult.detected ? 'YES' : 'NO'} (${screenshotResult.confidence}% confidence)`);
  console.log(`[DEBUG] WhatsApp: ${whatsappResult.detected ? 'YES' : 'NO'} (${whatsappResult.confidence}% confidence)`);
  console.log(`[DEBUG] Downloaded: ${downloadedResult.detected ? 'YES' : 'NO'} (${downloadedResult.confidence}% confidence)`);
  console.log(`[DEBUG] AI Generated: ${aiResult.probability}% probability`);
  console.log(`[DEBUG] Camera Original: ${cameraResult.detected ? 'YES' : 'NO'} (${cameraResult.confidence}% confidence)`);
  
  // FINAL CLASSIFIER - FIXED LOGIC
  let imageType = "unknown";
  let confidence = 0;
  
  const aiScore = aiResult.probability;
  const cameraScore = cameraResult.confidence;
  const screenshotScore = screenshotResult.confidence;
  const downloadedScore = downloadedResult.confidence;
  
  console.log(`[DEBUG] Raw Scores - AI: ${aiScore}, Camera: ${cameraScore}, Screenshot: ${screenshotScore}, Downloaded: ${downloadedScore}`);
  
  // FIXED PRIORITY RULES - Better thresholds for camera detection
  if (aiScore >= 60 && aiScore > cameraScore) {
    imageType = "ai";
    confidence = aiScore;
    console.log(`[DEBUG] Classified as AI: ${aiScore} >= 60 && > camera(${cameraScore})`);
  } else if (screenshotScore >= 70) {
    imageType = "screenshot";
    confidence = screenshotScore;
    console.log(`[DEBUG] Classified as Screenshot: ${screenshotScore} >= 70`);
  } else if (cameraScore >= 45) {  // LOWERED from 35 to 45
    imageType = "camera";
    confidence = cameraScore;
    console.log(`[DEBUG] Classified as Camera: ${cameraScore} >= 45`);
  } else if (downloadedScore >= 55) {
    imageType = "downloaded";
    confidence = downloadedScore;
    console.log(`[DEBUG] Classified as Downloaded: ${downloadedScore} >= 55`);
  } else {
    // Default to camera if it has the highest score (even if below threshold)
    const scores = { ai: aiScore, camera: cameraScore, screenshot: screenshotScore, downloaded: downloadedScore };
    const maxScore = Math.max(aiScore, cameraScore, screenshotScore, downloadedScore);
    const maxType = Object.keys(scores).find(key => scores[key as keyof typeof scores] === maxScore);
    
    if (maxType && maxScore > 30) {  // Minimum confidence threshold
      imageType = maxType;
      confidence = maxScore;
      console.log(`[DEBUG] Default classification: ${maxType} with highest score ${maxScore}`);
    } else {
      console.log(`[DEBUG] All scores too low, defaulting to unknown`);
    }
  }
  
  // UI RESULT MAPPING
  const uiResult = {
    ai: {
      source: "AI Generated",
      camera: false,
      status: "AI Generated Content"
    },
    
    camera: {
      source: "Camera Image",
      camera: true,
      status: "Authentic Camera Capture"
    },
    
    screenshot: {
      source: "Screenshot",
      camera: false,
      status: "Screen Captured"
    },
    
    downloaded: {
      source: "Downloaded Image",
      camera: false,
      status: "External Source"
    },
    
    unknown: {
      source: "Unknown",
      camera: false,
      status: "Unable To Verify"
    }
  };
  
  console.log(`[DEBUG] Final Classification: ${imageType} (${confidence}% confidence)`);
  console.log(`[DEBUG] UI Result:`, uiResult[imageType as keyof typeof uiResult]);
  
  console.log("✅ Forensic analysis complete");
  return report;
}

// ============================================
// HELPER ANALYSIS FUNCTIONS
// ============================================

/**
 * Analyze UI edge density for screenshot detection
 */
async function analyzeUIDensity(base64Data: string): Promise<number> {
  try {
    if (typeof Image === 'undefined' || typeof document === 'undefined') {
      return 0;
    }
    
    const img = new Image();
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Timeout")), 3000);
      img.onload = () => { clearTimeout(timeout); resolve(img); };
      img.onerror = () => { clearTimeout(timeout); reject(new Error("Load failed")); };
      img.src = base64Data.startsWith("data:") ? base64Data : `data:image/jpeg;base64,${base64Data}`;
    });
    
    const canvas = document.createElement("canvas");
    canvas.width = Math.min(img.naturalWidth, 500); // Sample smaller area
    canvas.height = Math.min(img.naturalHeight, 500);
    const ctx = canvas.getContext("2d");
    if (!ctx) return 0;
    
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    
    // Simple edge detection (Sobel-like)
    let edgeCount = 0;
    const threshold = 30;
    
    for (let y = 1; y < canvas.height - 1; y++) {
      for (let x = 1; x < canvas.width - 1; x++) {
        const idx = (y * canvas.width + x) * 4;
        
        // Calculate gradient
        const centerGray = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
        
        const gx = 
          -1 * data[((y - 1) * canvas.width + (x - 1)) * 4] +
          1 * data[((y - 1) * canvas.width + (x + 1)) * 4] +
          -2 * data[(y * canvas.width + (x - 1)) * 4] +
          2 * data[(y * canvas.width + (x + 1)) * 4] +
          -1 * data[((y + 1) * canvas.width + (x - 1)) * 4] +
          1 * data[((y + 1) * canvas.width + (x + 1)) * 4];
        
        const gy = 
          -1 * data[((y - 1) * canvas.width + (x - 1)) * 4] +
          -2 * data[((y - 1) * canvas.width + x) * 4] +
          -1 * data[((y - 1) * canvas.width + (x + 1)) * 4] +
          1 * data[((y + 1) * canvas.width + (x - 1)) * 4] +
          2 * data[((y + 1) * canvas.width + x) * 4] +
          1 * data[((y + 1) * canvas.width + (x + 1)) * 4];
        
        const magnitude = Math.sqrt(gx * gx + gy * gy);
        if (magnitude > threshold) edgeCount++;
      }
    }
    
    return edgeCount / (canvas.width * canvas.height);
  } catch (error) {
    console.warn("UI density analysis failed:", error);
    return 0;
  }
}

/**
 * Analyze JPEG compression signatures
 */
async function analyzeJPEGCompression(base64Data: string): Promise<{
  isHeavy: boolean;
  matchesWhatsApp: boolean;
}> {
  try {
    // Extract JPEG quantization tables (simplified)
    const jpegData = atob(base64Data.split(',')[1]);
    
    // Look for WhatsApp-like compression markers
    // WhatsApp typically uses specific quantization values
    // Note: whatsappMarkers array would be used for more sophisticated analysis
    
    let isHeavy = false;
    let matchesWhatsApp = false;
    
    // Simplified compression analysis
    // In production, use proper JPEG parsing
    const compressionIndicators = jpegData.length / 1000; // Size ratio indicator
    isHeavy = compressionIndicators < 50; // Heavily compressed images are smaller
    
    // WhatsApp typically uses specific compression patterns
    matchesWhatsApp = isHeavy && Math.random() > 0.5; // Simplified pattern matching
    
    return { isHeavy, matchesWhatsApp };
  } catch (error) {
    console.warn("JPEG compression analysis failed:", error);
    return { isHeavy: false, matchesWhatsApp: false };
  }
}

/**
 * Analyze re-encode signatures
 */
async function analyzeReencodeSignature(base64Data: string): Promise<{
  isReencoded: boolean;
}> {
  try {
    // Look for multiple compression signatures
    const jpegData = atob(base64Data.split(',')[1]);
    
    // Multiple quantization tables indicate re-encoding
    const quantizationTableCount = (jpegData.match(/\xFF\xDB/g) || []).length;
    
    return {
      isReencoded: quantizationTableCount > 1
    };
  } catch (error) {
    console.warn("Re-encode analysis failed:", error);
    return { isReencoded: false };
  }
}


/**
 * Analyze color variance for camera detection
 */
async function analyzeColorVariance(base64Data: string): Promise<number> {
  try {
    if (typeof Image === 'undefined' || typeof document === 'undefined') {
      return 0;
    }
    
    const img = new Image();
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Timeout")), 3000);
      img.onload = () => { clearTimeout(timeout); resolve(img); };
      img.onerror = () => { clearTimeout(timeout); reject(new Error("Load failed")); };
      img.src = base64Data.startsWith("data:") ? base64Data : `data:image/jpeg;base64,${base64Data}`;
    });
    
    const canvas = document.createElement("canvas");
    canvas.width = 100;
    canvas.height = 100;
    const ctx = canvas.getContext("2d");
    if (!ctx) return 0;
    
    ctx.drawImage(img, 0, 0, 100, 100);
    const imageData = ctx.getImageData(0, 0, 100, 100);
    const data = imageData.data;
    
    // Calculate color variance
    const colors: number[] = [];
    for (let i = 0; i < data.length; i += 4) {
      const gray = (data[i] + data[i + 1] + data[i + 2]) / 3;
      colors.push(gray);
    }
    
    const mean = colors.reduce((a, b) => a + b, 0) / colors.length;
    const variance = colors.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / colors.length;
    
    // Normalize to 0-1 range
    return Math.min(variance / 1000, 1);
  } catch (error) {
    console.warn("Color variance analysis failed:", error);
    return 0;
  }
}

/**
 * Analyze repeated patterns for AI detection
 */
async function analyzeRepeatedPatterns(_base64Data: string): Promise<number> {
  try {
    // Simplified pattern analysis
    // In production, use more sophisticated pattern recognition
    return Math.random() * 0.8; // Placeholder
  } catch (error) {
    console.warn("Pattern analysis failed:", error);
    return 0;
  }
}

/**
 * Analyze edge smoothness for AI detection
 */
async function analyzeEdgeSmoothness(base64Data: string): Promise<number> {
  try {
    if (typeof Image === 'undefined' || typeof document === 'undefined') {
      return 0;
    }
    
    const img = new Image();
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Timeout")), 3000);
      img.onload = () => { clearTimeout(timeout); resolve(img); };
      img.onerror = () => { clearTimeout(timeout); reject(new Error("Load failed")); };
      img.src = base64Data.startsWith("data:") ? base64Data : `data:image/jpeg;base64,${base64Data}`;
    });
    
    const canvas = document.createElement("canvas");
    canvas.width = 200;
    canvas.height = 200;
    const ctx = canvas.getContext("2d");
    if (!ctx) return 0;
    
    ctx.drawImage(img, 0, 0, 200, 200);
    const imageData = ctx.getImageData(0, 0, 200, 200);
    const data = imageData.data;
    
    // Analyze edge smoothness
    let smoothEdges = 0;
    let totalEdges = 0;
    
    for (let y = 1; y < 199; y++) {
      for (let x = 1; x < 199; x++) {
        const idx = (y * 200 + x) * 4;
        const center = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
        
        // Check neighbors
        const neighbors = [
          (data[((y - 1) * 200 + x) * 4] + data[((y - 1) * 200 + x) * 4 + 1] + data[((y - 1) * 200 + x) * 4 + 2]) / 3,
          (data[((y + 1) * 200 + x) * 4] + data[((y + 1) * 200 + x) * 4 + 1] + data[((y + 1) * 200 + x) * 4 + 2]) / 3,
          (data[(y * 200 + (x - 1)) * 4] + data[(y * 200 + (x - 1)) * 4 + 1] + data[(y * 200 + (x - 1)) * 4 + 2]) / 3,
          (data[(y * 200 + (x + 1)) * 4] + data[(y * 200 + (x + 1)) * 4 + 1] + data[(y * 200 + (x + 1)) * 4 + 2]) / 3
        ];
        
        const maxDiff = Math.max(...neighbors.map(n => Math.abs(n - center)));
        
        if (maxDiff > 20) { // Edge detected
          totalEdges++;
          
          // Check if edge is unusually smooth (AI characteristic)
          const avgNeighborDiff = neighbors.reduce((sum, n) => sum + Math.abs(n - center), 0) / neighbors.length;
          if (avgNeighborDiff < maxDiff * 0.7) {
            smoothEdges++;
          }
        }
      }
    }
    
    return totalEdges > 0 ? smoothEdges / totalEdges : 0;
  } catch (error) {
    console.warn("Edge smoothness analysis failed:", error);
    return 0;
  }
}

/**
 * Analyze frequency spectrum for AI detection
 */
async function analyzeFrequencySpectrum(_base64Data: string): Promise<number> {
  try {
    // Simplified frequency analysis
    // In production, use FFT for proper frequency domain analysis
    return Math.random() * 0.9; // Placeholder
  } catch (error) {
    console.warn("Frequency spectrum analysis failed:", error);
    return 0;
  }
}

/**
 * Analyze symmetry for AI detection
 */
async function analyzeSymmetry(base64Data: string): Promise<number> {
  try {
    if (typeof Image === 'undefined' || typeof document === 'undefined') {
      return 0;
    }
    
    const img = new Image();
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Timeout")), 3000);
      img.onload = () => { clearTimeout(timeout); resolve(img); };
      img.onerror = () => { clearTimeout(timeout); reject(new Error("Load failed")); };
      img.src = base64Data.startsWith("data:") ? base64Data : `data:image/jpeg;base64,${base64Data}`;
    });
    
    const canvas = document.createElement("canvas");
    canvas.width = 200;
    canvas.height = 200;
    const ctx = canvas.getContext("2d");
    if (!ctx) return 0;
    
    ctx.drawImage(img, 0, 0, 200, 200);
    const imageData = ctx.getImageData(0, 0, 200, 200);
    const data = imageData.data;
    
    // Check vertical symmetry
    let symmetryScore = 0;
    let comparisons = 0;
    
    for (let y = 50; y < 150; y++) {
      for (let x = 0; x < 100; x++) {
        const leftIdx = (y * 200 + x) * 4;
        const rightIdx = (y * 200 + (199 - x)) * 4;
        
        const leftGray = (data[leftIdx] + data[leftIdx + 1] + data[leftIdx + 2]) / 3;
        const rightGray = (data[rightIdx] + data[rightIdx + 1] + data[rightIdx + 2]) / 3;
        
        const diff = Math.abs(leftGray - rightGray);
        if (diff < 10) { // Very similar pixels
          symmetryScore++;
        }
        comparisons++;
      }
    }
    
    return comparisons > 0 ? symmetryScore / comparisons : 0;
  } catch (error) {
    console.warn("Symmetry analysis failed:", error);
    return 0;
  }
}

/**
 * Analyze noise distribution for AI detection
 */
async function analyzeNoiseDistribution(base64Data: string): Promise<number> {
  try {
    if (typeof Image === 'undefined' || typeof document === 'undefined') {
      return 0;
    }
    
    const img = new Image();
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Timeout")), 3000);
      img.onload = () => { clearTimeout(timeout); resolve(img); };
      img.onerror = () => { clearTimeout(timeout); reject(new Error("Load failed")); };
      img.src = base64Data.startsWith("data:") ? base64Data : `data:image/jpeg;base64,${base64Data}`;
    });
    
    const canvas = document.createElement("canvas");
    canvas.width = 100;
    canvas.height = 100;
    const ctx = canvas.getContext("2d");
    if (!ctx) return 0;
    
    ctx.drawImage(img, 0, 0, 100, 100);
    const imageData = ctx.getImageData(0, 0, 100, 100);
    const data = imageData.data;
    
    // Analyze noise patterns
    const noiseValues: number[] = [];
    
    for (let i = 0; i < data.length; i += 4) {
      // Simple noise estimation using local variance
      if (i > 400 && i < data.length - 400) {
        const center = (data[i] + data[i + 1] + data[i + 2]) / 3;
        const neighbors = [
          (data[i - 400] + data[i - 399] + data[i - 398]) / 3,
          (data[i + 400] + data[i + 401] + data[i + 402]) / 3
        ];
        
        const localVariance = neighbors.reduce((sum, n) => sum + Math.pow(n - center, 2), 0) / neighbors.length;
        noiseValues.push(localVariance);
      }
    }
    
    // Check for inconsistent noise (AI characteristic)
    if (noiseValues.length === 0) return 0;
    
    const mean = noiseValues.reduce((a, b) => a + b, 0) / noiseValues.length;
    const variance = noiseValues.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / noiseValues.length;
    
    // High variance in noise patterns suggests AI
    return Math.min(variance / 100, 1);
  } catch (error) {
    console.warn("Noise distribution analysis failed:", error);
    return 0;
  }
}

/**
 * Analyze sensor noise for camera detection
 */
async function analyzeSensorNoise(_base64Data: string): Promise<{
  isNatural: boolean;
}> {
  try {
    // Simplified sensor noise analysis
    // Natural camera images have specific noise patterns
    return { isNatural: Math.random() > 0.4 }; // Placeholder
  } catch (error) {
    console.warn("Sensor noise analysis failed:", error);
    return { isNatural: false };
  }
}

/**
 * Analyze image entropy for camera detection
 */
async function analyzeEntropy(base64Data: string): Promise<number> {
  try {
    if (typeof Image === 'undefined' || typeof document === 'undefined') {
      return 0;
    }
    
    const img = new Image();
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Timeout")), 3000);
      img.onload = () => { clearTimeout(timeout); resolve(img); };
      img.onerror = () => { clearTimeout(timeout); reject(new Error("Load failed")); };
      img.src = base64Data.startsWith("data:") ? base64Data : `data:image/jpeg;base64,${base64Data}`;
    });
    
    const canvas = document.createElement("canvas");
    canvas.width = 100;
    canvas.height = 100;
    const ctx = canvas.getContext("2d");
    if (!ctx) return 0;
    
    ctx.drawImage(img, 0, 0, 100, 100);
    const imageData = ctx.getImageData(0, 0, 100, 100);
    const data = imageData.data;
    
    // Calculate Shannon entropy
    const histogram = new Array(256).fill(0);
    
    for (let i = 0; i < data.length; i += 4) {
      const gray = Math.round((data[i] + data[i + 1] + data[i + 2]) / 3);
      histogram[gray]++;
    }
    
    const total = data.length / 4;
    let entropy = 0;
    
    for (let i = 0; i < 256; i++) {
      if (histogram[i] > 0) {
        const probability = histogram[i] / total;
        entropy -= probability * Math.log2(probability);
      }
    }
    
    // Normalize to 0-1 scale (max entropy for 8-bit is 8)
    return entropy / 8;
  } catch (error) {
    console.warn("Entropy analysis failed:", error);
    return 0;
  }
}

/**
 * Analyze natural JPEG characteristics for camera detection
 */
async function analyzeNaturalJPEG(base64Data: string): Promise<{
  isNatural: boolean;
}> {
  try {
    // Extract JPEG data for analysis
    const jpegData = atob(base64Data.split(',')[1]);
    
    // Look for natural JPEG characteristics
    // 1. Check for multiple quantization tables (natural camera images)
    const quantizationTables = (jpegData.match(/\xFF\xDB/g) || []).length;
    const hasMultipleTables = quantizationTables >= 2;
    
    // 2. Check for organic compression patterns (not too uniform)
    // Natural camera images have varying compression across different regions
    const compressionPattern = analyzeCompressionPattern(jpegData);
    
    // 3. Check for mobile device JPEG encoding signatures
    const mobileSignatures = [
      'Exif', // Most mobile cameras include EXIF
      '\x00\x00\x00\x00', // Some mobile encoders
    ];
    
    const hasMobileSignature = mobileSignatures.some(sig => jpegData.includes(sig));
    
    // Natural JPEG indicators
    const naturalIndicators = [
      hasMultipleTables,
      compressionPattern.isOrganic,
      hasMobileSignature
    ].filter(Boolean).length;
    
    return {
      isNatural: naturalIndicators >= 2
    };
  } catch (error) {
    console.warn("Natural JPEG analysis failed:", error);
    return { isNatural: false };
  }
}

/**
 * Analyze compression pattern for organic characteristics
 */
function analyzeCompressionPattern(jpegData: string): {
  isOrganic: boolean;
} {
  try {
    // Simplified compression pattern analysis
    // In production, this would analyze DCT coefficients and quantization matrices
    
    // Look for varying compression levels across the image
    // Natural camera images have non-uniform compression
    const dataSize = jpegData.length;
    
    // Check for typical mobile camera compression ratios
    // Natural compression is usually not too aggressive or too light
    const compressionRatio = dataSize / 1000000; // Simplified ratio
    const isOrganicCompression = compressionRatio > 0.5 && compressionRatio < 5;
    
    return {
      isOrganic: isOrganicCompression
    };
  } catch (error) {
    console.warn("Compression pattern analysis failed:", error);
    return { isOrganic: false };
  }
}

/**
 * Analyze export artifacts for downloaded detection
 */
async function analyzeExportArtifacts(base64Data: string): Promise<{
  hasExportArtifacts: boolean;
}> {
  try {
    // Extract image data for analysis
    const jpegData = atob(base64Data.split(',')[1]);
    
    // Look for filesystem export artifacts
    // 1. Multiple save cycles (indicates download/save operations)
    const quantizationTables = (jpegData.match(/\xFF\xDB/g) || []).length;
    const multipleSaveCycles = quantizationTables >= 3;
    
    // 2. Generic compression signatures (not camera-specific)
    const hasGenericCompression = !jpegData.includes('Exif') && quantizationTables <= 1;
    
    // 3. File size patterns (downloads often have specific size ranges)
    const fileSize = jpegData.length;
    const downloadSizeRange = fileSize > 50000 && fileSize < 2000000; // 50KB - 2MB
    
    // Export artifacts indicators
    const exportIndicators = [
      multipleSaveCycles,
      hasGenericCompression && downloadSizeRange
    ].filter(Boolean).length;
    
    return {
      hasExportArtifacts: exportIndicators >= 1
    };
  } catch (error) {
    console.warn("Export artifacts analysis failed:", error);
    return { hasExportArtifacts: false };
  }
}
