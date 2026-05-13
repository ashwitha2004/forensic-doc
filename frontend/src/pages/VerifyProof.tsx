import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Upload, Camera, Search, CheckCircle, AlertCircle, Shield, TrendingUp, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { extractAdvancedWatermark, type AdvancedWatermarkMetadata } from "@/lib/advancedSteganography";
import { extractSimpleWatermark, type SimpleWatermarkMetadata } from "@/lib/simpleSteganography";
import { analyzeImage, type ImageAnalysisResult } from "@/lib/imageAnalysis";
import { getAIDetection, type IntegratedDetectionResult } from "@/utils/aiDetection/aiDetectionIntegration";
import { CameraCapture } from "@/components/CameraCapture";

interface VerificationResult {
  success: boolean;
  isAuthentic: boolean;
  confidence: number;
  watermarkDetected: boolean;
  pinitEncrypted: boolean;
  imageType: 'camera' | 'ai' | 'screenshot' | 'edited' | 'unknown';
  aiGeneratedProbability: number;
  metadataStatus: 'original' | 'modified';
  compressionDetected: boolean;
  trustScore: number;
  metadata?: AdvancedWatermarkMetadata | SimpleWatermarkMetadata;
  analysis?: ImageAnalysisResult;
  error?: string;
  details: {
    fileName: string;
    timestamp: string;
    detectionType: string;
    issues: string[];
  };
  forensicType: string;
  aiProbability: number;
  cameraProbability: number;
  screenshotProbability: number;
  editedProbability: number;
  downloadedProbability: number;
  detectionType?: string;
  riskLevel?: string;
  debug?: any;
  securityStatus?: string;
  cameraCaptured?: boolean;
}

const VerifyProof = () => {
  const navigate = useNavigate();
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [verificationResult, setVerificationResult] = useState<VerificationResult | null>(null);
  const [verificationMode, setVerificationMode] = useState<'auto' | 'advanced' | 'simple'>('auto');
  const [showCameraModal, setShowCameraModal] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Removed AI detection initialization as it's not being used

  const handleImageSelect = (imageData: string, fileName: string, source: 'upload' | 'camera' = 'upload') => {
    setSelectedImage(imageData);
    setSelectedFileName(fileName);
    setVerificationResult(null);
    localStorage.setItem('current_image_source', source);
  };

  const handleCameraCapture = () => {
    setShowCameraModal(true);
  };

  const handleCameraCaptureComplete = (imageData: string) => {
    const fileName = `camera_capture_${Date.now()}.jpg`;
    handleImageSelect(imageData, fileName, 'camera');
    setShowCameraModal(false);
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        if (e.target?.result) {
          handleImageSelect(e.target.result as string, file.name, 'upload');
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const processVerification = async () => {
    if (!selectedImage) return;

    setIsProcessing(true);
    setVerificationResult(null);

    try {
      let result: VerificationResult;
      const fileName = `verified_image_${Date.now()}.jpg`;
      const timestamp = new Date().toISOString();

      // Use existing verification logic
      let watermarkMetadata: AdvancedWatermarkMetadata | SimpleWatermarkMetadata | null = null;
      let watermarkDetected = false;
      let pinitEncrypted = false;
      let detectionType = 'Unknown';

      if (verificationMode === 'auto' || verificationMode === 'advanced') {
        try {
          watermarkMetadata = await extractAdvancedWatermark(selectedImage);
          if (watermarkMetadata) {
            watermarkDetected = true;
            pinitEncrypted = watermarkMetadata.pinitEncrypted || false;
            detectionType = 'Advanced Watermark';
          }
        } catch (e) {
          console.log('Advanced watermark extraction failed, trying simple...');
        }
      }

      if (!watermarkDetected && (verificationMode === 'auto' || verificationMode === 'simple')) {
        try {
          watermarkMetadata = await extractSimpleWatermark(selectedImage);
          if (watermarkMetadata) {
            watermarkDetected = true;
            pinitEncrypted = watermarkMetadata.pinitEncrypted || false;
            detectionType = 'Simple Watermark';
          }
        } catch (e) {
          console.log('Simple watermark extraction failed');
        }
      }

      // Get capture source from localStorage
      const captureSource = localStorage.getItem('current_image_source') as 'upload' | 'camera' | null;
      localStorage.removeItem('current_image_source');
      
      // Perform comprehensive forensic analysis
      const analysis = await analyzeImage(selectedImage, selectedFileName || undefined, captureSource || undefined);
      
      // Use AI detection system
      let aiDetectionResult: IntegratedDetectionResult | null = null;
      let aiProbability = 0;
      
      try {
        const aiDetector = getAIDetection();
        aiDetectionResult = await aiDetector.analyzeImage(selectedImage);
        aiProbability = aiDetectionResult.confidence * 100;
      } catch (error) {
        console.warn('AI detection failed, falling back to forensic analysis:', error);
        aiProbability = analysis.forensicReport?.aiProbability || 0;
      }
      
      const metadataStatus = analysis.metadata.hasExif ? 'original' : 'modified';

      // Phase 1: compressionDetected must reflect *compression*, not editing.
      // The previous wiring (editedProbability > 50) conflated two unrelated
      // detectors. Until the real WhatsApp/Downloaded detectors land (Phase 3),
      // we use a conservative bytes-per-pixel heuristic on JPEG inputs only —
      // a recompressed/downloaded JPEG typically drops well below 0.25 B/pixel,
      // while a fresh camera JPEG sits between ~0.5 and ~3 B/pixel. PNGs and
      // unknown mime types are deliberately excluded (no new false positives).
      let compressionDetected = false;
      try {
        const dimsStr = (analysis.metadata?.dimensions || '').toString();
        const [wStr, hStr] = dimsStr.split('x');
        const w = parseInt(wStr, 10) || 0;
        const h = parseInt(hStr, 10) || 0;
        const pixelCount = w * h;
        // base64 length math: 3 bytes per 4 chars (ignoring padding) — close enough
        const fileBytes = Math.floor((selectedImage.length * 3) / 4);
        const mime = (analysis.metadata?.mimeType || '').toLowerCase();
        const isJpeg = mime.includes('jpeg') || mime.includes('jpg');
        if (isJpeg && pixelCount > 0) {
          const bpp = fileBytes / pixelCount;
          if (bpp < 0.25) compressionDetected = true;
        }
      } catch (e) {
        console.warn('[verify] compression heuristic failed (non-fatal):', e);
      }

      // Phase 1: real trust score (was hard-coded to 100). Weights are aligned
      // with backend/routers/pinit_verification.py so frontend and backend
      // scores stay coherent.
      //   Watermark present .......... 30
      //   PINIT-encrypted ............ 30
      //   Classification confidence .. up to 20 (forensic confidence × 0.2)
      //   EXIF integrity ............. 10
      //   No recompression ........... 10
      let trustScore = 0;
      if (watermarkDetected) trustScore += 30;
      if (pinitEncrypted) trustScore += 30;
      trustScore += Math.round((analysis.confidence || 0) * 0.2);
      if (analysis.metadata.hasExif) trustScore += 10;
      if (!compressionDetected) trustScore += 10;
      trustScore = Math.max(0, Math.min(100, trustScore));

      // Determine authenticity (threshold unchanged from prior behavior)
      const isAuthentic = watermarkDetected && pinitEncrypted && trustScore >= 70;
      
      // Use forensic confidence instead of random values
      const confidence = Math.round(analysis.confidence);

      // Identify issues
      const issues: string[] = [];
      if (!watermarkDetected) {
        issues.push('No PINIT watermark detected');
      }
      if (watermarkDetected && !pinitEncrypted) {
        issues.push('Watermark found but not PINIT encrypted');
      }
      
      if (aiDetectionResult && aiDetectionResult.aiGenerated) {
        issues.push(`AI-generated content detected (${aiProbability.toFixed(1)}% confidence)`);
      } else if (aiProbability > 50) {
        issues.push(`AI-generated content detected (${aiProbability.toFixed(1)}% probability)`);
      }
      
      if (compressionDetected) {
        issues.push('Image compression detected');
      }

      // Map image type to correct enum values
      const imageType = analysis.imageType;
      
      const cameraCaptured = imageType === 'camera';
      const securityStatus = cameraCaptured ? 'Authentic Camera Capture' :
                           imageType === 'ai' ? 'Synthetic AI Generated Image' :
                           imageType === 'screenshot' ? 'Screen Captured Content' :
                           imageType === 'edited' ? 'Manipulated or Edited Image' :
                           'Unable To Verify';

      result = {
        success: true,
        isAuthentic,
        confidence,
        watermarkDetected,
        pinitEncrypted,
        imageType,
        cameraCaptured,
        securityStatus,
        aiGeneratedProbability: aiProbability,
        metadataStatus,
        compressionDetected,
        trustScore,
        metadata: watermarkMetadata || undefined,
        analysis,
        details: {
          fileName,
          timestamp,
          detectionType,
          issues
        },
        // Add missing properties as requested
        forensicType: analysis.imageType,
        aiProbability: analysis.forensicReport?.aiProbability || 0,
        cameraProbability: analysis.forensicReport?.cameraProbability || 0,
        screenshotProbability: analysis.forensicReport?.screenshotProbability || 0,
        editedProbability: analysis.forensicReport?.editedProbability || 0,
        downloadedProbability: analysis.forensicReport?.downloadedProbability || 0
      };

      setVerificationResult(result);

    } catch (error) {
      console.error('Verification failed:', error);
      setVerificationResult({
        success: false,
        isAuthentic: false,
        confidence: 0,
        watermarkDetected: false,
        pinitEncrypted: false,
        imageType: 'unknown',
        cameraCaptured: false,
        securityStatus: 'Unable To Verify',
        aiGeneratedProbability: 0,
        metadataStatus: 'modified',
        compressionDetected: false,
        trustScore: 0,
        forensicType: 'unknown',
        aiProbability: 0,
        cameraProbability: 0,
        screenshotProbability: 0,
        editedProbability: 0,
        downloadedProbability: 0,
        error: error instanceof Error ? error.message : 'Verification failed',
        details: {
          fileName: `error_image_${Date.now()}.jpg`,
          timestamp: new Date().toISOString(),
          detectionType: 'Error',
          issues: ['Verification process failed']
        }
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const resetForm = () => {
    setSelectedImage(null);
    setSelectedFileName(null);
    setVerificationResult(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Helper functions for improved UI display
  const getSecurityStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'authentic':
        return 'text-green-400';
      case 'synthetic media':
        return 'text-red-400';
      case 'digital capture':
        return 'text-yellow-400';
      case 'modified':
        return 'text-orange-400';
      case 'external source':
        return 'text-blue-400';
      case 'error':
        return 'text-red-400';
      default:
        return 'text-gray-400';
    }
  };

  const getRiskLevelColor = (level: string) => {
    switch (level.toLowerCase()) {
      case 'low':
        return 'text-green-400';
      case 'medium':
        return 'text-yellow-400';
      case 'high':
        return 'text-red-400';
      default:
        return 'text-gray-400';
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 90) return 'text-green-400';
    if (confidence >= 80) return 'text-yellow-400';
    if (confidence >= 70) return 'text-orange-400';
    return 'text-red-400';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border/50 px-4 py-4"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              onClick={() => navigate("/home")}
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            <div>
              <h1 className="text-lg font-semibold text-foreground">Verify Proof</h1>
              <p className="text-xs text-muted-foreground">Improved image verification system</p>
            </div>
          </div>
          <Search className="w-6 h-6 text-muted-foreground" />
        </div>
      </motion.div>

      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {!verificationResult ? (
          <>
            {/* Verification Mode Selection */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-8"
            >
              <h2 className="text-xl font-semibold mb-4 text-white">Verification Mode</h2>
              <div className="grid md:grid-cols-3 gap-4">
                <button
                  onClick={() => setVerificationMode('auto')}
                  className={`p-4 rounded-lg border transition-all ${
                    verificationMode === 'auto'
                      ? 'bg-purple-600/20 border-purple-500/50 text-purple-300'
                      : 'bg-slate-800/50 border-slate-700/50 text-gray-300 hover:bg-slate-800/70'
                  }`}
                >
                  <h3 className="font-semibold mb-2">Auto Detect</h3>
                  <p className="text-sm opacity-80">
                    Automatically detects watermark type
                  </p>
                </button>
                <button
                  onClick={() => setVerificationMode('advanced')}
                  className={`p-4 rounded-lg border transition-all ${
                    verificationMode === 'advanced'
                      ? 'bg-cyan-600/20 border-cyan-500/50 text-cyan-300'
                      : 'bg-slate-800/50 border-slate-700/50 text-gray-300 hover:bg-slate-800/70'
                  }`}
                >
                  <h3 className="font-semibold mb-2">Advanced</h3>
                  <p className="text-sm opacity-80">
                    Check for advanced watermarks
                  </p>
                </button>
                <button
                  onClick={() => setVerificationMode('simple')}
                  className={`p-4 rounded-lg border transition-all ${
                    verificationMode === 'simple'
                      ? 'bg-blue-600/20 border-blue-500/50 text-blue-300'
                      : 'bg-slate-800/50 border-slate-700/50 text-gray-300 hover:bg-slate-800/70'
                  }`}
                >
                  <h3 className="font-semibold mb-2">Simple</h3>
                  <p className="text-sm opacity-80">
                    Check for basic watermarks
                  </p>
                </button>
              </div>
            </motion.div>

            {/* Image Upload Area */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              {!selectedImage ? (
                <div className="bg-background/80 backdrop-blur-lg border-2 border-dashed border-border/50 rounded-2xl p-12 text-center">
                  <div className="flex flex-col items-center gap-4">
                    <Search className="w-16 h-16 text-muted-foreground" />
                    <div>
                      <h3 className="text-xl font-semibold text-foreground mb-2">Select Image to Verify</h3>
                      <p className="text-muted-foreground mb-6">
                        Upload an image to analyze its authenticity and detect watermarks
                      </p>
                    </div>
                    <div className="flex gap-4">
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white px-6 py-3 rounded-lg transition-colors flex items-center gap-2"
                      >
                        <Upload className="w-4 h-4" />
                        Upload File
                      </button>
                      <button
                        onClick={handleCameraCapture}
                        className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 text-white px-6 py-3 rounded-lg transition-colors flex items-center gap-2"
                      >
                        <Camera className="w-4 h-4" />
                        Use Camera
                      </button>

                      {/* Camera Capture Modal */}
                      {showCameraModal && (
                        <CameraCapture
                          onCapture={handleCameraCaptureComplete}
                          onClose={() => setShowCameraModal(false)}
                        />
                      )}
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="bg-background/80 backdrop-blur-lg border border-border/50 rounded-2xl p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold text-foreground">Selected Image</h3>
                      <button
                        onClick={resetForm}
                        className="text-slate-400 hover:text-white transition-colors"
                      >
                        Clear
                      </button>
                    </div>
                    <div className="bg-slate-900/50 rounded-lg overflow-hidden">
                      <img
                        src={selectedImage}
                        alt="Selected for verification"
                        className="w-full h-64 object-contain"
                      />
                    </div>
                    {selectedFileName && (
                      <p className="text-sm text-muted-foreground mt-2">{selectedFileName}</p>
                    )}
                  </div>

                  <div className="flex justify-center">
                    <button
                      onClick={processVerification}
                      disabled={isProcessing}
                      className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 disabled:opacity-50 text-white px-8 py-4 rounded-lg transition-all flex items-center gap-3 text-lg font-semibold"
                    >
                      <Search className="w-5 h-5" />
                      {isProcessing ? 'Analyzing...' : 'Verify Authenticity'}
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </>
        ) : (
          /* Results Section - IMPROVED UI */
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            {!verificationResult.error ? (
              <div className="bg-background/80 backdrop-blur-lg border border-border/50 rounded-2xl p-8">
                {/* Status Header */}
                <div className="text-center mb-8">
                  <div className={`inline-flex items-center px-6 py-3 rounded-full mb-4 ${
                    verificationResult.securityStatus === 'Authentic' 
                      ? 'bg-green-500/20 border-green-500/30' 
                      : verificationResult.securityStatus === 'External Source'
                        ? 'bg-blue-500/20 border-blue-500/30'
                        : verificationResult.securityStatus === 'Digital Capture'
                          ? 'bg-yellow-500/20 border-yellow-500/30'
                          : verificationResult.securityStatus === 'Modified'
                            ? 'bg-orange-500/20 border-orange-500/30'
                            : 'bg-red-500/20 border-red-500/30'
                  }`}>
                    {verificationResult.securityStatus === 'Authentic' ? (
                      <CheckCircle className="w-6 h-6 text-green-400 mr-2" />
                    ) : (
                      <AlertCircle className="w-6 h-6 text-red-400 mr-2" />
                    )}
                    <span className={`font-bold text-lg ${
                      verificationResult.securityStatus === 'Authentic' 
                        ? 'text-green-400' 
                        : verificationResult.securityStatus === 'External Source'
                          ? 'text-blue-400'
                          : verificationResult.securityStatus === 'Digital Capture'
                            ? 'text-yellow-400'
                            : verificationResult.securityStatus === 'Modified'
                              ? 'text-orange-400'
                              : 'text-red-400'
                    }`}>
                      {verificationResult.securityStatus}
                    </span>
                  </div>
                </div>

                {/* IMPROVED VERIFICATION REPORT */}
                <div className="bg-accent/30 rounded-xl p-6">
                  <h3 className="text-xl font-bold text-foreground mb-6 text-center">VERIFICATION REPORT</h3>
                  
                  <div className="space-y-4">
                    {/* PINIT Encryption */}
                    <div className="flex justify-between items-center bg-background/50 rounded-lg p-4">
                      <span className="text-sm font-medium text-muted-foreground">PINIT Encryption:</span>
                      <span className={`text-lg font-bold ${
                        verificationResult.pinitEncrypted ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {verificationResult.pinitEncrypted ? 'YES' : 'NO'}
                      </span>
                    </div>
                    
                    {/* Camera Captured */}
                    <div className="flex justify-between items-center bg-background/50 rounded-lg p-4">
                      <span className="text-sm font-medium text-muted-foreground">Camera Captured:</span>
                      <span className={`text-lg font-bold ${
                        verificationResult.cameraCaptured ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {verificationResult.cameraCaptured ? 'YES' : 'NO'}
                      </span>
                    </div>
                    
                    {/* Image Source - MEANINGFUL CATEGORY */}
                    <div className="flex justify-between items-center bg-background/50 rounded-lg p-4">
                      <span className="text-sm font-medium text-muted-foreground">Image Source:</span>
                      <span className={`text-lg font-bold text-foreground capitalize`}>
                        {verificationResult.imageType}
                      </span>
                    </div>
                    
                    {/* Security Status */}
                    <div className="flex justify-between items-center bg-background/50 rounded-lg p-4">
                      <span className="text-sm font-medium text-muted-foreground">Security Status:</span>
                      <span className={`text-lg font-bold ${getSecurityStatusColor(verificationResult.securityStatus)}`}>
                        {verificationResult.securityStatus}
                      </span>
                    </div>
                    
                    {/* Confidence */}
                    <div className="flex justify-between items-center bg-background/50 rounded-lg p-4">
                      <span className="text-sm font-medium text-muted-foreground">Confidence:</span>
                      <span className={`text-lg font-bold ${getConfidenceColor(verificationResult.confidence)}`}>
                        {Math.round(verificationResult.confidence)}%
                      </span>
                    </div>
                  </div>

                  {/* ADDITIONAL ANALYSIS DETAILS */}
                  <div className="mt-6 space-y-4">
                    <h4 className="text-lg font-semibold text-foreground mb-4">Analysis Details</h4>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Detection Type */}
                      <div className="bg-background/50 rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <Shield className="w-5 h-5 text-blue-400" />
                          <span className="text-sm font-medium text-muted-foreground">Detection Type</span>
                        </div>
                        <div className={`text-lg font-bold ${getSecurityStatusColor(verificationResult.securityStatus)}`}>
                          {verificationResult.detectionType || 'Unknown'}
                        </div>
                      </div>
                      
                      {/* Risk Level */}
                      <div className="bg-background/50 rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <AlertTriangle className="w-5 h-5 text-orange-400" />
                          <span className="text-sm font-medium text-muted-foreground">Risk Level</span>
                        </div>
                        <div className={`text-lg font-bold ${getRiskLevelColor(verificationResult.riskLevel || 'Medium')}`}>
                          {verificationResult.riskLevel || 'Medium'}
                        </div>
                      </div>
                      
                      {/* Metadata Status */}
                      <div className="bg-background/50 rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <TrendingUp className="w-5 h-5 text-purple-400" />
                          <span className="text-sm font-medium text-muted-foreground">Metadata Status</span>
                        </div>
                        <div className={`text-lg font-bold ${getSecurityStatusColor(verificationResult.securityStatus)}`}>
                          {verificationResult.metadataStatus}
                        </div>
                      </div>
                      
                      {/* Compression Status */}
                      <div className="bg-background/50 rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <AlertCircle className="w-5 h-5 text-yellow-400" />
                          <span className="text-sm font-medium text-muted-foreground">Compression Status</span>
                        </div>
                        <div className={`text-lg font-bold ${getSecurityStatusColor(verificationResult.securityStatus)}`}>
                          {verificationResult.compressionDetected ? 'Detected' : 'Not Detected'}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-red-500/20 border border-red-500/50 rounded-xl p-6 text-center">
                <AlertCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-red-400 mb-2">Verification Failed</h3>
                <p className="text-red-300 mb-4">{verificationResult.error}</p>
                <Button
                  onClick={resetForm}
                  variant="outline"
                  className="border-red-500/50 text-red-400 hover:bg-red-500/10"
                >
                  Try Again
                </Button>
              </div>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default VerifyProof;
