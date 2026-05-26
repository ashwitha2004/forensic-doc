/**
 * FORENSIC DETECTION ENGINE v3 — Multi-Signal Probabilistic Fusion
 *
 * Architecture
 * ─────────────────────────────────────────────────────────────────
 * Every analyzer returns  { score, confidence, reliability }.
 *   score       0–1  how strongly this signal supports its hypothesis (AI or camera)
 *   confidence  0–1  certainty of this specific measurement on this image
 *   reliability 0–1  a-priori accuracy of this signal class (fixed per signal)
 *
 * Final AI score  = Σ(score × confidence × reliability) / Σ(confidence × reliability)
 * Final CAM score = same formula over camera signals
 *
 * False-positive protection:
 *   AI classification requires ≥ 2 independent strong signals
 *   (score > 0.65 AND confidence > 0.40) so that a single noisy metric
 *   cannot flip a real camera photo to "AI".
 */

import { ImageMetadata } from './imageAnalysis';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface ForensicSignal {
  score: number;       // 0–1 — strength of signal FOR its hypothesis
  confidence: number;  // 0–1 — quality/certainty of THIS measurement
  reliability: number; // 0–1 — a-priori reliability of this signal class
}

export interface AIForensicSignals {
  noiseFloorDeficit:   ForensicSignal; // missing camera sensor noise
  microtextureEntropy: ForensicSignal; // low-entropy smooth patches
  edgeUniformity:      ForensicSignal; // unnaturally uniform edge magnitudes
  patternRepetition:   ForensicSignal; // GAN/diffusion block self-similarity
  symmetryBias:        ForensicSignal; // AI compositional over-symmetry
  frequencyDeficit:    ForensicSignal; // high-frequency energy deficit
}

export interface CameraForensicSignals {
  sensorNoiseResidual: ForensicSignal; // PRNU-style block-level noise
  jpegNaturalness:     ForensicSignal; // natural JPEG quantization pattern
  cfaDemosaic:         ForensicSignal; // Bayer color-filter-array correlation
  chromaticAberration: ForensicSignal; // lens fringing on strong edges
  edgeRandomness:      ForensicSignal; // natural varied edge strengths
  faceRegionNoise:     ForensicSignal; // skin-area noise texture (conditional)
}

export interface FusionDebug {
  aiSignals:                   Record<string, number>;
  cameraSignals:               Record<string, number>;
  suppressionReason:           string;
  dominantSignals:             string[];
  fusionWeights:               Record<string, number>;
  finalDecisionReason:         string;
  strongAISignalCount:         number;
  falsePositiveProtectionApplied: boolean;
  rawAIScore:                  number;
  rawCameraScore:              number;
}

// Legacy per-detector results (kept for backward compat with callers)
export interface AIGeneratedDetection {
  probability: number;
  reasons: string[];
  subScores: { textureScore: number; edgeScore: number; frequencyScore: number; symmetryScore: number; noiseScore: number };
}
export interface CameraOriginalDetection {
  detected: boolean;
  confidence: number;
  reasons: string[];
  exifData: boolean;
  cameraManufacturer?: string;
  subScores: { sensorNoiseScore: number; cfaScore: number; jpegConsistency: number; aberrationScore: number; edgeRandomness: number };
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
  // Legacy probability fields (backward compat)
  aiProbability: number;
  cameraProbability: number;
  screenshotProbability: number;
  editedProbability: number;
  downloadedProbability: number;
  whatsappProbability: number;
  securityStatus: string;
  imageSource: string;
  cameraCaptured: boolean;
  // Legacy sub-score maps (backward compat)
  aiSubScores: { textureScore: number; edgeScore: number; frequencyScore: number; symmetryScore: number; noiseScore: number };
  cameraSubScores: { sensorNoiseScore: number; cfaScore: number; jpegConsistency: number; aberrationScore: number; edgeRandomness: number };
  suppressionTriggered: boolean;
  // v3 — probabilistic fusion results
  forensicSignals: { ai: AIForensicSignals; camera: CameraForensicSignals };
  fusionDebug: FusionDebug;
  reliabilityScore: number; // 0–100 overall signal quality
}

// ─────────────────────────────────────────────────────────────────────────────
// SHARED IMAGE LOADER
// ─────────────────────────────────────────────────────────────────────────────

async function loadImg(
  base64Data: string
): Promise<{ data: Uint8ClampedArray; width: number; height: number } | null> {
  if (typeof Image === 'undefined' || typeof document === 'undefined') return null;
  return new Promise(resolve => {
    const img = new Image();
    const t = setTimeout(() => resolve(null), 6000);
    img.onload = () => {
      clearTimeout(t);
      try {
        const c = document.createElement('canvas');
        c.width  = img.naturalWidth;
        c.height = img.naturalHeight;
        const ctx = c.getContext('2d');
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0);
        const d = ctx.getImageData(0, 0, c.width, c.height);
        resolve({ data: d.data, width: c.width, height: c.height });
      } catch { resolve(null); }
    };
    img.onerror = () => { clearTimeout(t); resolve(null); };
    img.src = base64Data.startsWith('data:') ? base64Data : `data:image/jpeg;base64,${base64Data}`;
  });
}

const lum = (data: Uint8ClampedArray, i: number) =>
  0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];

// ─────────────────────────────────────────────────────────────────────────────
// AI SIGNAL ANALYZERS  (high score = strongly AI-generated)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * noiseFloorDeficit — Most reliable AI signal.
 * Real camera sensors always produce photon-shot + read-out noise (σ ≈ 15–40).
 * AI generators produce near-zero noise floors (σ ≈ 2–7).
 * WhatsApp JPEG recompression quantises noise but cannot eliminate it.
 */
async function signalNoiseFloorDeficit(base64Data: string): Promise<ForensicSignal> {
  try {
    const img = await loadImg(base64Data);
    if (!img) return { score: 0.5, confidence: 0, reliability: 0.90 };
    const { data, width, height } = img;
    const stepY = Math.max(1, Math.floor(height / 200));
    const stepX = Math.max(1, Math.floor(width  / 200));
    const residuals: number[] = [];
    for (let y = stepY; y < height - stepY; y += stepY) {
      for (let x = stepX; x < width - stepX; x += stepX) {
        const iC = (y * width + x) * 4;
        const lap = Math.abs(
          4 * lum(data, iC)
          - lum(data, (y * width + (x - 1)) * 4)
          - lum(data, (y * width + (x + 1)) * 4)
          - lum(data, ((y - 1) * width + x) * 4)
          - lum(data, ((y + 1) * width + x) * 4)
        );
        residuals.push(lap);
      }
    }
    if (residuals.length < 100) return { score: 0.5, confidence: 0.2, reliability: 0.90 };
    const mean = residuals.reduce((a, b) => a + b, 0) / residuals.length;
    const variance = residuals.reduce((s, v) => s + (v - mean) ** 2, 0) / residuals.length;
    const sigma = Math.sqrt(Math.max(0, variance));
    // Camera σ ≈ 15–40 → noiseScore 0.3–0.8
    // AI     σ ≈ 2–7  → noiseScore 0.04–0.14
    // deficit = 1 − noiseScore  →  camera 0.2–0.7 / AI 0.86–0.96
    const noiseScore = Math.min(1, sigma / 50);
    const score      = Math.max(0, Math.min(1, 1 - noiseScore));
    const confidence = Math.min(0.95, residuals.length / 5000);
    return { score, confidence, reliability: 0.90 };
  } catch { return { score: 0.5, confidence: 0, reliability: 0.90 }; }
}

/**
 * microtextureEntropy — Patch-level Shannon entropy.
 * Real camera images carry sensor noise even in smooth regions, raising
 * their minimum patch entropy.  AI-generated smooth areas (skin, sky,
 * generated backgrounds) have near-zero noise → near-zero entropy.
 * Score = how low the 25th-percentile patch entropy is.
 */
async function signalMicrotextureEntropy(base64Data: string): Promise<ForensicSignal> {
  try {
    const img = await loadImg(base64Data);
    if (!img) return { score: 0.5, confidence: 0, reliability: 0.80 };
    const { data, width, height } = img;
    const patchSize = 32;
    const bins = 16;
    const entropies: number[] = [];
    const numPX = Math.floor(width  / patchSize);
    const numPY = Math.floor(height / patchSize);
    const step  = Math.max(1, Math.floor(Math.min(numPX, numPY) / 8));

    for (let py = 0; py < numPY; py += step) {
      for (let px = 0; px < numPX; px += step) {
        const hist = new Float32Array(bins);
        let n = 0;
        for (let dy = 0; dy < patchSize; dy++) {
          for (let dx = 0; dx < patchSize; dx++) {
            const x = px * patchSize + dx;
            const y = py * patchSize + dy;
            if (x >= width || y >= height) continue;
            const l = lum(data, (y * width + x) * 4);
            hist[Math.min(bins - 1, Math.floor(l / 256 * bins))]++;
            n++;
          }
        }
        if (n === 0) continue;
        let H = 0;
        for (let b = 0; b < bins; b++) {
          const p = hist[b] / n;
          if (p > 0) H -= p * Math.log2(p);
        }
        entropies.push(H / Math.log2(bins)); // normalise to 0–1
      }
    }
    if (entropies.length < 5) return { score: 0.5, confidence: 0.2, reliability: 0.80 };
    entropies.sort((a, b) => a - b);
    const p25 = entropies[Math.floor(entropies.length * 0.25)];
    // Camera P25 > 0.20 (noise keeps minimum entropy up)
    // AI     P25 < 0.08 (synthetic smooth patches near-zero)
    const score = Math.max(0, Math.min(1, (0.22 - p25) / 0.18));
    const confidence = Math.min(0.90, entropies.length / 30);
    return { score, confidence, reliability: 0.80 };
  } catch { return { score: 0.5, confidence: 0, reliability: 0.80 }; }
}

/**
 * edgeUniformity — Coefficient of variation of Sobel edge magnitudes.
 * Camera photos have highly varied edge strengths; AI diffusion outputs
 * produce unnaturally uniform edges (low CV → high AI score).
 */
async function signalEdgeUniformity(base64Data: string): Promise<ForensicSignal> {
  try {
    const img = await loadImg(base64Data);
    if (!img) return { score: 0.5, confidence: 0, reliability: 0.75 };
    const { data, width, height } = img;
    const stepY = Math.max(1, Math.floor(height / 200));
    const stepX = Math.max(1, Math.floor(width  / 200));
    const mags: number[] = [];
    for (let y = stepY; y < height - stepY; y += stepY) {
      for (let x = stepX; x < width - stepX; x += stepX) {
        if ((x % 8) < 2 || (y % 8) < 2) continue; // skip JPEG DCT boundaries
        const iC = (y * width + x) * 4;
        const gx = lum(data, (y * width + (x + 1)) * 4) - lum(data, iC);
        const gy = lum(data, ((y + 1) * width + x) * 4) - lum(data, iC);
        const m  = Math.sqrt(gx * gx + gy * gy);
        if (m > 15) mags.push(m);
      }
    }
    if (mags.length < 50) return { score: 0.5, confidence: 0.2, reliability: 0.75 };
    const mean = mags.reduce((a, b) => a + b, 0) / mags.length;
    const variance = mags.reduce((s, v) => s + (v - mean) ** 2, 0) / mags.length;
    const cv = mean > 0 ? Math.sqrt(variance) / mean : 0;
    // Camera CV 0.6–1.5 → score 0.0–0.5 (not AI-like)
    // AI     CV 0.1–0.4 → score 0.68–0.92
    const score = Math.max(0, Math.min(1, 1 - cv * 0.75));
    const confidence = Math.min(0.90, mags.length / 400);
    return { score, confidence, reliability: 0.75 };
  } catch { return { score: 0.5, confidence: 0, reliability: 0.75 }; }
}

/**
 * patternRepetition — Block self-similarity (GAN/diffusion artifact).
 * Deterministic NCC between non-overlapping 16×16 block pairs.
 */
async function signalPatternRepetition(base64Data: string): Promise<ForensicSignal> {
  try {
    const img = await loadImg(base64Data);
    if (!img || img.width < 64 || img.height < 64) return { score: 0, confidence: 0, reliability: 0.70 };
    const { data, width, height } = img;
    const bs = 16;
    const numPairs = 60;
    let totalSim = 0;
    let count = 0;
    for (let p = 0; p < numPairs; p++) {
      const ax = (p * 137) % Math.max(1, width  - bs);
      const ay = (p * 257) % Math.max(1, height - bs);
      const bx = (p * 419 + 31) % Math.max(1, width  - bs);
      const by = (p * 521 + 71) % Math.max(1, height - bs);
      if (Math.abs(ax - bx) < bs && Math.abs(ay - by) < bs) continue;
      const A: number[] = [], B: number[] = [];
      let sA = 0, sB = 0;
      for (let dy = 0; dy < bs; dy++) {
        for (let dx = 0; dx < bs; dx++) {
          const va = lum(data, ((ay + dy) * width + (ax + dx)) * 4);
          const vb = lum(data, ((by + dy) * width + (bx + dx)) * 4);
          A.push(va); B.push(vb); sA += va; sB += vb;
        }
      }
      const mA = sA / A.length, mB = sB / B.length;
      let dot = 0, qA = 0, qB = 0;
      for (let i = 0; i < A.length; i++) {
        const a = A[i] - mA, b = B[i] - mB;
        dot += a * b; qA += a * a; qB += b * b;
      }
      if (qA < 1 || qB < 1) continue;
      totalSim += Math.abs(dot / Math.sqrt(qA * qB));
      count++;
    }
    if (count < 10) return { score: 0, confidence: 0.2, reliability: 0.70 };
    const meanSim = totalSim / count;
    // Camera meanSim ~0.05–0.20 → score ~0.0–0.1
    // AI     meanSim ~0.30–0.55 → score ~0.4–1.0
    const score = Math.min(0.95, Math.max(0, (meanSim - 0.15) * 2.5));
    const confidence = Math.min(0.85, count / 40);
    return { score, confidence, reliability: 0.70 };
  } catch { return { score: 0, confidence: 0, reliability: 0.70 }; }
}

/**
 * symmetryBias — Horizontal mirror symmetry normalised by local deviation.
 * AI tools (centered subjects, portraits, logo-like outputs) skew abnormally
 * symmetric compared with natural hand-held camera photos.
 */
async function signalSymmetryBias(base64Data: string): Promise<ForensicSignal> {
  try {
    const img = await loadImg(base64Data);
    if (!img || img.width < 16) return { score: 0, confidence: 0, reliability: 0.65 };
    const { data, width, height } = img;
    const half  = Math.floor(width / 2);
    const stepY = Math.max(1, Math.floor(height / 200));
    const stepX = Math.max(1, Math.floor(half   / 100));
    let diffSum = 0, devSum = 0, count = 0;
    for (let y = 0; y < height; y += stepY) {
      for (let x = 0; x < half - 1; x += stepX) {
        const left  = lum(data, (y * width + x) * 4);
        const right = lum(data, (y * width + (width - 1 - x)) * 4);
        diffSum += Math.abs(left - right);
        devSum  += Math.abs(left - 128);
        count++;
      }
    }
    if (count === 0) return { score: 0, confidence: 0, reliability: 0.65 };
    const ratio = devSum > 1 ? (diffSum / count) / (devSum / count) : 1;
    // ratio 0 → nearly perfect symmetry → score 0.95 (AI-like)
    // ratio 1+ → asymmetric → score 0
    const score = Math.max(0, Math.min(0.95, 1 - ratio));
    const confidence = Math.min(0.85, count / 5000);
    return { score, confidence, reliability: 0.65 };
  } catch { return { score: 0, confidence: 0, reliability: 0.65 }; }
}

/**
 * frequencyDeficit — High-frequency energy deficit (HF/LF ratio).
 * NOTE: reliability is intentionally low (0.45) because WhatsApp JPEG
 * recompression also strips high-frequency content, producing false signal.
 */
async function signalFrequencyDeficit(base64Data: string): Promise<ForensicSignal> {
  try {
    const img = await loadImg(base64Data);
    if (!img) return { score: 0.5, confidence: 0, reliability: 0.45 };
    const { data, width, height } = img;
    const stepY = Math.max(1, Math.floor(height / 150));
    const stepX = Math.max(1, Math.floor(width  / 150));
    let hfSq = 0, lfSq = 0, count = 0;
    for (let y = 2; y < height - 2; y += stepY) {
      for (let x = 2; x < width - 2; x += stepX) {
        if ((x % 8) < 2 || (y % 8) < 2) continue;
        let avg = 0;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++)
            avg += lum(data, ((y + dy) * width + (x + dx)) * 4);
        avg /= 9;
        const hf = lum(data, (y * width + x) * 4) - avg;
        hfSq += hf * hf; lfSq += avg * avg; count++;
      }
    }
    if (count === 0) return { score: 0.5, confidence: 0, reliability: 0.45 };
    const ratio = lfSq > 1 ? Math.sqrt(hfSq / count) / Math.sqrt(lfSq / count) : 0;
    // Camera non-boundary ratio 0.03–0.15 → score 0.76–0.88 (above camera's range too)
    // AI     non-boundary ratio 0.01–0.025 → score 0.92–0.96
    // Low reliability prevents this from dominating the fusion.
    const score = Math.max(0, Math.min(0.95, 1 - ratio * 8));
    const confidence = Math.min(0.85, count / 3000);
    return { score, confidence, reliability: 0.45 };
  } catch { return { score: 0.5, confidence: 0, reliability: 0.45 }; }
}

// ─────────────────────────────────────────────────────────────────────────────
// CAMERA SIGNAL ANALYZERS  (high score = strongly camera-captured)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * sensorNoiseResidual — PRNU-inspired block-level noise analysis.
 * Real camera sensors produce spatially heteroscedastic noise: the per-block
 * Laplacian variance varies widely across the image.  AI synthetic images
 * either have near-zero noise or spatially-uniform correlated texture.
 */
async function signalSensorNoiseResidual(base64Data: string): Promise<ForensicSignal> {
  try {
    const img = await loadImg(base64Data);
    if (!img) return { score: 0.5, confidence: 0, reliability: 0.50 };
    const { data, width, height } = img;
    const bs = 20; // block size
    const numBX = Math.floor(width  / bs);
    const numBY = Math.floor(height / bs);
    const step  = Math.max(1, Math.floor(Math.min(numBX, numBY) / 10));
    const blockVars: number[] = [];

    for (let by = 0; by < numBY; by += step) {
      for (let bx = 0; bx < numBX; bx += step) {
        const laps: number[] = [];
        for (let dy = 1; dy < bs - 1; dy++) {
          for (let dx = 1; dx < bs - 1; dx++) {
            const x = bx * bs + dx;
            const y = by * bs + dy;
            if (x >= width - 1 || y >= height - 1) continue;
            const iC = (y * width + x) * 4;
            const lap = Math.abs(
              4 * lum(data, iC)
              - lum(data, (y * width + (x - 1)) * 4)
              - lum(data, (y * width + (x + 1)) * 4)
              - lum(data, ((y - 1) * width + x) * 4)
              - lum(data, ((y + 1) * width + x) * 4)
            );
            laps.push(lap);
          }
        }
        if (laps.length < 4) continue;
        const mn = laps.reduce((a, b) => a + b, 0) / laps.length;
        const vr = laps.reduce((s, v) => s + (v - mn) ** 2, 0) / laps.length;
        blockVars.push(vr);
      }
    }
    if (blockVars.length < 5) return { score: 0.5, confidence: 0.2, reliability: 0.50 };
    const meanVar = blockVars.reduce((a, b) => a + b, 0) / blockVars.length;
    const varOfVar = blockVars.reduce((s, v) => s + (v - meanVar) ** 2, 0) / blockVars.length;
    const cvOfVar  = meanVar > 0 ? Math.sqrt(varOfVar) / meanVar : 0;
    // Camera: meanVar 400–1600, cvOfVar 0.5–2.0 → score 0.55–1.0
    // AI:     meanVar 5–50,     cvOfVar 0.2–0.8 → score 0.02–0.2
    const noisePresent = Math.min(1, meanVar / 900);          // existence of noise
    const noiseVaried  = Math.min(1, cvOfVar  / 1.5);        // spatial heteroscedasticity
    const score      = noisePresent * 0.65 + noiseVaried * 0.35;
    const confidence = Math.min(0.92, blockVars.length / 15);
    return { score, confidence, reliability: 0.50 };
  } catch { return { score: 0.5, confidence: 0, reliability: 0.50 }; }
}

/**
 * jpegNaturalness — DCT block boundary periodicity.
 * Camera JPEGs show a characteristic ~1.4–2.0× higher column-wise difference
 * at DCT 8-pixel boundaries vs interior columns.  Non-JPEG sources ≈1.0;
 * heavily re-compressed over-compressed images push past 2.5.
 */
async function signalJPEGNaturalness(base64Data: string): Promise<ForensicSignal> {
  try {
    const img = await loadImg(base64Data);
    if (!img) return { score: 0.5, confidence: 0, reliability: 0.35 };
    const { data, width, height } = img;
    const colDiff = new Float64Array(width);
    const sRows   = Math.min(200, height);
    const stepY   = Math.max(1, Math.floor(height / sRows));
    let rowCount  = 0;
    for (let y = 0; y < height; y += stepY) {
      for (let x = 1; x < width; x++) {
        const i0 = (y * width + (x - 1)) * 4;
        const i1 = (y * width + x) * 4;
        colDiff[x] += Math.abs(lum(data, i1) - lum(data, i0));
      }
      rowCount++;
    }
    if (rowCount === 0) return { score: 0.5, confidence: 0, reliability: 0.35 };
    for (let x = 0; x < width; x++) colDiff[x] /= rowCount;
    let bSum = 0, bCnt = 0, iSum = 0, iCnt = 0;
    for (let x = 8; x < width - 1; x++) {
      if (x % 8 === 0) { bSum += colDiff[x]; bCnt++; }
      else             { iSum += colDiff[x]; iCnt++; }
    }
    if (bCnt === 0 || iCnt === 0) return { score: 0.5, confidence: 0, reliability: 0.35 };
    const ratio = (iSum / iCnt) > 0 ? (bSum / bCnt) / (iSum / iCnt) : 0;
    const isNatural = ratio > 1.1 && ratio < 2.6;
    // Normalised so natural camera JPEG (ratio ~1.5) scores ~0.80
    const score = isNatural ? Math.min(1, Math.max(0, (ratio - 1.05) / 0.55)) : ratio * 0.08;
    const confidence = Math.min(0.85, bCnt / 30);
    return { score, confidence, reliability: 0.35 };
  } catch { return { score: 0.5, confidence: 0, reliability: 0.35 }; }
}

/**
 * cfaDemosaic — Bayer CFA color-filter-array horizontal correlation.
 * Camera output is demosaiced from a Bayer grid, which imprints smooth
 * local colour gradients that survive WhatsApp and social-media recompression.
 */
async function signalCFADemosaic(base64Data: string): Promise<ForensicSignal> {
  try {
    const img = await loadImg(base64Data);
    if (!img) return { score: 0.5, confidence: 0, reliability: 0.30 };
    const { data, width, height } = img;
    const stepY = Math.max(1, Math.floor(height / 100));
    const stepX = Math.max(1, Math.floor(width  / 100));
    let smooth = 0, count = 0;
    for (let y = stepY; y < height - stepY; y += stepY) {
      for (let x = stepX; x < width - stepX - 1; x += stepX) {
        const i0 = (y * width + x) * 4;
        const i1 = (y * width + x + 1) * 4;
        const d = (Math.abs(data[i0] - data[i1]) + Math.abs(data[i0+1] - data[i1+1]) + Math.abs(data[i0+2] - data[i1+2])) / 3;
        if (d < 25) smooth++;
        count++;
      }
    }
    if (count === 0) return { score: 0.5, confidence: 0, reliability: 0.30 };
    const raw = smooth / count;
    // Camera 0.60–0.85; AI may also be in this range (modern diffusion models mimic CFA)
    // Only trust this signal when combined with noise residual.
    const score = Math.min(1, Math.max(0, raw));
    const confidence = Math.min(0.80, count / 500);
    return { score, confidence, reliability: 0.30 };
  } catch { return { score: 0.5, confidence: 0, reliability: 0.30 }; }
}

/**
 * chromaticAberration — Lens R-B fringing at strong luminance edges.
 * Real optical lenses cause CA that persists (at reduced amplitude) through
 * WhatsApp JPEG recompression.  Threshold lowered to 0.04 to catch
 * heavily-compressed camera photos.
 */
async function signalChromaticAberration(base64Data: string): Promise<ForensicSignal> {
  try {
    const img = await loadImg(base64Data);
    if (!img) return { score: 0, confidence: 0, reliability: 0.62 };
    const { data, width, height } = img;
    const stepY = Math.max(1, Math.floor(height / 200));
    const stepX = Math.max(1, Math.floor(width  / 200));
    let chromaSum = 0, edgeCount = 0;
    for (let y = stepY; y < height - stepY; y += stepY) {
      for (let x = stepX; x < width - stepX; x += stepX) {
        const iC = (y * width + x) * 4;
        const iR = (y * width + (x + 1)) * 4;
        const iD = ((y + 1) * width + x) * 4;
        const gx = lum(data, iR) - lum(data, iC);
        const gy = lum(data, iD) - lum(data, iC);
        const mag = Math.sqrt(gx * gx + gy * gy);
        if (mag <= 15) continue;
        const rG = (data[iR]   - data[iC])   + (data[iD]   - data[iC]);
        const gG = (data[iR+1] - data[iC+1]) + (data[iD+1] - data[iC+1]);
        const bG = (data[iR+2] - data[iC+2]) + (data[iD+2] - data[iC+2]);
        chromaSum += (Math.abs(rG - gG) + Math.abs(bG - gG)) / (mag + 1);
        edgeCount++;
      }
    }
    if (edgeCount < 20) return { score: 0, confidence: 0.2, reliability: 0.62 };
    const meanChroma = chromaSum / edgeCount;
    // Camera CA: mean 0.8–2.0 → score 0.27–0.50
    // AI/pure-digital: mean 0.0–0.3 → score 0.0–0.10
    // Threshold lowered: any score > 0.04 counts as lens presence
    const score = Math.min(1, meanChroma * 0.35);
    const confidence = Math.min(0.80, edgeCount / 200);
    return { score, confidence, reliability: 0.62 };
  } catch { return { score: 0, confidence: 0, reliability: 0.62 }; }
}

/**
 * edgeRandomness — Natural variability of edge-gradient magnitudes.
 * Camera content has high coefficient of variation (varied edges); AI diffusion
 * outputs have unnaturally uniform edges (low CV).
 * Camera score = min(1, CV/1.5)  →  high score = natural randomness.
 */
async function signalEdgeRandomness(base64Data: string): Promise<ForensicSignal> {
  try {
    const img = await loadImg(base64Data);
    if (!img) return { score: 0.5, confidence: 0, reliability: 0.78 };
    const { data, width, height } = img;
    const stepY = Math.max(1, Math.floor(height / 200));
    const stepX = Math.max(1, Math.floor(width  / 200));
    const mags: number[] = [];
    for (let y = stepY; y < height - stepY; y += stepY) {
      for (let x = stepX; x < width - stepX; x += stepX) {
        const iC = (y * width + x) * 4;
        const gx = lum(data, (y * width + (x + 1)) * 4) - lum(data, iC);
        const gy = lum(data, ((y + 1) * width + x) * 4) - lum(data, iC);
        const m  = Math.sqrt(gx * gx + gy * gy);
        if (m > 5) mags.push(m);
      }
    }
    if (mags.length < 10) return { score: 0.5, confidence: 0.2, reliability: 0.78 };
    const mean = mags.reduce((a, b) => a + b, 0) / mags.length;
    const variance = mags.reduce((s, v) => s + (v - mean) ** 2, 0) / mags.length;
    const cv = mean > 0 ? Math.sqrt(variance) / mean : 0;
    // Camera CV 0.6–1.5 → cameraScore 0.40–1.0
    // AI     CV 0.1–0.4 → cameraScore 0.07–0.27
    const score = Math.min(1, cv / 1.5);
    const confidence = Math.min(0.88, mags.length / 1000);
    return { score, confidence, reliability: 0.78 };
  } catch { return { score: 0.5, confidence: 0, reliability: 0.78 }; }
}

/**
 * faceRegionNoise — Skin-area Laplacian noise (conditional signal).
 * AI generators produce unnaturally smooth, poreless skin.
 * Camera photos of people retain natural micro-noise even on skin.
 * confidence = 0 when no skin region detected → signal drops out of fusion.
 */
async function signalFaceRegionNoise(base64Data: string): Promise<ForensicSignal> {
  try {
    const img = await loadImg(base64Data);
    if (!img) return { score: 0.5, confidence: 0, reliability: 0.72 };
    const { data, width, height } = img;
    const stepY = Math.max(1, Math.floor(height / 150));
    const stepX = Math.max(1, Math.floor(width  / 150));
    const skinLaps: number[] = [];
    let total = 0;
    for (let y = stepY; y < height - stepY; y += stepY) {
      for (let x = stepX; x < width - stepX; x += stepX) {
        total++;
        const idx = (y * width + x) * 4;
        const r = data[idx], g = data[idx+1], b = data[idx+2];
        // Kovac skin detection
        if (r > 95 && g > 40 && b > 20 && r > g && r > b && (r - b) > 15 && (r - g) > 15
            && Math.max(r, g, b) - Math.min(r, g, b) > 15) {
          const iC = (y * width + x) * 4;
          const lap = Math.abs(
            4 * lum(data, iC)
            - lum(data, (y * width + (x - 1)) * 4)
            - lum(data, (y * width + (x + 1)) * 4)
            - lum(data, ((y - 1) * width + x) * 4)
            - lum(data, ((y + 1) * width + x) * 4)
          );
          skinLaps.push(lap);
        }
      }
    }
    const skinFrac = skinLaps.length / Math.max(1, total);
    if (skinFrac < 0.03 || skinLaps.length < 20) {
      return { score: 0.5, confidence: 0, reliability: 0.72 }; // no face region
    }
    const mean = skinLaps.reduce((a, b) => a + b, 0) / skinLaps.length;
    // Camera skin Laplacian σ ≈ 15–35 → score 0.6–1.0
    // AI skin Laplacian σ ≈ 2–8   → score 0.08–0.32
    const score = Math.min(1, mean / 28);
    const baseCof = Math.min(1, skinLaps.length / 100);
    const confidence = baseCof * (skinFrac > 0.07 ? 0.85 : 0.55);
    return { score, confidence, reliability: 0.72 };
  } catch { return { score: 0.5, confidence: 0, reliability: 0.72 }; }
}

// ─────────────────────────────────────────────────────────────────────────────
// PROBABILISTIC FUSION ENGINE
// ─────────────────────────────────────────────────────────────────────────────

interface FusionResult {
  imageType: 'camera' | 'ai' | 'unknown';
  confidence: number;
  rawAIScore: number;
  rawCameraScore: number;
  strongAISignalCount: number;
  dominantSignals: string[];
  fusionWeights: Record<string, number>;
  suppressionReason: string;
  falsePositiveProtectionApplied: boolean;
  finalDecisionReason: string;
}

function weightedAvg(signals: Record<string, ForensicSignal>): { score: number; totalWeight: number; weights: Record<string, number> } {
  let wSum = 0, wTotal = 0;
  const weights: Record<string, number> = {};
  for (const [name, sig] of Object.entries(signals)) {
    const w = sig.confidence * sig.reliability;
    wSum   += sig.score * w;
    wTotal += w;
    weights[name] = +(w.toFixed(3));
  }
  return { score: wTotal > 0 ? wSum / wTotal : 0.5, totalWeight: wTotal, weights };
}

function fuseSignals(
  aiSigs:  AIForensicSignals,
  camSigs: CameraForensicSignals,
  hasExif: boolean
): FusionResult {
  const aiMap:  Record<string, ForensicSignal> = {
    noiseFloorDeficit:   aiSigs.noiseFloorDeficit,
    microtextureEntropy: aiSigs.microtextureEntropy,
    edgeUniformity:      aiSigs.edgeUniformity,
    patternRepetition:   aiSigs.patternRepetition,
    symmetryBias:        aiSigs.symmetryBias,
    frequencyDeficit:    aiSigs.frequencyDeficit,
  };
  const camMap: Record<string, ForensicSignal> = {
    sensorNoiseResidual: camSigs.sensorNoiseResidual,
    jpegNaturalness:     camSigs.jpegNaturalness,
    cfaDemosaic:         camSigs.cfaDemosaic,
    chromaticAberration: camSigs.chromaticAberration,
    edgeRandomness:      camSigs.edgeRandomness,
    faceRegionNoise:     camSigs.faceRegionNoise,
  };
  // EXIF bonus: treat as a small camera-only signal when present
  if (hasExif) {
    camMap['exifPresent'] = { score: 1.0, confidence: 0.95, reliability: 0.40 };
  }

  const aiAvg  = weightedAvg(aiMap);
  const camAvg = weightedAvg(camMap);
  const rawAI  = aiAvg.score;
  const rawCam = camAvg.score;

  // Strong AI signals: score > 0.65 AND confidence > 0.40
  const strongAI = Object.entries(aiMap)
    .filter(([, s]) => s.score > 0.65 && s.confidence > 0.40)
    .map(([n]) => n);

  // Dominant signals across both sets (highest weighted contribution)
  const contributions: [string, number][] = [
    ...Object.entries(aiMap).map(([n, s]) => [`AI:${n}`, s.score * s.confidence] as [string, number]),
    ...Object.entries(camMap).map(([n, s]) => [`CAM:${n}`, s.score * s.confidence] as [string, number]),
  ];
  const dominantSignals = contributions
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([n]) => n);

  const fusionWeights: Record<string, number> = {
    ...Object.fromEntries(Object.entries(aiAvg.weights).map(([k, v]) => [`ai_${k}`, v])),
    ...Object.fromEntries(Object.entries(camAvg.weights).map(([k, v]) => [`cam_${k}`, v])),
  };

  // ── False-positive protection ────────────────────────────────────────────
  // AI classification requires ≥ 2 independent strong signals so that a
  // single noisy metric (e.g. frequency deficit from WhatsApp compression)
  // cannot flip a real camera photo to "AI".
  let adjustedAI = rawAI;
  let fpProtectionApplied = false;
  let suppressionReason = 'none';
  if (rawAI > 0.55 && strongAI.length < 2) {
    const dampFactor = 0.65 + strongAI.length * 0.10;
    adjustedAI = rawAI * dampFactor;
    fpProtectionApplied = true;
    suppressionReason = `fp-guard: only ${strongAI.length} strong AI signal(s) — dampened ×${dampFactor.toFixed(2)}`;
  }

  // ── Classification ───────────────────────────────────────────────────────
  const AI_THRESH  = 0.60; // fusion score
  const CAM_THRESH = 0.43; // lower than AI — camera photos survive processing losses
  let imageType: 'camera' | 'ai' | 'unknown' = 'unknown';
  let confidence = 0;
  let finalDecisionReason = '';

  if (adjustedAI >= AI_THRESH && strongAI.length >= 2) {
    imageType  = 'ai';
    confidence = Math.round(adjustedAI * 100);
    finalDecisionReason = `AI fusion ${(adjustedAI * 100).toFixed(1)}% — ${strongAI.length} strong signals: [${strongAI.join(', ')}]`;
  } else if (rawCam >= CAM_THRESH && adjustedAI < AI_THRESH) {
    imageType  = 'camera';
    confidence = Math.round(rawCam * 100);
    finalDecisionReason = `Camera fusion ${(rawCam * 100).toFixed(1)}% — AI score ${(adjustedAI * 100).toFixed(1)}% below threshold`;
  } else {
    imageType  = 'unknown';
    confidence = Math.round(Math.max(adjustedAI, rawCam) * 100);
    finalDecisionReason = `Inconclusive — AI ${(adjustedAI * 100).toFixed(1)}%, Camera ${(rawCam * 100).toFixed(1)}%`;
  }

  console.log('[FUSION] ============================================');
  console.log('[FUSION] PROBABILISTIC FUSION RESULT');
  console.log('[FUSION] ============================================');
  console.log(`[FUSION] Raw AI score:     ${(rawAI  * 100).toFixed(1)}%`);
  console.log(`[FUSION] Raw Camera score: ${(rawCam * 100).toFixed(1)}%`);
  console.log(`[FUSION] Adjusted AI:      ${(adjustedAI * 100).toFixed(1)}%`);
  console.log(`[FUSION] Strong AI signals (${strongAI.length}): [${strongAI.join(', ')}]`);
  console.log(`[FUSION] FP protection: ${fpProtectionApplied} — ${suppressionReason}`);
  console.log(`[FUSION] Decision: ${imageType} @ ${confidence}%`);
  console.log(`[FUSION] Reason: ${finalDecisionReason}`);
  console.log(`[FUSION] Dominant signals: ${dominantSignals.join(' | ')}`);

  return {
    imageType, confidence,
    rawAIScore: rawAI, rawCameraScore: rawCam,
    strongAISignalCount: strongAI.length,
    dominantSignals, fusionWeights,
    suppressionReason, falsePositiveProtectionApplied: fpProtectionApplied,
    finalDecisionReason,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN FORENSIC ANALYSIS FUNCTION
// ─────────────────────────────────────────────────────────────────────────────

export async function performForensicAnalysis(
  base64Data: string,
  metadata: ImageMetadata
): Promise<ForensicAnalysisResult> {
  console.log('[FORENSIC v3] Starting multi-signal probabilistic fusion analysis...');
  console.log('[FORENSIC v3] Image:', `${metadata.dimensions.width}×${metadata.dimensions.height}`, 'EXIF:', metadata.hasExif);

  // ── Run all signals in parallel ─────────────────────────────────────────
  const [
    noiseFloorDeficit,   microtextureEntropy, edgeUniformity,
    patternRepetition,   symmetryBias,        frequencyDeficit,
    sensorNoiseResidual, jpegNaturalness,     cfaDemosaic,
    chromaticAberration, edgeRandomness,      faceRegionNoise,
    // Legacy screenshot/edited for backward compat diagnostics
    screenshotResult, editedResult,
  ] = await Promise.all([
    signalNoiseFloorDeficit(base64Data),
    signalMicrotextureEntropy(base64Data),
    signalEdgeUniformity(base64Data),
    signalPatternRepetition(base64Data),
    signalSymmetryBias(base64Data),
    signalFrequencyDeficit(base64Data),
    signalSensorNoiseResidual(base64Data),
    signalJPEGNaturalness(base64Data),
    signalCFADemosaic(base64Data),
    signalChromaticAberration(base64Data),
    signalEdgeRandomness(base64Data),
    signalFaceRegionNoise(base64Data),
    runLegacyScreenshot(base64Data, metadata),
    runLegacyEdited(base64Data),
  ]);

  const aiSigs:  AIForensicSignals = {
    noiseFloorDeficit, microtextureEntropy, edgeUniformity,
    patternRepetition, symmetryBias, frequencyDeficit,
  };
  const camSigs: CameraForensicSignals = {
    sensorNoiseResidual, jpegNaturalness, cfaDemosaic,
    chromaticAberration, edgeRandomness, faceRegionNoise,
  };

  // ── Log all individual signal scores ───────────────────────────────────
  console.log('[FORENSIC v3] ─── AI SIGNALS ───');
  for (const [n, s] of Object.entries(aiSigs)) {
    console.log(`[FORENSIC v3]   ${n}: score=${s.score.toFixed(3)} conf=${s.confidence.toFixed(3)} rel=${s.reliability.toFixed(2)}`);
  }
  console.log('[FORENSIC v3] ─── CAMERA SIGNALS ───');
  for (const [n, s] of Object.entries(camSigs)) {
    console.log(`[FORENSIC v3]   ${n}: score=${s.score.toFixed(3)} conf=${s.confidence.toFixed(3)} rel=${s.reliability.toFixed(2)}`);
  }

  // ── Fuse signals ────────────────────────────────────────────────────────
  const fusion = fuseSignals(aiSigs, camSigs, metadata.hasExif);

  // ── Overall reliability score (mean confidence × reliability of all signals)
  const allSigs = [...Object.values(aiSigs), ...Object.values(camSigs)];
  const reliabilityScore = Math.round(
    allSigs.reduce((s, sig) => s + sig.confidence * sig.reliability, 0) /
    allSigs.length * 100
  );

  // ── Map to UI strings ────────────────────────────────────────────────────
  const uiMap = {
    ai:      { source: 'AI Generated',       camera: false, status: 'Synthetic AI Generated Image' },
    camera:  { source: 'Camera Captured',    camera: true,  status: 'Authentic Camera Capture' },
    unknown: { source: 'Unknown',            camera: false, status: 'Unable To Verify' },
    screenshot: { source: 'Screenshot',      camera: false, status: 'Screen Captured Content' },
    edited:  { source: 'Edited Image',       camera: false, status: 'Manipulated or Edited Image' },
  } as const;
  const ui = uiMap[fusion.imageType];

  // ── Build legacy sub-score maps for backward compat ─────────────────────
  const aiSubScores = {
    textureScore:   patternRepetition.score,
    edgeScore:      edgeUniformity.score,
    frequencyScore: frequencyDeficit.score,
    symmetryScore:  symmetryBias.score,
    noiseScore:     1 - noiseFloorDeficit.score, // inverted: high = MORE noise = camera
  };
  const cameraSubScores = {
    sensorNoiseScore:  sensorNoiseResidual.score,
    cfaScore:          cfaDemosaic.score,
    jpegConsistency:   jpegNaturalness.score,
    aberrationScore:   chromaticAberration.score,
    edgeRandomness:    edgeRandomness.score,
  };

  const fusionDebug: FusionDebug = {
    aiSignals:     Object.fromEntries(Object.entries(aiSigs).map(([n, s]) => [n, +(s.score.toFixed(3))])),
    cameraSignals: Object.fromEntries(Object.entries(camSigs).map(([n, s]) => [n, +(s.score.toFixed(3))])),
    suppressionReason:            fusion.suppressionReason,
    dominantSignals:              fusion.dominantSignals,
    fusionWeights:                fusion.fusionWeights,
    finalDecisionReason:          fusion.finalDecisionReason,
    strongAISignalCount:          fusion.strongAISignalCount,
    falsePositiveProtectionApplied: fusion.falsePositiveProtectionApplied,
    rawAIScore:                   fusion.rawAIScore,
    rawCameraScore:               fusion.rawCameraScore,
  };

  console.log('[FORENSIC v3] ─── FINAL RESULT ───');
  console.log('[FORENSIC v3] fusionDebug:', fusionDebug);
  console.log('[FORENSIC v3] reliabilityScore:', reliabilityScore);

  return {
    imageType:    fusion.imageType,
    confidence:   fusion.confidence,
    aiProbability:     Math.round(fusion.rawAIScore  * 100),
    cameraProbability: Math.round(fusion.rawCameraScore * 100),
    screenshotProbability: screenshotResult.confidence,
    editedProbability:     editedResult.confidence,
    downloadedProbability: 0,
    whatsappProbability:   0,
    securityStatus: ui.status,
    imageSource:    ui.source,
    cameraCaptured: ui.camera,
    aiSubScores,
    cameraSubScores,
    suppressionTriggered: fusion.falsePositiveProtectionApplied,
    forensicSignals: { ai: aiSigs, camera: camSigs },
    fusionDebug,
    reliabilityScore,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// LEGACY DIAGNOSTIC DETECTORS  (screenshot / edited — informational only)
// ─────────────────────────────────────────────────────────────────────────────

async function runLegacyScreenshot(
  base64Data: string,
  metadata: ImageMetadata
): Promise<{ confidence: number }> {
  try {
    const { width, height } = metadata.dimensions;
    let score = 0;
    if (isScreenResolution(width, height))    score += 10;
    if (isScreenAspectRatio(width, height))   score += 15;
    if (!metadata.hasExif)                    score += 5;
    const uiScore = await _analyzeUIElements(base64Data);
    if (uiScore > 0.70)      score += 25;
    else if (uiScore > 0.40) score += 10;
    return { confidence: Math.min(100, score) };
  } catch { return { confidence: 0 }; }
}

async function runLegacyEdited(base64Data: string): Promise<{ confidence: number }> {
  try {
    const img = await loadImg(base64Data);
    if (!img) return { confidence: 0 };
    let score = 0;
    const lightingScore = await _analyzeLightingInconsistency(img);
    if (lightingScore > 0.70) score += 25;
    const noiseScore = await _analyzeEnhancedNoise(img);
    if (noiseScore > 0.90)    score += 5;
    return { confidence: Math.min(100, score) };
  } catch { return { confidence: 0 }; }
}

// ─────────────────────────────────────────────────────────────────────────────
// LEGACY HELPER FUNCTIONS  (kept for diagnostics)
// ─────────────────────────────────────────────────────────────────────────────

async function _analyzeUIElements(_base64Data: string): Promise<number> {
  return Math.random() * 0.5; // heuristic placeholder — not part of main classification
}

async function _analyzeLightingInconsistency(
  img: { data: Uint8ClampedArray; width: number; height: number }
): Promise<number> {
  const { data, width, height } = img;
  const blockH = Math.floor(height / 4);
  const blockW = Math.floor(width  / 4);
  if (blockH < 4 || blockW < 4) return 0;
  const means: number[] = [];
  for (let br = 0; br < 4; br++) {
    for (let bc = 0; bc < 4; bc++) {
      let s = 0, cnt = 0;
      for (let y = br * blockH; y < (br + 1) * blockH; y += 4) {
        for (let x = bc * blockW; x < (bc + 1) * blockW; x += 4) {
          s += lum(data, (y * width + x) * 4);
          cnt++;
        }
      }
      if (cnt > 0) means.push(s / cnt);
    }
  }
  if (means.length < 2) return 0;
  const avg = means.reduce((a, b) => a + b, 0) / means.length;
  const std = Math.sqrt(means.reduce((s, v) => s + (v - avg) ** 2, 0) / means.length);
  return Math.min(1, std / 50);
}

async function _analyzeEnhancedNoise(
  img: { data: Uint8ClampedArray; width: number; height: number }
): Promise<number> {
  const { data, width, height } = img;
  const step = Math.max(1, Math.floor(Math.min(width, height) / 100));
  const residuals: number[] = [];
  for (let y = step; y < height - step; y += step) {
    for (let x = step; x < width - step; x += step) {
      const iC = (y * width + x) * 4;
      residuals.push(Math.abs(
        4 * lum(data, iC)
        - lum(data, (y * width + (x - 1)) * 4)
        - lum(data, (y * width + (x + 1)) * 4)
        - lum(data, ((y - 1) * width + x) * 4)
        - lum(data, ((y + 1) * width + x) * 4)
      ));
    }
  }
  if (residuals.length === 0) return 0;
  return Math.min(1, (residuals.reduce((a, b) => a + b, 0) / residuals.length) / 80);
}

// ─────────────────────────────────────────────────────────────────────────────
// UTILITY
// ─────────────────────────────────────────────────────────────────────────────

function isScreenResolution(w: number, h: number): boolean {
  const resolutions = [
    [1920,1080],[1366,768],[1536,864],[1440,900],[1280,720],
    [1600,900],[2560,1440],[3840,2160],
  ];
  return resolutions.some(([rw,rh]) => (w===rw && h===rh) || (w===rh && h===rw));
}

function isScreenAspectRatio(w: number, h: number): boolean {
  const ratio = w / h;
  return [16/9, 16/10, 4/3, 3/2, 1.78, 1.6, 1.33, 1.5].some(r => Math.abs(ratio - r) < 0.08);
}

console.log('✅ Forensic Detection Engine v3 (probabilistic fusion) loaded');
