// Core AI Detection Types
export interface AIDetectionConfig {
  modelType: 'resnet' | 'efficientnet' | 'vit';
  enableMetadataAnalysis: boolean;
  enableForensicAnalysis: boolean;
  confidenceThreshold: number;
  enableModelInference: boolean;
}

export interface AIToolSignature {
  software: string[];
  generator: string[];
  comments: string[];
  copyright: string[];
}

export interface DetectionWeights {
  metadata: number;
  model: number;
  forensic: number;
}

// Model Types
export interface ModelMetrics {
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
  inferenceTime: number;
  memoryUsage: number;
}

export interface ModelInfo {
  name: string;
  version: string;
  type: 'resnet' | 'efficientnet' | 'vit';
  inputSize: number;
  parameters: number;
  trainedOn: string;
  lastUpdated: string;
}

// Image Processing Types
export interface ImageDimensions {
  width: number;
  height: number;
}

export interface ProcessingMetrics {
  preprocessingTime: number;
  inferenceTime: number;
  totalTime: number;
  memoryUsed: number;
}

// Analysis Result Types
export interface BaseAnalysisResult {
  score: number;
  confidence: number;
  processingTime: number;
  success: boolean;
  error?: string;
}

export interface MetadataAnalysisResult extends BaseAnalysisResult {
  isAIGenerated: boolean;
  aiTool: string | null;
  metadataScore: number;
  missingCameraEXIF: boolean;
  suspiciousSoftware: string[];
  detectedSignatures: string[];
  exifData: EXIFData | null;
}

export interface ModelPredictionResult extends BaseAnalysisResult {
  isAIGenerated: boolean;
  confidence: number;
  aiProbability: number;
  realProbability: number;
  modelType: string;
  inferenceTime: number;
  modelLoaded: boolean;
  modelMetrics?: ModelMetrics;
}

export interface ForensicAnalysisResult extends BaseAnalysisResult {
  score: number;
  suspiciousPatterns: string[];
  artifacts: string[];
  inconsistencies: string[];
  pixelRegularity: number;
  noiseLevel: number;
  compressionQuality: number;
  colorDistribution: number;
  edgeCharacteristics: number;
}

export interface AIDetectionResult extends BaseAnalysisResult {
  isAIGenerated: boolean;
  confidence: number;
  metadataAnalysis: MetadataAnalysisResult;
  modelPrediction: ModelPredictionResult | null;
  forensicAnalysis: ForensicAnalysisResult;
  combinedScore: number;
  detectionMethod: 'metadata' | 'model' | 'combined';
  processingTime: number;
  aiTool: string | null;
  recommendations: string[];
  processingMetrics: ProcessingMetrics;
}

// EXIF Data Types
export interface EXIFData {
  make?: string;
  model?: string;
  software?: string;
  dateTimeOriginal?: string;
  createDate?: string;
  modifyDate?: string;
  exifImageWidth?: number;
  exifImageHeight?: number;
  fNumber?: number;
  exposureTime?: number;
  isoSpeedRatings?: number;
  focalLength?: number;
  flash?: number;
  whiteBalance?: number;
  xResolution?: number;
  yResolution?: number;
  resolutionUnit?: number;
  imageDescription?: string;
  copyright?: string;
  artist?: string;
  comment?: string;
  userComment?: string;
  gpsData?: GPSData;
}

export interface GPSData {
  latitude: number;
  longitude: number;
  altitude: number;
  direction: number;
  timestamp: string;
}

// Detection Categories
export type AIToolCategory = 
  | 'midjourney'
  | 'stable-diffusion'
  | 'dall-e'
  | 'leonardo-ai'
  | 'adobe-firefly'
  | 'flux'
  | 'playground-ai'
  | 'bing-image-creator'
  | 'unknown';

export type DetectionLevel = 'low' | 'medium' | 'high' | 'very-high';
export type ConfidenceLevel = 'low' | 'moderate' | 'high' | 'very-high';

// API Response Types
export interface DetectionResponse {
  success: boolean;
  result: AIDetectionResult;
  timestamp: string;
  requestId: string;
  processingTime: number;
}

export interface BatchDetectionRequest {
  files: File[];
  config: AIDetectionConfig;
  priority: 'low' | 'normal' | 'high';
}

export interface BatchDetectionResponse {
  success: boolean;
  results: AIDetectionResult[];
  summary: BatchDetectionSummary;
  timestamp: string;
  requestId: string;
  totalProcessingTime: number;
}

export interface BatchDetectionSummary {
  totalImages: number;
  aiGeneratedCount: number;
  realImageCount: number;
  averageConfidence: number;
  averageProcessingTime: number;
  detectedTools: string[];
  errorCount: number;
}

// Error Types
export interface DetectionError {
  code: string;
  message: string;
  details?: any;
  timestamp: string;
  requestId?: string;
}

export type ErrorCode = 
  | 'INVALID_FILE_FORMAT'
  | 'FILE_TOO_LARGE'
  | 'MODEL_NOT_LOADED'
  | 'INFERENCE_FAILED'
  | 'METADATA_PARSE_ERROR'
  | 'PREPROCESSING_ERROR'
  | 'NETWORK_ERROR'
  | 'UNKNOWN_ERROR';

// Configuration Types
export interface ModelConfig {
  type: 'resnet' | 'efficientnet' | 'vit';
  url?: string;
  localPath?: string;
  weights?: string;
  config?: any;
}

export interface ThresholdConfig {
  aiGenerated: number;
  realImage: number;
  confidence: number;
  forensic: number;
  metadata: number;
}

export interface PerformanceConfig {
  maxConcurrentInferences: number;
  batchSize: number;
  enableGPU: boolean;
  memoryLimit: number;
  timeoutMs: number;
}

// UI State Types
export interface DetectionState {
  isProcessing: boolean;
  currentFile: string | null;
  progress: number;
  result: AIDetectionResult | null;
  error: DetectionError | null;
  modelLoaded: boolean;
  modelInfo: ModelInfo | null;
}

export interface UploadState {
  files: File[];
  currentIndex: number;
  processed: number;
  results: AIDetectionResult[];
  errors: DetectionError[];
  isProcessing: boolean;
  isPaused: boolean;
}

// Statistics Types
export interface DetectionStatistics {
  totalDetections: number;
  aiGeneratedCount: number;
  realImageCount: number;
  averageConfidence: number;
  averageProcessingTime: number;
  toolDistribution: Record<AIToolCategory, number>;
  confidenceDistribution: Record<ConfidenceLevel, number>;
  errorRate: number;
  successRate: number;
}

export interface ModelStatistics {
  totalInferences: number;
  averageInferenceTime: number;
  memoryUsage: number;
  accuracy: number;
  errorRate: number;
  uptime: number;
  lastUsed: string;
}

// Event Types
export interface DetectionEvent {
  type: 'detection-started' | 'detection-completed' | 'detection-failed' | 'model-loaded' | 'model-unloaded';
  timestamp: string;
  data?: any;
  requestId?: string;
}

export interface ProgressEvent {
  type: 'progress-update';
  timestamp: string;
  progress: number;
  currentFile: string;
  totalFiles: number;
  estimatedTimeRemaining: number;
}

// Utility Types
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

export type RequiredFields<T, K extends keyof T> = T & Required<Pick<T, K>>;

// Validation Types
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  suggestions: string[];
}

export interface FileValidationResult extends ValidationResult {
  fileType: string;
  fileSize: number;
  dimensions?: ImageDimensions;
  exifAvailable: boolean;
}

// All types are already exported above - no need for re-exports
