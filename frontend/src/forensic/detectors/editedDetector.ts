/**
 * Edited/Manipulated Image Detector
 * Priority 5: Detects image manipulation and editing
 */

import { EditedDetectionResult, ForensicImage } from '../types';

export class EditedDetector {
  /**
   * Detect if image has been edited/manipulated
   * @param image Forensic image to analyze
   * @returns Edited detection result
   */
  async detect(image: ForensicImage): Promise<EditedDetectionResult> {
    try {
      console.log('[Edited Detector] Starting manipulation detection...');
      
      const evidence: Record<string, any> = {};
      const reasoning: string[] = [];

      // Method 1: Inconsistent lighting
      const lightingResult = await this.detectInconsistentLighting(image);
      evidence.lighting_inconsistency = lightingResult.inconsistent;
      evidence.lighting_pattern = lightingResult.pattern;
      if (lightingResult.inconsistent) {
        reasoning.push(`Inconsistent lighting detected: ${lightingResult.pattern}`);
      }

      // Method 2: Cloning artifacts
      const cloningResult = await this.detectCloningArtifacts(image);
      evidence.cloning_artifacts = cloningResult.artifacts;
      evidence.cloning_pattern = cloningResult.pattern;
      if (cloningResult.detected) {
        reasoning.push(`Cloning artifacts detected: ${cloningResult.pattern}`);
      }

      // Method 3: Compositing edges
      const compositingResult = await this.detectCompositingEdges(image);
      evidence.compositing_edges = compositingResult.edges;
      evidence.compositing_pattern = compositingResult.pattern;
      if (compositingResult.detected) {
        reasoning.push(`Compositing edges detected: ${compositingResult.pattern}`);
      }

      // Method 4: Filter traces
      const filterResult = await this.detectFilterTraces(image);
      evidence.filter_traces = filterResult.traces;
      evidence.filter_pattern = filterResult.pattern;
      if (filterResult.detected) {
        reasoning.push(`Filter traces detected: ${filterResult.pattern}`);
      }

      // Method 5: Recompression artifacts
      const recompressionResult = await this.detectRecompressionArtifacts(image);
      evidence.recompression_artifacts = recompressionResult.artifacts;
      evidence.recompression_pattern = recompressionResult.pattern;
      if (recompressionResult.detected) {
        reasoning.push(`Recompression artifacts detected: ${recompressionResult.pattern}`);
      }

      // Method 6: Crop boundary traces
      const cropResult = await this.detectCropBoundaries(image);
      evidence.crop_boundaries = cropResult.boundaries;
      evidence.crop_pattern = cropResult.pattern;
      if (cropResult.detected) {
        reasoning.push(`Crop boundary traces detected: ${cropResult.pattern}`);
      }

      const detected = this.evaluateManipulation(
        lightingResult,
        cloningResult,
        compositingResult,
        filterResult,
        recompressionResult,
        cropResult
      );

      const confidence = this.calculateConfidence(
        lightingResult,
        cloningResult,
        compositingResult,
        filterResult,
        recompressionResult,
        cropResult
      );

      console.log(`[Edited Detector] Detection complete: ${detected ? 'EDITED_MANIPULATED' : 'NOT_EDITED'} (confidence: ${confidence})`);

      return {
        detected,
        confidence,
        evidence,
        reasoning,
        lighting_inconsistency: lightingResult.inconsistent,
        cloning_artifacts: cloningResult.detected,
        compositing_edges: compositingResult.detected,
        filter_traces: filterResult.detected,
        recompression_artifacts: recompressionResult.detected,
        crop_boundaries: cropResult.detected
      };

    } catch (error) {
      console.error('[Edited Detector] Error:', error);
      return {
        detected: false,
        confidence: 0,
        evidence: {},
        reasoning: ['Detection failed due to error'],
        lighting_inconsistency: false,
        cloning_artifacts: false,
        compositing_edges: false,
        filter_traces: false,
        recompression_artifacts: false,
        crop_boundaries: false
      };
    }
  }

  /**
   * Detect inconsistent lighting
   */
  private async detectInconsistentLighting(image: ForensicImage): Promise<{inconsistent: boolean, pattern: string}> {
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

          // Analyze lighting consistency
          const lightingAnalysis = this.analyzeLightingConsistency(data);
          const inconsistent = this.hasInconsistentLighting(lightingAnalysis);
          const pattern = this.classifyLightingPattern(lightingAnalysis);

          resolve({ inconsistent, pattern });
        };

        img.onerror = () => {
          resolve({ inconsistent: false, pattern: 'error' });
        };

        img.src = image.dataUrl;
      });
    } catch (error) {
      console.error('[Edited Detector] Lighting analysis error:', error);
      return { inconsistent: false, pattern: 'error' };
    }
  }

  /**
   * Analyze lighting consistency
   */
  private analyzeLightingConsistency(data: Uint8ClampedArray): any {
    // Convert to grayscale for lighting analysis
    const grayData = this.convertToGrayscale(data);
    
    // Analyze lighting gradients across the image
    const lightingGradients = this.analyzeLightingGradients(grayData);
    
    // Check for multiple light sources
    const lightSources = this.detectLightSources(grayData);
    
    // Analyze shadow consistency
    const shadowAnalysis = this.analyzeShadowConsistency(grayData);
    
    return {
      gradientVariance: lightingGradients.gradientVariance,
      lightSourceCount: lightSources.count,
      shadowInconsistency: shadowAnalysis.inconsistent,
      lightingPattern: lightingGradients.pattern
    };
  }

  /**
   * Analyze lighting gradients
   */
  private analyzeLightingGradients(grayData: Uint8ClampedArray): any {
    const blockSize = 16;
    const gradients: number[] = [];
    
    // Sample gradients across the image
    for (let y = 0; y < grayData.length / Math.sqrt(grayData.length) - blockSize; y += blockSize) {
      for (let x = 0; x < Math.sqrt(grayData.length) - blockSize; x += blockSize) {
        const blockGradient = this.calculateBlockGradient(grayData, x, y, Math.sqrt(grayData.length));
        gradients.push(blockGradient);
      }
    }

    // Analyze gradient consistency
    const avgGradient = gradients.reduce((a, b) => a + b, 0) / gradients.length;
    const gradientVariance = this.calculateVariance(gradients);
    
    return {
      averageGradient: avgGradient,
      gradientVariance,
      pattern: this.classifyGradientPattern(gradientVariance)
    };
  }

  /**
   * Classify gradient pattern
   */
  private classifyGradientPattern(gradientVariance: number): string {
    if (gradientVariance > 2000) {
      return 'extreme_gradient_variance';
    } else if (gradientVariance > 1500) {
      return 'high_gradient_variance';
    } else if (gradientVariance > 1000) {
      return 'moderate_gradient_variance';
    } else if (gradientVariance > 500) {
      return 'low_gradient_variance';
    } else {
      return 'consistent_gradients';
    }
  }

  /**
   * Calculate block gradient
   */
  private calculateBlockGradient(grayData: Uint8ClampedArray, blockX: number, blockY: number, width: number): number {
    // Calculate gradient in 16x16 block
    let totalGradient = 0;
    let samples = 0;

    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const idx = (blockY + y) * width + (blockX + x);
        
        if (idx + width + 1 < grayData.length && idx + width < grayData.length) {
          const current = grayData[idx];
          const right = grayData[idx + 1];
          const bottom = grayData[idx + width];
          
          // Calculate gradient magnitude
          const gradientX = Math.abs(right - current);
          const gradientY = Math.abs(bottom - current);
          const gradient = Math.sqrt(gradientX * gradientX + gradientY * gradientY);
          
          totalGradient += gradient;
          samples++;
        }
      }
    }

    return samples > 0 ? totalGradient / samples : 0;
  }

  /**
   * Detect multiple light sources
   */
  private detectLightSources(grayData: Uint8ClampedArray): {count: number, positions: any[]} {
    const lightSources: any[] = [];
    
    // Look for bright spots that could indicate light sources
    const brightnessThreshold = 200;
    
    for (let y = 0; y < grayData.length / Math.sqrt(grayData.length); y += 8) {
      for (let x = 0; x < Math.sqrt(grayData.length); x += 8) {
        const idx = y * Math.sqrt(grayData.length) + x;
        
        if (grayData[idx] > brightnessThreshold) {
          // Check if this is a local maximum
          const isLocalMax = this.isLocalMaximum(grayData, x, y, Math.sqrt(grayData.length), brightnessThreshold);
          
          if (isLocalMax) {
            lightSources.push({ x, y, brightness: grayData[idx] });
          }
        }
      }
    }

    return {
      count: lightSources.length,
      positions: lightSources
    };
  }

  /**
   * Check if pixel is local maximum
   */
  private isLocalMaximum(grayData: Uint8ClampedArray, x: number, y: number, width: number, threshold: number): boolean {
    const currentValue = grayData[y * width + x];
    
    // Check if current value meets threshold
    if (currentValue < threshold) {
      return false;
    }
    
    const neighborhoodSize = 3;
    
    for (let dy = -neighborhoodSize; dy <= neighborhoodSize; dy++) {
      for (let dx = -neighborhoodSize; dx <= neighborhoodSize; dx++) {
        if (dy === 0 && dx === 0) continue;
        
        const nx = x + dx;
        const ny = y + dy;
        
        if (nx >= 0 && nx < width && ny >= 0 && ny < grayData.length / width) {
          const nidx = ny * width + nx;
          
          if (grayData[nidx] >= currentValue) {
            return false;
          }
        }
      }
    }
    
    return true;
  }

  /**
   * Analyze shadow consistency
   */
  private analyzeShadowConsistency(grayData: Uint8ClampedArray): any {
    // Look for inconsistent shadow patterns
    const shadowRegions = this.detectShadowRegions(grayData);
    const shadowAnalysis = this.analyzeShadowPatterns(shadowRegions);
    
    return {
      regionCount: shadowRegions.length,
      inconsistent: shadowAnalysis.inconsistent,
      pattern: shadowAnalysis.pattern
    };
  }

  /**
   * Detect shadow regions
   */
  private detectShadowRegions(grayData: Uint8ClampedArray): any[] {
    const shadowRegions: any[] = [];
    const width = Math.sqrt(grayData.length);
    
    // Look for dark regions that could be shadows
    const shadowThreshold = 80;
    
    for (let y = 0; y < grayData.length / width - 20; y += 10) {
      for (let x = 0; x < width - 20; x += 10) {
        const regionData = this.extractRegion(grayData, x, y, 20, 20, width);
        const avgBrightness = this.calculateRegionAverage(regionData);
        
        if (avgBrightness < shadowThreshold) {
          shadowRegions.push({
            x, y,
            width: 20,
            height: 20,
            avgBrightness
          });
        }
      }
    }
    
    return shadowRegions;
  }

  /**
   * Extract region data
   */
  private extractRegion(grayData: Uint8ClampedArray, x: number, y: number, width: number, height: number, imageWidth: number): number[] {
    const region: number[] = [];
    
    for (let dy = 0; dy < height; dy++) {
      for (let dx = 0; dx < width; dx++) {
        const idx = (y + dy) * imageWidth + (x + dx);
        
        if (idx < grayData.length) {
          region.push(grayData[idx]);
        }
      }
    }
    
    return region;
  }

  /**
   * Calculate region average
   */
  private calculateRegionAverage(region: number[]): number {
    if (region.length === 0) return 0;
    return region.reduce((sum, val) => sum + val, 0) / region.length;
  }

  /**
   * Analyze shadow patterns
   */
  private analyzeShadowPatterns(shadowRegions: any[]): any {
    if (shadowRegions.length === 0) {
      return {
        inconsistent: false,
        pattern: 'no_shadows'
      };
    }

    // Analyze shadow consistency
    const shadowBrightnesses = shadowRegions.map(region => region.avgBrightness);
    const shadowVariance = this.calculateVariance(shadowBrightnesses);
    
    // Inconsistent shadows suggest manipulation
    const inconsistent = shadowVariance > 200;
    
    return {
      inconsistent,
      pattern: inconsistent ? 'inconsistent_shadows' : 'consistent_shadows'
    };
  }

  /**
   * Determine if lighting is inconsistent
   */
  private hasInconsistentLighting(lightingAnalysis: any): boolean {
    // Multiple light sources or inconsistent shadows suggest manipulation
    const hasMultipleSources = lightingAnalysis.lightSourceCount > 2;
    const hasHighGradientVariance = lightingAnalysis.gradientVariance > 1000;
    const hasInconsistentShadows = lightingAnalysis.shadowInconsistency;
    
    return hasMultipleSources || hasHighGradientVariance || hasInconsistentShadows;
  }

  /**
   * Classify lighting pattern
   */
  private classifyLightingPattern(lightingAnalysis: any): string {
    if (lightingAnalysis.shadowInconsistency) {
      return 'inconsistent_shadows';
    } else if (lightingAnalysis.lightSourceCount > 3) {
      return 'multiple_light_sources';
    } else if (lightingAnalysis.gradientVariance > 1500) {
      return 'inconsistent_lighting';
    } else {
      return 'consistent_lighting';
    }
  }

  /**
   * Detect cloning artifacts
   */
  private async detectCloningArtifacts(image: ForensicImage): Promise<{detected: boolean, artifacts: any, pattern: string}> {
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

          // Analyze for cloning artifacts
          const cloningAnalysis = this.analyzeCloningPatterns(data);
          const artifactScore = cloningAnalysis.cloningScore;
          const pattern = this.classifyCloningPattern(cloningAnalysis);

          const detected = artifactScore > 0.3;
          resolve({ 
            detected, 
            artifacts: cloningAnalysis,
            pattern 
          });
        };

        img.onerror = () => {
          resolve({ detected: false, artifacts: null, pattern: 'error' });
        };

        img.src = image.dataUrl;
      });
    } catch (error) {
      console.error('[Edited Detector] Cloning analysis error:', error);
      return { detected: false, artifacts: null, pattern: 'error' };
    }
  }

  /**
   * Analyze cloning patterns
   */
  private analyzeCloningPatterns(data: Uint8ClampedArray): any {
    // Look for patterns typical of copy-paste cloning
    const patternMatches = this.detectRepeatingPatterns(data);
    const edgeInconsistencies = this.detectEdgeInconsistencies(data);
    const textureAnomalies = this.detectTextureAnomalies(data);
    
    return {
      patternMatches,
      edgeInconsistencies,
      textureAnomalies,
      cloningScore: this.calculateCloningEvidence(patternMatches, edgeInconsistencies, textureAnomalies)
    };
  }

  /**
   * Detect repeating patterns (could indicate cloning)
   */
  private detectRepeatingPatterns(data: Uint8ClampedArray): any[] {
    const patterns: any[] = [];
    
    // Look for exact pattern matches
    const patternSize = 64; // 8x8 blocks
    
    for (let y = 0; y < data.length / (patternSize * 4) - patternSize; y += patternSize) {
      for (let x = 0; x < data.length / (patternSize * 4) - patternSize; x += patternSize) {
        const pattern = this.extractPattern(data, x, y, patternSize, Math.sqrt(data.length / 4));
        
        // Look for matches of this pattern
        const matches = this.findPatternMatches(data, pattern, Math.sqrt(data.length / 4));
        
        if (matches.length > 2) {
          patterns.push({
            pattern,
            matches,
            positions: matches
          });
        }
      }
    }

    return patterns;
  }

  /**
   * Extract pattern from image data
   */
  private extractPattern(data: Uint8ClampedArray, x: number, y: number, size: number, width: number): number[] {
    const pattern: number[] = [];
    
    for (let dy = 0; dy < size; dy++) {
      for (let dx = 0; dx < size; dx++) {
        const idx = (y + dy) * width + (x + dx);
        
        if (idx < data.length) {
          pattern.push(data[idx]);
        }
      }
    }

    return pattern;
  }

  /**
   * Find pattern matches
   */
  private findPatternMatches(data: Uint8ClampedArray, pattern: number[], width: number): any[] {
    const matches: any[] = [];
    const patternLength = pattern.length;
    
    for (let y = 0; y < data.length / (patternLength * 4) - patternLength; y += patternLength) {
      for (let x = 0; x < data.length / (patternLength * 4) - patternLength; x += patternLength) {
        // Check if pattern matches at this location
        let match = true;
        
        for (let i = 0; i < patternLength; i++) {
          const patternIdx = i * 4;
          const dataIdx = (y + Math.floor(i / 4)) * width + (x + (i % 4));
          
          if (dataIdx + 3 < data.length && pattern[patternIdx] !== data[dataIdx]) {
            match = false;
            break;
          }
        }
        
        if (match) {
          matches.push({ x, y });
        }
      }
    }

    return matches;
  }

  /**
   * Detect edge inconsistencies
   */
  private detectEdgeInconsistencies(data: Uint8ClampedArray): any[] {
    const inconsistencies: any[] = [];
    
    // Look for sudden edge changes that suggest cloning
    const edges = this.detectEdges(data);
    
    for (let i = 1; i < edges.length - 1; i++) {
      const currentEdge = edges[i];
      const prevEdge = edges[i - 1];
      
      if (currentEdge > 0 && prevEdge > 0) {
        const edgeDiff = Math.abs(currentEdge - prevEdge);
        
        // Sudden large edge changes suggest cloning
        if (edgeDiff > 100) {
          inconsistencies.push({
            position: i,
            edgeDiff,
            type: 'sudden_edge_change'
          });
        }
      }
    }

    return inconsistencies;
  }

  /**
   * Detect edges
   */
  private detectEdges(data: Uint8ClampedArray): number[] {
    const edges: number[] = [];
    
    // Simple edge detection
    for (let i = 1; i < data.length - 1; i++) {
      const diff = Math.abs(data[i] - data[i - 1]);
      edges.push(diff);
    }

    return edges;
  }

  /**
   * Detect texture anomalies
   */
  private detectTextureAnomalies(data: Uint8ClampedArray): any[] {
    const anomalies: any[] = [];
    
    // Look for texture inconsistencies
    const blockSize = 8;
    
    for (let y = 0; y < data.length / (blockSize * 4) - blockSize; y += blockSize) {
      for (let x = 0; x < data.length / (blockSize * 4) - blockSize; x += blockSize) {
        const blockTexture = this.analyzeBlockTexture(data, x, y, blockSize, Math.sqrt(data.length / 4));
        
        if (blockTexture.anomalous) {
          anomalies.push({
            x, y,
            type: 'texture_anomaly',
            score: blockTexture.anomalyScore
          });
        }
      }
    }

    return anomalies;
  }

  /**
   * Analyze block texture
   */
  private analyzeBlockTexture(data: Uint8ClampedArray, x: number, y: number, size: number, width: number): any {
    // Extract 8x8 block
    const block: number[] = [];
    
    for (let dy = 0; dy < size; dy++) {
      for (let dx = 0; dx < size; dx++) {
        const idx = (y + dy) * width + (x + dx);
        
        if (idx < data.length) {
          block.push(data[idx]);
        }
      }
    }

    // Analyze texture consistency
    const variance = this.calculateVariance(block);
    const mean = block.reduce((a, b) => a + b, 0) / block.length;
    const textureScore = this.calculateTextureScore(variance, mean);
    
    return {
      anomalous: textureScore > 0.7,
      anomalyScore: textureScore,
      variance,
      mean
    };
  }

  /**
   * Calculate texture score
   */
  private calculateTextureScore(variance: number, mean: number): number {
    // High variance with low mean suggests texture anomaly
    const normalizedVariance = variance / (mean + 1);
    
    if (normalizedVariance > 0.5) {
      return 0.8;
    } else if (normalizedVariance > 0.3) {
      return 0.6;
    } else if (normalizedVariance > 0.1) {
      return 0.4;
    } else {
      return 0.2;
    }
  }

  /**
   * Calculate cloning evidence score
   */
  private calculateCloningEvidence(patternMatches: any[], edgeInconsistencies: any[], textureAnomalies: any[]): number {
    let score = 0;
    
    // Pattern matches (strong evidence)
    if (patternMatches.length > 3) {
      score += 0.4;
    }
    
    // Edge inconsistencies (moderate evidence)
    if (edgeInconsistencies.length > 2) {
      score += 0.3;
    }
    
    // Texture anomalies (moderate evidence)
    if (textureAnomalies.length > 1) {
      score += 0.3;
    }
    
    return Math.min(score, 1.0);
  }

  /**
   * Classify cloning pattern
   */
  private classifyCloningPattern(cloningAnalysis: any): string {
    if (cloningAnalysis.patternMatches.length > 5) {
      return 'extensive_pattern_repetition';
    } else if (cloningAnalysis.edgeInconsistencies.length > 3) {
      return 'edge_inconsistencies';
    } else if (cloningAnalysis.textureAnomalies.length > 2) {
      return 'texture_anomalies';
    } else if (cloningAnalysis.cloningScore > 0.5) {
      return 'moderate_cloning_evidence';
    } else {
      return 'minimal_cloning';
    }
  }

  /**
   * Detect compositing edges
   */
  private async detectCompositingEdges(image: ForensicImage): Promise<{detected: boolean, edges: any, pattern: string}> {
    try {
      const img = new Image();
      
      return new Promise((resolve) => {
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          
          if (!ctx) {
            resolve({ detected: false, edges: null, pattern: 'error' });
            return;
          }

          canvas.width = img.width;
          canvas.height = img.height;
          ctx.drawImage(img, 0, 0);

          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const data = imageData.data;

          // Analyze for compositing artifacts
          const compositingAnalysis = this.analyzeCompositingPatterns(data);
          const edgeScore = compositingAnalysis.compositingScore;
          const pattern = this.classifyCompositingPattern(compositingAnalysis);

          const detected = edgeScore > 0.3;
          resolve({ 
            detected, 
            edges: compositingAnalysis,
            pattern 
          });
        };

        img.onerror = () => {
          resolve({ detected: false, edges: null, pattern: 'error' });
        };

        img.src = image.dataUrl;
      });
    } catch (error) {
      console.error('[Edited Detector] Compositing analysis error:', error);
      return { detected: false, edges: null, pattern: 'error' };
    }
  }

  /**
   * Analyze compositing patterns
   */
  private analyzeCompositingPatterns(data: Uint8ClampedArray): any {
    // Look for signs of image compositing
    const matteEdges = this.detectMatteEdges(data);
    const alphaBlending = this.detectAlphaBlending(data);
    const colorMismatches = this.detectColorMismatches(data);
    const selectionBorders = this.detectSelectionBorders(data);
    
    return {
      matteEdges,
      alphaBlending,
      colorMismatches,
      selectionBorders,
      compositingScore: this.calculateCompositingEvidence(matteEdges, alphaBlending, colorMismatches, selectionBorders)
    };
  }

  /**
   * Detect matte edges (from selection tools)
   */
  private detectMatteEdges(data: Uint8ClampedArray): any[] {
    const matteEdges: any[] = [];
    
    // Look for unnaturally perfect edges
    const edges = this.detectEdges(data);
    
    for (let i = 0; i < edges.length; i++) {
      if (edges[i] > 0) {
        // Check for perfect edge characteristics
        const isPerfectEdge = this.isPerfectEdge(data, i, Math.sqrt(data.length / 4));
        
        if (isPerfectEdge) {
          matteEdges.push({
            position: i,
            edgeStrength: edges[i],
            type: 'matte_edge'
          });
        }
      }
    }

    return matteEdges;
  }

  /**
   * Check if edge is unnaturally perfect
   */
  private isPerfectEdge(data: Uint8ClampedArray, position: number, width: number): boolean {
    // Perfect edges suggest selection tool usage
    const threshold = 200;
    
    if (data[position] < threshold) return false;
    
    // Check neighboring pixels
    const x = position % width;
    const y = Math.floor(position / width);
    
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        
        if (nx >= 0 && nx < width && ny >= 0 && ny < Math.sqrt(data.length / 4)) {
          const nidx = ny * width + nx;
          
          // Perfect edges have very sharp transitions
          if (Math.abs(data[nidx] - data[position]) < 10) {
            return false;
          }
        }
      }
    }

    return true;
  }

  /**
   * Detect alpha blending artifacts
   */
  private detectAlphaBlending(data: Uint8ClampedArray): any[] {
    const alphaArtifacts: any[] = [];
    
    // Look for signs of alpha channel manipulation
    const colorTransitions = this.analyzeColorTransitions(data);
    
    for (let i = 0; i < colorTransitions.length; i++) {
      const transition = colorTransitions[i];
      
      // Unnaturally smooth transitions suggest alpha blending
      if (transition.smoothness > 0.8) {
        alphaArtifacts.push({
          position: transition.position,
          smoothness: transition.smoothness,
          type: 'alpha_blending'
        });
      }
    }

    return alphaArtifacts;
  }

  /**
   * Analyze color transitions
   */
  private analyzeColorTransitions(data: Uint8ClampedArray): any[] {
    const transitions: any[] = [];
    
    for (let i = 4; i < data.length - 4; i += 4) {
      const r1 = data[i];
      const g1 = data[i + 1];
      const b1 = data[i + 2];
      
      const r2 = data[i + 4];
      const g2 = data[i + 5];
      const b2 = data[i + 6];
      
      // Calculate transition smoothness
      const rDiff = Math.abs(r2 - r1);
      const gDiff = Math.abs(g2 - g1);
      const bDiff = Math.abs(b2 - b1);
      const totalDiff = rDiff + gDiff + bDiff;
      
      const smoothness = 1 - (totalDiff / (255 * 3)); // Normalize to 0-1
      
      transitions.push({
        position: i,
        colorDiff: totalDiff,
        smoothness
      });
    }

    return transitions;
  }

  /**
   * Detect color mismatches
   */
  private detectColorMismatches(data: Uint8ClampedArray): any[] {
    const mismatches: any[] = [];
    
    // Look for inconsistent color spaces
    const colorSpaceAnalysis = this.analyzeColorSpaceConsistency(data);
    
    if (colorSpaceAnalysis.inconsistent) {
      mismatches.push({
        type: 'color_space_mismatch',
        inconsistency: colorSpaceAnalysis.inconsistencyType
      });
    }

    return mismatches;
  }

  /**
   * Analyze color space consistency
   */
  private analyzeColorSpaceConsistency(data: Uint8ClampedArray): any {
    // Simplified color space analysis
    const colorRanges = this.analyzeColorRanges(data);
    
    // Check for inconsistent color characteristics
    const hasInconsistentRanges = colorRanges.some(range => range.inconsistent);
    
    return {
      inconsistent: hasInconsistentRanges,
      inconsistencyType: hasInconsistentRanges ? 'color_range_inconsistency' : 'consistent'
    };
  }

  /**
   * Analyze color ranges
   */
  private analyzeColorRanges(data: Uint8ClampedArray): any[] {
    const ranges: any[] = [];
    
    // Sample color ranges across the image
    const blockSize = 16;
    
    for (let y = 0; y < data.length / (blockSize * 4) - blockSize; y += blockSize) {
      for (let x = 0; x < data.length / (blockSize * 4) - blockSize; x += blockSize) {
        const blockRange = this.analyzeBlockColorRange(data, x, y, blockSize, Math.sqrt(data.length / 4));
        
        ranges.push(blockRange);
      }
    }

    return ranges;
  }

  /**
   * Analyze block color range
   */
  private analyzeBlockColorRange(data: Uint8ClampedArray, x: number, y: number, size: number, width: number): any {
    // Extract 16x16 block
    const block: number[] = [];
    
    for (let dy = 0; dy < size; dy++) {
      for (let dx = 0; dx < size; dx++) {
        const idx = (y + dy) * width + (x + dx);
        
        if (idx < data.length) {
          block.push(data[idx]);
        }
      }
    }

    // Calculate color range
    const minColor = Math.min(...block);
    const maxColor = Math.max(...block);
    const range = maxColor - minColor;
    
    // Check if range is suspicious
    const inconsistent = range < 50 || range > 200;
    
    return {
      minColor,
      maxColor,
      range,
      inconsistent
    };
  }

  /**
   * Detect selection borders
   */
  private detectSelectionBorders(data: Uint8ClampedArray): any[] {
    const borders: any[] = [];
    
    // Look for selection tool borders
    const edgeMap = this.createEdgeMap(data);
    
    for (let y = 1; y < Math.sqrt(data.length / 4) - 1; y++) {
      for (let x = 1; x < Math.sqrt(data.length / 4) - 1; x++) {
        const idx = y * Math.sqrt(data.length / 4) + x;
        
        // Check for selection border patterns
        if (this.isSelectionBorder(edgeMap, idx, Math.sqrt(data.length / 4))) {
          borders.push({
            x, y,
            type: 'selection_border'
          });
        }
      }
    }

    return borders;
  }

  /**
   * Create edge map
   */
  private createEdgeMap(data: Uint8ClampedArray): number[] {
    const edgeMap = new Array(data.length / 4).fill(0);
    
    for (let i = 1; i < data.length / 4 - 1; i++) {
      const diff = Math.abs(data[i] - data[i - 1]);
      edgeMap[i] = diff > 50 ? 1 : 0;
    }

    return edgeMap;
  }

  /**
   * Check if position is selection border
   */
  private isSelectionBorder(edgeMap: number[], position: number, width: number): boolean {
    // Check surrounding pixels
    const surroundingEdges = [
      edgeMap[position - 1], // top
      edgeMap[position + 1], // bottom
      edgeMap[position - width], // left
      edgeMap[position + width]  // right
    ].filter(edge => edge !== undefined);
    
    // Selection borders often have high edge contrast
    const edgeCount = surroundingEdges.filter(edge => edge === 1).length;
    
    return edgeCount >= 3; // At least 3 edges suggest selection border
  }

  /**
   * Calculate compositing evidence score
   */
  private calculateCompositingEvidence(matteEdges: any[], alphaBlending: any[], colorMismatches: any[], selectionBorders: any[]): number {
    let score = 0;
    
    // Matte edges (strong evidence)
    if (matteEdges.length > 5) {
      score += 0.4;
    }
    
    // Alpha blending (strong evidence)
    if (alphaBlending.length > 3) {
      score += 0.3;
    }
    
    // Color mismatches (moderate evidence)
    if (colorMismatches.length > 2) {
      score += 0.2;
    }
    
    // Selection borders (moderate evidence)
    if (selectionBorders.length > 3) {
      score += 0.2;
    }
    
    return Math.min(score, 1.0);
  }

  /**
   * Classify compositing pattern
   */
  private classifyCompositingPattern(compositingAnalysis: any): string {
    if (compositingAnalysis.matteEdges.length > 8) {
      return 'extensive_matte_edges';
    } else if (compositingAnalysis.alphaBlending.length > 5) {
      return 'alpha_blending_artifacts';
    } else if (compositingAnalysis.colorMismatches.length > 4) {
      return 'color_space_inconsistencies';
    } else if (compositingAnalysis.selectionBorders.length > 5) {
      return 'selection_border_artifacts';
    } else if (compositingAnalysis.compositingScore > 0.5) {
      return 'moderate_compositing';
    } else {
      return 'minimal_compositing';
    }
  }

  /**
   * Detect filter traces
   */
  private async detectFilterTraces(image: ForensicImage): Promise<{detected: boolean, traces: any, pattern: string}> {
    try {
      const img = new Image();
      
      return new Promise((resolve) => {
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          
          if (!ctx) {
            resolve({ detected: false, traces: null, pattern: 'error' });
            return;
          }

          canvas.width = img.width;
          canvas.height = img.height;
          ctx.drawImage(img, 0, 0);

          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const data = imageData.data;

          // Analyze for filter traces
          const filterAnalysis = this.analyzeFilterPatterns(data);
          const filterScore = this.calculateFilterScore(
            filterAnalysis.sharpeningTraces,
            filterAnalysis.blurInconsistencies,
            filterAnalysis.colorEnhancements,
            filterAnalysis.noiseReduction
          );
          const pattern = this.classifyFilterPattern(filterAnalysis);

          const detected = filterScore > 0.3;
          resolve({ 
            detected, 
            traces: filterAnalysis,
            pattern 
          });
        };

        img.onerror = () => {
          resolve({ detected: false, traces: null, pattern: 'error' });
        };

        img.src = image.dataUrl;
      });
    } catch (error) {
      console.error('[Edited Detector] Filter analysis error:', error);
      return { detected: false, traces: null, pattern: 'error' };
    }
  }

  /**
   * Analyze filter patterns
   */
  private analyzeFilterPatterns(data: Uint8ClampedArray): any {
    // Look for evidence of filter application
    const sharpeningTraces = this.detectSharpeningTraces(data);
    const blurInconsistencies = this.detectBlurInconsistencies(data);
    const colorEnhancements = this.detectColorEnhancements(data);
    const noiseReduction = this.detectNoiseReduction(data);
    
    return {
      sharpeningTraces,
      blurInconsistencies,
      colorEnhancements,
      noiseReduction,
      filterScore: this.calculateFilterScore(sharpeningTraces, blurInconsistencies, colorEnhancements, noiseReduction)
    };
  }

  /**
   * Detect sharpening traces
   */
  private detectSharpeningTraces(data: Uint8ClampedArray): any[] {
    const traces: any[] = [];
    
    // Look for over-sharpening artifacts
    const edgeEnhancement = this.analyzeEdgeEnhancement(data);
    
    if (edgeEnhancement.overEnhanced) {
      traces.push({
        type: 'sharpening',
        severity: edgeEnhancement.enhancementLevel,
        pattern: 'edge_over_sharpening'
      });
    }

    return traces;
  }

  /**
   * Analyze edge enhancement
   */
  private analyzeEdgeEnhancement(data: Uint8ClampedArray): any {
    // Convert to grayscale for edge analysis
    const grayData = this.convertToGrayscale(data);
    
    // Detect edges
    const edges = this.detectEdges(grayData);
    
    // Look for over-enhanced edges
    const highContrastEdges = edges.filter(edge => edge > 200).length;
    const totalEdges = edges.filter(edge => edge > 50).length;
    
    const overEnhanced = highContrastEdges / totalEdges > 0.3;
    const enhancementLevel = highContrastEdges / totalEdges;
    
    return {
      overEnhanced,
      enhancementLevel,
      edgeCount: totalEdges
    };
  }

  /**
   * Detect blur inconsistencies
   */
  private detectBlurInconsistencies(data: Uint8ClampedArray): any[] {
    const inconsistencies: any[] = [];
    
    // Look for inconsistent blur patterns
    const blurAnalysis = this.analyzeBlurPatterns(data);
    
    if (blurAnalysis.inconsistent) {
      inconsistencies.push({
        type: 'blur_inconsistency',
        pattern: blurAnalysis.pattern,
        severity: blurAnalysis.inconsistencyLevel
      });
    }

    return inconsistencies;
  }

  /**
   * Analyze blur patterns
   */
  private analyzeBlurPatterns(data: Uint8ClampedArray): any {
    // Convert to grayscale for blur analysis
    const grayData = this.convertToGrayscale(data);
    
    // Analyze local blur levels
    const blurLevels: number[] = [];
    const blockSize = 8;
    
    for (let y = 0; y < grayData.length / blockSize - blockSize; y += blockSize) {
      for (let x = 0; x < Math.sqrt(grayData.length) - blockSize; x += blockSize) {
        const blockBlur = this.calculateLocalBlur(grayData, x, y, Math.sqrt(grayData.length));
        blurLevels.push(blockBlur);
      }
    }

    const avgBlur = blurLevels.reduce((a, b) => a + b, 0) / blurLevels.length;
    const blurVariance = this.calculateVariance(blurLevels);
    
    // Check for inconsistent blur
    const inconsistent = blurVariance > avgBlur * 2;
    
    return {
      inconsistent,
      pattern: inconsistent ? 'inconsistent_blur' : 'consistent_blur',
      inconsistencyLevel: blurVariance / (avgBlur + 1),
      averageBlur: avgBlur
    };
  }

  /**
   * Calculate local blur
   */
  private calculateLocalBlur(grayData: Uint8ClampedArray, x: number, y: number, width: number): number {
    // Calculate local blur in 8x8 block
    let totalVariance = 0;
    let samples = 0;

    for (let dy = 0; dy < 8; dy++) {
      for (let dx = 0; dx < 8; dx++) {
        const idx = (y + dy) * width + (x + dx);
        
        if (idx + 3 < grayData.length) {
          const center = grayData[idx];
          
          // Calculate local variance
          let localVariance = 0;
          let localSamples = 0;
          
          for (let ldy = -1; ldy <= 1; ldy++) {
            for (let ldx = -1; ldx <= 1; ldx++) {
              const nidx = (y + ldy) * width + (x + ldx);
              
              if (nidx >= 0 && nidx < grayData.length) {
                const diff = grayData[nidx] - center;
                localVariance += diff * diff;
                localSamples++;
              }
            }
          }
          
          if (localSamples > 0) {
            totalVariance += localVariance / localSamples;
            samples++;
          }
        }
      }
    }

    return samples > 0 ? Math.sqrt(totalVariance / samples) : 0;
  }

  /**
   * Detect color enhancements
   */
  private detectColorEnhancements(data: Uint8ClampedArray): any[] {
    const enhancements: any[] = [];
    
    // Look for oversaturated colors
    const saturationAnalysis = this.analyzeSaturation(data);
    
    if (saturationAnalysis.oversaturated) {
      enhancements.push({
        type: 'oversaturation',
        level: saturationAnalysis.saturationLevel,
        pattern: 'color_enhancement'
      });
    }

    return enhancements;
  }

  /**
   * Analyze saturation
   */
  private analyzeSaturation(data: Uint8ClampedArray): any {
    // Convert to HSV for saturation analysis
    const hsvData = this.convertToHSV(data);
    
    // Analyze saturation levels
    const saturations: number[] = [];
    
    for (let i = 0; i < hsvData.length; i += 3) {
      saturations.push(hsvData[i + 1]); // Saturation is at index 1
    }

    const avgSaturation = saturations.reduce((a, b) => a + b, 0) / saturations.length;
    const maxSaturation = Math.max(...saturations);
    
    const oversaturated = maxSaturation > 240;
    const saturationLevel = avgSaturation / 255;
    
    return {
      oversaturated,
      saturationLevel,
      averageSaturation: avgSaturation
    };
  }

  /**
   * Convert to HSV
   */
  private convertToHSV(data: Uint8ClampedArray): number[] {
    const hsv: number[] = [];
    
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i] / 255;
      const g = data[i + 1] / 255;
      const b = data[i + 2] / 255;
      
      const hsv = this.rgbToHSV(r, g, b);
      hsv.push(...hsv);
    }
    
    return hsv;
  }

  /**
   * RGB to HSV conversion
   */
  private rgbToHSV(r: number, g: number, b: number): number[] {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const diff = max - min;
    
    if (diff === 0) return [0, 0, 0];
    
    const maxC = max / 255;
    const minC = min / 255;
    const diffC = maxC - minC;
    
    let h = 0;
    let s = 0;
    let v = maxC;
    
    if (diffC !== 0) {
      const rNorm = (maxC - r) / diffC;
      const gNorm = (maxC - g) / diffC;
      const bNorm = (maxC - b) / diffC;
      
      const maxNorm = Math.max(rNorm, gNorm, bNorm);
      const minNorm = Math.min(rNorm, gNorm, bNorm);
      
      if (maxNorm === minNorm) {
        h = 0;
        s = maxC;
      } else {
        const deltaH = 60 * (maxNorm - minNorm) / (bNorm - gNorm);
        
        if (bNorm === maxNorm) {
          h = deltaH;
          s = maxC;
        } else if (gNorm === maxNorm) {
          h = 120 + deltaH;
          s = maxC;
        } else if (rNorm === maxNorm) {
          h = 240 + deltaH;
          s = maxC;
        } else {
          h = (rNorm + gNorm + bNorm - maxNorm - minNorm) * 60 / (bNorm - minNorm);
          s = maxC;
        }
      }
    }
    
    return [h, s, v];
  }

  /**
   * Detect noise reduction
   */
  private detectNoiseReduction(data: Uint8ClampedArray): any {
    const reduction: any[] = [];
    
    // Look for over-smoothed areas (noise reduction)
    const smoothnessAnalysis = this.analyzeSmoothnessPatterns(data);
    
    if (smoothnessAnalysis.oversmoothed) {
      reduction.push({
        type: 'noise_reduction',
        level: smoothnessAnalysis.smoothnessLevel,
        pattern: 'excessive_noise_reduction'
      });
    }

    return reduction;
  }

  /**
   * Analyze smoothness patterns
   */
  private analyzeSmoothnessPatterns(data: Uint8ClampedArray): any {
    // Convert to grayscale for analysis
    const grayData = this.convertToGrayscale(data);
    
    // Analyze local variance
    const blockSize = 8;
    const variances: number[] = [];
    
    for (let y = 0; y < grayData.length / blockSize - blockSize; y += blockSize) {
      for (let x = 0; x < Math.sqrt(grayData.length) - blockSize; x += blockSize) {
        const blockVariance = this.calculateLocalVariance(grayData, x, y, Math.sqrt(grayData.length));
        variances.push(blockVariance);
      }
    }

    const avgVariance = variances.reduce((a, b) => a + b, 0) / variances.length;
    const varianceVariance = this.calculateVariance(variances);
    
    const oversmoothed = varianceVariance < avgVariance * 0.3;
    const smoothnessLevel = avgVariance / (avgVariance + 1);
    
    return {
      oversmoothed,
      smoothnessLevel,
      averageVariance: avgVariance
    };
  }

  /**
   * Calculate filter evidence score
   */
  private calculateFilterScore(sharpeningTraces: any[], blurInconsistencies: any[], colorEnhancements: any[], noiseReduction: any[]): number {
    let score = 0;
    
    // Sharpening traces (strong evidence)
    if (sharpeningTraces.length > 2) {
      score += 0.3;
    }
    
    // Blur inconsistencies (moderate evidence)
    if (blurInconsistencies.length > 1) {
      score += 0.2;
    }
    
    // Color enhancements (moderate evidence)
    if (colorEnhancements.length > 2) {
      score += 0.2;
    }
    
    // Noise reduction (moderate evidence)
    if (noiseReduction.length > 1) {
      score += 0.2;
    }
    
    return Math.min(score, 1.0);
  }

  /**
   * Classify filter pattern
   */
  private classifyFilterPattern(filterAnalysis: any): string {
    if (filterAnalysis.sharpeningTraces.length > 5) {
      return 'extensive_sharpening';
    } else if (filterAnalysis.blurInconsistencies.length > 3) {
      return 'blur_inconsistencies';
    } else if (filterAnalysis.colorEnhancements.length > 4) {
      return 'color_enhancements';
    } else if (filterAnalysis.noiseReduction.length > 2) {
      return 'noise_reduction';
    } else if (filterAnalysis.filterScore > 0.5) {
      return 'moderate_filtering';
    } else {
      return 'minimal_filtering';
    }
  }

  /**
   * Detect recompression artifacts
   */
  private async detectRecompressionArtifacts(image: ForensicImage): Promise<{detected: boolean, artifacts: any, pattern: string}> {
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

          // Analyze for recompression artifacts
          const recompressionAnalysis = this.analyzeRecompressionPatterns(data);
          const artifactScore = this.calculateRecompressionEvidence(recompressionAnalysis.jpegArtifacts, recompressionAnalysis.blockingArtifacts, recompressionAnalysis.quantizationIssues);
          const pattern = this.classifyRecompressionPattern(recompressionAnalysis);

          const detected = artifactScore > 0.3;
          resolve({ 
            detected, 
            artifacts: recompressionAnalysis,
            pattern 
          });
        };

        img.onerror = () => {
          resolve({ detected: false, artifacts: null, pattern: 'error' });
        };

        img.src = image.dataUrl;
      });
    } catch (error) {
      console.error('[Edited Detector] Recompression analysis error:', error);
      return { detected: false, artifacts: null, pattern: 'error' };
    }
  }

  /**
   * Analyze recompression patterns
   */
  private analyzeRecompressionPatterns(data: Uint8ClampedArray): any {
    // Look for signs of multiple compression cycles
    const jpegArtifacts = this.analyzeJPEGArtifacts(data);
    const blockingArtifacts = this.analyzeBlockingArtifacts(data);
    const quantizationIssues = this.analyzeQuantizationIssues(data);
    
    return {
      jpegArtifacts,
      blockingArtifacts,
      quantizationIssues,
      recompressionScore: this.calculateRecompressionEvidence(jpegArtifacts, blockingArtifacts, quantizationIssues)
    };
  }

  /**
   * Analyze JPEG artifacts
   */
  private analyzeJPEGArtifacts(data: Uint8ClampedArray): any {
    // Look for double compression artifacts
    const blockSize = 8;
    const artifactScores: number[] = [];
    
    for (let y = 0; y < data.length / (blockSize * 4) - blockSize; y += blockSize) {
      for (let x = 0; x < Math.sqrt(data.length / 4) - blockSize; x += blockSize) {
        const blockScore = this.analyzeBlockArtifacts(data, x, y, blockSize, Math.sqrt(data.length / 4));
        artifactScores.push(blockScore);
      }
    }

    const avgArtifactScore = artifactScores.reduce((a, b) => a + b, 0) / artifactScores.length;
    const highArtifactCount = artifactScores.filter(score => score > 100).length;
    
    return {
      averageArtifactScore: avgArtifactScore,
      highArtifactCount,
      artifactPattern: this.classifyJPEGArtifactPattern(avgArtifactScore, highArtifactCount)
    };
  }

  /**
   * Analyze block artifacts
   */
  private analyzeBlockArtifacts(data: Uint8ClampedArray, x: number, y: number, size: number, width: number): number {
    // Look for double compression artifacts in 8x8 block
    const block: number[] = [];
    
    for (let dy = 0; dy < size; dy++) {
      for (let dx = 0; dx < size; dx++) {
        const idx = (y + dy) * width + (x + dx);
        
        if (idx + 3 < data.length) {
          block.push(data[idx]);
        }
      }
    }

    // Calculate artifact score
    let artifactScore = 0;
    
    for (let i = 1; i < block.length; i++) {
      const diff = Math.abs(block[i] - block[i - 1]);
      
      // High frequency differences suggest recompression
      if (diff > 50) {
        artifactScore += diff;
      }
    }

    return artifactScore;
  }

  /**
   * Classify JPEG artifact pattern
   */
  private classifyJPEGArtifactPattern(avgScore: number, highCount: number): string {
    if (avgScore > 150) {
      return 'heavy_compression_artifacts';
    } else if (highCount > 5) {
      return 'frequent_high_artifacts';
    } else if (avgScore > 80) {
      return 'moderate_compression_artifacts';
    } else {
      return 'minimal_artifacts';
    }
  }

  /**
   * Analyze blocking artifacts
   */
  private analyzeBlockingArtifacts(data: Uint8ClampedArray): any {
    // Look for blocking artifacts from recompression
    const blockSize = 8;
    const blockingScores: number[] = [];
    
    for (let y = 0; y < data.length / (blockSize * 4) - blockSize; y += blockSize) {
      for (let x = 0; x < Math.sqrt(data.length / 4) - blockSize; x += blockSize) {
        const blockScore = this.analyzeBlockBlocking(data, x, y, blockSize, Math.sqrt(data.length / 4));
        blockingScores.push(blockScore);
      }
    }

    const avgBlockingScore = blockingScores.reduce((a, b) => a + b, 0) / blockingScores.length;
    const highBlockingCount = blockingScores.filter(score => score > 0.7).length;
    
    return {
      averageBlockingScore: avgBlockingScore,
      highBlockingCount,
      blockingPattern: this.classifyBlockingPattern(avgBlockingScore, highBlockingCount)
    };
  }

  /**
   * Analyze block blocking
   */
  private analyzeBlockBlocking(data: Uint8ClampedArray, x: number, y: number, size: number, width: number): number {
    // Look for 8x8 block boundaries
    const block: number[] = [];
    
    for (let dy = 0; dy < size; dy++) {
      for (let dx = 0; dx < size; dx++) {
        const idx = (y + dy) * width + (x + dx);
        
        if (idx + 3 < data.length) {
          block.push(data[idx]);
        }
      }
    }

    // Calculate blocking score
    let blockingScore = 0;
    
    for (let i = 0; i < block.length; i++) {
      // Check edges of block
      if (i === 0 || i === size - 1 || i === (size - 1) * width || i === (size - width + 1)) {
        // Edge pixels - calculate the original index
        const blockY = Math.floor(i / size);
        const blockX = i % size;
        const idx = (y + blockY) * width + (x + blockX);
        
        if (idx + 3 < data.length && block[i] > 100) {
          blockingScore += 1;
        }
      }
    }

    return blockingScore / (size * 2 + size * 2); // Normalize
  }

  /**
   * Classify blocking pattern
   */
  private classifyBlockingPattern(avgScore: number, highCount: number): string {
    if (avgScore > 0.8) {
      return 'heavy_blocking_artifacts';
    } else if (highCount > 3) {
      return 'frequent_blocking';
    } else if (avgScore > 0.4) {
      return 'moderate_blocking';
    } else {
      return 'minimal_blocking';
    }
  }

  /**
   * Analyze quantization issues
   */
  private analyzeQuantizationIssues(data: Uint8ClampedArray): any {
    // Look for quantization problems
    const colorBands = this.analyzeColorBands(data);
    const posterization = this.analyzePosterization(data);
    
    return {
      colorBands,
      posterization,
      quantizationScore: this.calculateQuantizationEvidence(colorBands, posterization)
    };
  }

  /**
   * Analyze color bands
   */
  private analyzeColorBands(data: Uint8ClampedArray): any {
    // Look for limited color bands (sign of recompression)
    const uniqueColors = new Set();
    
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const color = `${r},${g},${b}`;
      uniqueColors.add(color);
    }

    const colorCount = uniqueColors.size;
    const limitedColors = colorCount < 256; // Should be much less for natural images
    
    return {
      colorCount,
      limitedColors,
      colorReduction: 1 - (colorCount / 256)
    };
  }

  /**
   * Analyze posterization
   */
  private analyzePosterization(data: Uint8ClampedArray): any {
    // Look for posterization artifacts
    const blockSize = 4;
    const posterizationScores: number[] = [];
    
    for (let y = 0; y < data.length / (blockSize * 4) - blockSize; y += blockSize) {
      for (let x = 0; x < Math.sqrt(data.length / 4) - blockSize; x += blockSize) {
        const blockScore = this.analyzeBlockPosterization(data, x, y, blockSize, Math.sqrt(data.length / 4));
        posterizationScores.push(blockScore);
      }
    }

    const averagePosterization = posterizationScores.reduce((a, b) => a + b, 0) / posterizationScores.length;
    const highPosterizationCount = posterizationScores.filter(score => score > 0.6).length;
    
    return {
      averagePosterization,
      highPosterizationCount,
      posterizationPattern: this.classifyPosterizationPattern(averagePosterization, highPosterizationCount)
    };
  }

  /**
   * Analyze block posterization
   */
  private analyzeBlockPosterization(data: Uint8ClampedArray, x: number, y: number, size: number, width: number): number {
    // Look for posterization in 4x4 block
    const block: number[] = [];
    
    for (let dy = 0; dy < size; dy++) {
      for (let dx = 0; dx < size; dx++) {
        const idx = (y + dy) * width + (x + dx);
        
        if (idx + 3 < data.length) {
          block.push(data[idx]);
        }
      }
    }

    // Calculate unique colors in block
    const uniqueColors = new Set(block);
    const colorCount = uniqueColors.size;
    
    // High posterization if very few colors
    return colorCount < 8 ? 0.8 : 0.2;
  }

  /**
   * Classify posterization pattern
   */
  private classifyPosterizationPattern(avgScore: number, highCount: number): string {
    if (avgScore > 0.7) {
      return 'heavy_posterization';
    } else if (highCount > 2) {
      return 'frequent_posterization';
    } else if (avgScore > 0.4) {
      return 'moderate_posterization';
    } else {
      return 'minimal_posterization';
    }
  }

  /**
   * Calculate quantization evidence score
   */
  private calculateQuantizationEvidence(colorBands: any, posterization: any): number {
    let score = 0;
    
    // Limited color bands (strong evidence)
    if (colorBands.limitedColors) {
      score += 0.4;
    }
    
    // High posterization (strong evidence)
    if (posterization.averagePosterization > 0.6) {
      score += 0.4;
    }
    
    // Color reduction (moderate evidence)
    if (colorBands.colorReduction > 0.5) {
      score += 0.2;
    }
    
    return Math.min(score, 1.0);
  }

  /**
   * Calculate recompression evidence score
   */
  private calculateRecompressionEvidence(jpegArtifacts: any, blockingArtifacts: any, quantizationIssues: any): number {
    let score = 0;
    
    // JPEG artifacts (strong evidence)
    if (jpegArtifacts.averageArtifactScore > 100) {
      score += 0.3;
    }
    
    // Blocking artifacts (strong evidence)
    if (blockingArtifacts.averageBlockingScore > 0.6) {
      score += 0.3;
    }
    
    // Quantization issues (moderate evidence)
    if (quantizationIssues.quantizationScore > 0.4) {
      score += 0.2;
    }
    
    return Math.min(score, 1.0);
  }

  /**
   * Classify recompression pattern
   */
  private classifyRecompressionPattern(recompressionAnalysis: any): string {
    if (recompressionAnalysis.jpegArtifacts.averageArtifactScore > 150) {
      return 'heavy_recompression';
    } else if (recompressionAnalysis.blockingArtifacts.highBlockingCount > 3) {
      return 'frequent_blocking';
    } else if (recompressionAnalysis.quantizationIssues.posterization.highPosterizationCount > 2) {
      return 'posterization_artifacts';
    } else if (recompressionAnalysis.jpegArtifacts.averageArtifactScore > 80) {
      return 'moderate_recompression';
    } else {
      return 'minimal_recompression';
    }
  }

  /**
   * Detect crop boundary traces
   */
  private async detectCropBoundaries(image: ForensicImage): Promise<{detected: boolean, boundaries: any, pattern: string}> {
    try {
      const img = new Image();
      
      return new Promise((resolve) => {
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          
          if (!ctx) {
            resolve({ detected: false, boundaries: null, pattern: 'error' });
            return;
          }

          canvas.width = img.width;
          canvas.height = img.height;
          ctx.drawImage(img, 0, 0);

          const imageData = ctx.getImageData(0, 0, canvas.width, img.height);
          const data = imageData.data;

          // Analyze for crop boundary traces
          const boundaryAnalysis = this.analyzeCropBoundaries(data, img.width, img.height);
          const boundaryScore = this.calculateCropBoundaryScore(boundaryAnalysis);
          const pattern = this.classifyCropPattern(boundaryAnalysis);

          const detected = boundaryScore > 0.3;
          resolve({ 
            detected, 
            boundaries: boundaryAnalysis,
            pattern 
          });
        };

        img.onerror = () => {
          resolve({ detected: false, boundaries: null, pattern: 'error' });
        };

        img.src = image.dataUrl;
      });
    } catch (error) {
      console.error('[Edited Detector] Crop boundary analysis error:', error);
      return { detected: false, boundaries: null, pattern: 'error' };
    }
  }

  /**
   * Analyze crop boundaries
   */
  private analyzeCropBoundaries(data: Uint8ClampedArray, width: number, height: number): any {
    // Look for sudden transitions that might indicate cropping
    const edgeMap = this.createEdgeMap(data);
    const boundaryCandidates = this.detectBoundaryCandidates(edgeMap, width, height);
    const boundaryAnalysis = this.analyzeBoundaryCharacteristics(boundaryCandidates);
    
    return {
      edgeMap,
      boundaryCandidates,
      characteristics: boundaryAnalysis
    };
  }

  /**
   * Detect boundary candidates
   */
  private detectBoundaryCandidates(edgeMap: number[], width: number, height: number): any[] {
    const candidates: any[] = [];
    
    // Look for potential crop boundaries
    for (let y = 10; y < height - 10; y += 20) {
      for (let x = 10; x < width - 10; x += 20) {
        const idx = y * width + x;
        
        if (this.isBoundaryEdge(edgeMap, idx, width, height)) {
          candidates.push({
            x, y,
            edgeStrength: edgeMap[idx],
            type: 'potential_boundary'
          });
        }
      }
    }

    return candidates;
  }

  /**
   * Check if position is boundary edge
   */
  private isBoundaryEdge(edgeMap: number[], position: number, width: number, height: number): boolean {
    const x = position % width;
    const y = Math.floor(position / width);
    
    // Check if position is within image bounds
    if (x < 0 || x >= width || y < 0 || y >= height) {
      return false;
    }
    
    // Check if this position has strong edges around it
    const surroundingEdges = [
      edgeMap[position - 1], // left
      edgeMap[position + 1], // right
      edgeMap[position - width], // top
      edgeMap[position + width], // bottom
      edgeMap[position - width - 1], // top-left
      edgeMap[position - width + 1], // top-right
      edgeMap[position + width - 1], // bottom-left
      edgeMap[position + width + 1]  // bottom-right
    ].filter(edge => edge !== undefined && edge > 100);
    
    return surroundingEdges.length >= 3;
  }

  /**
   * Analyze boundary characteristics
   */
  private analyzeBoundaryCharacteristics(candidates: any[]): any {
    if (candidates.length === 0) {
      return {
        boundaryCount: 0,
        avgStrength: 0,
        pattern: 'no_boundaries'
      };
    }

    const strengths = candidates.map(c => c.edgeStrength);
    const avgStrength = strengths.reduce((a, b) => a + b, 0) / strengths.length;
    const strengthVariance = this.calculateVariance(strengths);
    
    // Analyze boundary pattern
    const boundaryPattern = this.classifyBoundaryPattern(candidates, avgStrength, strengthVariance);
    
    return {
      boundaryCount: candidates.length,
      avgStrength,
      strengthVariance,
      pattern: boundaryPattern
    };
  }

  /**
   * Classify boundary pattern
   */
  private classifyBoundaryPattern(candidates: any[], avgStrength: number, variance: number): string {
    if (candidates.length > 8) {
      return 'excessive_boundaries';
    } else if (variance > avgStrength * 2) {
      return 'inconsistent_boundaries';
    } else if (avgStrength > 150) {
      return 'strong_boundaries';
    } else {
      return 'minimal_boundaries';
    }
  }

  /**
   * Calculate crop boundary score
   */
  private calculateCropBoundaryScore(boundaryAnalysis: any): number {
    let score = 0;
    
    // Strong boundaries (strong evidence)
    if (boundaryAnalysis.boundaryCount > 5) {
      score += 0.4;
    }
    
    // Inconsistent boundaries (moderate evidence)
    if (boundaryAnalysis.pattern === 'inconsistent_boundaries') {
      score += 0.3;
    }
    
    // High strength boundaries (moderate evidence)
    if (boundaryAnalysis.avgStrength > 120) {
      score += 0.2;
    }
    
    return Math.min(score, 1.0);
  }

  /**
   * Classify crop pattern
   */
  private classifyCropPattern(boundaryAnalysis: any): string {
    if (boundaryAnalysis.boundaryCount > 10) {
      return 'extensive_boundary_artifacts';
    } else if (boundaryAnalysis.pattern === 'inconsistent_boundaries') {
      return 'inconsistent_crop_boundaries';
    } else if (boundaryAnalysis.avgStrength > 150) {
      return 'strong_boundary_evidence';
    } else if (boundaryAnalysis.boundaryCount > 5) {
      return 'moderate_crop_evidence';
    } else {
      return 'minimal_crop_indicators';
    }
  }

  /**
   * Evaluate manipulation based on all detection methods
   */
  private evaluateManipulation(
    lightingResult: any,
    cloningResult: any,
    compositingResult: any,
    filterResult: any,
    recompressionResult: any,
    cropResult: any
  ): boolean {
    // Weighted evaluation of manipulation evidence
    let evidenceScore = 0;
    let totalWeight = 0;

    // Inconsistent lighting (moderate evidence)
    if (lightingResult.inconsistent) {
      evidenceScore += 2 * 0.6;
      totalWeight += 2;
    }

    // Cloning artifacts (strong evidence)
    if (cloningResult.detected) {
      evidenceScore += 3 * 0.8;
      totalWeight += 3;
    }

    // Compositing edges (strong evidence)
    if (compositingResult.detected) {
      evidenceScore += 2.5 * 0.7;
      totalWeight += 2.5;
    }

    // Filter traces (moderate evidence)
    if (filterResult.detected) {
      evidenceScore += 1.5 * 0.5;
      totalWeight += 1.5;
    }

    // Recompression artifacts (moderate evidence)
    if (recompressionResult.detected) {
      evidenceScore += 1 * 0.4;
      totalWeight += 1;
    }

    // Crop boundaries (weak evidence)
    if (cropResult.detected) {
      evidenceScore += 0.5 * 0.3;
      totalWeight += 0.5;
    }

    const finalScore = totalWeight > 0 ? evidenceScore / totalWeight : 0;
    return finalScore > 0.4;
  }

  /**
   * Calculate confidence based on all detection methods
   */
  private calculateConfidence(
    lightingResult: any,
    cloningResult: any,
    compositingResult: any,
    filterResult: any,
    recompressionResult: any,
    cropResult: any
  ): number {
    let confidence = 0;
    let methods = 0;

    if (lightingResult.inconsistent) {
      confidence += 0.15;
      methods++;
    }
    if (cloningResult.detected) {
      confidence += 0.20;
      methods++;
    }
    if (compositingResult.detected) {
      confidence += 0.20;
      methods++;
    }
    if (filterResult.detected) {
      confidence += 0.15;
      methods++;
    }
    if (recompressionResult.detected) {
      confidence += 0.15;
      methods++;
    }
    if (cropResult.detected) {
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
   * Helper: Calculate local variance for a specific block
   */
  private calculateLocalVariance(grayData: Uint8ClampedArray, x: number, y: number, width: number): number {
    const blockSize = 8;
    const block: number[] = [];
    
    for (let dy = 0; dy < blockSize; dy++) {
      for (let dx = 0; dx < blockSize; dx++) {
        const index = (y + dy) * width + (x + dx);
        if (index < grayData.length) {
          block.push(grayData[index]);
        }
      }
    }
    
    return this.calculateVariance(block);
  }

  }
