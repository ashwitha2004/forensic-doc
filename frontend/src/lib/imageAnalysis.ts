/**
 * Image metadata and verification analysis
 * =========================================
 * v2: Backend DL model is now PRIMARY classifier (70% weight).
 * Frontend forensic heuristics are AUXILIARY (20% frequency + 10% metadata).
 *
 * Decision flow:
 *   1. Extract image metadata (EXIF, mime, dimensions, fileSize)
 *   2. Try backend /api/inference/detect-ai-base64  → DL result (3 branches)
 *   3. Run frontend heuristics (forensicDetectionFixed.ts)
 *   4. Fuse:  70% DL  +  20% heuristic-frequency  +  10% metadata
 *   5. If backend unavailable → fall back to heuristic-only fusion (existing behaviour)
 */

import {
  performForensicAnalysis,
  ForensicAnalysisResult as ForensicReport,
} from './forensicDetectionFixed';
import { runDLInference, type DLInferenceResponse } from './dlInferenceClient';
import exifr from 'exifr';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ImageMetadata {
  dimensions: { width: number; height: number };
  mimeType:   string;
  hasExif:    boolean;
  filename?:  string;
  fileSize:   number;
  exifData?:  unknown;
}

/** Extended forensic report — adds DL branch detail for the debug panel */
export interface ForensicAnalysisResultExtended extends ForensicReport {
  // DL branch probabilities (0-1 AI probability each)
  dlResult?: {
    cnn_score:      number;
    residual_score: number;
    fft_score:      number;
    forensic_score: number;
    metadata_score: number;
  };
  dlCalibration?: {
    has_trained_weights: boolean;
    heuristic_proxy:     boolean;
    model_backend:       string;
    temperature:         number;
  };
  dlDominantSignals?: string[];
  dlFusionWeights?: Record<string, number>;
  dlAvailable?: boolean;
  dlProcessingMs?: number;
  fusedAiProbability?: number;   // final fused AI probability (0-100 scale)
}

export interface ImageAnalysisResult {
  imageType: 'camera' | 'ai' | 'screenshot' | 'edited' | 'unknown';
  confidence: number;
  metadata: {
    hasExif:    boolean;
    hasMetadata: boolean;
    dimensions?: string;
    mimeType:   string;
  };
  indicators: string[];
  ownership: {
    isWatermarked: boolean;
    owner?:        string;
    timestamp?:    string;
  };
  forensicReport?: ForensicAnalysisResultExtended;
}

// ── Fusion weights (must sum to 1) ────────────────────────────────────────────

const W_DL_CNN      = 0.35;  // RGB branch           ⎫
const W_DL_RESIDUAL = 0.20;  // Noise residual branch ⎬ DL total = 70%
const W_DL_FFT      = 0.15;  // FFT frequency branch  ⎭
const W_FREQ        = 0.20;  // Frontend heuristic frequency signal
const W_METADATA    = 0.10;  // EXIF / metadata reliability

// When DL is unavailable — heuristic only
const W_FALLBACK_FORENSIC = 0.75;
const W_FALLBACK_METADATA = 0.25;

// ── Main entry point ──────────────────────────────────────────────────────────

/**
 * Analyse an image and return a unified result.
 *
 * @param base64Data  Data URL (data:image/jpeg;base64,…)
 * @param filename    Original filename (optional, used for EXIF hints)
 * @param source      'camera' | 'upload' — trusted camera capture skips DL
 */
export async function analyzeImage(
  base64Data: string,
  filename?:  string,
  source?:    'upload' | 'camera',
): Promise<ImageAnalysisResult> {
  try {
    console.log('🔍 [imageAnalysis] Starting DL-primary forensic pipeline…');

    // ── 1. Metadata extraction ──────────────────────────────────────────────
    const meta = await extractImageMetadata(base64Data, filename);
    const dims = meta.dimensions;

    console.log('📊 [imageAnalysis] Metadata:', {
      dimensions: `${dims.width}×${dims.height}`,
      hasExif:  meta.hasExif,
      fileSize: meta.fileSize,
      mimeType: meta.mimeType,
    });

    // ── 2. Trusted camera source — skip inference ───────────────────────────
    if (source === 'camera') {
      console.log('📷 [imageAnalysis] Trusted camera capture — skipping DL inference.');
      return _cameraResult(meta, dims);
    }

    // ── 3. Backend DL inference (primary) ──────────────────────────────────
    let dlResult: DLInferenceResponse | null = null;
    try {
      dlResult = await runDLInference(
        base64Data,
        filename || 'image.jpg',
      );
    } catch (err) {
      console.warn('⚠️ [imageAnalysis] DL backend call threw:', err);
    }

    // ── 4. Frontend heuristic forensic analysis (auxiliary) ─────────────────
    let forensicReport: ForensicReport | undefined;
    try {
      forensicReport = await performForensicAnalysis(base64Data, meta);
      console.log('🔬 [imageAnalysis] Frontend forensic complete:', {
        type:       forensicReport.imageType,
        aiProb:     forensicReport.aiProbability,
        cameraProb: forensicReport.cameraProbability,
      });
    } catch (err) {
      console.warn('⚠️ [imageAnalysis] Frontend forensic failed:', err);
    }

    // ── 5. Fusion ────────────────────────────────────────────────────────────
    const { imageType, confidence, fusedAiProb } = _fuse(
      dlResult,
      forensicReport,
      meta,
    );

    // ── 6. Assemble indicators ───────────────────────────────────────────────
    const indicators: string[] = [];
    if (dlResult) {
      const b = dlResult.branch_scores;
      indicators.push(
        `🤖 DL CNN branch: ${(b.cnn_score * 100).toFixed(0)}% AI`,
        `🌊 DL Residual branch: ${(b.residual_score * 100).toFixed(0)}% AI`,
        `📊 DL FFT branch: ${(b.fft_score * 100).toFixed(0)}% AI`,
      );
      if (dlResult.calibration.heuristic_proxy) {
        indicators.push('ℹ️ Heuristic proxy (no trained DL checkpoint)');
      }
    } else {
      indicators.push('⚠️ DL backend unavailable — frontend heuristics only');
    }
    if (forensicReport?.suppressionTriggered) {
      indicators.push('🔧 AI suppression triggered');
    }

    // ── 7. Build extended forensic report ──────────────────────────────────
    const extendedReport: ForensicAnalysisResultExtended | undefined = forensicReport
      ? {
          ...forensicReport,
          ...(dlResult && {
            dlResult: {
              cnn_score:      dlResult.branch_scores.cnn_score,
              residual_score: dlResult.branch_scores.residual_score,
              fft_score:      dlResult.branch_scores.fft_score,
              forensic_score: dlResult.branch_scores.forensic_score,
              metadata_score: dlResult.branch_scores.metadata_score,
            },
            dlCalibration: {
              has_trained_weights: dlResult.calibration.has_trained_weights,
              heuristic_proxy:     dlResult.calibration.heuristic_proxy,
              model_backend:       dlResult.calibration.model_backend,
              temperature:         dlResult.calibration.temperature,
            },
            dlDominantSignals: dlResult.dominant_signals,
            dlFusionWeights:   dlResult.fusion_weights,
            dlAvailable:       dlResult.dl_available,
            dlProcessingMs:    dlResult.processing_time_ms,
          }),
          fusedAiProbability: Math.round(fusedAiProb * 100),
        }
      : undefined;

    console.log(
      `✅ [imageAnalysis] Final: ${imageType} (${confidence}% confidence, ` +
      `AI=${(fusedAiProb * 100).toFixed(1)}%, DL=${dlResult ? 'yes' : 'no'})`,
    );

    return {
      imageType,
      confidence,
      metadata: {
        hasExif:     meta.hasExif,
        hasMetadata: meta.hasExif,
        dimensions:  `${dims.width}x${dims.height}`,
        mimeType:    meta.mimeType,
      },
      indicators,
      ownership: {
        isWatermarked: false,
        timestamp:     new Date().toISOString(),
      },
      forensicReport: extendedReport,
    };

  } catch (error) {
    console.error('[imageAnalysis] Fatal error:', error);
    return {
      imageType:  'unknown',
      confidence: 0,
      metadata:   { hasExif: false, hasMetadata: false, dimensions: '0x0', mimeType: 'image/jpeg' },
      indicators: ['Error during analysis'],
      ownership:  { isWatermarked: false },
    };
  }
}

// ── Fusion logic ──────────────────────────────────────────────────────────────

function _fuse(
  dl:        DLInferenceResponse | null,
  forensic:  ForensicReport | undefined,
  meta:      ImageMetadata,
): { imageType: ImageAnalysisResult['imageType']; confidence: number; fusedAiProb: number } {

  // Metadata reliability score: 0.2 if EXIF present, 0.55 if absent
  const metadataAiScore = meta.hasExif ? 0.20 : 0.55;

  if (dl) {
    // ── DL-primary fusion ──────────────────────────────────────────────────
    const b = dl.branch_scores;

    // Heuristic frequency signal: blend server forensic_score with frontend
    const frontendFreq = forensic
      ? (forensic.aiProbability / 100)    // aiProbability is 0-100 in ForensicReport
      : 0.5;
    const freqScore = 0.50 * b.forensic_score + 0.50 * frontendFreq;

    const fusedAiProb =
      W_DL_CNN      * b.cnn_score      +
      W_DL_RESIDUAL * b.residual_score +
      W_DL_FFT      * b.fft_score      +
      W_FREQ        * freqScore        +
      W_METADATA    * metadataAiScore;

    const clamped = Math.max(0, Math.min(1, fusedAiProb));
    console.log(
      `[Fusion] DL-primary: cnn=${b.cnn_score.toFixed(3)} ` +
      `resid=${b.residual_score.toFixed(3)} fft=${b.fft_score.toFixed(3)} ` +
      `freq=${freqScore.toFixed(3)} meta=${metadataAiScore.toFixed(3)} ` +
      `→ AI=${(clamped * 100).toFixed(1)}%`,
    );

    return _classify(clamped);
  }

  // ── Heuristic-only fallback (DL backend unreachable) ─────────────────────
  if (forensic) {
    const forensicAiScore = forensic.aiProbability / 100;
    const fusedAiProb =
      W_FALLBACK_FORENSIC * forensicAiScore +
      W_FALLBACK_METADATA * metadataAiScore;
    const clamped = Math.max(0, Math.min(1, fusedAiProb));
    console.log(
      `[Fusion] Heuristic-only: forensicAI=${(forensicAiScore * 100).toFixed(1)}% ` +
      `meta=${metadataAiScore.toFixed(3)} → AI=${(clamped * 100).toFixed(1)}%`,
    );
    return _classify(clamped);
  }

  // No signal at all
  return { imageType: 'unknown', confidence: 0, fusedAiProb: 0.5 };
}

function _classify(aiProb: number): {
  imageType:  ImageAnalysisResult['imageType'];
  confidence: number;
  fusedAiProb: number;
} {
  const AI_THRESHOLD     = 0.55;   // > 55% AI probability → classify as AI
  const CAMERA_THRESHOLD = 0.45;   // < 45% AI probability → classify as camera

  if (aiProb >= AI_THRESHOLD) {
    return { imageType: 'ai',     confidence: Math.round(aiProb * 100), fusedAiProb: aiProb };
  }
  if (aiProb <= CAMERA_THRESHOLD) {
    return { imageType: 'camera', confidence: Math.round((1 - aiProb) * 100), fusedAiProb: aiProb };
  }
  return { imageType: 'unknown', confidence: 0, fusedAiProb: aiProb };
}

function _cameraResult(meta: ImageMetadata, dims: { width: number; height: number }): ImageAnalysisResult {
  return {
    imageType:  'camera',
    confidence: 95,
    metadata: {
      hasExif:     meta.hasExif,
      hasMetadata: meta.hasExif,
      dimensions:  `${dims.width}x${dims.height}`,
      mimeType:    meta.mimeType,
    },
    indicators: ['📷 Trusted camera capture (in-app)'],
    ownership:  { isWatermarked: false, timestamp: new Date().toISOString() },
  };
}

// ── Metadata extraction ───────────────────────────────────────────────────────

async function extractImageMetadata(
  base64Data: string,
  filename?:  string,
): Promise<ImageMetadata> {
  // Dimensions
  let dimensions = { width: 0, height: 0 };
  try { dimensions = await getImageDimensions(base64Data); } catch { /* ignore */ }

  // MIME type
  let mimeType = 'image/jpeg';
  const mimeMatch = /^data:([^;]+);base64,/i.exec(base64Data);
  if (mimeMatch?.[1]) mimeType = mimeMatch[1].toLowerCase();

  // File size
  let fileSize = 0;
  try {
    const commaIdx = base64Data.indexOf(',');
    const b64 = commaIdx >= 0 ? base64Data.slice(commaIdx + 1) : base64Data;
    const padding = (b64.match(/=+$/) || [''])[0].length;
    fileSize = Math.max(0, Math.floor((b64.length * 3) / 4) - padding);
  } catch {
    fileSize = base64Data.length * 0.75;
  }

  // EXIF
  let exifData: unknown = undefined;
  let hasExif = false;
  try {
    const parsed = await exifr.parse(base64Data, {
      tiff: true, ifd0: true, exif: true,
      gps: false, interop: false, makerNote: false, userComment: false,
      silentErrors: true,
    } as Parameters<typeof exifr.parse>[1]);
    if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
      exifData = parsed;
      hasExif = Boolean(
        (parsed as Record<string, unknown>).Make           ||
        (parsed as Record<string, unknown>).Model          ||
        (parsed as Record<string, unknown>).DateTimeOriginal ||
        (parsed as Record<string, unknown>).ExposureTime   ||
        (parsed as Record<string, unknown>).ISO            ||
        (parsed as Record<string, unknown>).FNumber,
      );
    }
  } catch { /* non-fatal */ }

  return { dimensions, mimeType, hasExif, filename, fileSize, exifData };
}

function getImageDimensions(base64Data: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload  = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve({ width: 1080, height: 1920 });
    img.src = base64Data.startsWith('data:') ? base64Data : `data:image/jpeg;base64,${base64Data}`;
  });
}

// ── Display helper ────────────────────────────────────────────────────────────

export function formatAnalysisResult(result: ImageAnalysisResult): string {
  const typeEmoji: Record<ImageAnalysisResult['imageType'], string> = {
    camera: '📷', ai: '🤖', screenshot: '📸', edited: '🔧', unknown: '❓',
  };
  const fr = result.forensicReport as ForensicAnalysisResultExtended | undefined;

  let out = `
${typeEmoji[result.imageType]} IMAGE TYPE: ${result.imageType.toUpperCase()}
📊 Confidence: ${result.confidence}%

📋 INDICATORS:
${result.indicators.map((i) => `  • ${i}`).join('\n')}

📋 METADATA:
  • EXIF Data: ${result.metadata.hasExif ? 'Present' : 'Not found'}
  • Dimensions: ${result.metadata.dimensions}
  • Format: ${result.metadata.mimeType}

🔒 OWNERSHIP:
  • Watermarked: ${result.ownership.isWatermarked ? 'Yes ✓' : 'No'}
  • Timestamp: ${result.ownership.timestamp}`;

  if (fr?.dlResult) {
    const b = fr.dlResult;
    out += `

🧠 DL INFERENCE (${fr.dlCalibration?.model_backend ?? 'unknown'}):
  📷 CNN branch:      ${(b.cnn_score * 100).toFixed(1)}% AI
  🌊 Residual branch: ${(b.residual_score * 100).toFixed(1)}% AI
  📊 FFT branch:      ${(b.fft_score * 100).toFixed(1)}% AI
  🔧 Frequency score: ${(b.forensic_score * 100).toFixed(1)}% AI
  📂 Metadata score:  ${(b.metadata_score * 100).toFixed(1)}% AI
  ═══════════════════════════════
  🎯 Fused AI prob:   ${fr.fusedAiProbability ?? '?'}%
  ℹ️  Trained weights: ${fr.dlCalibration?.has_trained_weights ? 'Yes' : 'No (heuristic proxy)'}`;
  }

  if (fr) {
    out += `

🔬 FORENSIC ANALYSIS:
  📸 Screenshot:      ${fr.screenshotProbability > 50 ? `YES (${fr.screenshotProbability}%)` : 'NO'}
  🤖 AI Generated:    ${fr.aiProbability}%
  📷 Camera Original: ${fr.cameraProbability > 35 ? `YES (${fr.cameraProbability}%)` : 'NO'}`;
  }

  return out.trim();
}
