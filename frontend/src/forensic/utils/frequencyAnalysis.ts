/**
 * Frequency Analysis Utilities
 * Advanced frequency domain analysis for forensic detection
 */

export class FrequencyAnalyzer {
  /**
   * Perform 2D FFT (simplified approximation)
   */
  static performFFT(data: Uint8ClampedArray, width: number, height: number): { real: number[], imag: number[] } {
    const size = Math.max(width, height);
    const real = new Array(size * size).fill(0);
    const imag = new Array(size * size).fill(0);
    
    // Pad data to square
    const paddedData = new Array(size * size).fill(0);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        paddedData[y * size + x] = data[y * width + x];
      }
    }
    
    // Simplified 2D FFT using row-column method
    for (let y = 0; y < size; y++) {
      const rowData = paddedData.slice(y * size, (y + 1) * size);
      const fftRow = this.perform1DFFT(rowData);
      
      for (let x = 0; x < size; x++) {
        real[y * size + x] = fftRow[x].real;
        imag[y * size + x] = fftRow[x].imag;
      }
    }
    
    for (let x = 0; x < size; x++) {
      const colReal: number[] = [];
      const colImag: number[] = [];
      
      for (let y = 0; y < size; y++) {
        colReal.push(real[y * size + x]);
        colImag.push(imag[y * size + x]);
      }
      
      const fftCol = this.perform1DFFT(colReal.map((r, i) => ({ real: r, imag: colImag[i] })));
      
      for (let y = 0; y < size; y++) {
        real[y * size + x] = fftCol[y].real;
        imag[y * size + x] = fftCol[y].imag;
      }
    }
    
    return { real, imag };
  }

  /**
   * Perform 1D FFT (simplified)
   */
  private static perform1DFFT(data: { real: number, imag: number }[]): { real: number, imag: number }[] {
    const N = data.length;
    if (N <= 1) return data;
    
    // Simplified FFT using DFT
    const result: { real: number, imag: number }[] = [];
    
    for (let k = 0; k < N; k++) {
      let realSum = 0;
      let imagSum = 0;
      
      for (let n = 0; n < N; n++) {
        const angle = -2 * Math.PI * k * n / N;
        realSum += data[n].real * Math.cos(angle) - data[n].imag * Math.sin(angle);
        imagSum += data[n].real * Math.sin(angle) + data[n].imag * Math.cos(angle);
      }
      
      result.push({ real: realSum, imag: imagSum });
    }
    
    return result;
  }

  /**
   * Calculate power spectrum
   */
  static calculatePowerSpectrum(real: number[], imag: number[]): number[] {
    const power = new Array(real.length);
    
    for (let i = 0; i < real.length; i++) {
      power[i] = real[i] * real[i] + imag[i] * imag[i];
    }
    
    return power;
  }

  /**
   * Analyze frequency bands
   */
  static analyzeFrequencyBands(power: number[], size: number): { 
    lowFreq: number, 
    midFreq: number, 
    highFreq: number,
    distribution: string 
  } {
    const center = Math.floor(size / 2);
    let lowFreqPower = 0;
    let midFreqPower = 0;
    let highFreqPower = 0;
    
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = y * size + x;
        const dy = y - center;
        const dx = x - center;
        const distance = Math.sqrt(dy * dy + dx * dx);
        const normalizedDistance = distance / center;
        
        if (normalizedDistance < 0.2) {
          lowFreqPower += power[idx];
        } else if (normalizedDistance < 0.5) {
          midFreqPower += power[idx];
        } else {
          highFreqPower += power[idx];
        }
      }
    }
    
    const totalPower = lowFreqPower + midFreqPower + highFreqPower;
    const lowFreqRatio = totalPower > 0 ? lowFreqPower / totalPower : 0;
    const midFreqRatio = totalPower > 0 ? midFreqPower / totalPower : 0;
    const highFreqRatio = totalPower > 0 ? highFreqPower / totalPower : 0;
    
    let distribution = 'balanced';
    if (lowFreqRatio > 0.6) distribution = 'low_dominant';
    else if (highFreqRatio > 0.6) distribution = 'high_dominant';
    else if (midFreqRatio > 0.6) distribution = 'mid_dominant';
    
    return {
      lowFreq: lowFreqRatio,
      midFreq: midFreqRatio,
      highFreq: highFreqRatio,
      distribution
    };
  }

  /**
   * Detect frequency anomalies
   */
  static detectFrequencyAnomalies(power: number[], size: number): {
    hasAnomalies: boolean,
    anomalyScore: number,
    anomalyType: string
  } {
    const center = Math.floor(size / 2);
    const anomalies: number[] = [];
    
    for (let y = 1; y < size - 1; y++) {
      for (let x = 1; x < size - 1; x++) {
        const idx = y * size + x;
        const current = power[idx];
        
        // Check neighbors
        const neighbors = [
          power[(y - 1) * size + x],
          power[(y + 1) * size + x],
          power[y * size + (x - 1)],
          power[y * size + (x + 1)]
        ];
        
        const avgNeighbor = neighbors.reduce((a, b) => a + b, 0) / neighbors.length;
        const ratio = current / (avgNeighbor + 1);
        
        // Significant deviation from neighbors
        if (ratio > 3 || ratio < 0.33) {
          anomalies.push(ratio);
        }
      }
    }
    
    const anomalyScore = anomalies.length / (size * size);
    const hasAnomalies = anomalyScore > 0.01;
    
    let anomalyType = 'none';
    if (hasAnomalies) {
      const avgRatio = anomalies.reduce((a, b) => a + b, 0) / anomalies.length;
      if (avgRatio > 1.5) anomalyType = 'spikes';
      else if (avgRatio < 0.67) anomalyType = 'gaps';
      else anomalyType = 'mixed';
    }
    
    return {
      hasAnomalies,
      anomalyScore,
      anomalyType
    };
  }

  /**
   * Analyze spectral entropy
   */
  static calculateSpectralEntropy(power: number[]): number {
    // Normalize power spectrum
    const totalPower = power.reduce((a, b) => a + b, 0);
    if (totalPower === 0) return 0;
    
    const normalizedPower = power.map(p => p / totalPower);
    
    // Calculate entropy
    let entropy = 0;
    for (const p of normalizedPower) {
      if (p > 0) {
        entropy -= p * Math.log2(p);
      }
    }
    
    return entropy;
  }

  /**
   * Detect periodic patterns
   */
  static detectPeriodicPatterns(power: number[], size: number): {
    hasPeriodicity: boolean,
    dominantFrequencies: number[],
    periodicityScore: number
  } {
    const center = Math.floor(size / 2);
    const peaks: { frequency: number, power: number }[] = [];
    
    // Find peaks in power spectrum
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = y * size + x;
        const dy = y - center;
        const dx = x - center;
        const frequency = Math.sqrt(dy * dy + dx * dx);
        
        if (frequency > 0) {
          const isPeak = this.isLocalPeak(power, idx, x, y, size);
          if (isPeak) {
            peaks.push({ frequency, power: power[idx] });
          }
        }
      }
    }
    
    // Sort peaks by power
    peaks.sort((a, b) => b.power - a.power);
    
    // Calculate periodicity score
    const topPeaks = peaks.slice(0, 5);
    const avgPeakPower = topPeaks.reduce((sum, p) => sum + p.power, 0) / (topPeaks.length || 1);
    const totalPower = power.reduce((sum, p) => sum + p, 0);
    const periodicityScore = avgPeakPower / (totalPower / (size * size));
    
    const hasPeriodicity = periodicityScore > 0.1;
    const dominantFrequencies = topPeaks.map(p => p.frequency);
    
    return {
      hasPeriodicity,
      dominantFrequencies,
      periodicityScore
    };
  }

  /**
   * Check if position is local peak
   */
  private static isLocalPeak(power: number[], idx: number, x: number, y: number, size: number): boolean {
    const current = power[idx];
    const threshold = current * 0.8;
    
    // Check 8 neighbors
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dy === 0 && dx === 0) continue;
        
        const nx = x + dx;
        const ny = y + dy;
        
        if (nx >= 0 && nx < size && ny >= 0 && ny < size) {
          const nidx = ny * size + nx;
          if (power[nidx] > current) {
            return false;
          }
        }
      }
    }
    
    return current > threshold;
  }

  /**
   * Analyze phase coherence
   */
  static analyzePhaseCoherence(real: number[], imag: number[], size: number): {
    coherence: number,
    phaseVariance: number,
    coherencePattern: string
  } {
    const center = Math.floor(size / 2);
    const phases: number[] = [];
    
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = y * size + x;
        const dy = y - center;
        const dx = x - center;
        const distance = Math.sqrt(dy * dy + dx * dx);
        
        // Skip DC component and very high frequencies
        if (distance > 1 && distance < center * 0.8) {
          const phase = Math.atan2(imag[idx], real[idx]);
          phases.push(phase);
        }
      }
    }
    
    // Calculate phase variance
    const meanPhase = phases.reduce((sum, p) => sum + p, 0) / phases.length;
    const phaseVariance = phases.reduce((sum, p) => sum + Math.pow(p - meanPhase, 2), 0) / phases.length;
    
    // Calculate coherence (inverse of variance)
    const coherence = 1 / (1 + phaseVariance);
    
    let coherencePattern = 'random';
    if (coherence > 0.8) coherencePattern = 'high_coherence';
    else if (coherence > 0.5) coherencePattern = 'moderate_coherence';
    else if (coherence > 0.2) coherencePattern = 'low_coherence';
    
    return {
      coherence,
      phaseVariance,
      coherencePattern
    };
  }

  /**
   * Detect synthetic frequency patterns
   */
  static detectSyntheticPatterns(power: number[], size: number): {
    isSynthetic: boolean,
    syntheticScore: number,
    patternType: string
  } {
    const frequencyBands = this.analyzeFrequencyBands(power, size);
    const anomalies = this.detectFrequencyAnomalies(power, size);
    const periodicity = this.detectPeriodicPatterns(power, size);
    const entropy = this.calculateSpectralEntropy(power);
    
    let syntheticScore = 0;
    let patternType = 'natural';
    
    // Low entropy suggests synthetic
    if (entropy < 3) {
      syntheticScore += 0.3;
      patternType = 'low_entropy';
    }
    
    // High low-frequency dominance suggests synthetic
    if (frequencyBands.lowFreq > 0.7) {
      syntheticScore += 0.2;
      patternType = 'low_freq_dominant';
    }
    
    // High periodicity suggests synthetic
    if (periodicity.hasPeriodicity) {
      syntheticScore += 0.2;
      patternType = 'periodic';
    }
    
    // Frequency anomalies suggest synthetic
    if (anomalies.hasAnomalies) {
      syntheticScore += 0.2;
      patternType = 'anomalous';
    }
    
    // Unusual frequency distribution suggests synthetic
    if (frequencyBands.distribution !== 'balanced') {
      syntheticScore += 0.1;
    }
    
    const isSynthetic = syntheticScore > 0.4;
    
    return {
      isSynthetic,
      syntheticScore,
      patternType
    };
  }
}
