/**
 * Image Forensics & Classification Analysis
 * Detect AI-generated, cropped, authentic images with detailed metrics
 */

export interface ForensicsMetrics {
  variance: number;
  noiseLevel: number;
  smoothBlockRatio: number;
  edgeCoherence: number;
  uniformityRatio: number;
  entropy: number;
  compressionRatio: number;
  aspectRatio: number;
  channelCorrelation: number;
}

export interface ClassificationResult {
  detectedCase: string;
  confidence: number;
  reasoning: string[];
  metrics: ForensicsMetrics;
  isAuthentic: boolean;
  isCropped: boolean;
  isAIGenerated: boolean;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

// ─── Compute image metrics ──
export const analyzeImageMetrics = (canvas: HTMLCanvasElement): ForensicsMetrics => {
  const ctx = canvas.getContext('2d');
  if (!ctx) return createDefaultMetrics();

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const width = canvas.width;
  const height = canvas.height;

  // 1. Variance & Noise
  let sum = 0,
    sumSq = 0,
    pixelCount = 0;
  const stride = Math.max(1, Math.floor(data.length / 20000));
  for (let i = 0; i < data.length; i += stride * 4) {
    const val = data[i]; // R channel
    sum += val;
    sumSq += val * val;
    pixelCount++;
  }
  const mean = sum / pixelCount;
  const variance = sumSq / pixelCount - mean * mean;
  const noiseLevel = Math.sqrt(variance) / 128; // Normalized 0-2

  // 2. Channel correlation
  let rrCorr = 0,
    ggCorr = 0,
    bbCorr = 0,
    rgCorr = 0,
    rbCorr = 0,
    gbCorr = 0;
  const samplingStride = Math.max(1, Math.floor(data.length / 5000));
  for (let i = 0; i < data.length; i += samplingStride * 4) {
    const r = data[i],
      g = data[i + 1],
      b = data[i + 2];
    rrCorr += r * r;
    ggCorr += g * g;
    bbCorr += b * b;
    rgCorr += r * g;
    rbCorr += r * b;
    gbCorr += g * b;
  }
  const channelCorrelation = (rgCorr + rbCorr + gbCorr) / (rrCorr + ggCorr + bbCorr + 0.001);

  // 3. Uniformity ratio (LBP)
  let uniformPatterns = 0,
    nonUniformPatterns = 0;
  for (let y = 2; y < Math.min(height - 2, 100); y += 2) {
    for (let x = 2; x < Math.min(width - 2, 100); x += 2) {
      const center = data[(y * width + x) * 4];
      const neighbors = [
        data[((y - 1) * width + (x - 1)) * 4],
        data[((y - 1) * width + x) * 4],
        data[((y - 1) * width + (x + 1)) * 4],
        data[(y * width + (x + 1)) * 4],
        data[((y + 1) * width + (x + 1)) * 4],
        data[((y + 1) * width + x) * 4],
        data[((y + 1) * width + (x - 1)) * 4],
        data[(y * width + (x - 1)) * 4],
      ];
      let transitions = 0;
      for (let i = 0; i < 8; i++) {
        if ((neighbors[i] > center) !== (neighbors[(i + 1) % 8] > center)) transitions++;
      }
      if (transitions <= 2) uniformPatterns++;
      else nonUniformPatterns++;
    }
  }
  const uniformityRatio = uniformPatterns / (uniformPatterns + nonUniformPatterns + 0.001);

  // 4. Smooth block ratio
  let highFreqEnergy = 0,
    lowFreqEnergy = 0;
  for (let y = 0; y < Math.min(height - 4, 200); y += 4) {
    for (let x = 0; x < Math.min(width - 4, 200); x += 4) {
      let blockSum = 0;
      for (let dy = 0; dy < 4; dy++)
        for (let dx = 0; dx < 4; dx++) blockSum += data[((y + dy) * width + (x + dx)) * 4];
      const blockMean = blockSum / 16;
      let blockVariance = 0;
      for (let dy = 0; dy < 4; dy++)
        for (let dx = 0; dx < 4; dx++)
          blockVariance += Math.pow(data[((y + dy) * width + (x + dx)) * 4] - blockMean, 2);
      if (blockVariance < 100) lowFreqEnergy++;
      else highFreqEnergy++;
    }
  }
  const smoothBlockRatio = lowFreqEnergy / (lowFreqEnergy + highFreqEnergy + 0.001);

  // 5. Edge coherence
  let coherentEdges = 0,
    totalEdges = 0;
  const edgeStride = width * 4;
  for (let y = 2; y < height - 2; y += 2) {
    for (let x = 2; x < width - 2; x += 2) {
      const idx = (y * width + x) * 4;
      const gx = Math.abs(data[idx + 4] - data[idx - 4]);
      const gy = Math.abs(data[idx + edgeStride] - data[idx - edgeStride]);
      const mag = Math.sqrt(gx * gx + gy * gy);
      if (mag > 20) {
        totalEdges++;
        const gx2 = Math.abs(data[idx + 8] - data[idx]);
        const gy2 = Math.abs(data[idx + edgeStride * 2] - data[idx]);
        const mag2 = Math.sqrt(gx2 * gx2 + gy2 * gy2);
        if (Math.abs(mag - mag2) < 10) coherentEdges++;
      }
    }
  }
  const edgeCoherence = totalEdges > 0 ? coherentEdges / totalEdges : 0;

  // 6. Entropy
  const histogram = new Array(256).fill(0);
  for (let i = 0; i < data.length; i += 4) histogram[data[i]]++;
  let entropy = 0;
  for (const count of histogram) {
    if (count > 0) {
      const p = count / (data.length / 4);
      entropy -= p * Math.log2(p);
    }
  }
  const avgEntropy = entropy / 8; // Normalized to 0-1

  // 7. Compression ratio (simulated via data uniqueness)
  let uniqueValues = new Set();
  for (let i = 0; i < data.length; i += stride * 4) uniqueValues.add(data[i]);
  const compressionRatio = uniqueValues.size / 256;

  // 8. Aspect ratio
  const aspectRatio = width / height;

  return {
    variance: Math.min(variance, 10000),
    noiseLevel: Math.min(noiseLevel, 2),
    smoothBlockRatio: smoothBlockRatio,
    edgeCoherence: edgeCoherence,
    uniformityRatio: uniformityRatio,
    entropy: avgEntropy,
    compressionRatio: compressionRatio,
    aspectRatio: aspectRatio,
    channelCorrelation: channelCorrelation,
  };
};

// ─── Classify image based on metrics ──
export const classifyImage = (
  canvas: HTMLCanvasElement,
  fileName: string,
  metrics: ForensicsMetrics
): ClassificationResult => {
  const reasoning: string[] = [];
  let authenticScore = 0;
  let aiScore = 0;
  let croppedScore = 0;

  // AI Detection: High uniformity + low noise = synthetic
  if (metrics.uniformityRatio > 0.7 && metrics.noiseLevel < 0.3) {
    aiScore += 40;
    reasoning.push('High uniformity + low noise suggests AI generation');
  }

  // AI Detection: Perfect channel correlation = synthetic
  if (metrics.channelCorrelation > 0.95) {
    aiScore += 30;
    reasoning.push('Perfect channel correlation detected (AI indicators)');
  }

  // AI Detection: Smooth blocks (DCT patterns)
  if (metrics.smoothBlockRatio > 0.8) {
    aiScore += 25;
    reasoning.push('Excessive smooth blocks (compression artifacts)');
  }

  // Authentic: Normal noise level + edge coherence
  if (metrics.noiseLevel > 0.4 && metrics.noiseLevel < 1.2 && metrics.edgeCoherence > 0.6) {
    authenticScore += 50;
    reasoning.push('Natural noise pattern + coherent edges detected');
  }

  // Authentic: Diverse pixel distribution
  if (metrics.entropy > 6.5) {
    authenticScore += 30;
    reasoning.push('High entropy indicates natural image content');
  }

  // Cropped Detection: Abnormal aspect ratio
  if (Math.abs(metrics.aspectRatio - 1.33) > 0.5 && Math.abs(metrics.aspectRatio - 1.77) > 0.5) {
    croppedScore += 40;
    reasoning.push(`Unusual aspect ratio (${metrics.aspectRatio.toFixed(2)}) suggests cropping`);
  }

  // Cropped Detection: Edge patterns at borders
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let borderEdges = 0;
    // Check top/bottom borders
    for (let x = 10; x < canvas.width - 10; x++) {
      const top = imageData.data[(10 * canvas.width + x) * 4];
      const bottom = imageData.data[((canvas.height - 10) * canvas.width + x) * 4];
      const topChange = Math.abs(top - imageData.data[(11 * canvas.width + x) * 4]);
      const bottomChange = Math.abs(bottom - imageData.data[((canvas.height - 11) * canvas.width + x) * 4]);
      if (topChange > 50 || bottomChange > 50) borderEdges++;
    }
    if (borderEdges > canvas.width * 0.3) {
      croppedScore += 30;
      reasoning.push('Edge artifacts detected at boundaries');
    }
  }

  // Determine primary classification
  const scores = [
    { type: 'Authentic', score: authenticScore },
    { type: 'AI Generated', score: aiScore },
    { type: 'Cropped/Modified', score: croppedScore },
  ];
  const primary = scores.reduce((a, b) => (a.score > b.score ? a : b));

  // Risk assessment
  let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';
  if (primary.type === 'AI Generated') {
    riskLevel = aiScore > 70 ? 'critical' : aiScore > 50 ? 'high' : 'medium';
  } else if (primary.type === 'Cropped/Modified') {
    riskLevel = croppedScore > 70 ? 'high' : 'medium';
  }

  return {
    detectedCase: primary.type,
    confidence: Math.min(100, primary.score),
    reasoning,
    metrics,
    isAuthentic: primary.type === 'Authentic',
    isCropped: primary.type === 'Cropped/Modified',
    isAIGenerated: primary.type === 'AI Generated',
    riskLevel,
  };
};

const createDefaultMetrics = (): ForensicsMetrics => ({
  variance: 0,
  noiseLevel: 0,
  smoothBlockRatio: 0,
  edgeCoherence: 0,
  uniformityRatio: 0,
  entropy: 0,
  compressionRatio: 0,
  aspectRatio: 0,
  channelCorrelation: 0,
});
