/**
 * Main Forensic Engine
 * Orchestrates all detectors and provides unified forensic analysis
 */

import { ForensicImage, ForensicAnalysisResult } from './types';
import { ForensicFusion } from './fusion/forensicFusion';
import { PINITDetector } from './detectors/pinitDetector';
import { CameraDetector } from './detectors/cameraDetector';
import { AIDetector } from './detectors/aiDetector';
import { ScreenshotDetector } from './detectors/screenshotDetector';
import { EditedDetector } from './detectors/editedDetector';

export class ForensicEngine {
  private pinitDetector: PINITDetector;
  private cameraDetector: CameraDetector;
  private aiDetector: AIDetector;
  private screenshotDetector: ScreenshotDetector;
  private editedDetector: EditedDetector;
  private fusion: typeof ForensicFusion;

  constructor() {
    this.pinitDetector = new PINITDetector();
    this.cameraDetector = new CameraDetector();
    this.aiDetector = new AIDetector();
    this.screenshotDetector = new ScreenshotDetector();
    this.editedDetector = new EditedDetector();
    this.fusion = ForensicFusion;
  }

  /**
   * Perform complete forensic analysis
   * @param image Forensic image to analyze
   * @returns Promise<ForensicAnalysisResult> Complete forensic analysis result
   */
  async analyzeImage(image: ForensicImage): Promise<ForensicAnalysisResult> {
    console.log('[Forensic Engine] Starting complete forensic analysis...');
    const startTime = performance.now();

    try {
      // Step 1: Run all detectors in parallel
      const [
        pinitResult,
        cameraResult,
        aiResult,
        screenshotResult,
        editedResult
      ] = await Promise.all([
        this.pinitDetector.detect(image),
        this.cameraDetector.detect(image),
        this.aiDetector.detect(image),
        this.screenshotDetector.detect(image),
        this.editedDetector.detect(image)
      ]);

      console.log('[Forensic Engine] All detectors completed, starting fusion...');

      // Step 2: Fuse results using evidence-based reasoning
      const fusedResult = this.fusion.fuseResults(
        pinitResult,
        cameraResult,
        aiResult,
        screenshotResult,
        editedResult
      );

      const processingTime = performance.now() - startTime;
      console.log(`[Forensic Engine] Complete analysis in ${processingTime}ms`);

      return fusedResult;

    } catch (error) {
      console.error('[Forensic Engine] Analysis failed:', error);
      return {
        success: false,
        classification: {
          type: 'UNKNOWN',
          confidence: 0,
          risk_level: 'LOW',
          primary_evidence: ['Analysis failed due to error'],
          secondary_evidence: []
        },
        signals: {
          metadata_detected: false,
          camera_probability: 0,
          ai_probability: 0,
          screenshot_probability: 0,
          edited_probability: 0,
          pinit_encrypted: false
        },
        processing_time_ms: performance.now() - startTime,
        technical_details: {
          pinit_detection: {
            detected: false,
            confidence: 0,
            evidence: {},
            reasoning: ['Analysis failed'],
            encrypted: false,
            watermark_detected: false
          },
          camera_detection: {
            detected: false,
            confidence: 0,
            evidence: {},
            reasoning: ['Analysis failed'],
            exif_present: false,
            sensor_noise_level: 0,
            natural_edges: false,
            jpeg_artifacts: false,
            chromatic_aberration: false
          },
          ai_detection: {
            detected: false,
            confidence: 0,
            evidence: {},
            reasoning: ['Analysis failed'],
            oversmoothing: 0,
            diffusion_artifacts: false,
            repetitive_patterns: false,
            frequency_anomaly: 0,
            synthetic_noise: false
          },
          screenshot_detection: {
            detected: false,
            confidence: 0,
            evidence: {},
            reasoning: ['Analysis failed'],
            ui_elements: false,
            text_density: 0,
            screen_ratio: false,
            pixel_grid: false,
            histogram_flatness: 0
          },
          edited_detection: {
            detected: false,
            confidence: 0,
            evidence: {},
            reasoning: ['Analysis failed'],
            lighting_inconsistency: false,
            cloning_artifacts: false,
            compositing_edges: false,
            filter_traces: false,
            recompression_artifacts: false,
            crop_boundaries: false
          }
        }
      };
    }
  }

  /**
   * Get detailed explanation of analysis results
   * @param result Forensic analysis result
   * @returns Detailed explanation object
   */
  getExplanation(result: ForensicAnalysisResult) {
    return this.fusion.getClassificationExplanation(result);
  }

  /**
   * Get risk assessment
   * @param result Forensic analysis result
   * @returns Risk assessment string
   */
  getRiskAssessment(result: ForensicAnalysisResult): string {
    const explanation = this.fusion.getClassificationExplanation(result);
    return explanation.riskAssessment;
  }

  /**
   * Get confidence level
   * @param result Forensic analysis result
   * @returns Confidence percentage (0-100)
   */
  getConfidenceLevel(result: ForensicAnalysisResult): number {
    return Math.round(result.classification.confidence * 100);
  }

  /**
   * Get classification type
   * @param result Forensic analysis result
   * @returns Classification type string
   */
  getClassificationType(result: ForensicAnalysisResult): string {
    return result.classification.type;
  }

  /**
   * Check if image is classified as authentic
   * @param result Forensic analysis result
   * @returns True if classified as camera captured or PINIT encrypted
   */
  isAuthentic(result: ForensicAnalysisResult): boolean {
    return ['CAMERA_CAPTURED', 'PINIT_ENCRYPTED'].includes(result.classification.type);
  }

  /**
   * Check if image is classified as synthetic
   * @param result Forensic analysis result
   * @returns True if classified as AI generated or edited
   */
  isSynthetic(result: ForensicAnalysisResult): boolean {
    return ['AI_GENERATED', 'EDITED_MANIPULATED'].includes(result.classification.type);
  }

  /**
   * Check if image is classified as screenshot
   * @param result Forensic analysis result
   * @returns True if classified as screenshot
   */
  isScreenshot(result: ForensicAnalysisResult): boolean {
    return result.classification.type === 'SCREENSHOT';
  }

  /**
   * Get processing statistics
   * @param result Forensic analysis result
   * @returns Processing statistics object
   */
  getProcessingStats(result: ForensicAnalysisResult): {
    totalTime: number,
    detectorTimes: {
      pinit: number,
      camera: number,
      ai: number,
      screenshot: number,
      edited: number
    }
  } {
    return {
      totalTime: result.processing_time_ms,
      detectorTimes: {
        pinit: 0, // Could be extracted from technical_details if needed
        camera: 0,
        ai: 0,
        screenshot: 0,
        edited: 0
      }
    };
  }
}
