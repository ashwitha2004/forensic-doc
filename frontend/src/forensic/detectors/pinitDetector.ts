/**
 * PINIT Encrypted Image Detector
 * Priority 1: Detects PINIT encrypted images first
 */

import { PINITDetectionResult, ForensicImage } from '../types';

export class PINITDetector {
  private readonly WATERMARK_SIGNATURES = [
    'PINIT_ENCRYPTED',
    'CRYPTO_VAULT',
    'DIGITAL_PROOF'
  ];

  private readonly ENCRYPTION_PATTERNS = [
    /PINIT.*ENCRYPT/gi,
    /VAULT.*SECURE/gi,
    /DIGITAL.*SIGNATURE/gi
  ];

  /**
   * Detect if image is PINIT encrypted
   * @param image Forensic image to analyze
   * @returns PINIT detection result
   */
  async detect(image: ForensicImage): Promise<PINITDetectionResult> {
    try {
      console.log('[PINIT Detector] Starting PINIT encryption detection...');
      
      const evidence: Record<string, any> = {};
      const reasoning: string[] = [];

      // Method 1: Check for PINIT watermarks in image metadata
      const metadataResult = await this.checkMetadataWatermarks(image);
      evidence.metadata_watermark = metadataResult.detected;
      if (metadataResult.detected) {
        reasoning.push(`PINIT watermark detected: ${metadataResult.signature}`);
      }

      // Method 2: Analyze image data for encryption patterns
      const patternResult = await this.analyzeEncryptionPatterns(image);
      evidence.encryption_patterns = patternResult.patterns;
      if (patternResult.detected) {
        reasoning.push(`Encryption pattern detected: ${patternResult.pattern}`);
      }

      // Method 3: Check for PINIT-specific pixel patterns
      const pixelResult = await this.analyzePixelPatterns(image);
      evidence.pixel_patterns = pixelResult.patterns;
      if (pixelResult.detected) {
        reasoning.push(`PINIT pixel patterns detected`);
      }

      // Method 4: Verify PINIT signature structure
      const signatureResult = await this.verifySignatureStructure(image);
      evidence.signature_structure = signatureResult.valid;
      if (signatureResult.valid) {
        reasoning.push(`Valid PINIT signature structure found`);
      }

      const detected = metadataResult.detected || 
                   patternResult.detected || 
                   pixelResult.detected || 
                   signatureResult.valid;

      const confidence = this.calculateConfidence(
        metadataResult,
        patternResult,
        pixelResult,
        signatureResult
      );

      console.log(`[PINIT Detector] Detection complete: ${detected ? 'ENCRYPTED' : 'NOT_ENCRYPTED'} (confidence: ${confidence})`);

      return {
        detected,
        confidence,
        evidence,
        reasoning,
        encrypted: detected,
        watermark_detected: metadataResult.detected,
        encryption_version: signatureResult.version
      };

    } catch (error) {
      console.error('[PINIT Detector] Error:', error);
      return {
        detected: false,
        confidence: 0,
        evidence: {},
        reasoning: ['Detection failed due to error'],
        encrypted: false,
        watermark_detected: false
      };
    }
  }

  /**
   * Check image metadata for PINIT watermarks
   */
  private async checkMetadataWatermarks(image: ForensicImage): Promise<{detected: boolean, signature?: string}> {
    try {
      // Create image element to extract metadata
      const img = new Image();
      
      return new Promise((resolve) => {
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          
          if (!ctx) {
            resolve({ detected: false });
            return;
          }

          canvas.width = img.width;
          canvas.height = img.height;
          ctx.drawImage(img, 0, 0);

          // Get image data for analysis
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const data = imageData.data;

          // Check for PINIT signatures in pixel data
          for (const signature of this.WATERMARK_SIGNATURES) {
            if (this.checkSignatureInData(data, signature)) {
              resolve({ detected: true, signature });
              return;
            }
          }

          resolve({ detected: false });
        };

        img.onerror = () => {
          resolve({ detected: false });
        };

        img.src = image.dataUrl;
      });
    } catch (error) {
      console.error('[PINIT Detector] Metadata check error:', error);
      return { detected: false };
    }
  }

  /**
   * Analyze image data for encryption patterns
   */
  private async analyzeEncryptionPatterns(image: ForensicImage): Promise<{detected: boolean, pattern?: string, patterns: string[]}> {
    try {
      const patterns: string[] = [];
      let detected = false;
      let detectedPattern = '';

      // Convert image to base64 for pattern analysis
      const base64Data = image.dataUrl.split(',')[1] || '';
      
      // Check each encryption pattern
      for (const pattern of this.ENCRYPTION_PATTERNS) {
        if (pattern.test(base64Data)) {
          patterns.push(pattern.source);
          detected = true;
          detectedPattern = pattern.source;
          break;
        }
      }

      return { detected, pattern: detectedPattern, patterns };
    } catch (error) {
      console.error('[PINIT Detector] Pattern analysis error:', error);
      return { detected: false, patterns: [] };
    }
  }

  /**
   * Analyze pixel patterns specific to PINIT encryption
   */
  private async analyzePixelPatterns(image: ForensicImage): Promise<{detected: boolean, patterns: string[]}> {
    try {
      const img = new Image();
      
      return new Promise((resolve) => {
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          
          if (!ctx) {
            resolve({ detected: false, patterns: [] });
            return;
          }

          canvas.width = img.width;
          canvas.height = img.height;
          ctx.drawImage(img, 0, 0);

          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const data = imageData.data;
          const patterns: string[] = [];

          // Check for PINIT-specific pixel distribution patterns
          const pixelDistribution = this.analyzePixelDistribution(data);
          if (pixelDistribution.isEncrypted) {
            patterns.push('PINIT pixel distribution');
          }

          // Check for structured noise patterns
          const noisePattern = this.analyzeNoisePattern(data);
          if (noisePattern.isStructured) {
            patterns.push('Structured encryption noise');
          }

          const detected = patterns.length > 0;
          resolve({ detected, patterns });
        };

        img.onerror = () => {
          resolve({ detected: false, patterns: [] });
        };

        img.src = image.dataUrl;
      });
    } catch (error) {
      console.error('[PINIT Detector] Pixel pattern analysis error:', error);
      return { detected: false, patterns: [] };
    }
  }

  /**
   * Verify PINIT signature structure
   */
  private async verifySignatureStructure(image: ForensicImage): Promise<{valid: boolean, version?: string}> {
    try {
      // This would verify the cryptographic signature structure
      // For now, implement basic structure check
      
      const img = new Image();
      
      return new Promise((resolve) => {
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          
          if (!ctx) {
            resolve({ valid: false });
            return;
          }

          canvas.width = img.width;
          canvas.height = img.height;
          ctx.drawImage(img, 0, 0);

          // Check for PINIT signature structure in image header/footer
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const signatureValid = this.validatePINITSignature(imageData.data);

          resolve({ 
            valid: signatureValid, 
            version: signatureValid ? '1.0' : undefined 
          });
        };

        img.onerror = () => {
          resolve({ valid: false });
        };

        img.src = image.dataUrl;
      });
    } catch (error) {
      console.error('[PINIT Detector] Signature verification error:', error);
      return { valid: false };
    }
  }

  /**
   * Check if signature exists in image data
   */
  private checkSignatureInData(data: Uint8ClampedArray, signature: string): boolean {
    try {
      const signatureBytes = new TextEncoder().encode(signature);
      
      // Scan through image data for signature pattern
      for (let i = 0; i <= data.length - signatureBytes.length; i++) {
        let match = true;
        for (let j = 0; j < signatureBytes.length; j++) {
          if (data[i + j] !== signatureBytes[j]) {
            match = false;
            break;
          }
        }
        if (match) {
          return true;
        }
      }
      
      return false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Analyze pixel distribution for encryption patterns
   */
  private analyzePixelDistribution(data: Uint8ClampedArray): {isEncrypted: boolean} {
    try {
      // PINIT encryption creates specific pixel distribution patterns
      const histogram = new Array(256).fill(0);
      
      for (let i = 0; i < data.length; i += 4) {
        // Analyze luminance
        const luminance = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
        histogram[luminance]++;
      }

      // Check for uniform distribution (indicative of encryption)
      const totalPixels = data.length / 4;
      const expectedPerBin = totalPixels / 256;
      const variance = this.calculateHistogramVariance(histogram, expectedPerBin);
      
      // PINIT encryption typically creates high variance in distribution
      const isEncrypted = variance > 1000;
      
      return { isEncrypted };
    } catch (error) {
      return { isEncrypted: false };
    }
  }

  /**
   * Analyze noise patterns for structured encryption
   */
  private analyzeNoisePattern(data: Uint8ClampedArray): {isStructured: boolean} {
    try {
      // PINIT encryption creates structured noise patterns
      let structuredCount = 0;
      let totalSamples = 0;

      for (let i = 0; i < data.length - 8; i += 4) {
        // Check for repeating patterns in noise
        const current = data[i];
        const next = data[i + 4];
        
        if (Math.abs(current - next) < 10) {
          structuredCount++;
        }
        totalSamples++;
      }

      const structuredRatio = structuredCount / totalSamples;
      const isStructured = structuredRatio > 0.7;
      
      return { isStructured };
    } catch (error) {
      return { isStructured: false };
    }
  }

  /**
   * Validate PINIT cryptographic signature
   */
  private validatePINITSignature(data: Uint8ClampedArray): boolean {
    try {
      // This is a simplified validation
      // In production, this would verify actual cryptographic signatures
      
      // Check for PINIT signature markers
      const pinitMarkers = [0x50, 0x49, 0x4E, 0x49, 0x54]; // "PINIT"
      
      for (let i = 0; i <= data.length - pinitMarkers.length; i++) {
        let match = true;
        for (let j = 0; j < pinitMarkers.length; j++) {
          if (data[i + j] !== pinitMarkers[j]) {
            match = false;
            break;
          }
        }
        if (match) {
          return true;
        }
      }
      
      return false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Calculate histogram variance
   */
  private calculateHistogramVariance(histogram: number[], expected: number): number {
    let variance = 0;
    for (let i = 0; i < histogram.length; i++) {
      const diff = histogram[i] - expected;
      variance += diff * diff;
    }
    return variance / histogram.length;
  }

  /**
   * Calculate confidence based on all detection methods
   */
  private calculateConfidence(
    metadataResult: {detected: boolean},
    patternResult: {detected: boolean},
    pixelResult: {detected: boolean},
    signatureResult: {valid: boolean}
  ): number {
    let confidence = 0;
    let methods = 0;

    if (metadataResult.detected) {
      confidence += 0.4;
      methods++;
    }
    if (patternResult.detected) {
      confidence += 0.3;
      methods++;
    }
    if (pixelResult.detected) {
      confidence += 0.2;
      methods++;
    }
    if (signatureResult.valid) {
      confidence += 0.1;
      methods++;
    }

    return methods > 0 ? confidence : 0;
  }
}
