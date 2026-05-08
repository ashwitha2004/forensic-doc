import * as tf from '@tensorflow/tfjs';

export interface ProcessedImageResult {
  tensor: tf.Tensor;
  originalDimensions: { width: number; height: number };
  processedDimensions: { width: number; height: number };
  preprocessingTime: number;
}

export class ImagePreprocessor {
  private static readonly TARGET_SIZE = 224; // Standard for many CNN models
  private static readonly NORMALIZATION_MEAN = [0.485, 0.456, 0.406]; // ImageNet means
  private static readonly NORMALIZATION_STD = [0.229, 0.224, 0.225]; // ImageNet stds

  /**
   * Convert image file to tensor ready for AI model inference
   */
  async preprocessImage(file: File): Promise<ProcessedImageResult> {
    const startTime = performance.now();
    
    try {
      // Create image element from file
      const imageElement = await this.createImageElement(file);
      
      // Get original dimensions
      const originalDimensions = {
        width: imageElement.naturalWidth,
        height: imageElement.naturalHeight
      };

      // Process image to tensor
      const tensor = await this.imageToTensor(imageElement);
      
      const processedDimensions = {
        width: ImagePreprocessor.TARGET_SIZE,
        height: ImagePreprocessor.TARGET_SIZE
      };

      const preprocessingTime = performance.now() - startTime;

      return {
        tensor,
        originalDimensions,
        processedDimensions,
        preprocessingTime
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Image preprocessing failed: ${errorMessage}`);
    }
  }

  /**
   * Create HTML image element from file
   */
  private createImageElement(file: File): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const image = new Image();
      const url = URL.createObjectURL(file);
      
      image.onload = () => {
        URL.revokeObjectURL(url);
        resolve(image);
      };
      
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to load image'));
      };
      
      image.src = url;
    });
  }

  /**
   * Convert image element to processed tensor
   */
  private async imageToTensor(image: HTMLImageElement): Promise<tf.Tensor> {
    // Create canvas to draw and resize image
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      throw new Error('Failed to get canvas context');
    }

    // Set canvas size to target dimensions
    canvas.width = ImagePreprocessor.TARGET_SIZE;
    canvas.height = ImagePreprocessor.TARGET_SIZE;

    // Draw and resize image
    ctx.drawImage(image, 0, 0, ImagePreprocessor.TARGET_SIZE, ImagePreprocessor.TARGET_SIZE);

    // Get image data
    const imageData = ctx.getImageData(0, 0, ImagePreprocessor.TARGET_SIZE, ImagePreprocessor.TARGET_SIZE);
    
    // Convert to tensor
    return this.imageDataToTensor(imageData);
  }

  /**
   * Convert ImageData to normalized tensor
   */
  private imageDataToTensor(imageData: ImageData): tf.Tensor {
    const { data, width, height } = imageData;
    
    // Convert Uint8ClampedArray to Float32Array and normalize
    const float32Data = new Float32Array(3 * width * height);
    
    for (let i = 0; i < data.length; i += 4) {
      const pixelIndex = i / 4;
      
      // RGB channels (ignore alpha)
      float32Data[pixelIndex] = data[i] / 255.0; // Red
      float32Data[width * height + pixelIndex] = data[i + 1] / 255.0; // Green
      float32Data[2 * width * height + pixelIndex] = data[i + 2] / 255.0; // Blue
    }

    // Create tensor from processed data
    const tensor = tf.tensor3d(float32Data, [height, width, 3]);
    
    // Apply ImageNet normalization
    const normalized = this.normalizeTensor(tensor);
    
    // Add batch dimension
    const batched = normalized.expandDims(0);
    
    // Clean up intermediate tensor
    tensor.dispose();
    normalized.dispose();
    
    return batched;
  }

  /**
   * Apply ImageNet normalization to tensor
   */
  private normalizeTensor(tensor: tf.Tensor): tf.Tensor {
    const mean = tf.tensor(ImagePreprocessor.NORMALIZATION_MEAN);
    const std = tf.tensor(ImagePreprocessor.NORMALIZATION_STD);
    
    // Normalize: (x - mean) / std
    const normalized = tf.div(tf.sub(tensor, mean), std);
    
    // Clean up
    mean.dispose();
    std.dispose();
    
    return normalized;
  }

  /**
   * Alternative preprocessing for different model requirements
   */
  async preprocessImageForModel(file: File, modelType: 'resnet' | 'efficientnet' | 'vit' = 'resnet'): Promise<ProcessedImageResult> {
    const startTime = performance.now();
    
    try {
      const imageElement = await this.createImageElement(file);
      const originalDimensions = {
        width: imageElement.naturalWidth,
        height: imageElement.naturalHeight
      };

      let tensor: tf.Tensor;
      let processedDimensions: { width: number; height: number };

      switch (modelType) {
        case 'efficientnet':
          processedDimensions = { width: 240, height: 240 };
          tensor = await this.preprocessForEfficientNet(imageElement);
          break;
        case 'vit':
          processedDimensions = { width: 384, height: 384 };
          tensor = await this.preprocessForViT(imageElement);
          break;
        default: // resnet
          processedDimensions = { width: 224, height: 224 };
          tensor = await this.imageToTensor(imageElement);
          break;
      }

      const preprocessingTime = performance.now() - startTime;

      return {
        tensor,
        originalDimensions,
        processedDimensions,
        preprocessingTime
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Image preprocessing for ${modelType} failed: ${errorMessage}`);
    }
  }

  /**
   * Preprocess for EfficientNet models
   */
  private async preprocessForEfficientNet(image: HTMLImageElement): Promise<tf.Tensor> {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    if (!ctx) throw new Error('Failed to get canvas context');

    const targetSize = 240;
    canvas.width = targetSize;
    canvas.height = targetSize;

    ctx.drawImage(image, 0, 0, targetSize, targetSize);
    const imageData = ctx.getImageData(0, 0, targetSize, targetSize);
    
    return this.imageDataToTensor(imageData);
  }

  /**
   * Preprocess for Vision Transformer models
   */
  private async preprocessForViT(image: HTMLImageElement): Promise<tf.Tensor> {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    if (!ctx) throw new Error('Failed to get canvas context');

    const targetSize = 384;
    canvas.width = targetSize;
    canvas.height = targetSize;

    ctx.drawImage(image, 0, 0, targetSize, targetSize);
    const imageData = ctx.getImageData(0, 0, targetSize, targetSize);
    
    return this.imageDataToTensor(imageData);
  }

  /**
   * Cleanup tensor resources
   */
  disposeTensor(tensor: tf.Tensor): void {
    if (tensor && !tensor.isDisposed) {
      tensor.dispose();
    }
  }

  /**
   * Validate image file format
   */
  static validateImageFile(file: File): { valid: boolean; error?: string } {
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    
    if (!validTypes.includes(file.type)) {
      return {
        valid: false,
        error: 'Invalid image format. Supported formats: JPEG, PNG, WebP'
      };
    }

    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      return {
        valid: false,
        error: 'Image file too large. Maximum size: 10MB'
      };
    }

    return { valid: true };
  }
}
