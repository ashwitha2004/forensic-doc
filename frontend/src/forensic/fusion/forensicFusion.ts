/**
 * Forensic Fusion Engine
 * Evidence-based fusion combining detector outputs with priority reasoning
 */

import { 
  ForensicAnalysisResult, 
  ForensicClassification, 
  ForensicSignals,
  PINITDetectionResult,
  CameraDetectionResult,
  AIDetectionResult,
  ScreenshotDetectionResult,
  EditedDetectionResult
} from '../types';

export class ForensicFusion {
  /**
   * Fuse detector results into final classification
   */
  static fuseResults(
    pinitResult: PINITDetectionResult,
    cameraResult: CameraDetectionResult,
    aiResult: AIDetectionResult,
    screenshotResult: ScreenshotDetectionResult,
    editedResult: EditedDetectionResult
  ): ForensicAnalysisResult {
    console.log('[Forensic Fusion] Starting evidence-based fusion...');
    
    const startTime = performance.now();
    
    // Step 1: Apply priority-based reasoning
    const classification = this.applyPriorityReasoning(
      pinitResult,
      cameraResult,
      aiResult,
      screenshotResult,
      editedResult
    );
    
    // Step 2: Calculate forensic signals
    const signals = this.calculateForensicSignals(
      pinitResult,
      cameraResult,
      aiResult,
      screenshotResult,
      editedResult
    );
    
    // Step 3: Calculate evidence-based confidence
    const confidence = this.calculateEvidenceBasedConfidence(
      classification,
      pinitResult,
      cameraResult,
      aiResult,
      screenshotResult,
      editedResult
    );
    
    const processingTime = performance.now() - startTime;
    
    console.log(`[Forensic Fusion] Fusion complete: ${classification.type} (confidence: ${confidence}, time: ${processingTime}ms)`);
    
    return {
      success: true,
      classification,
      signals,
      processing_time_ms: processingTime,
      technical_details: {
        pinit_detection: pinitResult,
        camera_detection: cameraResult,
        ai_detection: aiResult,
        screenshot_detection: screenshotResult,
        edited_detection: editedResult
      }
    };
  }

  /**
   * Apply priority-based reasoning (NOT highest score wins)
   */
  private static applyPriorityReasoning(
    pinitResult: PINITDetectionResult,
    cameraResult: CameraDetectionResult,
    aiResult: AIDetectionResult,
    screenshotResult: ScreenshotDetectionResult,
    editedResult: EditedDetectionResult
  ): ForensicClassification {
    console.log('[Forensic Fusion] Applying priority reasoning...');
    
    // Priority 1: PINIT Encrypted (immediate classification)
    if (pinitResult.detected && pinitResult.confidence > 0.6) {
      console.log('[Forensic Fusion] PINIT encrypted detected - immediate classification');
      return {
        type: 'PINIT_ENCRYPTED',
        confidence: pinitResult.confidence,
        risk_level: this.calculateRiskLevel('PINIT_ENCRYPTED', pinitResult.confidence),
        primary_evidence: pinitResult.reasoning,
        secondary_evidence: []
      };
    }

    // Priority 2: Screenshot (strong UI evidence)
    const screenshotEvidence = this.evaluateScreenshotEvidence(screenshotResult);
    if (screenshotEvidence.isStrong) {
      console.log('[Forensic Fusion] Strong screenshot evidence detected');
      return {
        type: 'SCREENSHOT',
        confidence: screenshotResult.confidence,
        risk_level: this.calculateRiskLevel('SCREENSHOT', screenshotResult.confidence),
        primary_evidence: screenshotResult.reasoning,
        secondary_evidence: this.getSecondaryEvidence('SCREENSHOT', aiResult, cameraResult, screenshotResult, editedResult)
      };
    }

    // Priority 3: AI Generated (synthetic patterns)
    const aiEvidence = this.evaluateAIEvidence(aiResult);
    if (aiEvidence.isStrong && aiEvidence.confidence > 0.5) {
      console.log('[Forensic Fusion] Strong AI generation evidence detected');
      return {
        type: 'AI_GENERATED',
        confidence: aiResult.confidence,
        risk_level: this.calculateRiskLevel('AI_GENERATED', aiResult.confidence),
        primary_evidence: aiResult.reasoning,
        secondary_evidence: this.getSecondaryEvidence('AI_GENERATED', aiResult, cameraResult, screenshotResult, editedResult)
      };
    }

    // Priority 4: Camera Captured (natural characteristics)
    const cameraEvidence = this.evaluateCameraEvidence(cameraResult);
    if (cameraEvidence.isStrong && cameraEvidence.confidence > 0.4) {
      console.log('[Forensic Fusion] Strong camera capture evidence detected');
      return {
        type: 'CAMERA_CAPTURED',
        confidence: cameraResult.confidence,
        risk_level: this.calculateRiskLevel('CAMERA_CAPTURED', cameraResult.confidence),
        primary_evidence: cameraResult.reasoning,
        secondary_evidence: this.getSecondaryEvidence('CAMERA_CAPTURED', aiResult, cameraResult, screenshotResult, editedResult)
      };
    }

    // Priority 5: Edited/Manipulated (manipulation traces)
    const editedEvidence = this.evaluateEditedEvidence(editedResult);
    if (editedEvidence.isStrong && editedEvidence.confidence > 0.4) {
      console.log('[Forensic Fusion] Strong manipulation evidence detected');
      return {
        type: 'EDITED_MANIPULATED',
        confidence: editedResult.confidence,
        risk_level: this.calculateRiskLevel('EDITED_MANIPULATED', editedResult.confidence),
        primary_evidence: editedResult.reasoning,
        secondary_evidence: this.getSecondaryEvidence('EDITED_MANIPULATED', aiResult, cameraResult, screenshotResult, editedResult)
      };
    }

    // Default: Unknown
    console.log('[Forensic Fusion] No strong evidence - classifying as UNKNOWN');
    return {
      type: 'UNKNOWN',
      confidence: 0.3,
      risk_level: 'LOW',
      primary_evidence: ['Insufficient evidence for classification'],
      secondary_evidence: this.getSecondaryEvidence('UNKNOWN', aiResult, cameraResult, screenshotResult, editedResult)
    };
  }

  /**
   * Evaluate screenshot evidence strength
   */
  private static evaluateScreenshotEvidence(result: ScreenshotDetectionResult): {
    isStrong: boolean,
    confidence: number
  } {
    let evidenceStrength = 0;
    let supportingFactors = 0;

    // Strong indicators
    if (result.ui_elements) {
      evidenceStrength += 0.3;
      supportingFactors++;
    }
    if (result.text_density > 0.1) {
      evidenceStrength += 0.25;
      supportingFactors++;
    }
    if (result.screen_ratio) {
      evidenceStrength += 0.2;
      supportingFactors++;
    }
    if (result.pixel_grid) {
      evidenceStrength += 0.15;
      supportingFactors++;
    }
    if (result.histogram_flatness > 0.7) {
      evidenceStrength += 0.1;
      supportingFactors++;
    }

    // Strong evidence requires multiple supporting factors
    const isStrong = supportingFactors >= 3 && evidenceStrength > 0.5;

    return {
      isStrong,
      confidence: Math.min(evidenceStrength, 1.0)
    };
  }

  /**
   * Evaluate AI generation evidence strength
   */
  private static evaluateAIEvidence(result: AIDetectionResult): {
    isStrong: boolean,
    confidence: number
  } {
    let evidenceStrength = 0;
    let supportingFactors = 0;

    // Strong indicators
    if (result.oversmoothing > 0.5) {
      evidenceStrength += 0.25;
      supportingFactors++;
    }
    if (result.diffusion_artifacts) {
      evidenceStrength += 0.25;
      supportingFactors++;
    }
    if (result.repetitive_patterns) {
      evidenceStrength += 0.2;
      supportingFactors++;
    }
    if (result.frequency_anomaly > 0.4) {
      evidenceStrength += 0.2;
      supportingFactors++;
    }
    if (result.synthetic_noise) {
      evidenceStrength += 0.1;
      supportingFactors++;
    }

    // Strong evidence requires multiple synthetic indicators
    const isStrong = supportingFactors >= 3 && evidenceStrength > 0.6;

    return {
      isStrong,
      confidence: Math.min(evidenceStrength, 1.0)
    };
  }

  /**
   * Evaluate camera capture evidence strength
   */
  private static evaluateCameraEvidence(result: CameraDetectionResult): {
    isStrong: boolean,
    confidence: number
  } {
    let evidenceStrength = 0;
    let supportingFactors = 0;

    // Strong indicators
    if (result.exif_present) {
      evidenceStrength += 0.3;
      supportingFactors++;
    }
    if (result.sensor_noise_level > 10) {
      evidenceStrength += 0.25;
      supportingFactors++;
    }
    if (result.natural_edges) {
      evidenceStrength += 0.2;
      supportingFactors++;
    }
    if (result.jpeg_artifacts) {
      evidenceStrength += 0.15;
      supportingFactors++;
    }
    if (result.chromatic_aberration) {
      evidenceStrength += 0.1;
      supportingFactors++;
    }

    // Strong evidence requires natural characteristics
    const isStrong = supportingFactors >= 3 && evidenceStrength > 0.4;

    return {
      isStrong,
      confidence: Math.min(evidenceStrength, 1.0)
    };
  }

  /**
   * Evaluate edited/manipulated evidence strength
   */
  private static evaluateEditedEvidence(result: EditedDetectionResult): {
    isStrong: boolean,
    confidence: number
  } {
    let evidenceStrength = 0;
    let supportingFactors = 0;

    // Strong indicators
    if (result.lighting_inconsistency) {
      evidenceStrength += 0.25;
      supportingFactors++;
    }
    if (result.cloning_artifacts) {
      evidenceStrength += 0.25;
      supportingFactors++;
    }
    if (result.compositing_edges) {
      evidenceStrength += 0.2;
      supportingFactors++;
    }
    if (result.filter_traces) {
      evidenceStrength += 0.15;
      supportingFactors++;
    }
    if (result.recompression_artifacts) {
      evidenceStrength += 0.1;
      supportingFactors++;
    }
    if (result.crop_boundaries) {
      evidenceStrength += 0.05;
      supportingFactors++;
    }

    // Strong evidence requires manipulation traces
    const isStrong = supportingFactors >= 2 && evidenceStrength > 0.4;

    return {
      isStrong,
      confidence: Math.min(evidenceStrength, 1.0)
    };
  }

  /**
   * Get secondary evidence for classification
   */
  private static getSecondaryEvidence(
    primaryType: string,
    aiResult: AIDetectionResult,
    cameraResult: CameraDetectionResult,
    screenshotResult: ScreenshotDetectionResult,
    editedResult?: EditedDetectionResult
  ): string[] {
    const secondaryEvidence: string[] = [];

    // Add conflicting evidence
    switch (primaryType) {
      case 'AI_GENERATED':
        if (cameraResult.detected) {
          secondaryEvidence.push('Some camera characteristics detected (possible conflict)');
        }
        if (screenshotResult.detected) {
          secondaryEvidence.push('Some screenshot characteristics detected (possible conflict)');
        }
        break;

      case 'CAMERA_CAPTURED':
        if (aiResult.detected) {
          secondaryEvidence.push('Some AI generation characteristics detected (possible conflict)');
        }
        if (screenshotResult.detected) {
          secondaryEvidence.push('Some screenshot characteristics detected (possible conflict)');
        }
        if (editedResult?.detected) {
          secondaryEvidence.push('Some manipulation characteristics detected');
        }
        break;

      case 'SCREENSHOT':
        if (aiResult.detected) {
          secondaryEvidence.push('Some AI generation characteristics detected');
        }
        if (cameraResult.exif_present) {
          secondaryEvidence.push('EXIF metadata present (possible camera origin)');
        }
        break;

      case 'EDITED_MANIPULATED':
        if (aiResult.detected) {
          secondaryEvidence.push('Some AI generation characteristics detected');
        }
        if (cameraResult.detected) {
          secondaryEvidence.push('Some camera characteristics detected (original may be camera captured)');
        }
        break;

      case 'PINIT_ENCRYPTED':
        if (aiResult.detected) {
          secondaryEvidence.push('Some AI generation characteristics detected (may be synthetic)');
        }
        break;

      case 'UNKNOWN':
        if (aiResult.detected) {
          secondaryEvidence.push('Some AI generation characteristics detected');
        }
        if (cameraResult.detected) {
          secondaryEvidence.push('Some camera characteristics detected');
        }
        if (screenshotResult.detected) {
          secondaryEvidence.push('Some screenshot characteristics detected');
        }
        if (editedResult?.detected) {
          secondaryEvidence.push('Some manipulation characteristics detected');
        }
        break;
    }

    return secondaryEvidence;
  }

  /**
   * Calculate forensic signals
   */
  private static calculateForensicSignals(
    pinitResult: PINITDetectionResult,
    cameraResult: CameraDetectionResult,
    aiResult: AIDetectionResult,
    screenshotResult: ScreenshotDetectionResult,
    editedResult: EditedDetectionResult
  ): ForensicSignals {
    return {
      metadata_detected: cameraResult.exif_present,
      camera_probability: cameraResult.confidence,
      ai_probability: aiResult.confidence,
      screenshot_probability: screenshotResult.confidence,
      edited_probability: editedResult.confidence,
      pinit_encrypted: pinitResult.detected
    };
  }

  /**
   * Calculate evidence-based confidence
   */
  private static calculateEvidenceBasedConfidence(
    classification: ForensicClassification,
    pinitResult: PINITDetectionResult,
    cameraResult: CameraDetectionResult,
    aiResult: AIDetectionResult,
    screenshotResult: ScreenshotDetectionResult,
    editedResult: EditedDetectionResult
  ): number {
    // Base confidence from primary detector
    let confidence = classification.confidence;

    // Adjust based on evidence consistency
    const evidenceConsistency = this.calculateEvidenceConsistency(
      classification.type,
      pinitResult,
      cameraResult,
      aiResult,
      screenshotResult,
      editedResult
    );

    // Boost confidence if evidence is consistent
    if (evidenceConsistency > 0.8) {
      confidence = Math.min(confidence * 1.2, 1.0);
    } else if (evidenceConsistency < 0.3) {
      confidence = confidence * 0.7; // Reduce confidence for conflicting evidence
    }

    // Consider detector agreement
    const detectorAgreement = this.calculateDetectorAgreement(
      classification.type,
      pinitResult,
      cameraResult,
      aiResult,
      screenshotResult,
      editedResult
    );

    if (detectorAgreement > 0.7) {
      confidence = Math.min(confidence * 1.1, 1.0);
    }

    return Math.round(confidence * 100) / 100; // Round to 2 decimal places
  }

  /**
   * Calculate evidence consistency
   */
  private static calculateEvidenceConsistency(
    primaryType: string,
    pinitResult: PINITDetectionResult,
    cameraResult: CameraDetectionResult,
    aiResult: AIDetectionResult,
    screenshotResult: ScreenshotDetectionResult,
    editedResult: EditedDetectionResult
  ): number {
    let consistency = 1.0;
    let conflicts = 0;
    let totalChecks = 0;

    // Check for conflicting evidence
    switch (primaryType) {
      case 'AI_GENERATED':
        if (cameraResult.detected) {
          consistency -= 0.3;
          conflicts++;
        }
        if (screenshotResult.detected) {
          consistency -= 0.2;
          conflicts++;
        }
        if (editedResult?.detected) {
          consistency -= 0.1;
          conflicts++;
        }
        totalChecks = 3;
        break;

      case 'CAMERA_CAPTURED':
        if (aiResult.detected) {
          consistency -= 0.3;
          conflicts++;
        }
        if (screenshotResult.detected) {
          consistency -= 0.2;
          conflicts++;
        }
        totalChecks = 2;
        break;

      case 'SCREENSHOT':
        if (cameraResult.exif_present) {
          consistency -= 0.2;
          conflicts++;
        }
        if (aiResult.detected) {
          consistency -= 0.1;
          conflicts++;
        }
        totalChecks = 2;
        break;

      case 'EDITED_MANIPULATED':
        if (aiResult.detected) {
          consistency -= 0.1;
          conflicts++;
        }
        totalChecks = 1;
        break;

      case 'PINIT_ENCRYPTED':
        // PINIT encryption should override other classifications
        if (aiResult.detected) {
          consistency -= 0.1;
          conflicts++;
        }
        totalChecks = 1;
        break;

      default:
        totalChecks = 0;
    }

    return totalChecks > 0 ? Math.max(0, consistency) : 1.0;
  }

  /**
   * Calculate detector agreement
   */
  private static calculateDetectorAgreement(
    primaryType: string,
    pinitResult: PINITDetectionResult,
    cameraResult: CameraDetectionResult,
    aiResult: AIDetectionResult,
    screenshotResult: ScreenshotDetectionResult,
    editedResult: EditedDetectionResult
  ): number {
    const detectorStates = {
      pinit: pinitResult.detected,
      camera: cameraResult.detected,
      ai: aiResult.detected,
      screenshot: screenshotResult.detected,
      edited: editedResult.detected
    };

    let agreement = 0;
    let totalComparisons = 0;

    // Count agreements with primary classification
    switch (primaryType) {
      case 'PINIT_ENCRYPTED':
        // PINIT should be the only strong signal
        if (!detectorStates.camera && !detectorStates.ai && !detectorStates.screenshot && !detectorStates.edited) {
          agreement = 1.0;
        }
        totalComparisons = 1;
        break;

      case 'AI_GENERATED':
        if (!detectorStates.camera && !detectorStates.screenshot && !detectorStates.pinit) {
          agreement += 0.8;
        }
        if (detectorStates.edited) {
          agreement += 0.2; // AI images often show manipulation traces
        }
        totalComparisons = 2;
        break;

      case 'CAMERA_CAPTURED':
        if (!detectorStates.ai && !detectorStates.screenshot && !detectorStates.pinit && !detectorStates.edited) {
          agreement = 1.0;
        }
        totalComparisons = 1;
        break;

      case 'SCREENSHOT':
        if (!detectorStates.camera && !detectorStates.ai && !detectorStates.pinit) {
          agreement += 0.8;
        }
        if (detectorStates.edited) {
          agreement += 0.2; // Screenshots may show editing
        }
        totalComparisons = 2;
        break;

      case 'EDITED_MANIPULATED':
        if (!detectorStates.pinit) {
          agreement += 0.7;
        }
        if (detectorStates.ai) {
          agreement += 0.3; // Edited images may show AI characteristics
        }
        totalComparisons = 2;
        break;

      case 'UNKNOWN':
        // Unknown should have weak signals from all detectors
        const weakSignals = [
          detectorStates.pinit ? 0.2 : 0.8,
          detectorStates.camera ? 0.2 : 0.8,
          detectorStates.ai ? 0.2 : 0.8,
          detectorStates.screenshot ? 0.2 : 0.8,
          detectorStates.edited ? 0.2 : 0.8
        ];
        agreement = weakSignals.reduce((a, b) => a + b, 0) / weakSignals.length;
        totalComparisons = 1;
        break;
    }

    return totalComparisons > 0 ? agreement / totalComparisons : 0;
  }

  /**
   * Calculate risk level
   */
  private static calculateRiskLevel(classificationType: string, confidence: number): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
    // Risk assessment based on classification type and confidence
    switch (classificationType) {
      case 'PINIT_ENCRYPTED':
        return confidence > 0.8 ? 'LOW' : 'MEDIUM';

      case 'CAMERA_CAPTURED':
        return confidence > 0.7 ? 'LOW' : 'MEDIUM';

      case 'AI_GENERATED':
        if (confidence > 0.8) return 'HIGH';
        if (confidence > 0.6) return 'MEDIUM';
        return 'LOW';

      case 'SCREENSHOT':
        if (confidence > 0.8) return 'MEDIUM';
        return 'LOW';

      case 'EDITED_MANIPULATED':
        if (confidence > 0.8) return 'CRITICAL';
        if (confidence > 0.6) return 'HIGH';
        if (confidence > 0.4) return 'MEDIUM';
        return 'LOW';

      case 'UNKNOWN':
      default:
        return 'LOW';
    }
  }

  /**
   * Get classification explanation
   */
  static getClassificationExplanation(result: ForensicAnalysisResult): {
    summary: string,
    detailedReasoning: string[],
    confidenceExplanation: string,
    riskAssessment: string
  } {
    const { classification, signals } = result;

    const summary = this.generateSummary(classification, signals);
    const detailedReasoning = this.generateDetailedReasoning(result);
    const confidenceExplanation = this.generateConfidenceExplanation(result);
    const riskAssessment = this.generateRiskAssessment(classification, signals);

    return {
      summary,
      detailedReasoning,
      confidenceExplanation,
      riskAssessment
    };
  }

  /**
   * Generate classification summary
   */
  private static generateSummary(classification: ForensicClassification, signals: ForensicSignals): string {
    switch (classification.type) {
      case 'PINIT_ENCRYPTED':
        return 'Image is encrypted with PINIT cryptographic protection. This indicates that image has been secured using PINIT digital vault system.';

      case 'CAMERA_CAPTURED':
        return 'Image appears to be captured by a real camera device. Natural sensor characteristics and metadata indicate authentic photographic origin.';

      case 'AI_GENERATED':
        return 'Image shows characteristics of AI-generated content. Synthetic patterns and artificial textures suggest computer-generated origin.';

      case 'SCREENSHOT':
        return 'Image appears to be a screenshot from a digital display. UI elements, text density, and screen ratios indicate screen capture origin.';

      case 'EDITED_MANIPULATED':
        return 'Image shows evidence of digital manipulation or editing. Inconsistent lighting, cloning artifacts, or compositing traces detected.';

      case 'UNKNOWN':
        return 'Image classification could not be determined with high confidence. Insufficient or conflicting evidence prevents reliable classification.';

      default:
        return 'Classification completed with forensic analysis.';
    }
  }

  /**
   * Generate detailed reasoning
   */
  private static generateDetailedReasoning(result: ForensicAnalysisResult): string[] {
    const reasoning: string[] = [];
    const { classification, technical_details } = result;

    // Add primary evidence
    reasoning.push(...classification.primary_evidence);

    // Add secondary evidence
    if (classification.secondary_evidence.length > 0) {
      reasoning.push('Additional observations:');
      reasoning.push(...classification.secondary_evidence);
    }

    // Add detector-specific insights
    if (technical_details.pinit_detection.detected) {
      reasoning.push(`PINIT encryption detected with ${Math.round(technical_details.pinit_detection.confidence * 100)}% confidence.`);
    }

    if (technical_details.camera_detection.exif_present) {
      reasoning.push(`Camera EXIF metadata present, indicating photographic origin.`);
    }

    if (technical_details.ai_detection.oversmoothing > 0.5) {
      reasoning.push(`AI oversmoothing detected (${Math.round(technical_details.ai_detection.oversmoothing * 100)}% level).`);
    }

    if (technical_details.screenshot_detection.ui_elements) {
      reasoning.push(`UI elements detected, suggesting screenshot origin.`);
    }

    if (technical_details.edited_detection.lighting_inconsistency) {
      reasoning.push(`Lighting inconsistencies detected, suggesting manipulation.`);
    }

    return reasoning;
  }

  /**
   * Generate confidence explanation
   */
  private static generateConfidenceExplanation(result: ForensicAnalysisResult): string {
    const { classification } = result;
    const confidence = classification.confidence;

    let explanation = `Confidence: ${Math.round(confidence * 100)}%. `;

    if (confidence > 0.8) {
      explanation += 'Strong evidence supports this classification with high reliability.';
    } else if (confidence > 0.6) {
      explanation += 'Moderate to strong evidence supports this classification.';
    } else if (confidence > 0.4) {
      explanation += 'Moderate evidence supports this classification, but consider alternative possibilities.';
    } else {
      explanation += 'Limited evidence supports this classification. Results should be verified.';
    }

    // Add context about conflicting evidence
    if (classification.secondary_evidence.length > 0) {
      explanation += ' Some conflicting evidence was detected and considered in the analysis.';
    }

    return explanation;
  }

  /**
   * Generate risk assessment
   */
  private static generateRiskAssessment(classification: ForensicClassification, signals: ForensicSignals): string {
    const { type, risk_level } = classification;

    switch (type) {
      case 'PINIT_ENCRYPTED':
        return risk_level === 'LOW' 
          ? 'Low risk: PINIT encryption provides strong cryptographic protection.'
          : 'Medium risk: Verify encryption integrity and authenticity.';

      case 'CAMERA_CAPTURED':
        return risk_level === 'LOW'
          ? 'Low risk: Authentic camera capture with natural characteristics.'
          : 'Medium risk: Consider verifying image authenticity and metadata.';

      case 'AI_GENERATED':
        return risk_level === 'HIGH'
          ? 'High risk: AI-generated content may be synthetic or manipulated.'
          : risk_level === 'MEDIUM'
          ? 'Medium risk: AI-generated content requires verification.'
          : 'Low risk: AI-generated content detected with low confidence.';

      case 'SCREENSHOT':
        return risk_level === 'MEDIUM'
          ? 'Medium risk: Screenshot may contain sensitive information from display.'
          : 'Low risk: Screenshot content appears benign.';

      case 'EDITED_MANIPULATED':
        return risk_level === 'CRITICAL'
          ? 'Critical risk: Significant manipulation detected - content may be altered.'
          : risk_level === 'HIGH'
          ? 'High risk: Manipulation detected - verify content authenticity.'
          : risk_level === 'MEDIUM'
          ? 'Medium risk: Some manipulation detected - exercise caution.'
          : 'Low risk: Minor manipulation detected.';

      case 'UNKNOWN':
        return 'Low risk: Classification uncertain - recommend manual verification.';

      default:
        return 'Risk assessment completed based on forensic analysis.';
    }
  }
}
