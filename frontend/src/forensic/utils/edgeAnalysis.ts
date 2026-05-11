/**
 * Edge Analysis Utilities
 * Advanced edge detection and analysis for forensic detection
 */

export class EdgeAnalyzer {
  /**
   * Detect edges using multiple methods
   */
  static detectEdges(data: Uint8ClampedArray, width: number, height: number): {
    sobel: Uint8ClampedArray,
    canny: Uint8ClampedArray,
    laplacian: Uint8ClampedArray
  } {
    const sobel = this.detectSobelEdges(data, width, height);
    const canny = this.detectCannyEdges(data, width, height);
    const laplacian = this.detectLaplacianEdges(data, width, height);
    
    return { sobel, canny, laplacian };
  }

  /**
   * Detect edges using Sobel operator
   */
  static detectSobelEdges(data: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray {
    const edges = new Uint8ClampedArray(data.length);
    
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        
        if (idx + width + 1 < data.length && idx - width - 1 >= 0) {
          // Sobel X kernel
          const sobelX = -1 * data[idx - width - 1] + 1 * data[idx - width + 1] +
                        -2 * data[idx - 1] + 2 * data[idx + 1] +
                        -1 * data[idx + width - 1] + 1 * data[idx + width + 1];
          
          // Sobel Y kernel
          const sobelY = -1 * data[idx - width - 1] - 2 * data[idx - width] - 1 * data[idx - width + 1] +
                        1 * data[idx + width - 1] + 2 * data[idx + width] + 1 * data[idx + width + 1];
          
          const magnitude = Math.sqrt(sobelX * sobelX + sobelY * sobelY);
          edges[idx] = magnitude > 100 ? 255 : 0;
        }
      }
    }
    
    return edges;
  }

  /**
   * Detect edges using Canny edge detection
   */
  static detectCannyEdges(data: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray {
    // Step 1: Gaussian blur
    const blurred = this.gaussianBlur(data, width, height, 1.4);
    
    // Step 2: Gradient calculation
    const gradients = this.calculateGradients(blurred, width, height);
    
    // Step 3: Non-maximum suppression
    const suppressed = this.nonMaximumSuppression(gradients, width, height);
    
    // Step 4: Hysteresis thresholding
    return this.hysteresisThreshold(suppressed, width, height, 50, 150);
  }

  /**
   * Apply Gaussian blur
   */
  private static gaussianBlur(data: Uint8ClampedArray, width: number, height: number, sigma: number): Uint8ClampedArray {
    const blurred = new Uint8ClampedArray(data.length);
    const kernelSize = Math.ceil(3 * sigma);
    const kernel = this.createGaussianKernel(kernelSize, sigma);
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let sum = 0;
        let kernelSum = 0;
        
        for (let ky = -Math.floor(kernelSize / 2); ky <= Math.floor(kernelSize / 2); ky++) {
          for (let kx = -Math.floor(kernelSize / 2); kx <= Math.floor(kernelSize / 2); kx++) {
            const px = Math.max(0, Math.min(width - 1, x + kx));
            const py = Math.max(0, Math.min(height - 1, y + ky));
            const idx = py * width + px;
            
            const kernelIdx = (ky + Math.floor(kernelSize / 2)) * kernelSize + (kx + Math.floor(kernelSize / 2));
            sum += data[idx] * kernel[kernelIdx];
            kernelSum += kernel[kernelIdx];
          }
        }
        
        blurred[y * width + x] = Math.round(sum / kernelSum);
      }
    }
    
    return blurred;
  }

  /**
   * Create Gaussian kernel
   */
  private static createGaussianKernel(size: number, sigma: number): number[] {
    const kernel: number[] = [];
    const center = Math.floor(size / 2);
    let sum = 0;
    
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = x - center;
        const dy = y - center;
        const value = Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma));
        kernel.push(value);
        sum += value;
      }
    }
    
    // Normalize
    for (let i = 0; i < kernel.length; i++) {
      kernel[i] /= sum;
    }
    
    return kernel;
  }

  /**
   * Calculate gradients
   */
  private static calculateGradients(data: Uint8ClampedArray, width: number, height: number): {
    magnitude: Uint8ClampedArray,
    direction: Uint8ClampedArray
  } {
    const magnitude = new Uint8ClampedArray(data.length);
    const direction = new Uint8ClampedArray(data.length);
    
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        
        if (idx + width + 1 < data.length && idx - width - 1 >= 0) {
          // Gradient X
          const gx = -1 * data[idx - width - 1] + 1 * data[idx - width + 1] +
                     -2 * data[idx - 1] + 2 * data[idx + 1] +
                     -1 * data[idx + width - 1] + 1 * data[idx + width + 1];
          
          // Gradient Y
          const gy = -1 * data[idx - width - 1] - 2 * data[idx - width] - 1 * data[idx - width + 1] +
                     1 * data[idx + width - 1] + 2 * data[idx + width] + 1 * data[idx + width + 1];
          
          magnitude[idx] = Math.sqrt(gx * gx + gy * gy);
          direction[idx] = Math.atan2(gy, gx) * 180 / Math.PI;
        }
      }
    }
    
    return { magnitude, direction };
  }

  /**
   * Non-maximum suppression
   */
  private static nonMaximumSuppression(gradients: { magnitude: Uint8ClampedArray, direction: Uint8ClampedArray }, width: number, height: number): Uint8ClampedArray {
    const suppressed = new Uint8ClampedArray(gradients.magnitude.length);
    
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        const angle = gradients.direction[idx];
        
        // Quantize angle to 4 directions
        let quantizedAngle = 0;
        if ((angle >= -22.5 && angle < 22.5) || (angle >= 157.5 || angle < -157.5)) {
          quantizedAngle = 0; // Horizontal
        } else if ((angle >= 22.5 && angle < 67.5) || (angle >= -157.5 && angle < -112.5)) {
          quantizedAngle = 45; // Diagonal
        } else if ((angle >= 67.5 && angle < 112.5) || (angle >= -112.5 && angle < -67.5)) {
          quantizedAngle = 90; // Vertical
        } else {
          quantizedAngle = 135; // Diagonal
        }
        
        // Suppress non-maximum values
        const current = gradients.magnitude[idx];
        let isMaximum = true;
        
        switch (quantizedAngle) {
          case 0: // Horizontal
            if (gradients.magnitude[idx - 1] > current || gradients.magnitude[idx + 1] > current) {
              isMaximum = false;
            }
            break;
          case 45: // Diagonal
            if (gradients.magnitude[idx - width - 1] > current || gradients.magnitude[idx + width + 1] > current) {
              isMaximum = false;
            }
            break;
          case 90: // Vertical
            if (gradients.magnitude[idx - width] > current || gradients.magnitude[idx + width] > current) {
              isMaximum = false;
            }
            break;
          case 135: // Diagonal
            if (gradients.magnitude[idx - width + 1] > current || gradients.magnitude[idx + width - 1] > current) {
              isMaximum = false;
            }
            break;
        }
        
        suppressed[idx] = isMaximum ? current : 0;
      }
    }
    
    return suppressed;
  }

  /**
   * Hysteresis thresholding
   */
  private static hysteresisThreshold(data: Uint8ClampedArray, width: number, height: number, lowThreshold: number, highThreshold: number): Uint8ClampedArray {
    const result = new Uint8ClampedArray(data.length);
    
    // Mark strong edges
    for (let i = 0; i < data.length; i++) {
      if (data[i] >= highThreshold) {
        result[i] = 255;
      }
    }
    
    // Trace weak edges connected to strong edges
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        
        if (data[idx] >= lowThreshold && data[idx] < highThreshold) {
          // Check 8 neighbors for strong edge
          let hasStrongNeighbor = false;
          
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dy === 0 && dx === 0) continue;
              
              const nidx = (y + dy) * width + (x + dx);
              if (nidx >= 0 && nidx < data.length && result[nidx] === 255) {
                hasStrongNeighbor = true;
                break;
              }
            }
            if (hasStrongNeighbor) break;
          }
          
          if (hasStrongNeighbor) {
            result[idx] = 255;
          }
        }
      }
    }
    
    return result;
  }

  /**
   * Detect edges using Laplacian operator
   */
  static detectLaplacianEdges(data: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray {
    const edges = new Uint8ClampedArray(data.length);
    
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        
        if (idx + width + 1 < data.length && idx - width - 1 >= 0) {
          // Laplacian kernel
          const laplacian = -1 * data[idx - width - 1] + -1 * data[idx - width] + -1 * data[idx - width + 1] +
                           -1 * data[idx - 1] + 8 * data[idx] + -1 * data[idx + 1] +
                           -1 * data[idx + width - 1] + -1 * data[idx + width] + -1 * data[idx + width + 1];
          
          edges[idx] = Math.abs(laplacian) > 50 ? 255 : 0;
        }
      }
    }
    
    return edges;
  }

  /**
   * Analyze edge characteristics
   */
  static analyzeEdgeCharacteristics(edges: Uint8ClampedArray, width: number, height: number): {
    density: number,
    orientation: string,
    continuity: number,
    junctions: number
  } {
    const edgePixels = Array.from(edges).filter(pixel => pixel > 0);
    const density = edgePixels.length / edges.length;
    
    const orientation = this.analyzeEdgeOrientation(edges, width, height);
    const continuity = this.analyzeEdgeContinuity(edges, width, height);
    const junctions = this.countEdgeJunctions(edges, width, height);
    
    return {
      density,
      orientation,
      continuity,
      junctions
    };
  }

  /**
   * Analyze edge orientation
   */
  private static analyzeEdgeOrientation(edges: Uint8ClampedArray, width: number, height: number): string {
    let horizontalEdges = 0;
    let verticalEdges = 0;
    let diagonalEdges = 0;
    
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        
        if (edges[idx] > 0) {
          // Check edge direction
          const horizontal = edges[idx - 1] > 0 || edges[idx + 1] > 0;
          const vertical = edges[idx - width] > 0 || edges[idx + width] > 0;
          const diagonal1 = edges[idx - width - 1] > 0 || edges[idx + width + 1] > 0;
          const diagonal2 = edges[idx - width + 1] > 0 || edges[idx + width - 1] > 0;
          
          if (horizontal && !vertical) horizontalEdges++;
          else if (vertical && !horizontal) verticalEdges++;
          else if (diagonal1 || diagonal2) diagonalEdges++;
        }
      }
    }
    
    const total = horizontalEdges + verticalEdges + diagonalEdges;
    if (total === 0) return 'none';
    
    const hRatio = horizontalEdges / total;
    const vRatio = verticalEdges / total;
    const dRatio = diagonalEdges / total;
    
    if (hRatio > 0.4) return 'horizontal_dominant';
    else if (vRatio > 0.4) return 'vertical_dominant';
    else if (dRatio > 0.4) return 'diagonal_dominant';
    else return 'mixed_orientation';
  }

  /**
   * Analyze edge continuity
   */
  private static analyzeEdgeContinuity(edges: Uint8ClampedArray, width: number, height: number): number {
    let continuousEdges = 0;
    let totalEdges = 0;
    
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        
        if (edges[idx] > 0) {
          totalEdges++;
          
          // Check if edge continues in any direction
          const neighbors = [
            edges[idx - 1], edges[idx + 1],
            edges[idx - width], edges[idx + width],
            edges[idx - width - 1], edges[idx - width + 1],
            edges[idx + width - 1], edges[idx + width + 1]
          ];
          
          const hasNeighbor = neighbors.some(neighbor => neighbor > 0);
          if (hasNeighbor) {
            continuousEdges++;
          }
        }
      }
    }
    
    return totalEdges > 0 ? continuousEdges / totalEdges : 0;
  }

  /**
   * Count edge junctions
   */
  private static countEdgeJunctions(edges: Uint8ClampedArray, width: number, height: number): number {
    let junctions = 0;
    
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        
        if (edges[idx] > 0) {
          // Count edge neighbors
          const neighbors = [
            edges[idx - 1], edges[idx + 1],
            edges[idx - width], edges[idx + width],
            edges[idx - width - 1], edges[idx - width + 1],
            edges[idx + width - 1], edges[idx + width + 1]
          ];
          
          const edgeNeighbors = neighbors.filter(neighbor => neighbor > 0).length;
          
          // Junction if more than 2 neighbors
          if (edgeNeighbors > 2) {
            junctions++;
          }
        }
      }
    }
    
    return junctions;
  }

  /**
   * Detect straight lines
   */
  static detectStraightLines(edges: Uint8ClampedArray, width: number, height: number): {
    horizontal: any[],
    vertical: any[],
    diagonal: any[]
  } {
    const horizontal: any[] = [];
    const vertical: any[] = [];
    const diagonal: any[] = [];
    
    // Detect horizontal lines
    for (let y = 0; y < height; y++) {
      let lineLength = 0;
      let startX = -1;
      
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        
        if (edges[idx] > 0) {
          if (startX === -1) {
            startX = x;
          }
          lineLength++;
        } else {
          if (lineLength > 10) {
            horizontal.push({
              y,
              startX,
              endX: x - 1,
              length: lineLength
            });
          }
          startX = -1;
          lineLength = 0;
        }
      }
      
      // Check at end of row
      if (lineLength > 10) {
        horizontal.push({
          y,
          startX,
          endX: width - 1,
          length: lineLength
        });
      }
    }
    
    // Detect vertical lines
    for (let x = 0; x < width; x++) {
      let lineLength = 0;
      let startY = -1;
      
      for (let y = 0; y < height; y++) {
        const idx = y * width + x;
        
        if (edges[idx] > 0) {
          if (startY === -1) {
            startY = y;
          }
          lineLength++;
        } else {
          if (lineLength > 10) {
            vertical.push({
              x,
              startY,
              endY: y - 1,
              length: lineLength
            });
          }
          startY = -1;
          lineLength = 0;
        }
      }
      
      // Check at end of column
      if (lineLength > 10) {
        vertical.push({
          x,
          startY,
          endY: height - 1,
          length: lineLength
        });
      }
    }
    
    // Detect diagonal lines (simplified)
    for (let y = 0; y < height - 10; y++) {
      for (let x = 0; x < width - 10; x++) {
        const idx = y * width + x;
        
        if (edges[idx] > 0) {
          // Check diagonal direction
          const diagonal1 = this.checkDiagonalLine(edges, x, y, width, height, 1, 1);
          const diagonal2 = this.checkDiagonalLine(edges, x, y, width, height, 1, -1);
          
          if (diagonal1.length > 10) {
            diagonal.push(diagonal1);
          }
          if (diagonal2.length > 10) {
            diagonal.push(diagonal2);
          }
        }
      }
    }
    
    return { horizontal, vertical, diagonal };
  }

  /**
   * Check diagonal line
   */
  private static checkDiagonalLine(edges: Uint8ClampedArray, startX: number, startY: number, width: number, height: number, dx: number, dy: number): any {
    let x = startX;
    let y = startY;
    let length = 0;
    
    while (x >= 0 && x < width && y >= 0 && y < height) {
      const idx = y * width + x;
      
      if (edges[idx] > 0) {
        length++;
        x += dx;
        y += dy;
      } else {
        break;
      }
    }
    
    return {
      startX,
      startY,
      endX: x - dx,
      endY: y - dy,
      length,
      direction: dx === dy ? 'down_right' : 'up_right'
    };
  }

  /**
   * Analyze edge distribution
   */
  static analyzeEdgeDistribution(edges: Uint8ClampedArray, width: number, height: number): {
    spatialDistribution: string,
    densityMap: number[],
    clusters: number
  } {
    const blockSize = 16;
    const blocksX = Math.ceil(width / blockSize);
    const blocksY = Math.ceil(height / blockSize);
    const densityMap = new Array(blocksX * blocksY).fill(0);
    
    // Calculate edge density in each block
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        
        if (edges[idx] > 0) {
          const blockX = Math.floor(x / blockSize);
          const blockY = Math.floor(y / blockSize);
          const blockIdx = blockY * blocksX + blockX;
          
          if (blockIdx < densityMap.length) {
            densityMap[blockIdx]++;
          }
        }
      }
    }
    
    // Normalize density map
    const maxDensity = Math.max(...densityMap);
    const normalizedDensity = densityMap.map(d => maxDensity > 0 ? d / maxDensity : 0);
    
    // Analyze spatial distribution
    const avgDensity = normalizedDensity.reduce((a, b) => a + b, 0) / normalizedDensity.length;
    const densityVariance = this.calculateVariance(normalizedDensity);
    
    let spatialDistribution = 'uniform';
    if (densityVariance > avgDensity * 2) {
      spatialDistribution = 'clustered';
    } else if (densityVariance < avgDensity * 0.5) {
      spatialDistribution = 'uniform';
    } else {
      spatialDistribution = 'mixed';
    }
    
    // Count high-density clusters
    const clusters = normalizedDensity.filter(d => d > 0.7).length;
    
    return {
      spatialDistribution,
      densityMap: normalizedDensity,
      clusters
    };
  }

  /**
   * Calculate variance
   */
  private static calculateVariance(values: number[]): number {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    return values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
  }
}
