/**
 * Screenshot Detector
 * Priority 2: Detects screenshots using UI analysis
 */

import { ScreenshotDetectionResult, ForensicImage } from '../types';

export class ScreenshotDetector {
  /**
   * Detect if image is a screenshot
   * @param image Forensic image to analyze
   * @returns Screenshot detection result
   */
  async detect(image: ForensicImage): Promise<ScreenshotDetectionResult> {
    try {
      console.log('[Screenshot Detector] Starting screenshot detection...');
      
      const evidence: Record<string, any> = {};
      const reasoning: string[] = [];

      // Method 1: UI edge concentration
      const edgeResult = await this.detectUIEdges(image);
      evidence.ui_edges = edgeResult.concentration;
      evidence.edge_density = edgeResult.density;
      if (edgeResult.detected) {
        reasoning.push(`UI edge concentration detected: ${edgeResult.pattern}`);
      }

      // Method 2: Text density analysis
      const textResult = await this.analyzeTextDensity(image);
      evidence.text_density = textResult.density;
      evidence.text_regions = textResult.regions;
      if (textResult.detected) {
        reasoning.push(`High text density detected: ${textResult.density.toFixed(2)}`);
      }

      // Method 3: Screen aspect ratios
      const ratioResult = await this.analyzeScreenRatios(image);
      evidence.screen_ratio = ratioResult.isScreenRatio;
      evidence.aspect_ratio = ratioResult.ratio;
      if (ratioResult.isScreenRatio) {
        reasoning.push(`Screen aspect ratio detected: ${ratioResult.ratio}`);
      }

      // Method 4: Display pixel grid patterns
      const gridResult = await this.analyzePixelGrid(image);
      evidence.pixel_grid = gridResult.detected;
      evidence.grid_pattern = gridResult.pattern;
      if (gridResult.detected) {
        reasoning.push(`Display pixel grid patterns detected`);
      }

      // Method 5: Histogram flatness
      const histogramResult = await this.analyzeHistogramFlatness(image);
      evidence.histogram_flatness = histogramResult.flatness;
      evidence.color_distribution = histogramResult.distribution;
      if (histogramResult.flat) {
        reasoning.push(`Histogram flatness detected: ${histogramResult.flatness.toFixed(2)}`);
      }

      // Method 6: Absence of camera sensor noise
      const noiseResult = await this.analyzeCameraNoiseAbsence(image);
      evidence.noise_absence = noiseResult.absent;
      evidence.noise_level = noiseResult.level;
      if (noiseResult.absent) {
        reasoning.push(`Camera sensor noise absent: ${noiseResult.level.toFixed(2)}`);
      }

      const detected = this.evaluateScreenshotOrigin(
        edgeResult,
        textResult,
        ratioResult,
        gridResult,
        histogramResult,
        noiseResult
      );

      const confidence = this.calculateConfidence(
        edgeResult,
        textResult,
        ratioResult,
        gridResult,
        histogramResult,
        noiseResult
      );

      console.log(`[Screenshot Detector] Detection complete: ${detected ? 'SCREENSHOT' : 'NOT_SCREENSHOT'} (confidence: ${confidence})`);

      return {
        detected,
        confidence,
        evidence,
        reasoning,
        ui_elements: edgeResult.detected,
        text_density: textResult.density,
        screen_ratio: ratioResult.isScreenRatio,
        pixel_grid: gridResult.detected,
        histogram_flatness: histogramResult.flatness
      };

    } catch (error) {
      console.error('[Screenshot Detector] Error:', error);
      return {
        detected: false,
        confidence: 0,
        evidence: {},
        reasoning: ['Detection failed due to error'],
        ui_elements: false,
        text_density: 0,
        screen_ratio: false,
        pixel_grid: false,
        histogram_flatness: 0
      };
    }
  }

  /**
   * Detect UI edge concentration
   */
  private async detectUIEdges(image: ForensicImage): Promise<{detected: boolean, concentration: number, density: number, pattern: string}> {
    try {
      const img = new Image();
      
      return new Promise((resolve) => {
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          
          if (!ctx) {
            resolve({ detected: false, concentration: 0, density: 0, pattern: 'error' });
            return;
          }

          canvas.width = img.width;
          canvas.height = img.height;
          ctx.drawImage(img, 0, 0);

          // Convert to grayscale for edge detection
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const grayData = this.convertToGrayscale(imageData.data);

          // Detect edges using Canny edge detection
          const edges = this.detectCannyEdges(grayData, canvas.width, canvas.height);
          
          // Analyze edge characteristics for UI patterns
          const edgeAnalysis = this.analyzeUIEdgePatterns(edges, canvas.width, canvas.height);
          const concentration = this.calculateUIEdgeConcentration(edgeAnalysis);
          const pattern = this.classifyUIEdgePattern(edgeAnalysis);

          const detected = concentration > 0.3;
          resolve({ 
            detected, 
            concentration,
            density: edgeAnalysis.density,
            pattern 
          });
        };

        img.onerror = () => {
          resolve({ detected: false, concentration: 0, density: 0, pattern: 'error' });
        };

        img.src = image.dataUrl;
      });
    } catch (error) {
      console.error('[Screenshot Detector] UI edge detection error:', error);
      return { detected: false, concentration: 0, density: 0, pattern: 'error' };
    }
  }

  /**
   * Detect edges using Canny edge detection
   */
  private detectCannyEdges(grayData: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray {
    const edges = new Uint8ClampedArray(grayData.length);
    
    // Simplified Canny edge detection
    const lowThreshold = 50;
    const highThreshold = 150;
    
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        
        // Calculate gradient magnitude
        const gradient = this.calculateGradientMagnitude(grayData, x, y, width, height);
        
        // Apply threshold
        edges[idx] = gradient > highThreshold ? 255 : (gradient > lowThreshold ? 128 : 0);
      }
    }
    
    return edges;
  }

  /**
   * Calculate gradient magnitude
   */
  private calculateGradientMagnitude(data: Uint8ClampedArray, x: number, y: number, width: number, height: number): number {
    // Sobel operator for gradient calculation
    const sobelX = this.applySobelKernel(data, x, y, width, height, 'x');
    const sobelY = this.applySobelKernel(data, x, y, width, height, 'y');
    
    return Math.sqrt(sobelX * sobelX + sobelY * sobelY);
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
   * Analyze UI edge patterns
   */
  private analyzeUIEdgePatterns(edges: Uint8ClampedArray, width: number, height: number): any {
    const edgePixels = Array.from(edges).filter(pixel => pixel > 0);
    const totalPixels = edges.length;
    const edgeDensity = edgePixels.length / totalPixels;
    
    // Look for UI-specific patterns
    const horizontalLines = this.detectHorizontalLines(edges, width, height);
    const verticalLines = this.detectVerticalLines(edges, width, height);
    const rightAngles = this.detectRightAngles(edges, width, height);
    const rectangles = this.detectRectangles(edges, width, height);
    
    // Analyze edge distribution
    const edgeDistribution = this.analyzeEdgeDistribution(edges, width, height);
    
    return {
      density: edgeDensity,
      horizontalLines: horizontalLines.length,
      verticalLines: verticalLines.length,
      rightAngles: rightAngles.length,
      rectangles: rectangles.length,
      distribution: edgeDistribution
    };
  }

  /**
   * Detect horizontal lines (UI elements)
   */
  private detectHorizontalLines(edges: Uint8ClampedArray, width: number, height: number): any[] {
    const lines: any[] = [];
    
    for (let y = 0; y < height; y++) {
      let consecutiveEdges = 0;
      let maxConsecutive = 0;
      
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        if (edges[idx] > 0) {
          consecutiveEdges++;
          maxConsecutive = Math.max(maxConsecutive, consecutiveEdges);
        } else {
          consecutiveEdges = 0;
        }
      }
      
      // If we have long horizontal edge sequences, likely UI element
      if (maxConsecutive > width * 0.3) {
        lines.push({
          y,
          startX: 0,
          endX: width - 1,
          length: maxConsecutive
        });
      }
    }
    
    return lines;
  }

  /**
   * Detect vertical lines (UI elements)
   */
  private detectVerticalLines(edges: Uint8ClampedArray, width: number, height: number): any[] {
    const lines: any[] = [];
    
    for (let x = 0; x < width; x++) {
      let consecutiveEdges = 0;
      let maxConsecutive = 0;
      
      for (let y = 0; y < height; y++) {
        const idx = y * width + x;
        if (edges[idx] > 0) {
          consecutiveEdges++;
          maxConsecutive = Math.max(maxConsecutive, consecutiveEdges);
        } else {
          consecutiveEdges = 0;
        }
      }
      
      // If we have long vertical edge sequences, likely UI element
      if (maxConsecutive > height * 0.3) {
        lines.push({
          x,
          startY: 0,
          endY: height - 1,
          length: maxConsecutive
        });
      }
    }
    
    return lines;
  }

  /**
   * Detect right angles (UI corners)
   */
  private detectRightAngles(edges: Uint8ClampedArray, width: number, height: number): any[] {
    const corners: any[] = [];
    
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        
        if (edges[idx] > 0) {
          // Check for right angle patterns
          const horizontal = this.detectHorizontalEdge(edges, x, y, width, height);
          const vertical = this.detectVerticalEdge(edges, x, y, width, height);
          
          // Right angle if both horizontal and vertical edges present
          if (horizontal && vertical) {
            corners.push({
              x,
              y,
              type: 'right_angle'
            });
          }
        }
      }
    }
    
    return corners;
  }

  /**
   * Detect rectangles (UI windows/buttons)
   */
  private detectRectangles(edges: Uint8ClampedArray, width: number, height: number): any[] {
    const rectangles: any[] = [];
    
    // Simple rectangle detection based on edge patterns
    for (let y = 10; y < height - 10; y += 5) {
      for (let x = 10; x < width - 10; x += 5) {
        const hasRectangleEdges = this.checkRectangleEdges(edges, x, y, width, height, 20, 10);
        
        if (hasRectangleEdges) {
          rectangles.push({
            x,
            y,
            width: 20,
            height: 10,
            type: 'ui_element'
          });
        }
      }
    }
    
    return rectangles;
  }

  /**
   * Check for rectangle edges
   */
  private checkRectangleEdges(edges: Uint8ClampedArray, startX: number, startY: number, width: number, height: number, rectWidth: number, rectHeight: number): boolean {
    // Check if rectangle has edges on all sides
    const topEdge = this.hasHorizontalEdge(edges, startX, startY, width, height, rectWidth);
    const bottomEdge = this.hasHorizontalEdge(edges, startX, startY + rectHeight - 1, width, height, rectWidth);
    const leftEdge = this.hasVerticalEdge(edges, startX, startY, width, height, rectHeight);
    const rightEdge = this.hasVerticalEdge(edges, startX + rectWidth - 1, startY, width, height, rectHeight);
    
    return topEdge && bottomEdge && leftEdge && rightEdge;
  }

  /**
   * Detect horizontal edge
   */
  private detectHorizontalEdge(edges: Uint8ClampedArray, x: number, y: number, width: number, height: number, length: number): boolean {
    let edgeCount = 0;
    
    for (let i = 0; i < length; i++) {
      const idx = y * width + x + i;
      if (idx < edges.length && edges[idx] > 0) {
        edgeCount++;
      }
    }
    
    return edgeCount > length * 0.7; // Most of the line has edges
  }

  /**
   * Detect vertical edge
   */
  private detectVerticalEdge(edges: Uint8ClampedArray, x: number, y: number, width: number, height: number, length: number): boolean {
    let edgeCount = 0;
    
    for (let i = 0; i < length; i++) {
      const idx = (y + i) * width + x;
      if (idx < edges.length && edges[idx] > 0) {
        edgeCount++;
      }
    }
    
    return edgeCount > length * 0.7; // Most of the line has edges
  }

  /**
   * Analyze edge distribution
   */
  private analyzeEdgeDistribution(edges: Uint8ClampedArray, width: number, height: number): any {
    const edgePixels = Array.from(edges).filter(pixel => pixel > 0);
    const totalPixels = edges.length;
    const edgeDensity = edgePixels.length / totalPixels;
    
    // Analyze spatial distribution of edges
    const spatialDistribution = this.analyzeSpatialDistribution(edgePixels, width, height);
    
    return {
      density: edgeDensity,
      spatialDistribution,
      uniformity: this.calculateEdgeUniformity(spatialDistribution)
    };
  }

  /**
   * Analyze spatial distribution of edges
   */
  private analyzeSpatialDistribution(edgePixels: number[], width: number, height: number): any {
    // Divide image into regions and analyze edge distribution
    const regions = 4;
    const regionWidth = width / 2;
    const regionHeight = height / 2;
    
    const regionCounts: number[] = [];
    
    for (let i = 0; i < edgePixels.length; i++) {
      const pixel = edgePixels[i];
      const x = pixel % width;
      const y = Math.floor(pixel / width);
      
      const regionX = Math.floor(x / regionWidth);
      const regionY = Math.floor(y / regionHeight);
      const regionIdx = regionY * 2 + regionX;
      
      if (!regionCounts[regionIdx]) {
        regionCounts[regionIdx] = 0;
      }
      regionCounts[regionIdx]++;
    }
    
    return {
      regionCounts,
      variance: this.calculateVariance(regionCounts)
    };
  }

  /**
   * Calculate edge uniformity
   */
  private calculateEdgeUniformity(spatialDistribution: any): number {
    const { regionCounts, variance } = spatialDistribution;
    const mean = regionCounts.reduce((a, b) => a + b, 0) / regionCounts.length;
    
    // Calculate how uniform the distribution is
    let uniformity = 0;
    for (const count of regionCounts) {
      const diff = Math.abs(count - mean);
      uniformity += diff;
    }
    
    return 1 - (uniformity / (regionCounts.length * mean)); // Normalize
  }

  /**
   * Calculate UI edge concentration
   */
  private calculateUIEdgeConcentration(edgeAnalysis: any): number {
    let concentration = 0;
    
    // High concentration of horizontal/vertical lines indicates UI
    if (edgeAnalysis.horizontalLines > 5) concentration += 0.3;
    if (edgeAnalysis.verticalLines > 5) concentration += 0.3;
    if (edgeAnalysis.rightAngles > 10) concentration += 0.2;
    if (edgeAnalysis.rectangles > 3) concentration += 0.2;
    
    // High edge density with uniform distribution indicates UI
    if (edgeAnalysis.density > 0.15 && edgeAnalysis.distribution.uniformity > 0.7) {
      concentration += 0.3;
    }
    
    return Math.min(concentration, 1.0);
  }

  /**
   * Classify UI edge pattern
   */
  private classifyUIEdgePattern(edgeAnalysis: any): string {
    if (edgeAnalysis.horizontalLines > 10 && edgeAnalysis.verticalLines > 10) {
      return 'ui_grid_pattern';
    } else if (edgeAnalysis.rectangles > 5) {
      return 'ui_element_pattern';
    } else if (edgeAnalysis.density > 0.2) {
      return 'high_edge_density';
    } else if (edgeAnalysis.rightAngles > 15) {
      return 'ui_corner_pattern';
    } else {
      return 'natural_edge_pattern';
    }
  }

  /**
   * Analyze text density
   */
  private async analyzeTextDensity(image: ForensicImage): Promise<{detected: boolean, density: number, regions: any[]}> {
    try {
      const img = new Image();
      
      return new Promise((resolve) => {
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          
          if (!ctx) {
            resolve({ detected: false, density: 0, regions: [] });
            return;
          }

          canvas.width = img.width;
          canvas.height = img.height;
          ctx.drawImage(img, 0, 0);

          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const data = imageData.data;

          // Analyze text patterns
          const textAnalysis = this.analyzeTextPatterns(data);
          const density = this.calculateTextDensity(textAnalysis);
          const regions = textAnalysis.regions;

          const detected = density > 0.05;
          resolve({ detected, density, regions });
        };

        img.onerror = () => {
          resolve({ detected: false, density: 0, regions: [] });
        };

        img.src = image.dataUrl;
      });
    } catch (error) {
      console.error('[Screenshot Detector] Text density analysis error:', error);
      return { detected: false, density: 0, regions: [] };
    }
  }

  /**
   * Analyze text patterns
   */
  private analyzeTextPatterns(data: Uint8ClampedArray): any {
    const regions: any[] = [];
    let textPixels = 0;
    let totalPixels = 0;

    // Look for text-like patterns
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      
      // Text typically has high contrast and specific color patterns
      const brightness = (r + g + b) / 3;
      const isTextLike = this.isTextPixel(r, g, b, brightness);
      
      if (isTextLike) {
        textPixels++;
        
        // Group adjacent text pixels into regions
        const x = (i / 4) % Math.sqrt(data.length / 4);
        const y = Math.floor((i / 4) / Math.sqrt(data.length / 4));
        
        const existingRegion = regions.find(region => 
          Math.abs(region.x - x) <= 5 && Math.abs(region.y - y) <= 5
        );
        
        if (existingRegion) {
          existingRegion.pixels++;
        } else {
          regions.push({ x, y, pixels: 1 });
        }
      }
      
      totalPixels++;
    }

    return {
      regions,
      textPixelRatio: textPixels / totalPixels,
      averageRegionSize: regions.length > 0 ? regions.reduce((sum, region) => sum + region.pixels, 0) / regions.length : 0
    };
  }

  /**
   * Check if pixel is text-like
   */
  private isTextPixel(r: number, g: number, b: number, brightness: number): boolean {
    // Text pixels typically have specific characteristics
    const isDark = brightness < 128;
    const hasHighContrast = this.calculateContrast(r, g, b) > 100;
    const isTextColor = isDark && hasHighContrast;
    
    return isTextColor;
  }

  /**
   * Calculate contrast
   */
  private calculateContrast(r: number, g: number, b: number): number {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    return max - min;
  }

  /**
   * Calculate text density
   */
  private calculateTextDensity(textAnalysis: any): number {
    const { textPixelRatio, averageRegionSize } = textAnalysis;
    
    // High text density indicates screenshot
    const highTextRatio = textPixelRatio > 0.1;
    const largeTextRegions = averageRegionSize > 50;
    
    let density = 0;
    if (highTextRatio) density += 0.4;
    if (largeTextRegions) density += 0.3;
    if (textAnalysis.regions.length > 5) density += 0.3;
    
    return Math.min(density, 1.0);
  }

  /**
   * Analyze screen aspect ratios
   */
  private async analyzeScreenRatios(image: ForensicImage): Promise<{isScreenRatio: boolean, ratio: string}> {
    try {
      const img = new Image();
      
      return new Promise((resolve) => {
        img.onload = () => {
          const aspectRatio = img.width / img.height;
          const ratioString = `${img.width}:${img.height}`;
          
          // Common screen aspect ratios
          const screenRatios = [
            { ratio: 16/9, name: '16:9' },
            { ratio: 16/10, name: '16:10' },
            { ratio: 4/3, name: '4:3' },
            { ratio: 3/2, name: '3:2' },
            { ratio: 1/1, name: '1:1' },
            { ratio: 9/16, name: '9:16' },
            { ratio: 10/16, name: '10:16' },
            { ratio: 21/9, name: '21:9' }, // Ultrawide
            { ratio: 32/9, name: '32:9' }  // Ultra-wide
          ];
          
          // Check if aspect ratio matches common screen ratios
          const matchingRatio = screenRatios.find(sr => 
            Math.abs(aspectRatio - sr.ratio) < 0.1
          );
          
          const isScreenRatio = !!matchingRatio;
          
          resolve({ isScreenRatio, ratio: ratioString });
        };

        img.onerror = () => {
          resolve({ isScreenRatio: false, ratio: 'unknown' });
        };

        img.src = image.dataUrl;
      });
    } catch (error) {
      console.error('[Screenshot Detector] Screen ratio analysis error:', error);
      return { isScreenRatio: false, ratio: 'error' };
    }
  }

  /**
   * Analyze pixel grid patterns
   */
  private async analyzePixelGrid(image: ForensicImage): Promise<{detected: boolean, pattern: string}> {
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

          // Analyze for display grid patterns
          const gridAnalysis = this.analyzeDisplayGrid(data, img.width, img.height);
          const pattern = this.classifyGridPattern(gridAnalysis);

          const detected = gridAnalysis.hasGridPattern;
          resolve({ detected, pattern });
        };

        img.onerror = () => {
          resolve({ detected: false, pattern: 'error' });
        };

        img.src = image.dataUrl;
      });
    } catch (error) {
      console.error('[Screenshot Detector] Pixel grid analysis error:', error);
      return { detected: false, pattern: 'error' };
    }
  }

  /**
   * Analyze display grid patterns
   */
  private analyzeDisplayGrid(data: Uint8ClampedArray, width: number, height: number): any {
    // Look for regular pixel patterns typical of displays
    const gridSize = 8; // Check 8x8 grids
    const gridPatterns: Map<string, number> = new Map();
    
    for (let y = 0; y < height - gridSize; y += gridSize) {
      for (let x = 0; x < width - gridSize; x += gridSize) {
        const gridSignature = this.createGridSignature(data, x, y, gridSize, width);
        const signatureKey = gridSignature.join(',');
        
        const count = gridPatterns.get(signatureKey) || 0;
        gridPatterns.set(signatureKey, count + 1);
      }
    }

    // Check for repeating grid patterns
    let maxRepetitions = 0;
    for (const count of gridPatterns.values()) {
      maxRepetitions = Math.max(maxRepetitions, count);
    }

    return {
      hasGridPattern: maxRepetitions > 3,
      maxRepetitions,
      uniquePatterns: gridPatterns.size,
      averageRepetitions: Array.from(gridPatterns.values()).reduce((a, b) => a + b, 0) / gridPatterns.size
    };
  }

  /**
   * Create grid signature
   */
  private createGridSignature(data: Uint8ClampedArray, startX: number, startY: number, size: number, width: number): number[] {
    const signature: number[] = [];
    
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (startY + y) * width + (startX + x) * 4;
        signature.push(data[idx]);
      }
    }

    return signature;
  }

  /**
   * Classify grid pattern
   */
  private classifyGridPattern(gridAnalysis: any): string {
    if (gridAnalysis.maxRepetitions > 5) {
      return 'regular_grid_pattern';
    } else if (gridAnalysis.uniquePatterns < 10) {
      return 'uniform_grid_pattern';
    } else if (gridAnalysis.averageRepetitions > 2) {
      return 'semi_regular_grid';
    } else {
      return 'no_grid_pattern';
    }
  }

  /**
   * Analyze histogram flatness
   */
  private async analyzeHistogramFlatness(image: ForensicImage): Promise<{flat: boolean, flatness: number, distribution: any}> {
    try {
      const img = new Image();
      
      return new Promise((resolve) => {
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          
          if (!ctx) {
            resolve({ flat: false, flatness: 0, distribution: null });
            return;
          }

          canvas.width = img.width;
          canvas.height = img.height;
          ctx.drawImage(img, 0, 0);

          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const data = imageData.data;

          // Analyze color histogram
          const histogramAnalysis = this.analyzeColorHistogram(data);
          const flatness = this.calculateHistogramFlatness(histogramAnalysis);
          const distribution = this.classifyHistogramDistribution(histogramAnalysis);

          const flat = flatness > 0.7;
          resolve({ flat, flatness, distribution });
        };

        img.onerror = () => {
          resolve({ flat: false, flatness: 0, distribution: null });
        };

        img.src = image.dataUrl;
      });
    } catch (error) {
      console.error('[Screenshot Detector] Histogram analysis error:', error);
      return { flat: false, flatness: 0, distribution: null };
    }
  }

  /**
   * Analyze color histogram
   */
  private analyzeColorHistogram(data: Uint8ClampedArray): any {
    const histogram = {
      r: new Array(256).fill(0),
      g: new Array(256).fill(0),
      b: new Array(256).fill(0)
    };

    // Build histogram
    for (let i = 0; i < data.length; i += 4) {
      histogram.r[data[i]]++;
      histogram.g[data[i + 1]]++;
      histogram.b[data[i + 2]]++;
    }

    // Calculate statistics
    const totalPixels = data.length / 4;
    const rStats = this.calculateHistogramStats(histogram.r, totalPixels);
    const gStats = this.calculateHistogramStats(histogram.g, totalPixels);
    const bStats = this.calculateHistogramStats(histogram.b, totalPixels);

    return {
      histogram,
      channelStats: { r: rStats, g: gStats, b: bStats },
      overallFlatness: (rStats.flatness + gStats.flatness + bStats.flatness) / 3
    };
  }

  /**
   * Calculate histogram statistics
   */
  private calculateHistogramStats(histogram: number[], totalPixels: number): any {
    // Calculate mean, variance, and flatness
    let sum = 0;
    let sumSquares = 0;
    
    for (let i = 0; i < 256; i++) {
      sum += histogram[i] * i;
      sumSquares += histogram[i] * i * i;
    }
    
    const mean = sum / totalPixels;
    const variance = (sumSquares / totalPixels) - (mean * mean);
    
    // Calculate flatness (how concentrated the histogram is)
    let flatness = 0;
    for (let i = 0; i < 256; i++) {
      if (histogram[i] > 0) {
        flatness += histogram[i] / totalPixels;
      }
    }

    return {
      mean,
      variance,
      flatness,
      peakCount: Math.max(...histogram),
      peakValue: histogram.indexOf(Math.max(...histogram))
    };
  }

  /**
   * Calculate histogram flatness
   */
  private calculateHistogramFlatness(histogramAnalysis: any): number {
    // Screenshots often have flatter histograms due to UI elements
    const { overallFlatness } = histogramAnalysis;
    
    // Additional flatness indicators
    const hasFewPeaks = this.countHistogramPeaks(histogramAnalysis.histogram) < 5;
    const hasLowVariance = histogramAnalysis.channelStats.r.variance < 1000 &&
                           histogramAnalysis.channelStats.g.variance < 1000 &&
                           histogramAnalysis.channelStats.b.variance < 1000;
    
    let flatness = overallFlatness;
    if (hasFewPeaks) flatness += 0.2;
    if (hasLowVariance) flatness += 0.2;
    
    return Math.min(flatness, 1.0);
  }

  /**
   * Count histogram peaks
   */
  private countHistogramPeaks(histogram: any): number {
    let peaks = 0;
    
    for (let i = 1; i < 255; i++) {
      if (histogram.r[i] > histogram.r[i - 1] && histogram.r[i] > histogram.r[i + 1] &&
          histogram.g[i] > histogram.g[i - 1] && histogram.g[i] > histogram.g[i + 1] &&
          histogram.b[i] > histogram.b[i - 1] && histogram.b[i] > histogram.b[i + 1]) {
        peaks++;
      }
    }
    
    return peaks;
  }

  /**
   * Classify histogram distribution
   */
  private classifyHistogramDistribution(histogramAnalysis: any): string {
    if (histogramAnalysis.overallFlatness > 0.8) {
      return 'very_flat';
    } else if (histogramAnalysis.overallFlatness > 0.6) {
      return 'flat';
    } else if (histogramAnalysis.channelStats.r.variance < 500) {
      return 'low_variance';
    } else {
      return 'natural_distribution';
    }
  }

  /**
   * Analyze camera sensor noise absence
   */
  private async analyzeCameraNoiseAbsence(image: ForensicImage): Promise<{absent: boolean, level: number}> {
    try {
      const img = new Image();
      
      return new Promise((resolve) => {
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          
          if (!ctx) {
            resolve({ absent: false, level: 0 });
            return;
          }

          canvas.width = img.width;
          canvas.height = img.height;
          ctx.drawImage(img, 0, 0);

          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const data = imageData.data;

          // Convert to grayscale for noise analysis
          const grayData = this.convertToGrayscale(data);

          // Analyze noise characteristics
          const noiseAnalysis = this.performNoiseAnalysis(grayData);
          const noiseLevel = this.calculateNoiseLevel(noiseAnalysis);
          const absent = this.isNoiseAbsent(noiseAnalysis);

          resolve({ absent, level: noiseLevel });
        };

        img.onerror = () => {
          resolve({ absent: false, level: 0 });
        };

        img.src = image.dataUrl;
      });
    } catch (error) {
      console.error('[Screenshot Detector] Noise analysis error:', error);
      return { absent: false, level: 0 };
    }
  }

  /**
   * Perform noise analysis
   */
  private performNoiseAnalysis(grayData: Uint8ClampedArray): any {
    const blockSize = 8;
    const noiseLevels: number[] = [];
    
    for (let i = 0; i < grayData.length; i += blockSize) {
      if (i + blockSize <= grayData.length) {
        // Calculate local noise in this block
        const block = grayData.slice(i, i + blockSize);
        const noise = this.calculateLocalNoise(block);
        noiseLevels.push(noise);
      }
    }

    const avgNoise = noiseLevels.reduce((a, b) => a + b, 0) / noiseLevels.length;
    const noiseVariance = this.calculateVariance(noiseLevels);
    
    return {
      averageNoise: avgNoise,
      variance: noiseVariance,
      distribution: this.classifyNoiseDistribution(noiseLevels)
    };
  }

  /**
   * Calculate local noise
   */
  private calculateLocalNoise(block: Uint8ClampedArray): number {
    if (block.length < 4) return 0;
    
    let totalVariance = 0;
    let samples = 0;
    
    for (let i = 0; i < block.length - 4; i += 4) {
      // Calculate variance in RGB channels
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
   * Calculate noise level
   */
  private calculateNoiseLevel(noiseAnalysis: any): number {
    // Normalize noise level to 0-1 scale
    const maxExpectedNoise = 50; // Expected sensor noise level
    const normalizedLevel = Math.min(noiseAnalysis.averageNoise / maxExpectedNoise, 1.0);
    
    return normalizedLevel;
  }

  /**
   * Determine if noise is absent (typical of screenshots)
   */
  private isNoiseAbsent(noiseAnalysis: any): boolean {
    // Screenshots typically have very low or no sensor noise
    const hasVeryLowNoise = noiseAnalysis.averageNoise < 5;
    const hasUniformNoise = noiseAnalysis.distribution === 'uniform';
    const hasLowVariance = noiseAnalysis.variance < 10;
    
    return hasVeryLowNoise && (hasUniformNoise || hasLowVariance);
  }

  /**
   * Classify noise distribution
   */
  private classifyNoiseDistribution(noiseLevels: number[]): string {
    const variance = this.calculateVariance(noiseLevels);
    
    if (variance < 5) {
      return 'uniform';
    } else if (variance > 100) {
      return 'natural_varied';
    } else {
      return 'semi_uniform';
    }
  }

  /**
   * Evaluate screenshot origin based on all detection methods
   */
  private evaluateScreenshotOrigin(
    edgeResult: any,
    textResult: any,
    ratioResult: any,
    gridResult: any,
    histogramResult: any,
    noiseResult: any
  ): boolean {
    // Weighted evaluation of screenshot evidence
    let evidenceScore = 0;
    let totalWeight = 0;

    // UI edges (strong evidence)
    if (edgeResult.detected) {
      evidenceScore += 3 * edgeResult.concentration;
      totalWeight += 3;
    }

    // Text density (moderate evidence)
    if (textResult.detected) {
      evidenceScore += 2 * textResult.density;
      totalWeight += 2;
    }

    // Screen ratio (moderate evidence)
    if (ratioResult.isScreenRatio) {
      evidenceScore += 1.5 * 0.8;
      totalWeight += 1.5;
    }

    // Pixel grid (weak evidence)
    if (gridResult.detected) {
      evidenceScore += 1 * 0.6;
      totalWeight += 1;
    }

    // Histogram flatness (moderate evidence)
    if (histogramResult.flat) {
      evidenceScore += 1 * histogramResult.flatness;
      totalWeight += 1;
    }

    // Noise absence (strong evidence)
    if (noiseResult.absent) {
      evidenceScore += 2.5 * 0.9;
      totalWeight += 2.5;
    }

    const finalScore = totalWeight > 0 ? evidenceScore / totalWeight : 0;
    return finalScore > 0.4;
  }

  /**
   * Calculate confidence based on all detection methods
   */
  private calculateConfidence(
    edgeResult: any,
    textResult: any,
    ratioResult: any,
    gridResult: any,
    histogramResult: any,
    noiseResult: any
  ): number {
    let confidence = 0;
    let methods = 0;

    if (edgeResult.detected) {
      confidence += 0.25;
      methods++;
    }
    if (textResult.detected) {
      confidence += 0.20;
      methods++;
    }
    if (ratioResult.isScreenRatio) {
      confidence += 0.15;
      methods++;
    }
    if (gridResult.detected) {
      confidence += 0.10;
      methods++;
    }
    if (histogramResult.flat) {
      confidence += 0.15;
      methods++;
    }
    if (noiseResult.absent) {
      confidence += 0.15;
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
}
