import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-backend-webgl';

export interface AIInferenceResult {
  isAI: boolean;
  confidence: number;
  modelPredictions: {
    gan: number;
    diffusion: number;
    synthetic: number;
    natural: number;
  };
  artifacts: {
    textureAnomalies: number;
    patternRepetition: number;
    lightingInconsistency: number;
    structuralAnomalies: number;
  };
  details: string[];
}

export class AIInference {
  private model: tf.LayersModel | null = null;
  private isInitialized = false;

  async initialize(): Promise<void> {
    try {
      // Initialize TensorFlow.js backend
      await tf.ready();
      console.log('[AI-INFERENCE] TensorFlow.js backend initialized');

      // For now, we'll use a simplified approach without a pre-trained model
      // In production, you would load a pre-trained AI detection model
      // this.model = await tf.loadLayersModel('/models/ai-detection/model.json');
      
      this.isInitialized = true;
      console.log('[AI-INFERENCE] AI inference system initialized');
    } catch (error) {
      console.error('[AI-INFERENCE] Failed to initialize:', error);
      throw error;
    }
  }

  async analyzeImage(imageData: string): Promise<AIInferenceResult> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      console.log('[AI-INFERENCE] Starting AI image analysis...');
      
      // Convert image to tensor
      const imageTensor = await this.imageToTensor(imageData);
      
      // Perform pixel-level analysis
      const textureAnalysis = await this.analyzeTexture(imageTensor);
      const patternAnalysis = await this.analyzePatterns(imageTensor);
      const lightingAnalysis = await this.analyzeLighting(imageTensor);
      const structureAnalysis = await this.analyzeStructure(imageTensor);
      
      // Calculate AI probability based on multiple factors
      const aiScore = this.calculateAIScore({
        texture: textureAnalysis,
        patterns: patternAnalysis,
        lighting: lightingAnalysis,
        structure: structureAnalysis
      });

      const result: AIInferenceResult = {
        isAI: aiScore > 0.6,
        confidence: aiScore,
        modelPredictions: {
          gan: textureAnalysis.ganLikelihood,
          diffusion: patternAnalysis.diffusionLikelihood,
          synthetic: lightingAnalysis.syntheticLikelihood,
          natural: 1 - aiScore
        },
        artifacts: {
          textureAnomalies: textureAnalysis.anomalyScore,
          patternRepetition: patternAnalysis.repetitionScore,
          lightingInconsistency: lightingAnalysis.inconsistencyScore,
          structuralAnomalies: structureAnalysis.anomalyScore
        },
        details: this.generateAnalysisDetails({
          texture: textureAnalysis,
          patterns: patternAnalysis,
          lighting: lightingAnalysis,
          structure: structureAnalysis
        })
      };

      // Cleanup tensor
      imageTensor.dispose();
      
      console.log('[AI-INFERENCE] Analysis complete:', result);
      return result;
    } catch (error) {
      console.error('[AI-INFERENCE] Analysis failed:', error);
      return this.getDefaultResult();
    }
  }

  private async imageToTensor(imageData: string): Promise<tf.Tensor3D> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        try {
          // Create canvas and draw image
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Could not get canvas context'));
            return;
          }

          // Resize to standard analysis size (256x256)
          const analysisSize = 256;
          canvas.width = analysisSize;
          canvas.height = analysisSize;
          
          ctx.drawImage(img, 0, 0, analysisSize, analysisSize);
          
          // Get image data and convert to tensor
          const imageData = ctx.getImageData(0, 0, analysisSize, analysisSize);
          const tensor = tf.browser.fromPixels(imageData);
          
          // Normalize to [0, 1]
          const normalized = tensor.div(255.0) as tf.Tensor3D;
          
          resolve(normalized);
        } catch (error) {
          reject(error);
        }
      };
      
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = imageData.startsWith('data:') ? imageData : `data:image/jpeg;base64,${imageData}`;
    });
  }

  private async analyzeTexture(tensor: tf.Tensor3D): Promise<{
    anomalyScore: number;
    ganLikelihood: number;
    details: string[];
  }> {
    try {
      // Analyze texture patterns typical in AI-generated images
      // GAN images often have unusual texture patterns
      
      // Calculate texture variance across different regions
      const regions = this.splitIntoRegions(tensor, 4);
      const variances = await Promise.all(
        regions.map(async (region) => {
          const mean = region.mean();
          const variance = tf.moments(region).variance;
          const varianceValue = await variance.data();
          region.dispose();
          mean.dispose();
          variance.dispose();
          return varianceValue[0];
        })
      );

      // AI images often have unnaturally consistent textures
      const avgVariance = variances.reduce((a, b) => a + b, 0) / variances.length;
      const varianceConsistency = 1 - (Math.max(...variances) - Math.min(...variances)) / avgVariance;
      
      // GANs often produce specific texture artifacts
      const ganLikelihood = varianceConsistency > 0.7 ? varianceConsistency * 0.8 : 0.3;
      const anomalyScore = varianceConsistency;

      return {
        anomalyScore,
        ganLikelihood,
        details: varianceConsistency > 0.7 ? 
          ['Unusually consistent texture patterns', 'Possible GAN artifacts'] :
          ['Natural texture variation detected']
      };
    } catch (error) {
      console.warn('[AI-INFERENCE] Texture analysis failed:', error);
      return { anomalyScore: 0.5, ganLikelihood: 0.5, details: ['Texture analysis failed'] };
    }
  }

  private async analyzePatterns(tensor: tf.Tensor3D): Promise<{
    repetitionScore: number;
    diffusionLikelihood: number;
    details: string[];
  }> {
    try {
      // Analyze for repetitive patterns common in diffusion models
      // Diffusion models sometimes create repeating elements
      
      // Simple pattern detection using frequency analysis
      const gray = tf.image.rgbToGrayscale(tensor);
      const fft = tf.fft(tf.cast(gray, 'complex64'));
      const magnitude = tf.abs(fft);
      
      // Look for unusual frequency patterns
      const magnitudeData = await magnitude.data();
      const magnitudeArray = Array.from(magnitudeData);
      const avgMagnitude = magnitudeArray.reduce((a, b) => a + b, 0) / magnitudeArray.length;
      
      // High frequency energy can indicate AI generation
      const highFreqEnergy = magnitudeArray.filter(v => v > avgMagnitude * 2).length / magnitudeArray.length;
      
      gray.dispose();
      fft.dispose();
      magnitude.dispose();
      
      const repetitionScore = Math.min(highFreqEnergy * 2, 1);
      const diffusionLikelihood = repetitionScore > 0.3 ? repetitionScore : 0.2;

      return {
        repetitionScore,
        diffusionLikelihood,
        details: repetitionScore > 0.3 ? 
          ['Repetitive patterns detected', 'Possible diffusion model artifacts'] :
          ['Natural pattern variation']
      };
    } catch (error) {
      console.warn('[AI-INFERENCE] Pattern analysis failed:', error);
      return { repetitionScore: 0.5, diffusionLikelihood: 0.5, details: ['Pattern analysis failed'] };
    }
  }

  private async analyzeLighting(tensor: tf.Tensor3D): Promise<{
    inconsistencyScore: number;
    syntheticLikelihood: number;
    details: string[];
  }> {
    try {
      // Analyze lighting consistency
      // AI images often have unrealistic lighting
      
      // Calculate lighting gradients
      const gray = tf.image.rgbToGrayscale(tensor);
      
      // Manual Sobel edge detection
      const sobelX = tf.tensor2d([
        [-1, 0, 1],
        [-2, 0, 2],
        [-1, 0, 1]
      ], [3, 3]);
      
      const sobelY = tf.tensor2d([
        [-1, -2, -1],
        [0, 0, 0],
        [1, 2, 1]
      ], [3, 3]);
      
      // Convolve with Sobel kernels
      // Create proper 4D tensor shape [batch, height, width, channels]
      const gray4d = gray.expandDims(-1).expandDims(0);
      console.log('[AI-INFERENCE] Gray tensor shape before conv2d:', gray4d.shape);
      
      const kernelX = sobelX.reshape([3, 3, 1, 1]) as tf.Tensor4D;
      const kernelY = sobelY.reshape([3, 3, 1, 1]) as tf.Tensor4D;
      
      let edgesX: tf.Tensor4D;
      let edgesY: tf.Tensor4D;
      
      // Handle the 5D tensor case by squeezing the extra dimension
      if (gray4d.shape.length === 5) {
        console.log('[AI-INFERENCE] Fixing 5D tensor to 4D...');
        // Remove the extra dimension: [1, height, width, 1, 1] -> [1, height, width, 1]
        const correctedTensor = gray4d.squeeze([-1]) as tf.Tensor4D;
        console.log('[AI-INFERENCE] Corrected tensor shape:', correctedTensor.shape);
        edgesX = tf.conv2d(correctedTensor, kernelX, 1, 'same');
        edgesY = tf.conv2d(correctedTensor, kernelY, 1, 'same');
        correctedTensor.dispose();
      } else if (gray4d.shape.length === 4) {
        edgesX = tf.conv2d(gray4d as tf.Tensor4D, kernelX, 1, 'same');
        edgesY = tf.conv2d(gray4d as tf.Tensor4D, kernelY, 1, 'same');
      } else {
        console.error('[AI-INFERENCE] Unexpected tensor shape:', gray4d.shape);
        throw new Error(`Unexpected tensor shape: ${gray4d.shape}`);
      }
      
      // Clean up intermediate tensors
      gray4d.dispose();
      
      // Combine gradients
      const gradients = tf.sqrt(tf.square(edgesX).add(tf.square(edgesY))).squeeze();
      
      const gradientData = await gradients.data() as Float32Array;
      const avgGradient = gradientData.reduce((a, b) => a + b, 0) / gradientData.length;
      
      // Unnatural lighting patterns
      const lightingInconsistency = Math.abs(avgGradient - 0.5) * 2;
      
      // Clean up all tensors
      gray.dispose();
      sobelX.dispose();
      sobelY.dispose();
      edgesX.dispose();
      edgesY.dispose();
      gradients.dispose();
      
      const syntheticLikelihood = lightingInconsistency > 0.6 ? lightingInconsistency : 0.3;

      return {
        inconsistencyScore: lightingInconsistency,
        syntheticLikelihood,
        details: lightingInconsistency > 0.6 ? 
          ['Unusual lighting patterns', 'Synthetic lighting detected'] :
          ['Natural lighting detected']
      };
    } catch (error) {
      console.warn('[AI-INFERENCE] Lighting analysis failed:', error);
      return { inconsistencyScore: 0.5, syntheticLikelihood: 0.5, details: ['Lighting analysis failed'] };
    }
  }

  private async analyzeStructure(tensor: tf.Tensor3D): Promise<{
    anomalyScore: number;
    details: string[];
  }> {
    try {
      // Analyze structural elements
      // AI images sometimes have malformed structures
      
      // Edge detection and structure analysis
      // Manual Sobel edge detection since tf.image.sobelEdges doesn't exist
      const sobelX = tf.tensor2d([
        [-1, 0, 1],
        [-2, 0, 2],
        [-1, 0, 1]
      ], [3, 3]);
      
      const sobelY = tf.tensor2d([
        [-1, -2, -1],
        [0, 0, 0],
        [1, 2, 1]
      ], [3, 3]);
      
      // Convert to grayscale if needed and apply Sobel filters
      const gray = tensor.mean(2).expandDims(2) as tf.Tensor3D;
      const sobelX4D = sobelX.reshape([3, 3, 1, 1]) as tf.Tensor4D;
      const sobelY4D = sobelY.reshape([3, 3, 1, 1]) as tf.Tensor4D;
      const edgesX = tf.conv2d(gray, sobelX4D, 1, 'same') as tf.Tensor3D;
      const edgesY = tf.conv2d(gray, sobelY4D, 1, 'same') as tf.Tensor3D;
      
      // Combine edges
      const edges = tf.sqrt(tf.square(edgesX).add(tf.square(edgesY)));
      const edgeDensity = tf.mean(edges);
      
      // Cleanup
      sobelX.dispose();
      sobelY.dispose();
      sobelX4D.dispose();
      sobelY4D.dispose();
      gray.dispose();
      edgesX.dispose();
      edgesY.dispose();
      
      const edgeValue = await edgeDensity.data();
      const anomalyScore = Math.abs(edgeValue[0] - 0.3) / 0.3;
      
      edges.dispose();
      edgeDensity.dispose();

      return {
        anomalyScore: Math.min(anomalyScore, 1),
        details: anomalyScore > 0.5 ? 
          ['Structural anomalies detected', 'Unusual edge patterns'] :
          ['Natural structure detected']
      };
    } catch (error) {
      console.warn('[AI-INFERENCE] Structure analysis failed:', error);
      return { anomalyScore: 0.5, details: ['Structure analysis failed'] };
    }
  }

  private splitIntoRegions(tensor: tf.Tensor3D, numRegions: number): tf.Tensor3D[] {
    const regions: tf.Tensor3D[] = [];
    const [height, width] = tensor.shape.slice(0, 2);
    const regionHeight = Math.floor(height / numRegions);
    const regionWidth = Math.floor(width / numRegions);

    for (let i = 0; i < numRegions; i++) {
      for (let j = 0; j < numRegions; j++) {
        const startY = i * regionHeight;
        const startX = j * regionWidth;
        const region = tf.slice(tensor, [startY, startX, 0], [regionHeight, regionWidth, -1]);
        regions.push(region);
      }
    }

    return regions;
  }

  private calculateAIScore(analysis: {
    texture: any;
    patterns: any;
    lighting: any;
    structure: any;
  }): number {
    // Weight different analysis types
    const weights = {
      texture: 0.3,
      patterns: 0.25,
      lighting: 0.25,
      structure: 0.2
    };

    const score = 
      analysis.texture.anomalyScore * weights.texture +
      analysis.patterns.repetitionScore * weights.patterns +
      analysis.lighting.inconsistencyScore * weights.lighting +
      analysis.structure.anomalyScore * weights.structure;

    return Math.min(score, 1);
  }

  private generateAnalysisDetails(analysis: {
    texture: any;
    patterns: any;
    lighting: any;
    structure: any;
  }): string[] {
    return [
      ...analysis.texture.details,
      ...analysis.patterns.details,
      ...analysis.lighting.details,
      ...analysis.structure.details
    ];
  }

  private getDefaultResult(): AIInferenceResult {
    return {
      isAI: false,
      confidence: 0.5,
      modelPredictions: {
        gan: 0.5,
        diffusion: 0.5,
        synthetic: 0.5,
        natural: 0.5
      },
      artifacts: {
        textureAnomalies: 0.5,
        patternRepetition: 0.5,
        lightingInconsistency: 0.5,
        structuralAnomalies: 0.5
      },
      details: ['AI inference analysis failed']
    };
  }
}

export const aiInference = new AIInference();
