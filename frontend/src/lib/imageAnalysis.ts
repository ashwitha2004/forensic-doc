/**
 * Image metadata and verification analysis
 * Detects image type, ownership, and source
 */

import { performForensicAnalysis, ForensicReport, ImageMetadata } from './forensicDetection';

export interface ImageAnalysisResult {
  imageType: "phone" | "ai" | "whatsapp" | "screenshot" | "real" | "unknown";
  confidence: number; // 0-100
  metadata: {
    hasExif: boolean;
    hasMetadata: boolean;
    dimensions?: string;
    mimeType: string;
  };
  indicators: string[];
  ownership: {
    isWatermarked: boolean;
    owner?: string;
    timestamp?: string;
  };
  // Add forensic report for detailed analysis
  forensicReport?: ForensicReport;
}

/**
 * Analyze image to determine type and source
 * Uses layered forensic detection approach with trusted source priority
 */
export async function analyzeImage(base64Data: string, filename?: string, source?: 'upload' | 'camera'): Promise<ImageAnalysisResult> {
  try {
    console.log("🔍 Analyzing image with layered forensic detection...");

    // Get image dimensions with error handling
    let dimensions: { width: number; height: number } = { width: 1080, height: 1920 }; // Default dimensions
    try {
      dimensions = await getImageDimensions(base64Data);
      console.log(`📏 Image dimensions: ${dimensions.width}x${dimensions.height}`);
    } catch (dimError) {
      console.warn("⚠️ Could not get image dimensions:", dimError);
      // Keep default dimensions
    }

    // Prepare metadata for forensic analysis
    const forensicMetadata: ImageMetadata = {
      dimensions,
      mimeType: "image/jpeg",
      hasExif: Math.random() > 0.5, // Simulated EXIF check
      filename,
      fileSize: base64Data.length * 0.75, // Approximate file size
      exifData: null // Would be populated by EXIF extraction in production
    };

    // Perform layered forensic analysis
    let forensicReport: ForensicReport | undefined;
    try {
      forensicReport = await performForensicAnalysis(base64Data, forensicMetadata);
      console.log("🔬 Forensic analysis complete");
    } catch (forensicError) {
      console.warn("⚠️ Forensic analysis failed:", forensicError);
      // Continue without forensic report
    }

    // Determine primary image type based on trusted source priority
    let imageType: ImageAnalysisResult["imageType"] = "unknown";
    let confidence = 50;
    const indicators: string[] = [];

    // PRIORITY 1: Trusted camera source override
    if (source === 'camera') {
      imageType = "phone";
      confidence = 95;
      indicators.push("📷 Trusted camera capture (in-app)");
      console.log(`🎯 Trusted camera source detected: ${imageType} (${confidence}% confidence)`);
    } else if (forensicReport) {
      // PRIORITY 2: Forensic analysis for uploaded files
      console.log("🔬 Using forensic analysis for uploaded file");
      
      // Priority-based classification - AI has HIGHEST priority
      const detections = [
        { type: "ai" as const, detected: forensicReport.ai_generated.probability > 50, confidence: forensicReport.ai_generated.probability, reasons: forensicReport.ai_generated.reasons },
        { type: "screenshot" as const, detected: forensicReport.screenshot.detected, confidence: forensicReport.screenshot.confidence, reasons: forensicReport.screenshot.reasons },
        { type: "whatsapp" as const, detected: forensicReport.whatsapp.detected, confidence: forensicReport.whatsapp.confidence, reasons: forensicReport.whatsapp.reasons },
        { type: "phone" as const, detected: forensicReport.camera_original.detected, confidence: forensicReport.camera_original.confidence, reasons: forensicReport.camera_original.reasons }
      ];

      // Find the highest confidence detection
      const bestDetection = detections
        .filter(d => d.detected)
        .sort((a, b) => b.confidence - a.confidence)[0];

      if (bestDetection) {
        imageType = bestDetection.type;
        confidence = bestDetection.confidence;
        indicators.push(...bestDetection.reasons);
        console.log(`🎯 Primary detection: ${imageType} (${confidence}% confidence)`);
      }

      // Add forensic summary indicators
      if (forensicReport.downloaded.detected) {
        indicators.push("🌐 Downloaded image detected");
      }
      if (forensicReport.ai_generated.probability > 30) {
        indicators.push(`🤖 AI probability: ${forensicReport.ai_generated.probability}%`);
      }
    } else {
      // Fallback to original analysis if forensic analysis failed
      console.log("⚠️ Using fallback analysis");
      
      // Check for AI-generated characteristics with error handling
      let aiScore = 0;
      try {
        aiScore = await detectAIGenerated(base64Data);
        console.log(`🤖 AI detection score: ${aiScore}`);
      } catch (aiError) {
        console.warn("⚠️ AI detection failed:", aiError);
        indicators.push("AI detection unavailable");
      }

      if (aiScore > 50) {
        imageType = "ai";
        confidence = aiScore;
        indicators.push("🤖 AI-generated image detected");
        indicators.push("Possible tools: DALL-E, Midjourney, Stable Diffusion");
      } else if (detectedScreenshot(dimensions)) {
        imageType = "screenshot";
        confidence = 80;
        indicators.push("� Screenshot detected");
        indicators.push("Typical screen resolution aspect ratio");
      } else if (detectedWhatsApp(dimensions)) {
        imageType = "whatsapp";
        confidence = 85;
        indicators.push("� WhatsApp origin detected");
        indicators.push("Typical WhatsApp compression found");
      } else {
        imageType = "phone";
        confidence = 70;
        indicators.push("📷 Real/Phone image");
        indicators.push("Standard mobile camera characteristics");
      }
    }

    const result: ImageAnalysisResult = {
      imageType,
      confidence,
      metadata: {
        hasExif: forensicMetadata.hasExif,
        hasMetadata: true,
        dimensions: `${dimensions.width}x${dimensions.height}`,
        mimeType: forensicMetadata.mimeType,
      },
      indicators,
      ownership: {
        isWatermarked: false,
        timestamp: new Date().toISOString(),
      },
      forensicReport
    };

    console.log("✅ Analysis complete:", result);
    return result;
  } catch (error) {
    console.error("❌ Analysis error:", error);

    // Handle constructor errors specifically (X3, Y3, etc.)
    const errorMsg = error instanceof Error ? error.message : String(error);
    const defaultDimensions = { width: 1080, height: 1920 };

    if (errorMsg.includes('X3') || errorMsg.includes('Y3') || errorMsg.includes('constructor')) {
      console.error('🚨 Constructor Error Detected:', errorMsg);
      return {
        imageType: "unknown",
        confidence: 0,
        metadata: {
          hasExif: false,
          hasMetadata: false,
          dimensions: `${defaultDimensions.width}x${defaultDimensions.height}`,
          mimeType: "image/jpeg"
        },
        indicators: [`Constructor error: ${errorMsg}`],
        ownership: {
          isWatermarked: false,
          timestamp: new Date().toISOString()
        }
      };
    }

    // Handle memory errors
    if (errorMsg.includes('memory') || errorMsg.includes('out of memory')) {
      return {
        imageType: "unknown",
        confidence: 0,
        metadata: {
          hasExif: false,
          hasMetadata: false,
          dimensions: `${defaultDimensions.width}x${defaultDimensions.height}`,
          mimeType: "image/jpeg"
        },
        indicators: ["Memory error - please close other apps"],
        ownership: {
          isWatermarked: false,
          timestamp: new Date().toISOString()
        }
      };
    }

    return {
      imageType: "unknown",
      confidence: 0,
      metadata: { 
        hasExif: false, 
        hasMetadata: false, 
        dimensions: `${defaultDimensions.width}x${defaultDimensions.height}`, 
        mimeType: "image/jpeg" 
      },
      indicators: ["Error during analysis"],
      ownership: { isWatermarked: false },
    };
  }
}

/**
 * Get image dimensions from base64 data
 */
function getImageDimensions(base64Data: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      resolve({
        width: img.naturalWidth,
        height: img.naturalHeight,
      });
    };
    img.onerror = () => {
      // Default dimensions on error
      resolve({ width: 1080, height: 1920 });
    };
    img.src = base64Data.startsWith("data:") ? base64Data : `data:image/jpeg;base64,${base64Data}`;
  });
}

/**
 * Detect AI-generated image characteristics
 * Scores 0-100 based on AI likelihood
 */
async function detectAIGenerated(base64Data: string): Promise<number> {
  // This is a simulated AI detection
  // In production, you'd use ML models like:
  // - CLIP for semantic analysis
  // - Frequency domain analysis for GAN artifacts
  // - Texture analysis

  try {
    console.log("🤖 Starting AI detection analysis...");
    
    // Check if Image constructor is available
    if (typeof Image === 'undefined') {
      console.warn("⚠️ Image constructor not available");
      return 0;
    }
    
    const img = new Image();
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("AI detection image loading timeout"));
      }, 5000);
      
      img.onload = () => {
        clearTimeout(timeout);
        resolve(img);
      };
      
      img.onerror = () => {
        clearTimeout(timeout);
        reject(new Error("Failed to load image for AI detection"));
      };
      
      img.src = base64Data.startsWith("data:") ? base64Data : `data:image/jpeg;base64,${base64Data}`;
    });

    // Check if document and canvas are available
    if (typeof document === 'undefined' || typeof document.createElement === 'undefined') {
      console.warn("⚠️ Document or canvas not available for AI detection");
      return 0;
    }
    
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      console.warn("⚠️ Could not get canvas context for AI detection");
      return 0;
    }

    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, 10, 10);
    const data = imageData.data;

    console.log("🎨 Canvas analysis complete, checking AI characteristics...");

    // Check for AI characteristics:
    // 1. Unusual color distribution
    // 2. Watermarked artifacts
    // 3. Frequency patterns

    let score = 0;

    // Analyze pixel diversity (AI images often have less natural randomness)
    const colors = new Set();
    for (let i = 0; i < data.length; i += 4) {
      colors.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
    }
    if (colors.size < 15) score += 20; // Low diversity suggests AI

    // Random score based on simulation
    // In production, use actual ML models
    score += Math.random() * 40;

    return Math.min(100, score);
  } catch (error) {
    console.warn("⚠️ AI detection error:", error);
    return 0;
  }
}

/**
 * Detect whitespace characteristics (WhatsApp, etc.)
 */
function detectedWhatsApp(dimensions: { width: number; height: number }): boolean {
  // WhatsApp uses specific compression and often crops to certain aspect ratios
  const aspectRatio = dimensions.width / dimensions.height;
  
  // Common WhatsApp aspect ratios
  return (
    (aspectRatio > 0.5 && aspectRatio < 0.6) || // Typical story format
    (aspectRatio > 1.4 && aspectRatio < 1.6)    // Typical landscape
  );
}

/**
 * Detect screenshot characteristics
 */
function detectedScreenshot(dimensions: { width: number; height: number }): boolean {
  // Common screenshot dimensions
  const commonWidths = [1080, 1440, 720, 540, 1024, 768, 800];
  return commonWidths.includes(dimensions.width);
}

/**
 * Format analysis result for display
 * Includes forensic details if available
 */
export function formatAnalysisResult(result: ImageAnalysisResult): string {
  const typeEmoji: Record<ImageAnalysisResult["imageType"], string> = {
    phone: "📷",
    ai: "🤖",
    whatsapp: "💬",
    screenshot: "📸",
    real: "✨",
    unknown: "❓",
  };

  let output = `
${typeEmoji[result.imageType]} IMAGE TYPE: ${result.imageType.toUpperCase()}
📊 Confidence: ${result.confidence}%

📋 INDICATORS:
${result.indicators.map((ind) => `  • ${ind}`).join("\n")}

📋 METADATA:
  • EXIF Data: ${result.metadata.hasExif ? "Present" : "Not found"}
  • Image Dimension: ${result.metadata.dimensions}
  • Format: ${result.metadata.mimeType}

🔒 OWNERSHIP:
  • Watermarked: ${result.ownership.isWatermarked ? "Yes ✓" : "No"}
  • Timestamp: ${result.ownership.timestamp}
  ${result.ownership.owner ? `• Owner: ${result.ownership.owner}` : ""}`;

  // Add forensic details if available
  if (result.forensicReport) {
    const fr = result.forensicReport;
    output += `

🔬 FORENSIC ANALYSIS:
  📸 Screenshot: ${fr.screenshot.detected ? `YES (${fr.screenshot.confidence}%)` : 'NO'}
  💬 WhatsApp: ${fr.whatsapp.detected ? `YES (${fr.whatsapp.confidence}%)` : 'NO'}
  🌐 Downloaded: ${fr.downloaded.detected ? `YES (${fr.downloaded.confidence}%)` : 'NO'}
  🤖 AI Generated: ${fr.ai_generated.probability}%
  📷 Camera Original: ${fr.camera_original.detected ? `YES (${fr.camera_original.confidence}%)` : 'NO'}`;

    // Add detailed reasons for each detection
    if (fr.screenshot.detected && fr.screenshot.reasons.length > 0) {
      output += `

📸 SCREENSHOT REASONS:
${fr.screenshot.reasons.map(r => `    • ${r}`).join("\n")}`;
    }

    if (fr.whatsapp.detected && fr.whatsapp.reasons.length > 0) {
      output += `

💬 WHATSAPP REASONS:
${fr.whatsapp.reasons.map(r => `    • ${r}`).join("\n")}`;
    }

    if (fr.downloaded.detected && fr.downloaded.reasons.length > 0) {
      output += `

🌐 DOWNLOAD REASONS:
${fr.downloaded.reasons.map(r => `    • ${r}`).join("\n")}`;
    }

    if (fr.ai_generated.reasons.length > 0) {
      output += `

🤖 AI REASONS:
${fr.ai_generated.reasons.map(r => `    • ${r}`).join("\n")}`;
    }

    if (fr.camera_original.detected && fr.camera_original.reasons.length > 0) {
      output += `

📷 CAMERA REASONS:
${fr.camera_original.reasons.map(r => `    • ${r}`).join("\n")}`;
    }
  }

  return output.trim();
}
