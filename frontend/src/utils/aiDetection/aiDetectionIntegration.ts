import { AIDetector } from './detectAIImage';
import { AIDetectionConfig } from './types';

export interface IntegratedDetectionResult {
  aiGenerated: boolean;
  confidence: number;
  aiTool: string | null;
  detectionMethod: 'metadata' | 'model' | 'inference' | 'combined';
  processingTime: number;
  recommendations: string[];
  modelLoaded: boolean;
  error?: string;
}

export class AIDetectionIntegration {
  private detector: AIDetector;
  private initialized = false;

  constructor() {
    this.detector = new AIDetector();
  }

  /**
   * Initialize the AI detection system
   */
  async initialize(config: Partial<AIDetectionConfig> = {}): Promise<void> {
    if (this.initialized) return;

    try {
      const defaultConfig: AIDetectionConfig = {
        modelType: 'resnet',
        enableMetadataAnalysis: true,
        enableForensicAnalysis: true,
        confidenceThreshold: 0.5,
        enableModelInference: true,
        ...config
      };

      await this.detector.initialize(defaultConfig.modelType);
      this.initialized = true;
      
      console.log('AI Detection Integration initialized successfully');
    } catch (error) {
      console.warn('AI Detection Integration initialization failed:', error instanceof Error ? error.message : String(error));
      // Continue with metadata-only detection
      this.initialized = true;
    }
  }

  /**
   * Analyze image for AI generation - integrated with existing VerifyProof flow
   */
  async analyzeImage(file: File | string): Promise<IntegratedDetectionResult> {
    if (!this.initialized) {
      await this.initialize();
    }

    const startTime = performance.now();

    try {
      // Convert data URL to File if needed
      let imageFile: File;
      
      if (typeof file === 'string') {
        // Handle data URL strings (from existing VerifyProof flow)
        imageFile = await this.dataURLToFile(file);
      } else {
        imageFile = file;
      }

      // Run comprehensive AI detection
      const result = await this.detector.detectAIImage(imageFile);
      
      const processingTime = performance.now() - startTime;

      return {
        aiGenerated: result.isAIGenerated,
        confidence: result.confidence,
        aiTool: result.aiTool,
        detectionMethod: result.detectionMethod,
        processingTime,
        recommendations: result.recommendations,
        modelLoaded: !!result.modelPrediction
      };

    } catch (error) {
      const processingTime = performance.now() - startTime;
      
      return {
        aiGenerated: false,
        confidence: 0,
        aiTool: null,
        detectionMethod: 'metadata',
        processingTime,
        recommendations: ['AI detection failed, showing default result'],
        modelLoaded: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Quick AI detection for real-time feedback
   */
  async quickAnalyze(file: File | string): Promise<{
    aiGenerated: boolean;
    confidence: number;
    processingTime: number;
  }> {
    if (!this.initialized) {
      await this.initialize();
    }

    const startTime = performance.now();

    try {
      let imageFile: File;
      
      if (typeof file === 'string') {
        imageFile = await this.dataURLToFile(file);
      } else {
        imageFile = file;
      }

      // For quick analysis, we can skip some forensic steps
      const result = await this.detector.detectAIImage(imageFile);
      
      return {
        aiGenerated: result.isAIGenerated,
        confidence: result.confidence,
        processingTime: performance.now() - startTime
      };

    } catch (error) {
      return {
        aiGenerated: false,
        confidence: 0,
        processingTime: performance.now() - startTime
      };
    }
  }

  /**
   * Get AI detection status and model info
   */
  getStatus() {
    return this.detector.getStatus();
  }

  /**
   * Convert data URL to File object
   */
  private async dataURLToFile(dataURL: string): Promise<File> {
    const response = await fetch(dataURL);
    const blob = await response.blob();
    
    // Extract filename from data URL or generate one
    const filename = this.extractFilenameFromDataURL(dataURL) || 'image.jpg';
    
    return new File([blob], filename, { type: blob.type });
  }

  /**
   * Extract filename from data URL
   */
  private extractFilenameFromDataURL(dataURL: string): string | null {
    // Try to extract from data URL parameters
    const match = dataURL.match(/filename=([^;]+)/);
    if (match) {
      return decodeURIComponent(match[1]);
    }
    
    // Check if it's a base64 image with a type
    if (dataURL.startsWith('data:image/')) {
      const typeMatch = dataURL.match(/data:image\/([^;]+)/);
      if (typeMatch) {
        const extension = typeMatch[1];
        return `image.${extension}`;
      }
    }
    
    return null;
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    this.detector.dispose();
    this.initialized = false;
  }

  /**
   * Get detection statistics
   */
  getStatistics(): {
    modelLoaded: boolean;
    modelType: string;
    ready: boolean;
    memoryUsage: number;
  } {
    const status = this.getStatus();
    
    return {
      modelLoaded: status.modelLoaded,
      modelType: status.modelInfo?.modelType || 'none',
      ready: status.ready,
      memoryUsage: status.modelInfo?.memoryUsage || 0
    };
  }
}

// Singleton instance for easy usage across the app
let aiDetectionInstance: AIDetectionIntegration | null = null;

export function getAIDetection(): AIDetectionIntegration {
  if (!aiDetectionInstance) {
    aiDetectionInstance = new AIDetectionIntegration();
  }
  return aiDetectionInstance;
}

// Export convenience functions for direct usage
export async function detectAIInImage(file: File | string): Promise<IntegratedDetectionResult> {
  const detector = getAIDetection();
  return detector.analyzeImage(file);
}

export async function quickAIDetect(file: File | string): Promise<{
  aiGenerated: boolean;
  confidence: number;
  processingTime: number;
}> {
  const detector = getAIDetection();
  return detector.quickAnalyze(file);
}

export function getAIDetectionStatus() {
  const detector = getAIDetection();
  return detector.getStatus();
}
