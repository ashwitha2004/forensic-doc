import { MetadataAnalyzer, MetadataAnalysisResult } from './metadataAnalyzer';
import { ImagePreprocessor, ProcessedImageResult } from './imagePreprocess';
import { AIModel, ModelPredictionResult } from './aiModel';
import { aiInference, AIInferenceResult } from './aiInference';

export interface AIDetectionResult {
  isAIGenerated: boolean;
  confidence: number;
  metadataAnalysis: MetadataAnalysisResult;
  modelPrediction: ModelPredictionResult | null;
  aiInferenceResult: AIInferenceResult | null;
  forensicAnalysis: ForensicAnalysisResult;
  combinedScore: number;
  detectionMethod: 'metadata' | 'model' | 'inference' | 'combined';
  processingTime: number;
  aiTool: string | null;
  recommendations: string[];
}

export interface ForensicAnalysisResult {
  score: number;
  suspiciousPatterns: string[];
  artifacts: string[];
  inconsistencies: string[];
}

export class AIDetector {
  private metadataAnalyzer: MetadataAnalyzer;
  private imagePreprocessor: ImagePreprocessor;
  private aiModel: AIModel;
  private modelLoaded = false;

  constructor() {
    this.metadataAnalyzer = new MetadataAnalyzer();
    this.imagePreprocessor = new ImagePreprocessor();
    this.aiModel = new AIModel();
  }

  /**
   * Initialize the AI detection system
   */
  async initialize(modelType: 'resnet' | 'efficientnet' | 'vit' = 'resnet'): Promise<void> {
    try {
      await this.aiModel.loadModel(modelType);
      this.modelLoaded = true;
      console.log(`AI Detector initialized with ${modelType} model`);
    } catch (error) {
      console.warn('Failed to load AI model, will use metadata-only detection:', error instanceof Error ? error.message : String(error));
      this.modelLoaded = false;
    }
  }

  /**
   * Main detection method - combines all analysis techniques
   */
  async detectAIImage(file: File): Promise<AIDetectionResult> {
    const startTime = performance.now();

    try {
      // Validate image file
      const validation = ImagePreprocessor.validateImageFile(file);
      if (!validation.valid) {
        throw new Error(validation.error);
      }

      // Step 1: Metadata Analysis
      const metadataAnalysis = await this.metadataAnalyzer.analyzeImage(file);

      // Step 2: AI Model Prediction (if model is loaded)
      let modelPrediction: ModelPredictionResult | null = null;
      let processedImage: ProcessedImageResult | null = null;

      if (this.modelLoaded) {
        try {
          processedImage = await this.imagePreprocessor.preprocessImage(file);
          modelPrediction = await this.aiModel.predict(processedImage);
        } catch (error) {
          console.warn('AI model prediction failed:', error instanceof Error ? error.message : String(error));
          modelPrediction = null;
        }
      }

      // Step 3: AI Inference Analysis (TensorFlow pixel analysis)
      let aiInferenceResult: AIInferenceResult | null = null;
      try {
        // Convert file to base64 for inference
        const base64Data = await this.fileToBase64(file);
        aiInferenceResult = await aiInference.analyzeImage(base64Data);
      } catch (error) {
        console.warn('AI inference analysis failed:', error instanceof Error ? error.message : String(error));
        aiInferenceResult = null;
      }

      // Step 4: Forensic Analysis
      const forensicAnalysis = await this.performForensicAnalysis(file, processedImage);

      // Step 5: Combine all results
      const combinedResult = this.combineResults(
        metadataAnalysis,
        modelPrediction,
        aiInferenceResult,
        forensicAnalysis
      );

      const processingTime = performance.now() - startTime;

      // Clean up tensor resources
      if (processedImage) {
        this.imagePreprocessor.disposeTensor(processedImage.tensor);
      }

      return {
        ...combinedResult,
        metadataAnalysis,
        modelPrediction,
        aiInferenceResult,
        forensicAnalysis,
        processingTime,
        recommendations: this.generateRecommendations(combinedResult)
      };
    } catch (error) {
      throw new Error(`AI detection failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Convert file to base64
   */
  private async fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (reader.result) {
          const base64 = reader.result as string;
          // Remove data URL prefix if present
          const base64Data = base64.includes(',') ? base64.split(',')[1] : base64;
          resolve(base64Data);
        } else {
          reject(new Error('Failed to convert file to base64'));
        }
      };
      reader.onerror = () => reject(new Error('FileReader error'));
      reader.readAsDataURL(file);
    });
  }

  /**
   * Perform forensic analysis on the image
   */
  private async performForensicAnalysis(
    file: File,
    processedImage: ProcessedImageResult | null
  ): Promise<ForensicAnalysisResult> {
    const result: ForensicAnalysisResult = {
      score: 0,
      suspiciousPatterns: [],
      artifacts: [],
      inconsistencies: []
    };

    try {
      // Create image element for analysis
      const imageElement = await this.createImageElement(file);
      
      // Analyze pixel patterns
      const pixelAnalysis = this.analyzePixelPatterns(imageElement);
      result.score += pixelAnalysis.score;
      result.suspiciousPatterns.push(...pixelAnalysis.patterns);
      result.artifacts.push(...pixelAnalysis.artifacts);

      // Analyze compression artifacts
      const compressionAnalysis = this.analyzeCompressionArtifacts(imageElement);
      result.score += compressionAnalysis.score;
      result.artifacts.push(...compressionAnalysis.artifacts);

      // Analyze color distribution
      const colorAnalysis = this.analyzeColorDistribution(imageElement);
      result.score += colorAnalysis.score;
      result.inconsistencies.push(...colorAnalysis.inconsistencies);

      // Analyze edge patterns
      const edgeAnalysis = this.analyzeEdgePatterns(imageElement);
      result.score += edgeAnalysis.score;
      result.suspiciousPatterns.push(...edgeAnalysis.patterns);

      // Clean up
      URL.revokeObjectURL(imageElement.src);

    } catch (error) {
      console.warn('Forensic analysis failed:', error instanceof Error ? error.message : String(error));
    }

    return result;
  }

  /**
   * Analyze pixel patterns for AI generation signs
   */
  private analyzePixelPatterns(image: HTMLImageElement): {
    score: number;
    patterns: string[];
    artifacts: string[];
  } {
    const result = { score: 0, patterns: [] as string[], artifacts: [] as string[] };

    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return result;

      canvas.width = image.width;
      canvas.height = image.height;
      ctx.drawImage(image, 0, 0);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;

      // Check for unnatural pixel regularity
      const regularityScore = this.checkPixelRegularity(data);
      if (regularityScore > 0.7) {
        result.score += 0.2;
        result.patterns.push('high-pixel-regularity');
      }

      // Check for noise patterns
      const noiseScore = this.checkNoisePatterns(data);
      if (noiseScore < 0.3) {
        result.score += 0.15;
        result.artifacts.push('unnatural-smoothness');
      }

      // Check for repeating patterns
      const patternScore = this.checkRepeatingPatterns(data, canvas.width, canvas.height);
      if (patternScore > 0.5) {
        result.score += 0.1;
        result.patterns.push('repeating-patterns');
      }

    } catch (error) {
      console.warn('Pixel pattern analysis failed:', error instanceof Error ? error.message : String(error));
    }

    return result;
  }

  /**
   * Analyze compression artifacts
   */
  private analyzeCompressionArtifacts(image: HTMLImageElement): {
    score: number;
    artifacts: string[];
  } {
    const result = { score: 0, artifacts: [] as string[] };

    try {
      // Check for JPEG compression artifacts
      if (image.src.includes('jpeg') || image.src.includes('jpg')) {
        // AI-generated images often have different compression patterns
        result.score += 0.05;
        result.artifacts.push('jpeg-compression-patterns');
      }

      // Check for unusual compression quality
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return result;

      canvas.width = image.width;
      canvas.height = image.height;
      ctx.drawImage(image, 0, 0);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const compressionScore = this.analyzeCompressionQuality(imageData.data);
      
      if (compressionScore > 0.8) {
        result.score += 0.1;
        result.artifacts.push('high-compression-quality');
      }

    } catch (error) {
      console.warn('Compression analysis failed:', error instanceof Error ? error.message : String(error));
    }

    return result;
  }

  /**
   * Analyze color distribution
   */
  private analyzeColorDistribution(image: HTMLImageElement): {
    score: number;
    inconsistencies: string[];
  } {
    const result = { score: 0, inconsistencies: [] as string[] };

    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return result;

      canvas.width = image.width;
      canvas.height = image.height;
      ctx.drawImage(image, 0, 0);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const colorScore = this.analyzeColorConsistency(imageData.data);
      
      if (colorScore > 0.7) {
        result.score += 0.15;
        result.inconsistencies.push('unnatural-color-distribution');
      }

    } catch (error) {
      console.warn('Color distribution analysis failed:', error instanceof Error ? error.message : String(error));
    }

    return result;
  }

  /**
   * Analyze edge patterns
   */
  private analyzeEdgePatterns(image: HTMLImageElement): {
    score: number;
    patterns: string[];
  } {
    const result = { score: 0, patterns: [] as string[] };

    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return result;

      canvas.width = image.width;
      canvas.height = image.height;
      ctx.drawImage(image, 0, 0);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const edgeScore = this.analyzeEdgeCharacteristics(imageData.data, canvas.width, canvas.height);
      
      if (edgeScore > 0.6) {
        result.score += 0.1;
        result.patterns.push('unnatural-edge-patterns');
      }

    } catch (error) {
      console.warn('Edge pattern analysis failed:', error instanceof Error ? error.message : String(error));
    }

    return result;
  }

  /**
   * Combine all analysis results into final determination
   */
  private combineResults(
    metadata: MetadataAnalysisResult,
    model: ModelPredictionResult | null,
    inference: AIInferenceResult | null,
    forensic: ForensicAnalysisResult
  ): Omit<AIDetectionResult, 'metadataAnalysis' | 'modelPrediction' | 'aiInferenceResult' | 'forensicAnalysis' | 'processingTime' | 'recommendations'> {
    let combinedScore = 0;
    let detectionMethod: 'metadata' | 'model' | 'inference' | 'combined' = 'metadata';
    let isAIGenerated = false;
    let confidence = 0;
    let aiTool = metadata.aiTool;

    // Weight factors - AI inference gets highest weight
    const metadataWeight = 0.2;
    const modelWeight = 0.3;
    const inferenceWeight = 0.4;
    const forensicWeight = 0.1;

    // Calculate weighted score
    combinedScore += metadata.metadataScore * metadataWeight;
    
    if (model) {
      combinedScore += model.aiProbability * modelWeight;
      detectionMethod = 'combined';
      confidence = model.confidence;
    } else {
      detectionMethod = 'metadata';
      confidence = metadata.confidence;
    }

    // Add AI inference score with highest priority
    if (inference) {
      combinedScore += inference.confidence * inferenceWeight;
      if (detectionMethod === 'metadata') {
        detectionMethod = 'inference';
      } else {
        detectionMethod = 'combined';
      }
      confidence = Math.max(confidence, inference.confidence);
    }

    combinedScore += Math.min(forensic.score, 1.0) * forensicWeight;

    // AI DETECTION HAS HIGHEST PRIORITY
    // If any AI signal is strong, classify as AI regardless of other factors
    const aiSignals = [
      metadata.isAIGenerated ? metadata.confidence : 0,
      model?.aiProbability || 0,
      inference?.confidence || 0
    ];
    
    const maxAISignal = Math.max(...aiSignals);
    
    // AI detection overrides everything if confidence is high
    if (maxAISignal > 0.6) {
      isAIGenerated = true;
      confidence = maxAISignal;
      combinedScore = Math.max(combinedScore, maxAISignal);
    } else {
      isAIGenerated = combinedScore > 0.5;
      confidence = Math.max(confidence, combinedScore);
    }

    // If metadata detected a specific AI tool, use that
    if (metadata.aiTool) {
      aiTool = metadata.aiTool;
    }

    return {
      isAIGenerated,
      confidence: Math.min(confidence, 1.0),
      combinedScore: Math.min(combinedScore, 1.0),
      detectionMethod,
      aiTool
    };
  }

  /**
   * Generate recommendations based on detection results
   */
  private generateRecommendations(result: Omit<AIDetectionResult, 'metadataAnalysis' | 'modelPrediction' | 'aiInferenceResult' | 'forensicAnalysis' | 'processingTime' | 'recommendations'>): string[] {
    const recommendations: string[] = [];

    if (result.isAIGenerated) {
      recommendations.push('This image appears to be AI-generated');
      
      if (result.aiTool) {
        recommendations.push(`Likely created with: ${result.aiTool}`);
      }
      
      if (result.confidence > 0.8) {
        recommendations.push('High confidence in AI detection');
      } else {
        recommendations.push('Moderate confidence - additional verification recommended');
      }
    } else {
      recommendations.push('This image appears to be authentic');
      
      if (result.confidence > 0.8) {
        recommendations.push('High confidence in authenticity');
      } else {
        recommendations.push('Moderate confidence - consider additional verification');
      }
    }

    if (result.detectionMethod === 'metadata') {
      recommendations.push('Detection based on metadata analysis only');
    } else if (result.detectionMethod === 'model') {
      recommendations.push('Detection based on AI model analysis');
    } else if (result.detectionMethod === 'inference') {
      recommendations.push('Detection based on TensorFlow AI inference analysis');
    } else if (result.detectionMethod === 'combined') {
      recommendations.push('Detection based on combined AI analysis methods');
    }

    return recommendations;
  }

  // Helper methods for forensic analysis
  private checkPixelRegularity(data: Uint8ClampedArray): number {
    // Simplified pixel regularity check
    let variance = 0;
    const sampleSize = Math.min(1000, data.length / 4);
    
    for (let i = 0; i < sampleSize; i++) {
      const idx = i * 4;
      const gray = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
      variance += Math.pow(gray - 128, 2);
    }
    
    variance /= sampleSize;
    return 1 - (variance / 16384); // Normalize to 0-1
  }

  private checkNoisePatterns(data: Uint8ClampedArray): number {
    // Simplified noise analysis
    let noise = 0;
    const sampleSize = Math.min(500, data.length / 12);
    
    for (let i = 0; i < sampleSize; i++) {
      const idx = i * 12;
      const diff1 = Math.abs(data[idx] - data[idx + 4]);
      const diff2 = Math.abs(data[idx + 1] - data[idx + 5]);
      const diff3 = Math.abs(data[idx + 2] - data[idx + 6]);
      noise += (diff1 + diff2 + diff3) / 3;
    }
    
    return Math.min(noise / sampleSize / 255, 1);
  }

  private checkRepeatingPatterns(data: Uint8ClampedArray, width: number, height: number): number {
    // Simplified pattern detection
    let patternScore = 0;
    const blockSize = 16;
    const blocksX = Math.floor(width / blockSize);
    const blocksY = Math.floor(height / blockSize);
    
    for (let by = 0; by < blocksY - 1; by++) {
      for (let bx = 0; bx < blocksX - 1; bx++) {
        const block1Start = (by * blockSize * width + bx * blockSize) * 4;
        const block2Start = (by * blockSize * width + (bx + 1) * blockSize) * 4;
        
        let similarity = 0;
        for (let i = 0; i < blockSize * 4; i++) {
          similarity += Math.abs(data[block1Start + i] - data[block2Start + i]);
        }
        
        if (similarity < blockSize * 4 * 10) { // Threshold for similarity
          patternScore += 0.1;
        }
      }
    }
    
    return Math.min(patternScore, 1);
  }

  private analyzeCompressionQuality(data: Uint8ClampedArray): number {
    // Simplified compression analysis
    let quality = 0;
    const sampleSize = Math.min(1000, data.length / 4);
    
    for (let i = 0; i < sampleSize; i++) {
      const idx = i * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      
      // Check for quantization artifacts
      if (r % 8 === 0 && g % 8 === 0 && b % 8 === 0) {
        quality += 0.01;
      }
    }
    
    return Math.min(quality, 1);
  }

  private analyzeColorConsistency(data: Uint8ClampedArray): number {
    // Simplified color distribution analysis
    const histogram = new Array(256).fill(0);
    const sampleSize = Math.min(10000, data.length / 4);
    
    for (let i = 0; i < sampleSize; i++) {
      const idx = i * 4;
      const gray = Math.floor((data[idx] + data[idx + 1] + data[idx + 2]) / 3);
      histogram[gray]++;
    }
    
    // Calculate distribution uniformity
    let uniformity = 0;
    for (let i = 0; i < 256; i++) {
      uniformity += Math.abs(histogram[i] - sampleSize / 256);
    }
    
    return 1 - (uniformity / (sampleSize * 2));
  }

  private analyzeEdgeCharacteristics(data: Uint8ClampedArray, width: number, height: number): number {
    // Simplified edge detection
    let edgeCount = 0;
    const sampleSize = Math.min(1000, (width - 2) * (height - 2));
    
    for (let i = 0; i < sampleSize; i++) {
      const x = Math.floor(Math.random() * (width - 2)) + 1;
      const y = Math.floor(Math.random() * (height - 2)) + 1;
      
      const idx = (y * width + x) * 4;
      const gray = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
      
      // Check neighboring pixels
      const neighbors = [
        ((y - 1) * width + x) * 4,
        ((y + 1) * width + x) * 4,
        (y * width + (x - 1)) * 4,
        (y * width + (x + 1)) * 4
      ];
      
      let edgeStrength = 0;
      for (const nIdx of neighbors) {
        const nGray = (data[nIdx] + data[nIdx + 1] + data[nIdx + 2]) / 3;
        edgeStrength += Math.abs(gray - nGray);
      }
      
      if (edgeStrength > 30) {
        edgeCount++;
      }
    }
    
    return edgeCount / sampleSize;
  }

  private createImageElement(file: File): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const image = new Image();
      const url = URL.createObjectURL(file);
      
      image.onload = () => {
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
   * Get detector status
   */
  getStatus(): {
    modelLoaded: boolean;
    modelInfo: any;
    ready: boolean;
  } {
    return {
      modelLoaded: this.modelLoaded,
      modelInfo: this.modelLoaded ? this.aiModel.getModelInfo() : null,
      ready: true // Always ready for metadata analysis
    };
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    this.aiModel.dispose();
    this.modelLoaded = false;
  }
}
