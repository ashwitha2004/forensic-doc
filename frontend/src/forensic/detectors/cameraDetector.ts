/**
 * Camera Captured Image Detector
 * Priority 4: Detects real camera-captured images using forensic analysis
 */

import { CameraDetectionResult, ForensicImage } from '../types';

export class CameraDetector {
  /**
   * Detect if image was captured by a real camera
   * @param image Forensic image to analyze
   * @returns Camera detection result
   */
  async detect(image: ForensicImage): Promise<CameraDetectionResult> {
    try {
      console.log('[Camera Detector] Starting camera capture detection...');
      
      const evidence: Record<string, any> = {};
      const reasoning: string[] = [];

      // Method 1: EXIF metadata analysis
      const exifResult = await this.analyzeEXIFMetadata(image);
      evidence.exif_data = exifResult.data;
      evidence.exif_present = exifResult.present;
      if (exifResult.present) {
        reasoning.push(`Camera EXIF metadata detected: ${exifResult.cameraInfo}`);
      }

      // Method 2: Natural sensor noise estimation
      const noiseResult = await this.analyzeSensorNoise(image);
      evidence.sensor_noise = noiseResult.level;
      evidence.noise_pattern = noiseResult.pattern;
      if (noiseResult.isNatural) {
        reasoning.push(`Natural sensor noise detected: ${noiseResult.level.toFixed(2)}`);
      }

      // Method 3: JPEG quantization analysis
      const jpegResult = await this.analyzeJPEGArtifacts(image);
      evidence.jpeg_artifacts = jpegResult.artifacts;
      evidence.quantization_pattern = jpegResult.pattern;
      if (jpegResult.isCamera) {
        reasoning.push(`Camera JPEG artifacts detected`);
      }

      // Method 4: Chromatic aberration detection
      const chromaticResult = await this.detectChromaticAberration(image);
      evidence.chromatic_aberration = chromaticResult.detected;
      evidence.aberration_level = chromaticResult.level;
      if (chromaticResult.detected) {
        reasoning.push(`Chromatic aberration detected: ${chromaticResult.level.toFixed(2)}`);
      }

      // Method 5: Natural edge distribution
      const edgeResult = await this.analyzeNaturalEdges(image);
      evidence.edge_distribution = edgeResult.distribution;
      evidence.natural_edges = edgeResult.isNatural;
      if (edgeResult.isNatural) {
        reasoning.push(`Natural edge distribution detected`);
      }

      // Method 6: CFA interpolation traces
      const cfaResult = await this.detectCFATraces(image);
      evidence.cfa_traces = cfaResult.detected;
      evidence.interpolation_pattern = cfaResult.pattern;
      if (cfaResult.detected) {
        reasoning.push(`CFA interpolation traces detected`);
      }

      // Method 7: Natural blur patterns
      const blurResult = await this.analyzeNaturalBlur(image);
      evidence.blur_pattern = blurResult.pattern;
      evidence.natural_blur = blurResult.isNatural;
      if (blurResult.isNatural) {
        reasoning.push(`Natural blur patterns detected`);
      }

      const detected = this.evaluateCameraOrigin(
        exifResult,
        noiseResult,
        jpegResult,
        chromaticResult,
        edgeResult,
        cfaResult,
        blurResult
      );

      const confidence = this.calculateConfidence(
        exifResult,
        noiseResult,
        jpegResult,
        chromaticResult,
        edgeResult,
        cfaResult,
        blurResult
      );

      console.log(`[Camera Detector] Detection complete: ${detected ? 'CAMERA_CAPTURED' : 'NOT_CAMERA'} (confidence: ${confidence})`);

      return {
        detected,
        confidence,
        evidence,
        reasoning,
        exif_present: exifResult.present,
        sensor_noise_level: noiseResult.level,
        natural_edges: edgeResult.isNatural,
        jpeg_artifacts: jpegResult.isCamera,
        chromatic_aberration: chromaticResult.detected
      };

    } catch (error) {
      console.error('[Camera Detector] Error:', error);
      return {
        detected: false,
        confidence: 0,
        evidence: {},
        reasoning: ['Detection failed due to error'],
        exif_present: false,
        sensor_noise_level: 0,
        natural_edges: false,
        jpeg_artifacts: false,
        chromatic_aberration: false
      };
    }
  }

  /**
   * Analyze EXIF metadata for camera information
   */
  private async analyzeEXIFMetadata(image: ForensicImage): Promise<{present: boolean, data: any, cameraInfo: string}> {
    try {
      // Use exifr library to extract EXIF data
      const exifr = await import('exifr');
      
      try {
        const exifData = await exifr.default.parse(image.file);
        
        if (!exifData) {
          return { present: false, data: null, cameraInfo: '' };
        }

        // Check for camera-specific metadata
        const cameraInfo = this.extractCameraInfo(exifData);
        const hasCameraData = !!(exifData.Make || exifData.Model || exifData.DateTime || exifData.ISO);

        return {
          present: hasCameraData,
          data: exifData,
          cameraInfo
        };

      } catch (exifError) {
        console.log('[Camera Detector] No EXIF data found:', exifError);
        return { present: false, data: null, cameraInfo: '' };
      }

    } catch (error) {
      console.error('[Camera Detector] EXIF analysis error:', error);
      return { present: false, data: null, cameraInfo: '' };
    }
  }

  /**
   * Extract camera information from EXIF data
   */
  private extractCameraInfo(exifData: any): string {
    const parts: string[] = [];
    
    if (exifData.Make) parts.push(exifData.Make);
    if (exifData.Model) parts.push(exifData.Model);
    if (exifData.LensModel) parts.push(exifData.LensModel);
    if (exifData.DateTime) parts.push(exifData.DateTime);
    if (exifData.ISO) parts.push(`ISO${exifData.ISO}`);
    if (exifData.FNumber) parts.push(`f/${exifData.FNumber}`);
    if (exifData.ExposureTime) parts.push(`${exifData.ExposureTime}s`);
    
    return parts.join(' ');
  }

  /**
   * Analyze sensor noise patterns
   */
  private async analyzeSensorNoise(image: ForensicImage): Promise<{isNatural: boolean, level: number, pattern: string}> {
    try {
      const img = new Image();
      
      return new Promise((resolve) => {
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          
          if (!ctx) {
            resolve({ isNatural: false, level: 0, pattern: 'unknown' });
            return;
          }

          canvas.width = img.width;
          canvas.height = img.height;
          ctx.drawImage(img, 0, 0);

          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const data = imageData.data;

          // Analyze noise characteristics
          const noiseAnalysis = this.performNoiseAnalysis(data);
          
          // Natural sensor noise has specific characteristics
          const isNatural = this.isNaturalSensorNoise(noiseAnalysis);
          const pattern = this.classifyNoisePattern(noiseAnalysis);

          resolve({ 
            isNatural, 
            level: noiseAnalysis.overallLevel,
            pattern 
          });
        };

        img.onerror = () => {
          resolve({ isNatural: false, level: 0, pattern: 'error' });
        };

        img.src = image.dataUrl;
      });
    } catch (error) {
      console.error('[Camera Detector] Sensor noise analysis error:', error);
      return { isNatural: false, level: 0, pattern: 'error' };
    }
  }

  /**
   * Perform detailed noise analysis
   */
  private performNoiseAnalysis(data: Uint8ClampedArray): any {
    const noiseLevels: number[] = [];
    
    // Sample noise across the image
    for (let i = 0; i < data.length; i += 40) {
      if (i + 40 < data.length) {
        // Calculate local noise in this region
        const region = data.slice(i, i + 40);
        const noise = this.calculateLocalNoise(region);
        noiseLevels.push(noise);
      }
    }

    const avgNoise = noiseLevels.reduce((a, b) => a + b, 0) / noiseLevels.length;
    const noiseVariance = this.calculateVariance(noiseLevels);
    
    // Analyze noise frequency distribution
    const frequencyAnalysis = this.analyzeNoiseFrequency(noiseLevels);
    
    return {
      overallLevel: avgNoise,
      variance: noiseVariance,
      frequency: frequencyAnalysis,
      distribution: this.classifyNoiseDistribution(noiseLevels)
    };
  }

  /**
   * Calculate local noise in a region
   */
  private calculateLocalNoise(region: Uint8ClampedArray): number {
    if (region.length < 4) return 0;
    
    let totalVariance = 0;
    let samples = 0;
    
    for (let i = 0; i < region.length - 4; i += 4) {
      // Calculate variance in RGB channels
      const r = region[i];
      const g = region[i + 1];
      const b = region[i + 2];
      
      const mean = (r + g + b) / 3;
      const variance = ((r - mean) ** 2 + (g - mean) ** 2 + (b - mean) ** 2) / 3;
      totalVariance += variance;
      samples++;
    }
    
    return samples > 0 ? Math.sqrt(totalVariance / samples) : 0;
  }

  /**
   * Determine if noise pattern is natural sensor noise
   */
  private isNaturalSensorNoise(noiseAnalysis: any): boolean {
    // Natural sensor noise has specific characteristics:
    // 1. Gaussian-like distribution
    // 2. Certain frequency characteristics
    // 3. Spatially correlated patterns
    
    const hasGaussianDistribution = noiseAnalysis.distribution === 'gaussian';
    const hasNaturalFrequency = noiseAnalysis.frequency.peakFrequency > 0.1 && noiseAnalysis.frequency.peakFrequency < 0.8;
    const hasModerateVariance = noiseAnalysis.variance > 5 && noiseAnalysis.variance < 50;
    
    return hasGaussianDistribution && hasNaturalFrequency && hasModerateVariance;
  }

  /**
   * Classify noise pattern
   */
  private classifyNoisePattern(noiseAnalysis: any): string {
    if (noiseAnalysis.distribution === 'gaussian' && noiseAnalysis.variance < 20) {
      return 'natural_sensor';
    } else if (noiseAnalysis.distribution === 'uniform') {
      return 'synthetic';
    } else if (noiseAnalysis.variance > 50) {
      return 'high_noise';
    } else {
      return 'unknown';
    }
  }

  /**
   * Analyze JPEG compression artifacts
   */
  private async analyzeJPEGArtifacts(image: ForensicImage): Promise<{isCamera: boolean, artifacts: any, pattern: string}> {
    try {
      // Check if image is JPEG
      const isJPEG = image.type.includes('jpeg') || image.filename.includes('.jpg') || image.filename.includes('.jpeg');
      
      if (!isJPEG) {
        return { isCamera: false, artifacts: null, pattern: 'not_jpeg' };
      }

      const img = new Image();
      
      return new Promise((resolve) => {
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          
          if (!ctx) {
            resolve({ isCamera: false, artifacts: null, pattern: 'error' });
            return;
          }

          canvas.width = img.width;
          canvas.height = img.height;
          ctx.drawImage(img, 0, 0);

          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const data = imageData.data;

          // Analyze JPEG quantization artifacts
          const artifactAnalysis = this.analyzeQuantizationArtifacts(data);
          
          // Camera JPEGs have specific artifact patterns
          const isCamera = this.isCameraJPEG(artifactAnalysis);
          const pattern = this.classifyJPEGPattern(artifactAnalysis);

          resolve({ 
            isCamera, 
            artifacts: artifactAnalysis,
            pattern 
          });
        };

        img.onerror = () => {
          resolve({ isCamera: false, artifacts: null, pattern: 'error' });
        };

        img.src = image.dataUrl;
      });
    } catch (error) {
      console.error('[Camera Detector] JPEG analysis error:', error);
      return { isCamera: false, artifacts: null, pattern: 'error' };
    }
  }

  /**
   * Analyze quantization artifacts
   */
  private analyzeQuantizationArtifacts(data: Uint8ClampedArray): any {
    // Look for JPEG quantization block artifacts
    const blockSize = 8; // JPEG uses 8x8 blocks
    const blockArtifacts: number[] = [];
    
    for (let y = 0; y < data.length / (blockSize * 4); y++) {
      for (let x = 0; x < data.length / (blockSize * 4); x++) {
        // Analyze 8x8 blocks for quantization patterns
        const blockArtifact = this.analyzeBlockQuantization(data, x, y);
        if (blockArtifact > 0) {
          blockArtifacts.push(blockArtifact);
        }
      }
    }

    return {
      blockArtifacts,
      averageArtifact: blockArtifacts.reduce((a, b) => a + b, 0) / (blockArtifacts.length || 1),
      maxArtifact: Math.max(...blockArtifacts, 0),
      pattern: this.analyzeArtifactPattern(blockArtifacts)
    };
  }

  /**
   * Analyze quantization in a single block
   */
  private analyzeBlockQuantization(data: Uint8ClampedArray, blockX: number, blockY: number): number {
    // Simplified block analysis - would need proper implementation
    // This checks for discontinuities typical of JPEG quantization
    let artifactScore = 0;
    const width = Math.sqrt(data.length / 4);
    
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 8; j++) {
        const pixelIndex = ((blockY * 8 + i) * width + (blockX * 8 + j)) * 4;
        
        if (pixelIndex + 8 < data.length) {
          // Check for sharp transitions typical of quantization
          const current = data[pixelIndex];
          const next = data[pixelIndex + 8];
          
          if (Math.abs(current - next) > 30) {
            artifactScore++;
          }
        }
      }
    }
    
    return artifactScore;
  }

  /**
   * Determine if JPEG pattern indicates camera origin
   */
  private isCameraJPEG(artifactAnalysis: any): boolean {
    // Camera JPEGs have moderate, natural-looking artifacts
    // Heavy compression artifacts might indicate digital manipulation
    const moderateArtifact = artifactAnalysis.averageArtifact > 5 && artifactAnalysis.averageArtifact < 50;
    const naturalPattern = artifactAnalysis.pattern === 'natural_quantization';
    
    return moderateArtifact && naturalPattern;
  }

  /**
   * Classify JPEG artifact pattern
   */
  private classifyJPEGPattern(artifactAnalysis: any): string {
    if (artifactAnalysis.averageArtifact < 10) {
      return 'natural_quantization';
    } else if (artifactAnalysis.averageArtifact > 100) {
      return 'heavy_compression';
    } else {
      return 'moderate_compression';
    }
  }

  /**
   * Detect chromatic aberration
   */
  private async detectChromaticAberration(image: ForensicImage): Promise<{detected: boolean, level: number}> {
    try {
      const img = new Image();
      
      return new Promise((resolve) => {
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          
          if (!ctx) {
            resolve({ detected: false, level: 0 });
            return;
          }

          canvas.width = img.width;
          canvas.height = img.height;
          ctx.drawImage(img, 0, 0);

          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const data = imageData.data;

          // Analyze color channel separation for chromatic aberration
          const aberrationLevel = this.analyzeColorChannelSeparation(data);
          const detected = aberrationLevel > 15;

          resolve({ detected, level: aberrationLevel });
        };

        img.onerror = () => {
          resolve({ detected: false, level: 0 });
        };

        img.src = image.dataUrl;
      });
    } catch (error) {
      console.error('[Camera Detector] Chromatic aberration analysis error:', error);
      return { detected: false, level: 0 };
    }
  }

  /**
   * Analyze color channel separation
   */
  private analyzeColorChannelSeparation(data: Uint8ClampedArray): number {
    let totalSeparation = 0;
    let samples = 0;

    for (let i = 0; i < data.length - 12; i += 4) {
      // Calculate separation between RGB channels
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      const rgSeparation = Math.abs(r - g);
      const rbSeparation = Math.abs(r - b);
      const gbSeparation = Math.abs(g - b);

      const maxSeparation = Math.max(rgSeparation, rbSeparation, gbSeparation);
      totalSeparation += maxSeparation;
      samples++;
    }

    return samples > 0 ? totalSeparation / samples : 0;
  }

  /**
   * Analyze natural edge distribution
   */
  private async analyzeNaturalEdges(image: ForensicImage): Promise<{isNatural: boolean, distribution: any}> {
    try {
      const img = new Image();
      
      return new Promise((resolve) => {
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          
          if (!ctx) {
            resolve({ isNatural: false, distribution: null });
            return;
          }

          canvas.width = img.width;
          canvas.height = img.height;
          ctx.drawImage(img, 0, 0);

          // Convert to grayscale for edge detection
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const grayData = this.convertToGrayscale(imageData.data);

          // Detect edges using Sobel operator
          const edges = this.detectEdges(grayData, canvas.width, canvas.height);
          
          // Analyze edge distribution
          const edgeDistribution = this.analyzeEdgeCharacteristics(edges);
          const isNatural = this.hasNaturalEdgeDistribution(edgeDistribution);

          resolve({ isNatural, distribution: edgeDistribution });
        };

        img.onerror = () => {
          resolve({ isNatural: false, distribution: null });
        };

        img.src = image.dataUrl;
      });
    } catch (error) {
      console.error('[Camera Detector] Edge analysis error:', error);
      return { isNatural: false, distribution: null };
    }
  }

  /**
   * Convert image data to grayscale
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
   * Detect edges using Sobel operator
   */
  private detectEdges(grayData: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray {
    const edges = new Uint8ClampedArray(grayData.length);
    
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        
        // Sobel X and Y kernels
        const sobelX = this.applySobelKernel(grayData, x, y, width, height, 'x');
        const sobelY = this.applySobelKernel(grayData, x, y, width, height, 'y');
        
        const magnitude = Math.sqrt(sobelX * sobelX + sobelY * sobelY);
        edges[idx] = magnitude > 50 ? 255 : 0;
      }
    }
    
    return edges;
  }

  /**
   * Apply Sobel kernel
   */
  private applySobelKernel(data: Uint8ClampedArray, x: number, y: number, width: number, height: number, direction: 'x' | 'y'): number {
    const kernel = direction === 'x' 
      ? [-1, 0, 1, -2, 0, 2, -1, 0, 1]
      : [-1, -2, -1, 0, 0, 0, 1, 2, 1];
    
    let result = 0;
    for (let ky = -1; ky <= 1; ky++) {
      for (let kx = -1; kx <= 1; kx++) {
        const px = x + kx;
        const py = y + ky;
        
        if (px >= 0 && px < width && py >= 0 && py < height) {
          const idx = py * width + px;
          const kernelIdx = (ky + 1) * 3 + (kx + 1);
          result += data[idx] * kernel[kernelIdx];
        }
      }
    }
    
    return result;
  }

  /**
   * Analyze edge characteristics
   */
  private analyzeEdgeCharacteristics(edges: Uint8ClampedArray): any {
    const edgePixels = Array.from(edges).filter(pixel => pixel > 0);
    const totalPixels = edges.length;
    const edgeDensity = edgePixels.length / totalPixels;
    
    // Analyze edge strength distribution
    const edgeStrengths = edgePixels.map(p => p);
    const avgStrength = edgeStrengths.reduce((a, b) => a + b, 0) / (edgeStrengths.length || 1);
    const strengthVariance = this.calculateVariance(edgeStrengths);
    
    return {
      density: edgeDensity,
      averageStrength: avgStrength,
      strengthVariance: strengthVariance,
      distribution: this.classifyEdgeDistribution(edgeDensity, strengthVariance)
    };
  }

  /**
   * Determine if edge distribution is natural
   */
  private hasNaturalEdgeDistribution(edgeDistribution: any): boolean {
    // Natural images have moderate edge density with varied strengths
    const moderateDensity = edgeDistribution.density > 0.05 && edgeDistribution.density < 0.3;
    const variedStrengths = edgeDistribution.strengthVariance > 100;
    const naturalPattern = edgeDistribution.distribution === 'natural_varied';
    
    return moderateDensity && variedStrengths && naturalPattern;
  }

  /**
   * Classify edge distribution pattern
   */
  private classifyEdgeDistribution(density: number, variance: number): string {
    if (density < 0.05) {
      return 'too_smooth';
    } else if (density > 0.3) {
      return 'too_many_edges';
    } else if (variance < 50) {
      return 'uniform_edges';
    } else {
      return 'natural_varied';
    }
  }

  /**
   * Detect CFA interpolation traces
   */
  private async detectCFATraces(image: ForensicImage): Promise<{detected: boolean, pattern: string}> {
    try {
      const img = new Image();
      
      return new Promise((resolve) => {
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          
          if (!ctx) {
            resolve({ detected: false, pattern: 'error' });
            return;
          }

          canvas.width = img.width;
          canvas.height = img.height;
          ctx.drawImage(img, 0, 0);

          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const data = imageData.data;

          // Analyze color filter array patterns
          const cfaPattern = this.analyzeCFAPattern(data);
          const detected = cfaPattern.hasInterpolation;

          resolve({ detected, pattern: cfaPattern.type });
        };

        img.onerror = () => {
          resolve({ detected: false, pattern: 'error' });
        };

        img.src = image.dataUrl;
      });
    } catch (error) {
      console.error('[Camera Detector] CFA analysis error:', error);
      return { detected: false, pattern: 'error' };
    }
  }

  /**
   * Analyze CFA interpolation patterns
   */
  private analyzeCFAPattern(data: Uint8ClampedArray): any {
    // Look for Color Filter Array interpolation patterns
    // Real cameras have specific demosaicing patterns
    
    let interpolationScore = 0;
    let samples = 0;

    for (let i = 0; i < data.length - 8; i += 4) {
      // Check for local color consistency patterns
      const r1 = data[i];
      const g1 = data[i + 1];
      const b1 = data[i + 2];
      
      const r2 = data[i + 4];
      const g2 = data[i + 5];
      const b2 = data[i + 6];

      // Calculate color differences
      const rDiff = Math.abs(r1 - r2);
      const gDiff = Math.abs(g1 - g2);
      const bDiff = Math.abs(b1 - b2);

      // CFA interpolation creates specific color correlation patterns
      const avgDiff = (rDiff + gDiff + bDiff) / 3;
      if (avgDiff < 20) {
        interpolationScore++;
      }
      samples++;
    }

    const interpolationRatio = samples > 0 ? interpolationScore / samples : 0;
    const hasInterpolation = interpolationRatio > 0.3;

    return {
      hasInterpolation,
      interpolationRatio,
      type: hasInterpolation ? 'cfa_interpolation' : 'no_cfa_traces'
    };
  }

  /**
   * Analyze natural blur patterns
   */
  private async analyzeNaturalBlur(image: ForensicImage): Promise<{isNatural: boolean, pattern: string}> {
    try {
      const img = new Image();
      
      return new Promise((resolve) => {
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          
          if (!ctx) {
            resolve({ isNatural: false, pattern: 'error' });
            return;
          }

          canvas.width = img.width;
          canvas.height = img.height;
          ctx.drawImage(img, 0, 0);

          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const data = imageData.data;

          // Analyze blur characteristics
          const blurAnalysis = this.analyzeBlurCharacteristics(data);
          const isNatural = this.hasNaturalBlur(blurAnalysis);

          resolve({ isNatural, pattern: blurAnalysis.pattern });
        };

        img.onerror = () => {
          resolve({ isNatural: false, pattern: 'error' });
        };

        img.src = image.dataUrl;
      });
    } catch (error) {
      console.error('[Camera Detector] Blur analysis error:', error);
      return { isNatural: false, pattern: 'error' };
    }
  }

  /**
   * Analyze blur characteristics
   */
  private analyzeBlurCharacteristics(data: Uint8ClampedArray): any {
    // Convert to grayscale for blur analysis
    const grayData = this.convertToGrayscale(data);
    
    // Calculate Laplacian variance for blur detection
    const laplacianVariance = this.calculateLaplacianVariance(grayData);
    
    // Analyze frequency content
    const frequencyAnalysis = this.analyzeFrequencyContent(grayData);
    
    return {
      laplacianVariance,
      frequencyDistribution: frequencyAnalysis,
      pattern: this.classifyBlurPattern(laplacianVariance, frequencyAnalysis)
    };
  }

  /**
   * Calculate Laplacian variance
   */
  private calculateLaplacianVariance(grayData: Uint8ClampedArray): number {
    // Simplified Laplacian variance calculation
    let variance = 0;
    let samples = 0;

    for (let i = 1; i < grayData.length - 1; i++) {
      const laplacian = Math.abs(grayData[i - 1] - 2 * grayData[i] + grayData[i + 1]);
      variance += laplacian * laplacian;
      samples++;
    }

    return samples > 0 ? variance / samples : 0;
  }

  /**
   * Analyze frequency content
   */
  private analyzeFrequencyContent(grayData: Uint8ClampedArray): any {
    // Simple frequency analysis using FFT approximation
    const frequencies = this.approximateFFT(grayData);
    
    return {
      highFrequency: frequencies.high,
      lowFrequency: frequencies.low,
      distribution: this.classifyFrequencyDistribution(frequencies)
    };
  }

  /**
   * Approximate FFT for frequency analysis
   */
  private approximateFFT(data: Uint8ClampedArray): any {
    // Simplified frequency analysis - real FFT would be more accurate
    let highFreq = 0;
    let lowFreq = 0;
    
    for (let i = 1; i < data.length - 1; i++) {
      const diff = Math.abs(data[i] - data[i - 1]);
      if (diff > 50) {
        highFreq++;
      } else {
        lowFreq++;
      }
    }
    
    return {
      high: highFreq / data.length,
      low: lowFreq / data.length
    };
  }

  /**
   * Determine if blur pattern is natural
   */
  private hasNaturalBlur(blurAnalysis: any): boolean {
    // Natural camera blur has specific frequency characteristics
    const moderateLaplacian = blurAnalysis.laplacianVariance > 10 && blurAnalysis.laplacianVariance < 100;
    const naturalFrequency = blurAnalysis.frequencyDistribution.distribution === 'natural_frequency';
    
    return moderateLaplacian && naturalFrequency;
  }

  /**
   * Classify blur pattern
   */
  private classifyBlurPattern(laplacianVariance: number, frequencyAnalysis: any): string {
    if (laplacianVariance < 10) {
      return 'over_sharpened';
    } else if (laplacianVariance > 100) {
      return 'excessive_blur';
    } else if (frequencyAnalysis.distribution === 'natural_frequency') {
      return 'natural_blur';
    } else {
      return 'artificial_blur';
    }
  }

  /**
   * Evaluate overall camera origin
   */
  private evaluateCameraOrigin(
    exifResult: any,
    noiseResult: any,
    jpegResult: any,
    chromaticResult: any,
    edgeResult: any,
    cfaResult: any,
    blurResult: any
  ): boolean {
    // Weighted evaluation of camera origin evidence
    let evidenceScore = 0;
    let totalWeight = 0;

    // EXIF metadata (strong evidence)
    if (exifResult.present) {
      evidenceScore += 3 * 0.8;
      totalWeight += 3;
    }

    // Natural sensor noise (strong evidence)
    if (noiseResult.isNatural) {
      evidenceScore += 2 * 0.7;
      totalWeight += 2;
    }

    // JPEG artifacts (moderate evidence)
    if (jpegResult.isCamera) {
      evidenceScore += 1.5 * 0.6;
      totalWeight += 1.5;
    }

    // Chromatic aberration (moderate evidence)
    if (chromaticResult.detected) {
      evidenceScore += 1 * 0.5;
      totalWeight += 1;
    }

    // Natural edges (moderate evidence)
    if (edgeResult.isNatural) {
      evidenceScore += 1 * 0.6;
      totalWeight += 1;
    }

    // CFA traces (moderate evidence)
    if (cfaResult.detected) {
      evidenceScore += 1 * 0.5;
      totalWeight += 1;
    }

    // Natural blur (weak evidence)
    if (blurResult.isNatural) {
      evidenceScore += 0.5 * 0.4;
      totalWeight += 0.5;
    }

    const finalScore = totalWeight > 0 ? evidenceScore / totalWeight : 0;
    return finalScore > 0.4;
  }

  /**
   * Calculate confidence based on all detection methods
   */
  private calculateConfidence(
    exifResult: any,
    noiseResult: any,
    jpegResult: any,
    chromaticResult: any,
    edgeResult: any,
    cfaResult: any,
    blurResult: any
  ): number {
    let confidence = 0;
    let methods = 0;

    if (exifResult.present) {
      confidence += 0.25;
      methods++;
    }
    if (noiseResult.isNatural) {
      confidence += 0.20;
      methods++;
    }
    if (jpegResult.isCamera) {
      confidence += 0.15;
      methods++;
    }
    if (chromaticResult.detected) {
      confidence += 0.10;
      methods++;
    }
    if (edgeResult.isNatural) {
      confidence += 0.15;
      methods++;
    }
    if (cfaResult.detected) {
      confidence += 0.10;
      methods++;
    }
    if (blurResult.isNatural) {
      confidence += 0.05;
      methods++;
    }

    return methods > 0 ? confidence : 0;
  }

  /**
   * Helper: Calculate variance
   */
  private calculateVariance(values: number[]): number {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    return values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
  }

  /**
   * Helper: Analyze noise frequency
   */
  private analyzeNoiseFrequency(noiseLevels: number[]): any {
    // Simple frequency analysis of noise levels
    const sorted = [...noiseLevels].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    
    const lowFreq = noiseLevels.filter(n => n < median).length / noiseLevels.length;
    const highFreq = noiseLevels.filter(n => n > median).length / noiseLevels.length;
    
    return {
      lowFrequency: lowFreq,
      highFrequency: highFreq,
      peakFrequency: Math.max(lowFreq, highFreq)
    };
  }

  /**
   * Helper: Classify noise distribution
   */
  private classifyNoiseDistribution(noiseLevels: number[]): string {
    const variance = this.calculateVariance(noiseLevels);
    
    if (variance < 10) {
      return 'uniform';
    } else if (variance > 100) {
      return 'irregular';
    } else {
      return 'gaussian';
    }
  }

  /**
   * Helper: Analyze artifact pattern
   */
  private analyzeArtifactPattern(blockArtifacts: number[]): string {
    if (blockArtifacts.length === 0) return 'no_artifacts';
    
    const variance = this.calculateVariance(blockArtifacts);
    const mean = blockArtifacts.reduce((a, b) => a + b, 0) / blockArtifacts.length;
    
    if (variance < mean * 0.5) {
      return 'consistent_artifacts';
    } else if (variance > mean * 2) {
      return 'inconsistent_artifacts';
    } else {
      return 'natural_variation';
    }
  }

  /**
   * Helper: Classify frequency distribution
   */
  private classifyFrequencyDistribution(frequencies: any): string {
    const ratio = frequencies.low / (frequencies.low + frequencies.high);
    
    if (ratio > 0.7) {
      return 'natural_frequency';
    } else if (ratio < 0.3) {
      return 'high_frequency_dominant';
    } else {
      return 'balanced_frequency';
    }
  }
}
