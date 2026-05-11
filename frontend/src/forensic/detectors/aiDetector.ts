/**
 * AI Generated Image Detector
 * Priority 3: Detects AI-generated images using forensic measurements
 */

import { AIDetectionResult, ForensicImage } from '../types';

export class AIDetector {
  /**
   * Detect if image is AI-generated
   * @param image Forensic image to analyze
   * @returns AI detection result
   */
  async detect(image: ForensicImage): Promise<AIDetectionResult> {
    try {
      console.log('[AI Detector] Starting AI generation detection...');
      
      const evidence: Record<string, any> = {};
      const reasoning: string[] = [];

      // Method 1: Oversmoothing detection
      const smoothingResult = await this.detectOversmoothing(image);
      evidence.oversmoothing = smoothingResult.level;
      evidence.smoothing_pattern = smoothingResult.pattern;
      if (smoothingResult.detected) {
        reasoning.push(`Oversmoothing detected: ${smoothingResult.pattern} (level: ${smoothingResult.level.toFixed(2)})`);
      }

      // Method 2: Diffusion texture artifacts
      const diffusionResult = await this.detectDiffusionArtifacts(image);
      evidence.diffusion_artifacts = diffusionResult.artifacts;
      evidence.diffusion_pattern = diffusionResult.pattern;
      if (diffusionResult.detected) {
        reasoning.push(`Diffusion artifacts detected: ${diffusionResult.pattern}`);
      }

      // Method 3: Repetitive patterns
      const patternResult = await this.analyzeRepetitivePatterns(image);
      evidence.repetitive_patterns = patternResult.patterns;
      evidence.pattern_regularity = patternResult.regularity;
      if (patternResult.detected) {
        reasoning.push(`Repetitive patterns detected: ${patternResult.patterns.length} patterns`);
      }

      // Method 4: Frequency spectrum anomalies
      const frequencyResult = await this.analyzeFrequencySpectrum(image);
      evidence.frequency_anomaly = frequencyResult.anomaly;
      evidence.spectrum_distribution = frequencyResult.distribution;
      if (frequencyResult.anomalous) {
        reasoning.push(`Frequency spectrum anomalies detected: ${frequencyResult.anomaly.toFixed(2)}`);
      }

      // Method 5: Unnatural symmetry
      const symmetryResult = await this.detectUnnaturalSymmetry(image);
      evidence.symmetry_score = symmetryResult.score;
      evidence.symmetry_pattern = symmetryResult.pattern;
      if (symmetryResult.detected) {
        reasoning.push(`Unnatural symmetry detected: ${symmetryResult.pattern}`);
      }

      // Method 6: Synthetic noise patterns
      const noiseResult = await this.analyzeSyntheticNoise(image);
      evidence.synthetic_noise = noiseResult.synthetic;
      evidence.noise_pattern = noiseResult.pattern;
      if (noiseResult.synthetic) {
        reasoning.push(`Synthetic noise patterns detected: ${noiseResult.pattern}`);
      }

      // Method 7: Edge inconsistency
      const edgeResult = await this.analyzeEdgeInconsistency(image);
      evidence.edge_inconsistency = edgeResult.inconsistent;
      evidence.edge_pattern = edgeResult.pattern;
      if (edgeResult.inconsistent) {
        reasoning.push(`Edge inconsistency detected: ${edgeResult.pattern}`);
      }

      const detected = this.evaluateAIGeneration(
        smoothingResult,
        diffusionResult,
        patternResult,
        frequencyResult,
        symmetryResult,
        noiseResult,
        edgeResult
      );

      const confidence = this.calculateConfidence(
        smoothingResult,
        diffusionResult,
        patternResult,
        frequencyResult,
        symmetryResult,
        noiseResult,
        edgeResult
      );

      console.log(`[AI Detector] Detection complete: ${detected ? 'AI_GENERATED' : 'NOT_AI'} (confidence: ${confidence})`);

      return {
        detected,
        confidence,
        evidence,
        reasoning,
        oversmoothing: smoothingResult.level,
        diffusion_artifacts: diffusionResult.detected,
        repetitive_patterns: patternResult.detected,
        frequency_anomaly: frequencyResult.anomaly,
        synthetic_noise: noiseResult.synthetic
      };

    } catch (error) {
      console.error('[AI Detector] Error:', error);
      return {
        detected: false,
        confidence: 0,
        evidence: {},
        reasoning: ['Detection failed due to error'],
        oversmoothing: 0,
        diffusion_artifacts: false,
        repetitive_patterns: false,
        frequency_anomaly: 0,
        synthetic_noise: false
      };
    }
  }

  /**
   * Detect oversmoothing common in AI-generated images
   */
  private async detectOversmoothing(image: ForensicImage): Promise<{detected: boolean, level: number, pattern: string}> {
    try {
      const img = new Image();
      
      return new Promise((resolve) => {
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          
          if (!ctx) {
            resolve({ detected: false, level: 0, pattern: 'error' });
            return;
          }

          canvas.width = img.width;
          canvas.height = img.height;
          ctx.drawImage(img, 0, 0);

          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const data = imageData.data;

          // Analyze local variance for oversmoothing
          const varianceAnalysis = this.analyzeLocalVariance(data);
          const smoothingLevel = this.calculateOversmoothingLevel(varianceAnalysis);
          const pattern = this.classifySmoothingPattern(varianceAnalysis);

          const detected = smoothingLevel > 0.3;
          resolve({ detected, level: smoothingLevel, pattern });
        };

        img.onerror = () => {
          resolve({ detected: false, level: 0, pattern: 'error' });
        };

        img.src = image.dataUrl;
      });
    } catch (error) {
      console.error('[AI Detector] Oversmoothing analysis error:', error);
      return { detected: false, level: 0, pattern: 'error' };
    }
  }

  /**
   * Analyze local variance for oversmoothing
   */
  private analyzeLocalVariance(data: Uint8ClampedArray): any {
    const blockSize = 8;
    const variances: number[] = [];
    
    for (let y = 0; y < data.length / (blockSize * 4); y++) {
      for (let x = 0; x < data.length / (blockSize * 4); x++) {
        // Calculate variance in 8x8 blocks
        const blockVariance = this.calculateBlockVariance(data, x, y, blockSize);
        variances.push(blockVariance);
      }
    }

    const avgVariance = variances.reduce((a, b) => a + b, 0) / variances.length;
    const varianceVariance = this.calculateVariance(variances);
    const uniformity = 1 / (1 + varianceVariance);

    return {
      averageVariance: avgVariance,
      varianceVariance,
      uniformity,
      distribution: this.classifyVarianceDistribution(variances)
    };
  }

  /**
   * Calculate oversmoothing level
   */
  private calculateOversmoothingLevel(varianceAnalysis: any): number {
    // AI-generated images often have unusually low variance
    const lowVariance = varianceAnalysis.averageVariance < 20;
    const highUniformity = varianceAnalysis.uniformity > 0.8;
    const uniformDistribution = varianceAnalysis.distribution === 'uniform';

    let score = 0;
    if (lowVariance) score += 0.4;
    if (highUniformity) score += 0.3;
    if (uniformDistribution) score += 0.3;

    return Math.min(score, 1.0);
  }

  /**
   * Classify smoothing pattern
   */
  private classifySmoothingPattern(varianceAnalysis: any): string {
    if (varianceAnalysis.uniformity > 0.9) {
      return 'highly_smoothed';
    } else if (varianceAnalysis.uniformity > 0.7) {
      return 'moderately_smoothed';
    } else if (varianceAnalysis.distribution === 'uniform') {
      return 'uniform_smoothing';
    } else {
      return 'natural_texture';
    }
  }

  /**
   * Detect diffusion texture artifacts
   */
  private async detectDiffusionArtifacts(image: ForensicImage): Promise<{detected: boolean, artifacts: any, pattern: string}> {
    try {
      const img = new Image();
      
      return new Promise((resolve) => {
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          
          if (!ctx) {
            resolve({ detected: false, artifacts: null, pattern: 'error' });
            return;
          }

          canvas.width = img.width;
          canvas.height = img.height;
          ctx.drawImage(img, 0, 0);

          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const data = imageData.data;

          // Analyze texture for diffusion artifacts
          const textureAnalysis = this.analyzeTexturePatterns(data);
          const artifactScore = this.calculateDiffusionArtifactScore(textureAnalysis);
          const pattern = this.classifyDiffusionPattern(textureAnalysis);

          const detected = artifactScore > 0.4;
          resolve({ 
            detected, 
            artifacts: textureAnalysis,
            pattern 
          });
        };

        img.onerror = () => {
          resolve({ detected: false, artifacts: null, pattern: 'error' });
        };

        img.src = image.dataUrl;
      });
    } catch (error) {
      console.error('[AI Detector] Diffusion artifacts analysis error:', error);
      return { detected: false, artifacts: null, pattern: 'error' };
    }
  }

  /**
   * Analyze texture patterns
   */
  private analyzeTexturePatterns(data: Uint8ClampedArray): any {
    // Look for patterns typical of diffusion models
    
    // Pattern 1: Watercolor-like blending
    const watercolorScore = this.detectWatercolorBlending(data);
    
    // Pattern 2: Uncanny valley artifacts
    const valleyScore = this.detectUncannyValleys(data);
    
    // Pattern 3: Over-smoothed gradients
    const gradientScore = this.detectOversmoothedGradients(data);
    
    // Pattern 4: Repeating texture elements
    const repeatingScore = this.detectRepeatingTextures(data);

    return {
      watercolorScore,
      valleyScore,
      gradientScore,
      repeatingScore,
      overallScore: (watercolorScore + valleyScore + gradientScore + repeatingScore) / 4
    };
  }

  /**
   * Detect watercolor-like blending
   */
  private detectWatercolorBlending(data: Uint8ClampedArray): number {
    let blendingScore = 0;
    let samples = 0;

    for (let i = 0; i < data.length - 8; i += 4) {
      // Check for soft, blended color transitions
      const r1 = data[i];
      const g1 = data[i + 1];
      const b1 = data[i + 2];
      
      const r2 = data[i + 4];
      const g2 = data[i + 5];
      const b2 = data[i + 6];

      // Calculate color difference
      const colorDiff = Math.abs(r1 - r2) + Math.abs(g1 - g2) + Math.abs(b1 - b2);
      
      // Watercolor effect has very smooth transitions
      if (colorDiff < 30) {
        blendingScore++;
      }
      samples++;
    }

    return samples > 0 ? blendingScore / samples : 0;
  }

  /**
   * Detect uncanny valley artifacts
   */
  private detectUncannyValleys(data: Uint8ClampedArray): number {
    let valleyScore = 0;
    let samples = 0;

    for (let i = 0; i < data.length - 12; i += 4) {
      // Check for unnatural color transitions
      const colors = [
        [data[i], data[i + 1], data[i + 2]],
        [data[i + 4], data[i + 5], data[i + 6]],
        [data[i + 8], data[i + 9], data[i + 10]]
      ];

      // Look for uncanny valley patterns
      if (this.hasUncannyValleyPattern(colors)) {
        valleyScore++;
      }
      samples++;
    }

    return samples > 0 ? valleyScore / samples : 0;
  }

  /**
   * Check for uncanny valley pattern
   */
  private hasUncannyValleyPattern(colors: number[][]): boolean {
    // Simplified pattern detection for uncanny valleys
    // Real diffusion models often create specific color transition patterns
    
    const centerColor = colors[1];
    const avgColor = [
      (colors[0][0] + colors[2][0]) / 2,
      (colors[0][1] + colors[2][1]) / 2,
      (colors[0][2] + colors[2][2]) / 2
    ];

    // Check if center color is unnaturally different
    const colorDistance = Math.sqrt(
      Math.pow(centerColor[0] - avgColor[0], 2) +
      Math.pow(centerColor[1] - avgColor[1], 2) +
      Math.pow(centerColor[2] - avgColor[2], 2)
    );

    return colorDistance > 50;
  }

  /**
   * Detect over-smoothed gradients
   */
  private detectOversmoothedGradients(data: Uint8ClampedArray): number {
    let gradientScore = 0;
    let samples = 0;

    for (let i = 0; i < data.length - 8; i += 4) {
      // Calculate gradient magnitude
      const r1 = data[i];
      const g1 = data[i + 1];
      const b1 = data[i + 2];
      
      const r2 = data[i + 4];
      const g2 = data[i + 5];
      const b2 = data[i + 6];

      const gradientMagnitude = Math.sqrt(
        Math.pow(r2 - r1, 2) + Math.pow(g2 - g1, 2) + Math.pow(b2 - b1, 2)
      );

      // AI images often have unnaturally smooth gradients
      if (gradientMagnitude < 20) {
        gradientScore++;
      }
      samples++;
    }

    return samples > 0 ? gradientScore / samples : 0;
  }

  /**
   * Detect repeating texture elements
   */
  private detectRepeatingTextures(data: Uint8ClampedArray): number {
    // Look for repeating patterns typical of AI generation
    const textureHashes: Map<string, number> = new Map();
    let repeatingScore = 0;
    let totalSamples = 0;

    for (let i = 0; i < data.length - 16; i += 8) {
      // Create texture signature for 8x8 block
      const signature = this.createTextureSignature(data, i);
      const signatureKey = signature.join(',');
      
      const count = textureHashes.get(signatureKey) || 0;
      textureHashes.set(signatureKey, count + 1);
      totalSamples++;
    }

    // Calculate repetition score
    for (const count of textureHashes.values()) {
      if (count > 2) {
        repeatingScore += count;
      }
    }

    return totalSamples > 0 ? Math.min(repeatingScore / totalSamples, 1.0) : 0;
  }

  /**
   * Create texture signature
   */
  private createTextureSignature(data: Uint8ClampedArray, offset: number): number[] {
    const signature: number[] = [];
    
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 8; j++) {
        const idx = (offset + i * 32 + j * 4) % data.length;
        signature.push(data[idx]);
      }
    }

    return signature;
  }

  /**
   * Calculate diffusion artifact score
   */
  private calculateDiffusionArtifactScore(textureAnalysis: any): number {
    let score = 0;

    if (textureAnalysis.watercolorScore > 0.3) score += 0.3;
    if (textureAnalysis.valleyScore > 0.2) score += 0.2;
    if (textureAnalysis.gradientScore > 0.4) score += 0.4;
    if (textureAnalysis.repeatingScore > 0.3) score += 0.3;

    return Math.min(score, 1.0);
  }

  /**
   * Classify diffusion pattern
   */
  private classifyDiffusionPattern(textureAnalysis: any): string {
    if (textureAnalysis.overallScore > 0.7) {
      return 'high_diffusion_artifacts';
    } else if (textureAnalysis.watercolorScore > 0.5) {
      return 'watercolor_blending';
    } else if (textureAnalysis.valleyScore > 0.3) {
      return 'uncanny_valleys';
    } else {
      return 'minimal_artifacts';
    }
  }

  /**
   * Analyze repetitive patterns
   */
  private async analyzeRepetitivePatterns(image: ForensicImage): Promise<{detected: boolean, patterns: string[], regularity: number}> {
    try {
      const img = new Image();
      
      return new Promise((resolve) => {
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          
          if (!ctx) {
            resolve({ detected: false, patterns: [], regularity: 0 });
            return;
          }

          canvas.width = img.width;
          canvas.height = img.height;
          ctx.drawImage(img, 0, 0);

          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const data = imageData.data;

          // Analyze for repetitive patterns
          const patternAnalysis = this.performPatternAnalysis(data);
          const regularity = this.calculatePatternRegularity(patternAnalysis);

          const detected = regularity > 0.3;
          resolve({ 
            detected, 
            patterns: patternAnalysis.patterns,
            regularity 
          });
        };

        img.onerror = () => {
          resolve({ detected: false, patterns: [], regularity: 0 });
        };

        img.src = image.dataUrl;
      });
    } catch (error) {
      console.error('[AI Detector] Pattern analysis error:', error);
      return { detected: false, patterns: [], regularity: 0 };
    }
  }

  /**
   * Perform pattern analysis
   */
  private performPatternAnalysis(data: Uint8ClampedArray): any {
    const patterns: string[] = [];
    
    // Pattern 1: Geometric repetition
    const geometricPatterns = this.detectGeometricRepetition(data);
    if (geometricPatterns.length > 0) {
      patterns.push(...geometricPatterns);
    }

    // Pattern 2: Color palette repetition
    const colorPatterns = this.detectColorPaletteRepetition(data);
    if (colorPatterns.length > 0) {
      patterns.push(...colorPatterns);
    }

    // Pattern 3: Structural repetition
    const structuralPatterns = this.detectStructuralRepetition(data);
    if (structuralPatterns.length > 0) {
      patterns.push(...structuralPatterns);
    }

    return {
      patterns,
      geometricCount: geometricPatterns.length,
      colorCount: colorPatterns.length,
      structuralCount: structuralPatterns.length
    };
  }

  /**
   * Detect geometric repetition
   */
  private detectGeometricRepetition(data: Uint8ClampedArray): string[] {
    const patterns: string[] = [];
    
    // Look for repeating geometric shapes
    const shapeHashes: Map<string, number> = new Map();
    
    for (let i = 0; i < data.length - 64; i += 16) {
      const shapeSignature = this.createShapeSignature(data, i);
      const signatureKey = shapeSignature.join(',');
      
      const count = shapeHashes.get(signatureKey) || 0;
      shapeHashes.set(signatureKey, count + 1);
      
      if (count > 2) {
        patterns.push('geometric_repetition');
      }
    }

    return patterns;
  }

  /**
   * Create shape signature
   */
  private createShapeSignature(data: Uint8ClampedArray, offset: number): number[] {
    const signature: number[] = [];
    
    // Sample 4x4 block for shape analysis
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        const idx = (offset + i * 16 + j * 4) % data.length;
        signature.push(data[idx]);
      }
    }

    return signature;
  }

  /**
   * Detect color palette repetition
   */
  private detectColorPaletteRepetition(data: Uint8ClampedArray): string[] {
    const patterns: string[] = [];
    const colorPalette: Map<string, number> = new Map();
    
    // Sample colors throughout the image
    for (let i = 0; i < data.length; i += 40) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      
      // Quantize color to reduce palette
      const quantized = this.quantizeColor(r, g, b);
      const colorKey = quantized.join(',');
      
      const count = colorPalette.get(colorKey) || 0;
      colorPalette.set(colorKey, count + 1);
    }

    // Check for limited color palette (AI characteristic)
    const uniqueColors = colorPalette.size;
    if (uniqueColors < 64) {
      patterns.push('limited_color_palette');
    }

    return patterns;
  }

  /**
   * Quantize color
   */
  private quantizeColor(r: number, g: number, b: number): number[] {
    const levels = 4; // 4 levels per channel
    const step = 256 / levels;
    
    return [
      Math.floor(r / step) * step,
      Math.floor(g / step) * step,
      Math.floor(b / step) * step
    ];
  }

  /**
   * Detect structural repetition
   */
  private detectStructuralRepetition(data: Uint8ClampedArray): string[] {
    const patterns: string[] = [];
    
    // Look for repeating structural elements
    const structureHashes: Map<string, number> = new Map();
    
    for (let i = 0; i < data.length - 32; i += 8) {
      const structureSignature = this.createStructureSignature(data, i);
      const signatureKey = structureSignature.join(',');
      
      const count = structureHashes.get(signatureKey) || 0;
      structureHashes.set(signatureKey, count + 1);
      
      if (count > 3) {
        patterns.push('structural_repetition');
      }
    }

    return patterns;
  }

  /**
   * Create structure signature
   */
  private createStructureSignature(data: Uint8ClampedArray, offset: number): number[] {
    const signature: number[] = [];
    
    // Create 2x4 structure signature
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 4; j++) {
        const idx = (offset + i * 16 + j * 4) % data.length;
        signature.push(data[idx]);
      }
    }

    return signature;
  }

  /**
   * Calculate pattern regularity
   */
  private calculatePatternRegularity(patternAnalysis: any): number {
    const totalPatterns = patternAnalysis.patterns.length;
    const patternTypes = new Set(patternAnalysis.patterns);
    
    // High regularity if many patterns of same type
    if (totalPatterns > 5 && patternTypes.size < 3) {
      return 0.8;
    } else if (totalPatterns > 3) {
      return 0.5;
    } else if (totalPatterns > 0) {
      return 0.3;
    } else {
      return 0;
    }
  }

  /**
   * Analyze frequency spectrum
   */
  private async analyzeFrequencySpectrum(image: ForensicImage): Promise<{anomalous: boolean, anomaly: number, distribution: any}> {
    try {
      const img = new Image();
      
      return new Promise((resolve) => {
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          
          if (!ctx) {
            resolve({ anomalous: false, anomaly: 0, distribution: null });
            return;
          }

          canvas.width = img.width;
          canvas.height = img.height;
          ctx.drawImage(img, 0, 0);

          // Convert to grayscale for frequency analysis
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const grayData = this.convertToGrayscale(imageData.data);

          // Perform frequency analysis
          const frequencyAnalysis = this.performFrequencyAnalysis(grayData);
          const anomaly = this.calculateFrequencyAnomaly(frequencyAnalysis);
          const distribution = this.classifyFrequencyDistribution(frequencyAnalysis);

          const anomalous = anomaly > 0.3;
          resolve({ anomalous, anomaly, distribution });
        };

        img.onerror = () => {
          resolve({ anomalous: false, anomaly: 0, distribution: null });
        };

        img.src = image.dataUrl;
      });
    } catch (error) {
      console.error('[AI Detector] Frequency analysis error:', error);
      return { anomalous: false, anomaly: 0, distribution: null };
    }
  }

  /**
   * Perform frequency analysis
   */
  private performFrequencyAnalysis(grayData: Uint8ClampedArray): any {
    // Simple frequency domain analysis
    const frequencies: number[] = [];
    
    // Calculate frequency components
    for (let i = 1; i < grayData.length - 1; i++) {
      const diff = Math.abs(grayData[i] - grayData[i - 1]);
      frequencies.push(diff);
    }

    // Analyze frequency distribution
    const avgFrequency = frequencies.reduce((a, b) => a + b, 0) / frequencies.length;
    const frequencyVariance = this.calculateVariance(frequencies);
    
    // Calculate frequency spectrum characteristics
    const lowFreqPower = this.calculateBandPower(frequencies, 0, 10);
    const midFreqPower = this.calculateBandPower(frequencies, 10, 50);
    const highFreqPower = this.calculateBandPower(frequencies, 50, 128);

    return {
      averageFrequency: avgFrequency,
      frequencyVariance,
      lowFreqPower,
      midFreqPower,
      highFreqPower,
      spectrumBalance: this.calculateSpectrumBalance(lowFreqPower, midFreqPower, highFreqPower)
    };
  }

  /**
   * Calculate power in frequency band
   */
  private calculateBandPower(frequencies: number[], minFreq: number, maxFreq: number): number {
    const bandFrequencies = frequencies.filter((_, index) => index >= minFreq && index < maxFreq);
    return bandFrequencies.reduce((power, freq) => power + freq * freq, 0) / (bandFrequencies.length || 1);
  }

  /**
   * Calculate spectrum balance
   */
  private calculateSpectrumBalance(low: number, mid: number, high: number): string {
    const total = low + mid + high;
    const lowRatio = low / total;
    const midRatio = mid / total;
    const highRatio = high / total;

    if (lowRatio > 0.6) {
      return 'low_frequency_dominant';
    } else if (highRatio > 0.5) {
      return 'high_frequency_dominant';
    } else if (midRatio > 0.4) {
      return 'mid_frequency_dominant';
    } else if (Math.abs(lowRatio - highRatio) < 0.2) {
      return 'balanced_spectrum';
    } else {
      return 'irregular_spectrum';
    }
  }

  /**
   * Calculate frequency anomaly
   */
  private calculateFrequencyAnomaly(frequencyAnalysis: any): number {
    // AI-generated images often have unusual frequency characteristics
    const hasLowVariance = frequencyAnalysis.frequencyVariance < 100;
    const hasIrregularBalance = frequencyAnalysis.spectrumBalance === 'irregular_spectrum';
    const hasHighLowFreq = frequencyAnalysis.lowFreqPower > frequencyAnalysis.highFreqPower * 2;

    let anomaly = 0;
    if (hasLowVariance) anomaly += 0.3;
    if (hasIrregularBalance) anomaly += 0.4;
    if (hasHighLowFreq) anomaly += 0.3;

    return Math.min(anomaly, 1.0);
  }

  /**
   * Classify frequency distribution
   */
  private classifyFrequencyDistribution(frequencyAnalysis: any): any {
    return {
      type: frequencyAnalysis.spectrumBalance,
      lowFreqRatio: frequencyAnalysis.lowFreqPower / (frequencyAnalysis.lowFreqPower + frequencyAnalysis.highFreqPower),
      highFreqRatio: frequencyAnalysis.highFreqPower / (frequencyAnalysis.lowFreqPower + frequencyAnalysis.highFreqPower),
      variance: frequencyAnalysis.frequencyVariance
    };
  }

  /**
   * Detect unnatural symmetry
   */
  private async detectUnnaturalSymmetry(image: ForensicImage): Promise<{detected: boolean, score: number, pattern: string}> {
    try {
      const img = new Image();
      
      return new Promise((resolve) => {
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          
          if (!ctx) {
            resolve({ detected: false, score: 0, pattern: 'error' });
            return;
          }

          canvas.width = img.width;
          canvas.height = img.height;
          ctx.drawImage(img, 0, 0);

          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const data = imageData.data;

          // Analyze symmetry
          const symmetryAnalysis = this.performSymmetryAnalysis(data, canvas.width, canvas.height);
          const symmetryScore = this.calculateSymmetryScore(symmetryAnalysis);
          const pattern = this.classifySymmetryPattern(symmetryAnalysis);

          const detected = symmetryScore > 0.4;
          resolve({ detected, score: symmetryScore, pattern });
        };

        img.onerror = () => {
          resolve({ detected: false, score: 0, pattern: 'error' });
        };

        img.src = image.dataUrl;
      });
    } catch (error) {
      console.error('[AI Detector] Symmetry analysis error:', error);
      return { detected: false, score: 0, pattern: 'error' };
    }
  }

  /**
   * Perform symmetry analysis
   */
  private performSymmetryAnalysis(data: Uint8ClampedArray, width: number, height: number): any {
    // Analyze horizontal and vertical symmetry
    const horizontalSymmetry = this.analyzeHorizontalSymmetry(data, width, height);
    const verticalSymmetry = this.analyzeVerticalSymmetry(data, width, height);
    const diagonalSymmetry = this.analyzeDiagonalSymmetry(data, width, height);

    return {
      horizontalSymmetry,
      verticalSymmetry,
      diagonalSymmetry,
      overallSymmetry: (horizontalSymmetry + verticalSymmetry + diagonalSymmetry) / 3
    };
  }

  /**
   * Analyze horizontal symmetry
   */
  private analyzeHorizontalSymmetry(data: Uint8ClampedArray, width: number, height: number): number {
    let symmetryScore = 0;
    let comparisons = 0;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width / 2; x++) {
        const leftIdx = (y * width + x) * 4;
        const rightIdx = (y * width + (width - 1 - x)) * 4;
        
        if (leftIdx + 3 < data.length && rightIdx + 3 < data.length) {
          const leftPixel = [data[leftIdx], data[leftIdx + 1], data[leftIdx + 2]];
          const rightPixel = [data[rightIdx], data[rightIdx + 1], data[rightIdx + 2]];
          
          const similarity = this.calculatePixelSimilarity(leftPixel, rightPixel);
          symmetryScore += similarity;
          comparisons++;
        }
      }
    }

    return comparisons > 0 ? symmetryScore / comparisons : 0;
  }

  /**
   * Analyze vertical symmetry
   */
  private analyzeVerticalSymmetry(data: Uint8ClampedArray, width: number, height: number): number {
    let symmetryScore = 0;
    let comparisons = 0;

    for (let y = 0; y < height / 2; y++) {
      for (let x = 0; x < width; x++) {
        const topIdx = (y * width + x) * 4;
        const bottomIdx = ((height - 1 - y) * width + x) * 4;
        
        if (topIdx + 3 < data.length && bottomIdx + 3 < data.length) {
          const topPixel = [data[topIdx], data[topIdx + 1], data[topIdx + 2]];
          const bottomPixel = [data[bottomIdx], data[bottomIdx + 1], data[bottomIdx + 2]];
          
          const similarity = this.calculatePixelSimilarity(topPixel, bottomPixel);
          symmetryScore += similarity;
          comparisons++;
        }
      }
    }

    return comparisons > 0 ? symmetryScore / comparisons : 0;
  }

  /**
   * Analyze diagonal symmetry
   */
  private analyzeDiagonalSymmetry(data: Uint8ClampedArray, width: number, height: number): number {
    let symmetryScore = 0;
    let comparisons = 0;

    for (let y = 0; y < height / 2; y++) {
      for (let x = 0; x < width / 2; x++) {
        const tlIdx = (y * width + x) * 4;
        const brIdx = ((height - 1 - y) * width + (width - 1 - x)) * 4;
        
        if (tlIdx + 3 < data.length && brIdx + 3 < data.length) {
          const tlPixel = [data[tlIdx], data[tlIdx + 1], data[tlIdx + 2]];
          const brPixel = [data[brIdx], data[brIdx + 1], data[brIdx + 2]];
          
          const similarity = this.calculatePixelSimilarity(tlPixel, brPixel);
          symmetryScore += similarity;
          comparisons++;
        }
      }
    }

    return comparisons > 0 ? symmetryScore / comparisons : 0;
  }

  /**
   * Calculate pixel similarity
   */
  private calculatePixelSimilarity(pixel1: number[], pixel2: number[]): number {
    const diff = Math.abs(pixel1[0] - pixel2[0]) + 
                 Math.abs(pixel1[1] - pixel2[1]) + 
                 Math.abs(pixel1[2] - pixel2[2]);
    return 1 - (diff / (255 * 3)); // Normalize to 0-1
  }

  /**
   * Calculate symmetry score
   */
  private calculateSymmetryScore(symmetryAnalysis: any): number {
    // AI-generated images often have unnatural symmetry
    const avgSymmetry = symmetryAnalysis.overallSymmetry;
    const hasHighSymmetry = avgSymmetry > 0.8;
    const hasUniformSymmetry = Math.abs(symmetryAnalysis.horizontalSymmetry - symmetryAnalysis.verticalSymmetry) < 0.1;

    let score = 0;
    if (hasHighSymmetry) score += 0.4;
    if (hasUniformSymmetry) score += 0.3;
    if (avgSymmetry > 0.6) score += 0.3;

    return Math.min(score, 1.0);
  }

  /**
   * Classify symmetry pattern
   */
  private classifySymmetryPattern(symmetryAnalysis: any): string {
    if (symmetryAnalysis.overallSymmetry > 0.9) {
      return 'perfect_symmetry';
    } else if (symmetryAnalysis.overallSymmetry > 0.7) {
      return 'high_symmetry';
    } else if (symmetryAnalysis.overallSymmetry > 0.5) {
      return 'moderate_symmetry';
    } else {
      return 'natural_asymmetry';
    }
  }

  /**
   * Analyze synthetic noise
   */
  private async analyzeSyntheticNoise(image: ForensicImage): Promise<{synthetic: boolean, pattern: string}> {
    try {
      const img = new Image();
      
      return new Promise((resolve) => {
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          
          if (!ctx) {
            resolve({ synthetic: false, pattern: 'error' });
            return;
          }

          canvas.width = img.width;
          canvas.height = img.height;
          ctx.drawImage(img, 0, 0);

          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const data = imageData.data;

          // Analyze noise characteristics
          const noiseAnalysis = this.analyzeNoiseCharacteristics(data);
          const synthetic = this.isSyntheticNoise(noiseAnalysis);
          const pattern = this.classifyNoiseCharacteristics(noiseAnalysis.noiseLevels);

          resolve({ synthetic, pattern });
        };

        img.onerror = () => {
          resolve({ synthetic: false, pattern: 'error' });
        };

        img.src = image.dataUrl;
      });
    } catch (error) {
      console.error('[AI Detector] Synthetic noise analysis error:', error);
      return { synthetic: false, pattern: 'error' };
    }
  }

  /**
   * Analyze noise characteristics
   */
  private analyzeNoiseCharacteristics(data: Uint8ClampedArray): any {
    // Convert to grayscale for noise analysis
    const grayData = this.convertToGrayscale(data);
    
    // Calculate noise statistics
    const noiseLevels: number[] = [];
    
    for (let i = 1; i < grayData.length - 1; i++) {
      const noise = Math.abs(grayData[i] - grayData[i - 1]);
      noiseLevels.push(noise);
    }

    const avgNoise = noiseLevels.reduce((a, b) => a + b, 0) / noiseLevels.length;
    const noiseVariance = this.calculateVariance(noiseLevels);
    const noiseDistribution = this.analyzeNoiseDistribution(noiseLevels);

    return {
      averageNoise: avgNoise,
      noiseVariance,
      distribution: noiseDistribution,
      pattern: this.classifyNoiseCharacteristics(noiseLevels)
    };
  }

  /**
   * Determine if noise is synthetic
   */
  private isSyntheticNoise(noiseAnalysis: any): boolean {
    // Synthetic noise has specific characteristics
    const hasLowVariance = noiseAnalysis.noiseVariance < 50;
    const hasUniformDistribution = noiseAnalysis.distribution === 'uniform';
    const hasRegularPattern = noiseAnalysis.pattern === 'regular_synthetic';

    return hasLowVariance && (hasUniformDistribution || hasRegularPattern);
  }

  /**
   * Classify noise pattern
   */
  private classifyNoiseCharacteristics(noiseLevels: number[]): string {
    const variance = this.calculateVariance(noiseLevels);
    
    if (variance < 20) {
      return 'uniform_synthetic';
    } else if (variance > 200) {
      return 'natural_sensor';
    } else if (this.hasRegularPattern(noiseLevels)) {
      return 'regular_synthetic';
    } else {
      return 'irregular_natural';
    }
  }

  /**
   * Check for regular pattern in noise
   */
  private hasRegularPattern(noiseLevels: number[]): boolean {
    // Simple check for regular repeating pattern
    const pattern = noiseLevels.slice(0, 10);
    let repetitions = 0;

    for (let i = 10; i < noiseLevels.length; i++) {
      const match = noiseLevels[i] === pattern[i % 10];
      if (match) repetitions++;
    }

    return repetitions / (noiseLevels.length - 10) > 0.7;
  }

  /**
   * Analyze edge inconsistency
   */
  private async analyzeEdgeInconsistency(image: ForensicImage): Promise<{inconsistent: boolean, pattern: string}> {
    try {
      const img = new Image();
      
      return new Promise((resolve) => {
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          
          if (!ctx) {
            resolve({ inconsistent: false, pattern: 'error' });
            return;
          }

          canvas.width = img.width;
          canvas.height = img.height;
          ctx.drawImage(img, 0, 0);

          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const data = imageData.data;

          // Analyze edge consistency
          const edgeAnalysis = this.analyzeEdgeConsistency(data);
          const inconsistent = this.hasInconsistentEdges(edgeAnalysis);
          const pattern = this.classifyEdgePattern(edgeAnalysis);

          resolve({ inconsistent, pattern });
        };

        img.onerror = () => {
          resolve({ inconsistent: false, pattern: 'error' });
        };

        img.src = image.dataUrl;
      });
    } catch (error) {
      console.error('[AI Detector] Edge inconsistency analysis error:', error);
      return { inconsistent: false, pattern: 'error' };
    }
  }

  /**
   * Analyze edge consistency
   */
  private analyzeEdgeConsistency(data: Uint8ClampedArray): any {
    // Convert to grayscale for edge detection
    const grayData = this.convertToGrayscale(data);
    
    // Detect edges using simple gradient
    const edges = this.detectSimpleEdges(grayData);
    
    // Analyze edge strength and direction consistency
    const edgeStrengths = edges.filter(edge => edge > 0).map(edge => edge);
    const avgStrength = edgeStrengths.reduce((a, b) => a + b, 0) / (edgeStrengths.length || 1);
    const strengthVariance = this.calculateVariance(edgeStrengths);

    return {
      edgeDensity: edges.filter(edge => edge > 0).length / edges.length,
      averageStrength: avgStrength,
      strengthVariance,
      distribution: this.classifyEdgeDistribution(edgeStrengths)
    };
  }

  /**
   * Detect simple edges
   */
  private detectSimpleEdges(grayData: Uint8ClampedArray): number[] {
    const edges: number[] = [];
    
    for (let i = 1; i < grayData.length - 1; i++) {
      const diff = Math.abs(grayData[i] - grayData[i - 1]);
      edges.push(diff > 30 ? diff : 0);
    }
    
    return edges;
  }

  /**
   * Classify edge distribution
   */
  private classifyEdgeDistribution(edgeStrengths: number[]): string {
    const variance = this.calculateVariance(edgeStrengths);
    const mean = edgeStrengths.reduce((a, b) => a + b, 0) / (edgeStrengths.length || 1);
    
    if (variance < mean * 0.2) {
      return 'uniform_edges';
    } else if (variance > mean * 2) {
      return 'inconsistent_edges';
    } else {
      return 'natural_edge_variation';
    }
  }

  /**
   * Check for inconsistent edges
   */
  private hasInconsistentEdges(edgeAnalysis: any): boolean {
    // AI-generated images often have inconsistent edge patterns
    const hasUniformEdges = edgeAnalysis.distribution === 'uniform_edges';
    const hasLowVariance = edgeAnalysis.strengthVariance < 100;
    const hasLowDensity = edgeAnalysis.edgeDensity < 0.1;

    return hasUniformEdges && hasLowVariance && hasLowDensity;
  }

  /**
   * Classify edge pattern
   */
  private classifyEdgePattern(edgeAnalysis: any): string {
    if (edgeAnalysis.distribution === 'uniform_edges') {
      return 'synthetic_edge_uniformity';
    } else if (edgeAnalysis.strengthVariance < 50) {
      return 'low_edge_variance';
    } else if (edgeAnalysis.edgeDensity < 0.05) {
      return 'sparse_edges';
    } else {
      return 'natural_edge_variation';
    }
  }

  /**
   * Evaluate AI generation based on all detection methods
   */
  private evaluateAIGeneration(
    smoothingResult: any,
    diffusionResult: any,
    patternResult: any,
    frequencyResult: any,
    symmetryResult: any,
    noiseResult: any,
    edgeResult: any
  ): boolean {
    // Weighted evaluation of AI generation evidence
    let evidenceScore = 0;
    let totalWeight = 0;

    // Oversmoothing (strong evidence)
    if (smoothingResult.detected) {
      evidenceScore += 3 * 0.8;
      totalWeight += 3;
    }

    // Diffusion artifacts (strong evidence)
    if (diffusionResult.detected) {
      evidenceScore += 3 * 0.7;
      totalWeight += 3;
    }

    // Repetitive patterns (moderate evidence)
    if (patternResult.detected) {
      evidenceScore += 2 * 0.6;
      totalWeight += 2;
    }

    // Frequency anomalies (moderate evidence)
    if (frequencyResult.anomalous) {
      evidenceScore += 2 * 0.5;
      totalWeight += 2;
    }

    // Unnatural symmetry (moderate evidence)
    if (symmetryResult.detected) {
      evidenceScore += 1.5 * 0.6;
      totalWeight += 1.5;
    }

    // Synthetic noise (moderate evidence)
    if (noiseResult.synthetic) {
      evidenceScore += 1.5 * 0.5;
      totalWeight += 1.5;
    }

    // Edge inconsistency (weak evidence)
    if (edgeResult.inconsistent) {
      evidenceScore += 1 * 0.4;
      totalWeight += 1;
    }

    const finalScore = totalWeight > 0 ? evidenceScore / totalWeight : 0;
    return finalScore > 0.4;
  }

  /**
   * Calculate confidence based on all detection methods
   */
  private calculateConfidence(
    smoothingResult: any,
    diffusionResult: any,
    patternResult: any,
    frequencyResult: any,
    symmetryResult: any,
    noiseResult: any,
    edgeResult: any
  ): number {
    let confidence = 0;
    let methods = 0;

    if (smoothingResult.detected) {
      confidence += 0.20;
      methods++;
    }
    if (diffusionResult.detected) {
      confidence += 0.20;
      methods++;
    }
    if (patternResult.detected) {
      confidence += 0.15;
      methods++;
    }
    if (frequencyResult.anomalous) {
      confidence += 0.15;
      methods++;
    }
    if (symmetryResult.detected) {
      confidence += 0.10;
      methods++;
    }
    if (noiseResult.synthetic) {
      confidence += 0.10;
      methods++;
    }
    if (edgeResult.inconsistent) {
      confidence += 0.10;
      methods++;
    }

    return methods > 0 ? confidence : 0;
  }

  /**
   * Helper: Convert to grayscale
   */
  private convertToGrayscale(data: Uint8ClampedArray): Uint8ClampedArray {
    const grayData = new Uint8ClampedArray(data.length / 4);
    
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
      grayData[i / 4] = gray;
    }
    
    return grayData;
  }

  /**
   * Helper: Calculate variance
   */
  private calculateVariance(values: number[]): number {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    return values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
  }

  /**
   * Helper: Analyze noise distribution
   */
  private analyzeNoiseDistribution(noiseLevels: number[]): string {
    const variance = this.calculateVariance(noiseLevels);
    
    if (variance < 30) {
      return 'uniform';
    } else if (variance > 150) {
      return 'natural_varied';
    } else {
      return 'semi_uniform';
    }
  }

  /**
   * Helper: Calculate block variance
   */
  private calculateBlockVariance(data: Uint8ClampedArray, blockX: number, blockY: number, blockSize: number): number {
    const blockValues: number[] = [];
    
    for (let y = 0; y < blockSize; y++) {
      for (let x = 0; x < blockSize; x++) {
        const idx = ((blockY + y) * Math.sqrt(data.length / 4) + (blockX + x)) * 4;
        if (idx < data.length) {
          blockValues.push(data[idx]);
        }
      }
    }

    return this.calculateVariance(blockValues);
  }

  /**
   * Helper: Classify variance distribution
   */
  private classifyVarianceDistribution(variances: number[]): string {
    const variance = this.calculateVariance(variances);
    const mean = variances.reduce((a, b) => a + b, 0) / variances.length;
    
    if (variance < mean * 0.3) {
      return 'uniform';
    } else if (variance > mean * 2) {
      return 'high_variance';
    } else {
      return 'mixed_variance';
    }
  }
}
