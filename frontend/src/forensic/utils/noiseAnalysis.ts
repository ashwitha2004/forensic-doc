/**
 * Noise Analysis Utilities
 * Advanced noise analysis for forensic detection
 */

export class NoiseAnalyzer {
  /**
   * Analyze noise characteristics
   */
  static analyzeNoise(data: Uint8ClampedArray, width: number, height: number): {
    level: number,
    pattern: string,
    distribution: string,
    characteristics: {
      variance: number,
      mean: number,
      entropy: number,
      uniformity: number
    }
  } {
    // Convert to grayscale for noise analysis
    const grayData = this.convertToGrayscale(data);
    
    // Calculate basic noise statistics
    const noiseStats = this.calculateNoiseStatistics(grayData);
    
    // Analyze noise pattern
    const noisePattern = this.analyzeNoisePattern(grayData, width, height);
    
    // Analyze noise distribution
    const noiseDistribution = this.analyzeNoiseDistribution(grayData);
    
    // Calculate noise characteristics
    const characteristics = {
      variance: noiseStats.variance,
      mean: noiseStats.mean,
      entropy: this.calculateNoiseEntropy(grayData),
      uniformity: this.calculateNoiseUniformity(grayData)
    };
    
    return {
      level: noiseStats.level,
      pattern: noisePattern,
      distribution: noiseDistribution,
      characteristics
    };
  }

  /**
   * Calculate noise statistics
   */
  private static calculateNoiseStatistics(data: Uint8ClampedArray): {
    level: number,
    variance: number,
    mean: number
  } {
    // Calculate local noise levels
    const blockSize = 8;
    const noiseLevels: number[] = [];
    
    for (let y = 0; y < data.length / blockSize - blockSize; y += blockSize) {
      for (let x = 0; x < Math.sqrt(data.length) - blockSize; x += blockSize) {
        const blockNoise = this.calculateBlockNoise(data, x, y, Math.sqrt(data.length));
        noiseLevels.push(blockNoise);
      }
    }

    const meanNoise = noiseLevels.reduce((a, b) => a + b, 0) / noiseLevels.length;
    const variance = this.calculateVariance(noiseLevels);
    const level = meanNoise;

    return { level, variance, mean: meanNoise };
  }

  /**
   * Calculate block noise
   */
  private static calculateBlockNoise(data: Uint8ClampedArray, x: number, y: number, width: number): number {
    const blockSize = 8;
    let totalVariance = 0;
    let samples = 0;

    for (let dy = 0; dy < blockSize; dy++) {
      for (let dx = 0; dx < blockSize; dx++) {
        const idx = (y + dy) * width + (x + dx);
        
        if (idx + 4 < data.length) {
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];
          
          const mean = (r + g + b) / 3;
          const variance = ((r - mean) ** 2 + (g - mean) ** 2 + (b - mean) ** 2) / 3;
          totalVariance += variance;
          samples++;
        }
      }
    }

    return samples > 0 ? Math.sqrt(totalVariance / samples) : 0;
  }

  /**
   * Analyze noise pattern
   */
  private static analyzeNoisePattern(data: Uint8ClampedArray, width: number, height: number): string {
    // Look for patterns in noise
    const spatialCorrelation = this.calculateSpatialCorrelation(data, width, height);
    const temporalConsistency = this.calculateTemporalConsistency(data);
    const frequencyCharacteristics = this.analyzeNoiseFrequency(data);

    // Classify noise pattern
    if (spatialCorrelation > 0.8) {
      return 'structured_noise';
    } else if (frequencyCharacteristics.highFrequency > 0.7) {
      return 'high_frequency_noise';
    } else if (temporalConsistency > 0.9) {
      return 'uniform_noise';
    } else if (spatialCorrelation < 0.3) {
      return 'random_noise';
    } else {
      return 'natural_sensor_noise';
    }
  }

  /**
   * Calculate spatial correlation
   */
  private static calculateSpatialCorrelation(data: Uint8ClampedArray, width: number, height: number): number {
    let correlation = 0;
    let samples = 0;

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        
        if (idx + width + 1 < data.length && idx - width - 1 >= 0) {
          const center = data[idx];
          const neighbors = [
            data[idx - 1], data[idx + 1],
            data[idx - width], data[idx + width],
            data[idx - width - 1], data[idx - width + 1],
            data[idx + width - 1], data[idx + width + 1]
          ];
          
          const avgNeighbor = neighbors.reduce((a, b) => a + b, 0) / neighbors.length;
          const correlation = 1 - Math.abs(center - avgNeighbor) / 255;
          
          correlation += correlation;
          samples++;
        }
      }
    }

    return samples > 0 ? correlation / samples : 0;
  }

  /**
   * Calculate temporal consistency
   */
  private static calculateTemporalConsistency(data: Uint8ClampedArray): number {
    // Analyze noise consistency across the image
    const blockSize = 16;
    const noiseLevels: number[] = [];

    for (let i = 0; i < data.length; i += blockSize) {
      if (i + blockSize <= data.length) {
        const block = data.slice(i, i + blockSize);
        const blockNoise = this.calculateBlockNoiseLevel(block);
        noiseLevels.push(blockNoise);
      }
    }

    const meanNoise = noiseLevels.reduce((a, b) => a + b, 0) / noiseLevels.length;
    const variance = this.calculateVariance(noiseLevels);
    
    // High consistency means low variance
    return 1 - (variance / (meanNoise * meanNoise + 1));
  }

  /**
   * Calculate block noise level
   */
  private static calculateBlockNoiseLevel(block: Uint8ClampedArray): number {
    if (block.length < 4) return 0;
    
    let totalVariance = 0;
    let samples = 0;

    for (let i = 0; i < block.length; i += 4) {
      const r = block[i];
      const g = block[i + 1];
      const b = block[i + 2];
      
      const mean = (r + g + b) / 3;
      const variance = ((r - mean) ** 2 + (g - mean) ** 2 + (b - mean) ** 2) / 3;
      totalVariance += variance;
      samples++;
    }

    return samples > 0 ? Math.sqrt(totalVariance / samples) : 0;
  }

  /**
   * Analyze noise frequency
   */
  private static analyzeNoiseFrequency(data: Uint8ClampedArray): {
    highFrequency: number,
    lowFrequency: number,
    midFrequency: number
  } {
    // Simple frequency analysis of noise
    const frequencies: number[] = [];
    
    for (let i = 1; i < data.length; i++) {
      const diff = Math.abs(data[i] - data[i - 1]);
      frequencies.push(diff);
    }

    // Analyze frequency distribution
    const avgFreq = frequencies.reduce((a, b) => a + b, 0) / frequencies.length;
    const highFreq = frequencies.filter(f => f > avgFreq * 1.5).length / frequencies.length;
    const lowFreq = frequencies.filter(f => f < avgFreq * 0.5).length / frequencies.length;
    const midFreq = 1 - highFreq - lowFreq;

    return { highFrequency: highFreq, lowFrequency: lowFreq, midFrequency: midFreq };
  }

  /**
   * Analyze noise distribution
   */
  private static analyzeNoiseDistribution(data: Uint8ClampedArray): string {
    // Analyze how noise is distributed
    const histogram = this.calculateNoiseHistogram(data);
    const entropy = this.calculateHistogramEntropy(histogram);
    const skewness = this.calculateNoiseSkewness(data);

    // Classify distribution
    if (entropy < 3) {
      return 'uniform_distribution';
    } else if (skewness > 0.5) {
      return 'skewed_distribution';
    } else if (skewness < -0.5) {
      return 'reverse_skewed_distribution';
    } else {
      return 'gaussian_distribution';
    }
  }

  /**
   * Calculate noise histogram
   */
  private static calculateNoiseHistogram(data: Uint8ClampedArray): number[] {
    const histogram = new Array(256).fill(0);
    
    for (let i = 0; i < data.length; i++) {
      histogram[data[i]]++;
    }

    return histogram;
  }

  /**
   * Calculate histogram entropy
   */
  private static calculateHistogramEntropy(histogram: number[]): number {
    const total = histogram.reduce((a, b) => a + b, 0);
    if (total === 0) return 0;

    let entropy = 0;
    for (let i = 0; i < histogram.length; i++) {
      if (histogram[i] > 0) {
        const probability = histogram[i] / total;
        entropy -= probability * Math.log2(probability);
      }
    }

    return entropy;
  }

  /**
   * Calculate noise skewness
   */
  private static calculateNoiseSkewness(data: Uint8ClampedArray): number {
    const mean = data.reduce((a, b) => a + b, 0) / data.length;
    const variance = this.calculateVariance(Array.from(data));
    const stdDev = Math.sqrt(variance);

    if (stdDev === 0) return 0;

    let skewness = 0;
    for (let i = 0; i < data.length; i++) {
      const deviation = (data[i] - mean) / stdDev;
      skewness += Math.pow(deviation, 3);
    }

    return skewness / data.length;
  }

  /**
   * Calculate noise entropy
   */
  private static calculateNoiseEntropy(data: Uint8ClampedArray): number {
    const histogram = this.calculateNoiseHistogram(data);
    return this.calculateHistogramEntropy(histogram);
  }

  /**
   * Calculate noise uniformity
   */
  private static calculateNoiseUniformity(data: Uint8ClampedArray): number {
    const blockSize = 8;
    const noiseLevels: number[] = [];

    for (let i = 0; i < data.length; i += blockSize) {
      if (i + blockSize <= data.length) {
        const block = data.slice(i, i + blockSize);
        const blockNoise = this.calculateBlockNoiseLevel(block);
        noiseLevels.push(blockNoise);
      }
    }

    const meanNoise = noiseLevels.reduce((a, b) => a + b, 0) / noiseLevels.length;
    const variance = this.calculateVariance(noiseLevels);
    
    // High uniformity means low variance
    return 1 - (variance / (meanNoise * meanNoise + 1));
  }

  /**
   * Detect synthetic noise
   */
  static detectSyntheticNoise(data: Uint8ClampedArray, width: number, height: number): {
    isSynthetic: boolean,
    confidence: number,
    syntheticType: string
  } {
    const noiseAnalysis = this.analyzeNoise(data, width, height);
    
    // Check for synthetic noise characteristics
    const hasUniformPattern = noiseAnalysis.pattern === 'uniform_noise';
    const hasStructuredPattern = noiseAnalysis.pattern === 'structured_noise';
    const hasLowEntropy = noiseAnalysis.characteristics.entropy < 3;
    const hasHighUniformity = noiseAnalysis.characteristics.uniformity > 0.8;
    const hasLowVariance = noiseAnalysis.characteristics.variance < 50;

    let confidence = 0;
    let syntheticType = 'unknown';

    if (hasUniformPattern) {
      confidence += 0.3;
      syntheticType = 'uniform_synthetic';
    }

    if (hasStructuredPattern) {
      confidence += 0.3;
      syntheticType = 'structured_synthetic';
    }

    if (hasLowEntropy) {
      confidence += 0.2;
      syntheticType = 'low_entropy_synthetic';
    }

    if (hasHighUniformity) {
      confidence += 0.1;
    }

    if (hasLowVariance) {
      confidence += 0.1;
    }

    const isSynthetic = confidence > 0.4;

    return {
      isSynthetic,
      confidence,
      syntheticType
    };
  }

  /**
   * Detect natural sensor noise
   */
  static detectNaturalSensorNoise(data: Uint8ClampedArray, width: number, height: number): {
    isNatural: boolean,
    confidence: number,
    noiseType: string
  } {
    const noiseAnalysis = this.analyzeNoise(data, width, height);
    
    // Check for natural sensor noise characteristics
    const hasGaussianDistribution = noiseAnalysis.distribution === 'gaussian_distribution';
    const hasNaturalPattern = noiseAnalysis.pattern === 'natural_sensor_noise';
    const hasModerateEntropy = noiseAnalysis.characteristics.entropy > 3 && noiseAnalysis.characteristics.entropy < 7;
    const hasModerateVariance = noiseAnalysis.characteristics.variance > 50 && noiseAnalysis.characteristics.variance < 200;
    const hasModerateUniformity = noiseAnalysis.characteristics.uniformity > 0.3 && noiseAnalysis.characteristics.uniformity < 0.8;

    let confidence = 0;
    let noiseType = 'unknown';

    if (hasGaussianDistribution) {
      confidence += 0.3;
      noiseType = 'gaussian_sensor_noise';
    }

    if (hasNaturalPattern) {
      confidence += 0.3;
      noiseType = 'natural_sensor_noise';
    }

    if (hasModerateEntropy) {
      confidence += 0.2;
    }

    if (hasModerateVariance) {
      confidence += 0.1;
    }

    if (hasModerateUniformity) {
      confidence += 0.1;
    }

    const isNatural = confidence > 0.4;

    return {
      isNatural,
      confidence,
      noiseType
    };
  }

  /**
   * Analyze noise color characteristics
   */
  static analyzeNoiseColorCharacteristics(data: Uint8ClampedArray): {
    colorNoise: {
      red: number,
      green: number,
      blue: number
    },
    colorCorrelation: number,
    colorBalance: string
  } {
    // Separate color channels
    const redChannel: number[] = [];
    const greenChannel: number[] = [];
    const blueChannel: number[] = [];

    for (let i = 0; i < data.length; i += 4) {
      redChannel.push(data[i]);
      greenChannel.push(data[i + 1]);
      blueChannel.push(data[i + 2]);
    }

    // Calculate noise for each channel
    const redNoise = this.calculateChannelNoise(redChannel);
    const greenNoise = this.calculateChannelNoise(greenChannel);
    const blueNoise = this.calculateChannelNoise(blueChannel);

    // Calculate color correlation
    const colorCorrelation = this.calculateColorChannelCorrelation(redChannel, greenChannel, blueChannel);

    // Analyze color balance
    const colorBalance = this.analyzeColorBalance(redNoise, greenNoise, blueNoise);

    return {
      colorNoise: {
        red: redNoise,
        green: greenNoise,
        blue: blueNoise
      },
      colorCorrelation,
      colorBalance
    };
  }

  /**
   * Calculate channel noise
   */
  private static calculateChannelNoise(channel: number[]): number {
    const blockSize = 8;
    const noiseLevels: number[] = [];

    for (let i = 0; i < channel.length; i += blockSize) {
      if (i + blockSize <= channel.length) {
        const block = channel.slice(i, i + blockSize);
        const blockNoise = this.calculateBlockNoiseLevel(block);
        noiseLevels.push(blockNoise);
      }
    }

    return noiseLevels.reduce((a, b) => a + b, 0) / noiseLevels.length;
  }

  /**
   * Calculate color channel correlation
   */
  private static calculateColorChannelCorrelation(red: number[], green: number[], blue: number[]): number {
    let correlation = 0;
    let samples = 0;

    for (let i = 0; i < Math.min(red.length, green.length, blue.length); i++) {
      const redMean = red.reduce((a, b) => a + b, 0) / red.length;
      const greenMean = green.reduce((a, b) => a + b, 0) / green.length;
      const blueMean = blue.reduce((a, b) => a + b, 0) / blue.length;

      const redDev = red[i] - redMean;
      const greenDev = green[i] - greenMean;
      const blueDev = blue[i] - blueMean;

      // Calculate correlation between channels
      const rgCorrelation = Math.abs(redDev * greenDev);
      const rbCorrelation = Math.abs(redDev * blueDev);
      const gbCorrelation = Math.abs(greenDev * blueDev);

      correlation += (rgCorrelation + rbCorrelation + gbCorrelation) / 3;
      samples++;
    }

    return samples > 0 ? correlation / samples : 0;
  }

  /**
   * Analyze color balance
   */
  private static analyzeColorBalance(redNoise: number, greenNoise: number, blueNoise: number): string {
    const avgNoise = (redNoise + greenNoise + blueNoise) / 3;
    const redRatio = redNoise / avgNoise;
    const greenRatio = greenNoise / avgNoise;
    const blueRatio = blueNoise / avgNoise;

    const maxRatio = Math.max(redRatio, greenRatio, blueRatio);
    const minRatio = Math.min(redRatio, greenRatio, blueRatio);

    if (maxRatio - minRatio > 0.5) {
      return 'unbalanced';
    } else if (maxRatio - minRatio > 0.2) {
      return 'slightly_unbalanced';
    } else {
      return 'balanced';
    }
  }

  /**
   * Convert to grayscale
   */
  private static convertToGrayscale(data: Uint8ClampedArray): Uint8ClampedArray {
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
   * Calculate variance
   */
  private static calculateVariance(values: number[]): number {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    return values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
  }
}
