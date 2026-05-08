import exifr from 'exifr';

export interface MetadataAnalysisResult {
  isAIGenerated: boolean;
  aiTool: string | null;
  confidence: number;
  metadataScore: number;
  missingCameraEXIF: boolean;
  suspiciousSoftware: string[];
  detectedSignatures: string[];
}

export class MetadataAnalyzer {
  private static readonly AI_TOOLS_SIGNATURES = {
    midjourney: {
      software: ['Midjourney', 'Midjourney Bot'],
      generator: ['Midjourney', 'MJ'],
      comments: ['midjourney', 'mj-', 'v 6.0', 'v 5.2'],
      copyright: ['Midjourney, Inc.']
    },
    'stable-diffusion': {
      software: ['Stable Diffusion', 'DreamStudio', 'AUTOMATIC1111'],
      generator: ['stable diffusion', 'sd-', 'dreamshaper'],
      comments: ['stable diffusion', 'sd-', 'dreamstudio'],
      copyright: ['Stability AI']
    },
    'dall-e': {
      software: ['DALL·E', 'DALL-E', 'OpenAI'],
      generator: ['dall-e', 'dall e'],
      comments: ['dall-e', 'openai'],
      copyright: ['OpenAI']
    },
    'leonardo-ai': {
      software: ['Leonardo.Ai', 'Leonardo AI'],
      generator: ['leonardo', 'leonardo.ai'],
      comments: ['leonardo', 'leonardo.ai'],
      copyright: ['Leonardo.Ai']
    },
    'adobe-firefly': {
      software: ['Adobe Firefly', 'Firefly', 'Adobe Photoshop'],
      generator: ['firefly', 'adobe firefly'],
      comments: ['firefly', 'adobe firefly'],
      copyright: ['Adobe']
    },
    flux: {
      software: ['FLUX', 'Flux AI', 'Black Forest Labs'],
      generator: ['flux', 'black forest'],
      comments: ['flux', 'black forest'],
      copyright: ['Black Forest Labs']
    },
    'playground-ai': {
      software: ['Playground AI', 'Playground'],
      generator: ['playground', 'playground.ai'],
      comments: ['playground', 'playground.ai'],
      copyright: ['Playground AI']
    },
    'bing-image-creator': {
      software: ['Microsoft Designer', 'Bing Image Creator', 'DALL·E'],
      generator: ['bing', 'microsoft designer'],
      comments: ['bing', 'microsoft designer'],
      copyright: ['Microsoft']
    }
  };

  private static readonly CAMERA_EXIF_TAGS = [
    'Make', 'Model', 'ExifImageWidth', 'ExifImageHeight',
    'DateTimeOriginal', 'CreateDate', 'ModifyDate',
    'FNumber', 'ExposureTime', 'ISOSpeedRatings',
    'FocalLength', 'Flash', 'WhiteBalance'
  ];

  private static readonly SUSPICIOUS_SOFTWARE = [
    'Photoshop', 'GIMP', 'Canva', 'Figma', 'Illustrator',
    'Affinity Photo', 'Pixelmator', 'Paint.NET'
  ];

  async analyzeImage(file: File): Promise<MetadataAnalysisResult> {
    try {
      const buffer = await file.arrayBuffer();
      const metadata = await exifr.parse(buffer);
      
      return this.evaluateMetadata(metadata);
    } catch (error) {
      // If metadata parsing fails, assume it could be AI generated
      return {
        isAIGenerated: false,
        aiTool: null,
        confidence: 0.1,
        metadataScore: 0.0,
        missingCameraEXIF: true,
        suspiciousSoftware: [],
        detectedSignatures: ['metadata-parse-error']
      };
    }
  }

  private evaluateMetadata(metadata: any): MetadataAnalysisResult {
    const result: MetadataAnalysisResult = {
      isAIGenerated: false,
      aiTool: null,
      confidence: 0,
      metadataScore: 0,
      missingCameraEXIF: false,
      suspiciousSoftware: [],
      detectedSignatures: []
    };

    // Check for missing camera EXIF data
    const cameraEXIFPresent = this.checkCameraEXIF(metadata);
    result.missingCameraEXIF = !cameraEXIFPresent;
    
    if (!cameraEXIFPresent) {
      result.metadataScore += 0.3;
      result.detectedSignatures.push('missing-camera-exif');
    }

    // Check for AI tool signatures
    const aiToolDetection = this.detectAITools(metadata);
    if (aiToolDetection.detected) {
      result.isAIGenerated = true;
      result.aiTool = aiToolDetection.tool;
      result.confidence = aiToolDetection.confidence;
      result.metadataScore += aiToolDetection.score;
      result.detectedSignatures.push(...aiToolDetection.signatures);
    }

    // Check for suspicious software
    const suspiciousSoftware = this.checkSuspiciousSoftware(metadata);
    result.suspiciousSoftware = suspiciousSoftware;
    if (suspiciousSoftware.length > 0) {
      result.metadataScore += 0.2;
      result.detectedSignatures.push('suspicious-software');
    }

    // Check for synthetic characteristics
    const syntheticSigns = this.checkSyntheticCharacteristics(metadata);
    result.metadataScore += syntheticSigns.score;
    result.detectedSignatures.push(...syntheticSigns.signatures);

    // Final determination
    result.confidence = Math.min(result.metadataScore, 1.0);
    result.isAIGenerated = result.metadataScore > 0.5;

    return result;
  }

  private checkCameraEXIF(metadata: any): boolean {
    return MetadataAnalyzer.CAMERA_EXIF_TAGS.some(tag => 
      metadata[tag] !== undefined && metadata[tag] !== null
    );
  }

  private detectAITools(metadata: any): {
    detected: boolean;
    tool: string | null;
    confidence: number;
    score: number;
    signatures: string[];
  } {
    const result = {
      detected: false,
      tool: null as string | null,
      confidence: 0,
      score: 0,
      signatures: [] as string[]
    };

    const metadataString = JSON.stringify(metadata).toLowerCase();

    for (const [toolName, signatures] of Object.entries(MetadataAnalyzer.AI_TOOLS_SIGNATURES)) {
      let matchScore = 0;
      const foundSignatures: string[] = [];

      // Check software field
      if (metadata.Software) {
        const software = metadata.Software.toLowerCase();
        signatures.software.forEach(sig => {
          if (software.includes(sig.toLowerCase())) {
            matchScore += 0.4;
            foundSignatures.push(`software:${sig}`);
          }
        });
      }

      // Check generator field
      if (metadata.ImageDescription || metadata.Comment) {
        const description = (metadata.ImageDescription || metadata.Comment || '').toLowerCase();
        signatures.generator.forEach(sig => {
          if (description.includes(sig.toLowerCase())) {
            matchScore += 0.3;
            foundSignatures.push(`generator:${sig}`);
          }
        });
      }

      // Check comments and descriptions
      if (metadata.Comment) {
        const comment = metadata.Comment.toLowerCase();
        signatures.comments.forEach(sig => {
          if (comment.includes(sig.toLowerCase())) {
            matchScore += 0.2;
            foundSignatures.push(`comment:${sig}`);
          }
        });
      }

      // Check copyright
      if (metadata.Copyright) {
        const copyright = metadata.Copyright.toLowerCase();
        signatures.copyright.forEach(sig => {
          if (copyright.includes(sig.toLowerCase())) {
            matchScore += 0.1;
            foundSignatures.push(`copyright:${sig}`);
          }
        });
      }

      if (matchScore > result.score) {
        result.detected = true;
        result.tool = toolName;
        result.score = matchScore;
        result.confidence = Math.min(matchScore, 1.0);
        result.signatures = foundSignatures;
      }
    }

    return result;
  }

  private checkSuspiciousSoftware(metadata: any): string[] {
    const suspicious: string[] = [];
    
    if (metadata.Software) {
      const software = metadata.Software.toLowerCase();
      MetadataAnalyzer.SUSPICIOUS_SOFTWARE.forEach(prog => {
        if (software.includes(prog.toLowerCase())) {
          suspicious.push(prog);
        }
      });
    }

    return suspicious;
  }

  private checkSyntheticCharacteristics(metadata: any): {
    score: number;
    signatures: string[];
  } {
    const result = {
      score: 0,
      signatures: [] as string[]
    };

    // Check for perfect resolution (common in AI images)
    if (metadata.ExifImageWidth && metadata.ExifImageHeight) {
      const commonAISizes = [
        [1024, 1024], [512, 512], [1024, 768], [768, 1024],
        [512, 768], [768, 512], [1792, 1024], [1024, 1792]
      ];
      
      const size = [metadata.ExifImageWidth, metadata.ExifImageHeight];
      if (commonAISizes.some(aiSize => 
        (aiSize[0] === size[0] && aiSize[1] === size[1]) ||
        (aiSize[0] === size[1] && aiSize[1] === size[0])
      )) {
        result.score += 0.1;
        result.signatures.push('ai-resolution');
      }
    }

    // Check for unusual DPI settings
    if (metadata.XResolution && metadata.YResolution) {
      if (metadata.XResolution === 72 && metadata.YResolution === 72) {
        result.score += 0.05;
        result.signatures.push('standard-dpi');
      }
    }

    // Check for missing creation date
    if (!metadata.DateTimeOriginal && !metadata.CreateDate) {
      result.score += 0.1;
      result.signatures.push('missing-creation-date');
    }

    return result;
  }
}
