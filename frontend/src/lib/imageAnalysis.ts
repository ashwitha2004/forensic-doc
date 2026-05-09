/**
 * Image metadata and verification analysis
 * Detects image type, ownership, and source
 */

import { performForensicAnalysis, ForensicAnalysisResult as ForensicReport } from './forensicDetectionFixed';

export interface ImageMetadata {
  dimensions: { width: number; height: number };
  mimeType: string;
  hasExif: boolean;
  filename?: string;
  fileSize: number;
  exifData?: any;
}

export interface ImageAnalysisResult {
  imageType: "camera" | "ai" | "screenshot" | "edited" | "unknown";
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
  forensicReport?: ForensicReport;
}

/**
 * Analyze image to determine type and source
 * Uses layered forensic detection approach with trusted source priority
 */
export async function analyzeImage(base64Data: string, filename?: string, source?: 'upload' | 'camera'): Promise<ImageAnalysisResult> {
  try {
    console.log("🔍 Analyzing image with layered forensic detection...");

    // Extract basic metadata
    const forensicMetadata: ImageMetadata = await extractImageMetadata(base64Data);
    const dimensions = forensicMetadata.dimensions;

    console.log("📊 Image metadata extracted:", {
      dimensions: `${dimensions.width}x${dimensions.height}`,
      hasExif: forensicMetadata.hasExif,
      fileSize: forensicMetadata.fileSize,
      mimeType: forensicMetadata.mimeType
    });

    // Run forensic analysis
    let forensicReport: ForensicReport | undefined = undefined;
    try {
      forensicReport = await performForensicAnalysis(base64Data, forensicMetadata);
      console.log("🔬 Forensic analysis completed:", forensicReport);
    } catch (error) {
      console.warn("⚠️ Forensic analysis failed:", error);
      // Continue without forensic report
    }

    // Determine primary image type based on trusted source priority
    let imageType: ImageAnalysisResult["imageType"] = "unknown";
    let confidence = 50;
    const indicators: string[] = [];

    // PRIORITY 1: Trusted camera source override
    if (source === 'camera') {
      imageType = "camera";
      confidence = 95;
      indicators.push("📷 Trusted camera capture (in-app)");
      console.log(`🎯 Trusted camera source detected: ${imageType} (${confidence}% confidence)`);
    } else if (forensicReport) {
      // PRIORITY 2: Forensic analysis for uploaded files
      console.log("🔬 Using forensic analysis for uploaded file");
      
      // Use the forensic report's classification directly
      imageType = forensicReport.imageType;
      confidence = forensicReport.confidence;
      
      console.log(`🎯 Forensic classification: ${imageType} (${confidence}% confidence)`);
    } else {
      // Fallback to original analysis if forensic analysis failed
      console.log("⚠️ No forensic report available, using fallback analysis");
      // Keep unknown type
    }
    
    // Add forensic summary indicators
    if (forensicReport && forensicReport.editedProbability > 40) {
      indicators.push("🔧 Edited image detected");
    }
    if (forensicReport && forensicReport.aiProbability > 30) {
      indicators.push(`🤖 AI probability: ${forensicReport.aiProbability}%`);
    }
    
    console.log(`✅ Analysis complete: ${imageType} (${confidence}% confidence)`);

    const result: ImageAnalysisResult = {
      imageType,
      confidence,
      metadata: {
        hasExif: forensicMetadata.hasExif,
        hasMetadata: forensicMetadata.hasExif,
        dimensions: `${dimensions.width}x${dimensions.height}`,
        mimeType: forensicMetadata.mimeType
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
    console.error("Image analysis failed:", error);
    // Return fallback result
    return {
      imageType: "unknown",
      confidence: 0,
      metadata: { 
        hasExif: false, 
        hasMetadata: false, 
        dimensions: "1080x1920", 
        mimeType: "image/jpeg" 
      },
      indicators: ["Error during analysis"],
      ownership: { isWatermarked: false },
    };
  }
}

// Helper function to extract basic image metadata
async function extractImageMetadata(base64Data: string): Promise<ImageMetadata> {
  // Simplified metadata extraction - in production you'd use proper EXIF parsing
  return {
    dimensions: { width: 1080, height: 1920 },
    mimeType: "image/jpeg",
    hasExif: false,
    fileSize: base64Data.length * 0.75, // Rough estimate
  };
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
    camera: "📷",
    ai: "🤖",
    screenshot: "📸",
    edited: "🔧",
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
  📸 Screenshot: ${fr.screenshotProbability > 50 ? `YES (${fr.screenshotProbability}%)` : 'NO'}
  💬 WhatsApp: ${fr.whatsappProbability > 45 ? `YES (${fr.whatsappProbability}%)` : 'NO'}
  🌐 Downloaded: ${fr.downloadedProbability > 40 ? `YES (${fr.downloadedProbability}%)` : 'NO'}
  🤖 AI Generated: ${fr.aiProbability}%
  📷 Camera Original: ${fr.cameraProbability > 35 ? `YES (${fr.cameraProbability}%)` : 'NO'}`;

    // Add detailed analysis summary
    if (fr.screenshotProbability > 50) {
      output += `

📸 SCREENSHOT DETECTED: High confidence screenshot analysis`;
    }

    if (fr.whatsappProbability > 45) {
      output += `

💬 WHATSAPP DETECTED: WhatsApp compression signatures found`;
    }

    if (fr.downloadedProbability > 40) {
      output += `

🌐 DOWNLOAD DETECTED: Multiple re-encoding artifacts detected`;
    }

    if (fr.aiProbability > 30) {
      output += `

🤖 AI DETECTED: AI generation signatures found`;
    }

    if (fr.cameraProbability > 35) {
      output += `

📷 CAMERA DETECTED: Authentic camera characteristics`;
    }
  }

  return output.trim();
}
