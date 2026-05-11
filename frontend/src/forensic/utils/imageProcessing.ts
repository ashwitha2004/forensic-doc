/**
 * Image Processing Utilities
 * Common image processing functions for forensic analysis
 */

export class ImageProcessor {
  /**
   * Convert image to canvas for analysis
   */
  static async loadImage(imageDataUrl: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = imageDataUrl;
    });
  }

  /**
   * Get image data from image element
   */
  static getImageData(img: HTMLImageElement): ImageData {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      throw new Error('Failed to get canvas context');
    }

    canvas.width = img.width;
    canvas.height = img.height;
    ctx.drawImage(img, 0, 0);

    return ctx.getImageData(0, 0, img.width, img.height);
  }

  /**
   * Convert to grayscale
   */
  static toGrayscale(imageData: ImageData): Uint8ClampedArray {
    const grayData = new Uint8ClampedArray(imageData.data.length / 4);
    
    for (let i = 0; i < imageData.data.length; i += 4) {
      const r = imageData.data[i];
      const g = imageData.data[i + 1];
      const b = imageData.data[i + 2];
      const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
      grayData[i / 4] = gray;
    }
    
    return new ImageData(grayData, imageData.width, imageData.height, imageData.colorSpace, imageData.channels);
  }

  /**
   * Calculate histogram
   */
  static calculateHistogram(data: Uint8ClampedArray): number[] {
    const histogram = new Array(256).fill(0);
    
    for (let i = 0; i < data.length; i++) {
      histogram[data[i]]++;
    }
    
    return histogram;
  }

  /**
   * Calculate variance
   */
  static calculateVariance(values: number[]): number {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    return values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
  }

  /**
   * Apply Gaussian blur
   */
  static applyGaussianBlur(data: Uint8ClampedArray, width: number, height: number, radius: number = 1): Uint8ClampedArray {
    const blurred = new Uint8ClampedArray(data.length);
    const kernelSize = radius * 2 + 1;
    const kernel = this.createGaussianKernel(kernelSize);
    
    const tempData = new Float32Array(data.length);
    for (let i = 0; i < data.length; i++) {
      tempData[i] = data[i];
    }
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let weightedSum = 0;
        let kernelSum = 0;
        
        for (let ky = -radius; ky <= radius; ky++) {
          for (let kx = -radius; kx <= radius; kx++) {
            const pixelY = Math.max(0, Math.min(height - 1, y + ky));
            const pixelX = Math.max(0, Math.min(width - 1, x + kx));
            const idx = pixelY * width + pixelX;
            
            if (idx < tempData.length) {
              weightedSum += tempData[idx] * kernel[(ky + radius) * kernelSize + (kx + radius)];
              kernelSum += kernel[(ky + radius) * kernelSize + (kx + radius)];
            }
          }
        }
        
        const idx = y * width + x;
        if (idx < blurred.length) {
          blurred[idx] = Math.round(weightedSum / kernelSum);
        }
      }
    }
    
    return blurred;
  }

  /**
   * Create Gaussian kernel
   */
  private static createGaussianKernel(size: number): number[] {
    const kernel: number[] = [];
    const center = Math.floor(size / 2);
    const sigma = size / 6;
    let sum = 0;
    
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dy = y - center;
        const dx = x - center;
        const weight = Math.exp(-(dy * dy + dx * dx) / (2 * sigma * sigma));
        kernel.push(weight);
        sum += weight;
      }
    }
    
    // Normalize kernel
    for (let i = 0; i < kernel.length; i++) {
      kernel[i] = kernel[i] / sum;
    }
    
    return kernel;
  }

  /**
   * Detect edges using Sobel operator
   */
  static detectEdges(data: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray {
    const edges = new Uint8ClampedArray(data.length);
    
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        
        if (idx + width + 1 < data.length && idx - width - 1 >= 0) {
          const topLeft = data[idx - width - 1];
          const topCenter = data[idx - width];
          const topRight = data[idx - width + 1];
          const centerLeft = data[idx - 1];
          const centerRight = data[idx + 1];
          const bottomLeft = data[idx + width - 1];
          const bottomCenter = data[idx + width];
          const bottomRight = data[idx + width + 1];
          
          const sobelX = -1 * topLeft - 2 * topCenter + -1 * topRight + 
                           -1 * bottomLeft + 2 * bottomCenter + -1 * bottomRight +
                           1 * centerLeft + 2 * centerRight;
          
          const sobelY = -1 * topLeft - 2 * centerLeft - 1 * centerRight + 
                           -2 * topCenter + 0 * topRight + 
                           -1 * bottomLeft + 0 * bottomCenter + 
                           1 * bottomLeft + 2 * bottomRight;
          
          const magnitude = Math.sqrt(sobelX * sobelX + sobelY * sobelY);
          edges[idx] = magnitude > 100 ? 255 : 0;
        }
      }
    }
    
    return edges;
  }

  /**
   * Calculate local variance
   */
  static calculateLocalVariance(data: Uint8ClampedArray, x: number, y: number, width: number, blockSize: number = 8): number {
    let sum = 0;
    let sumSquares = 0;
    let count = 0;
    
    for (let dy = -Math.floor(blockSize / 2); dy <= Math.floor(blockSize / 2); dy++) {
      for (let dx = -Math.floor(blockSize / 2); dx <= Math.floor(blockSize / 2); dx++) {
        const idx = (y + dy) * width + (x + dx);
        
        if (idx >= 0 && idx < data.length) {
          const pixel = data[idx];
          sum += pixel;
          sumSquares += pixel * pixel;
          count++;
        }
      }
    }
    
    if (count === 0) return 0;
    
    const mean = sum / count;
    return sumSquares / count - mean * mean;
  }

  /**
   * Calculate frequency spectrum
   */
  static calculateFrequencySpectrum(data: Uint8ClampedArray): { lowFreq: number, highFreq: number } {
    let lowFreq = 0;
    let highFreq = 0;
    
    for (let i = 1; i < data.length; i++) {
      const diff = Math.abs(data[i] - data[i - 1]);
      if (diff < 50) {
        lowFreq++;
      } else if (diff > 100) {
        highFreq++;
      }
    }
    
    return {
      lowFreq: lowFreq / data.length,
      highFreq: highFreq / data.length
    };
  }

  /**
   * Calculate texture features
   */
  static calculateTextureFeatures(data: Uint8ClampedArray): { contrast: number, regularity: number } {
    const blockSize = 8;
    const features: { contrast: number[], regularity: number[] } = { contrast: [], regularity: [] };
    
    for (let y = 0; y < data.length / (blockSize * 4) - blockSize; y += blockSize) {
      for (let x = 0; x < Math.sqrt(data.length / 4) - blockSize; x += blockSize) {
        const blockData: number[] = [];
        
        for (let dy = 0; dy < blockSize; dy++) {
          for (let dx = 0; dx < blockSize; dx++) {
            const idx = (y + dy) * Math.sqrt(data.length / 4) + (x + dx);
            if (idx < data.length) {
              blockData.push(data[idx]);
            }
          }
        }
        
        const blockMean = blockData.reduce((a, b) => a + b, 0) / blockData.length;
        const blockVariance = this.calculateVariance(blockData);
        const blockContrast = Math.sqrt(blockVariance);
        
        features.contrast.push(blockContrast);
        features.regularity.push(blockVariance);
      }
    }
    
    const avgContrast = features.contrast.reduce((a, b) => a + b, 0) / features.contrast.length;
    const avgRegularity = features.regularity.reduce((a, b) => a + b, 0) / features.regularity.length;
    
    return {
      contrast: avgContrast,
      regularity: avgRegularity
    };
  }
}
