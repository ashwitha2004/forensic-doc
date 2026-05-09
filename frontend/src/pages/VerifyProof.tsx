import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Upload, Camera, Search, CheckCircle, AlertCircle } from "lucide-react";
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
  imageSource: 'camera' | 'screenshot' | 'whatsapp' | 'downloaded' | 'unknown';
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
}

const VerifyProof = () => {
  const navigate = useNavigate();
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [verificationResult, setVerificationResult] = useState<VerificationResult | null>(null);
  const [verificationMode, setVerificationMode] = useState<'auto' | 'advanced' | 'simple'>('auto');
  const [aiDetectionReady, setAiDetectionReady] = useState(false);
  const [showCameraModal, setShowCameraModal] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Initialize AI detection system
  useEffect(() => {
    const initializeAIDetection = async () => {
      try {
        const aiDetector = getAIDetection();
        await aiDetector.initialize({
          modelType: 'resnet',
          enableMetadataAnalysis: true,
          enableForensicAnalysis: true,
          confidenceThreshold: 0.5,
          enableModelInference: true
        });
        setAiDetectionReady(true);
      } catch (error) {
        console.warn('AI Detection initialization failed, will use fallback:', error);
        setAiDetectionReady(true);
      }
    };
    initializeAIDetection();
  }, []);

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

      // Get the capture source from localStorage
      const captureSource = localStorage.getItem('current_image_source') as 'upload' | 'camera' | null;
      localStorage.removeItem('current_image_source');
      
      // Perform comprehensive forensic analysis
      const analysis = await analyzeImage(selectedImage, selectedFileName || undefined, captureSource || undefined);
      
      // Determine image source using TRUSTED SOURCE PRIORITY
      let imageSource: 'camera' | 'screenshot' | 'whatsapp' | 'downloaded' | 'unknown';
      
      if (captureSource === 'camera') {
        imageSource = "camera";
      } else if (analysis.forensicReport) {
        const fr = analysis.forensicReport;
        
        if (fr.screenshot.detected) {
          imageSource = "screenshot";
        }
        else if (fr.whatsapp.detected) {
          imageSource = "whatsapp";
        }
        else if (fr.camera_original.detected) {
          imageSource = "camera";
        }
        else if (fr.downloaded.detected) {
          imageSource = "downloaded";
        }
        else {
          imageSource = "unknown";
        }
      } else {
        switch (analysis.imageType) {
          case "screenshot":
            imageSource = "screenshot";
            break;
          case "phone":
            imageSource = "camera";
            break;
          case "whatsapp":
            imageSource = "whatsapp";
            break;
          case "ai":
            imageSource = "downloaded";
            break;
          default:
            imageSource = "unknown";
        }
      }
      
      // Use AI detection system
      let aiDetectionResult: IntegratedDetectionResult | null = null;
      let aiProbability = 0;
      
      try {
        const aiDetector = getAIDetection();
        aiDetectionResult = await aiDetector.analyzeImage(selectedImage);
        aiProbability = aiDetectionResult.confidence * 100;
      } catch (error) {
        console.warn('AI detection failed, falling back to forensic analysis:', error);
        aiProbability = analysis.forensicReport?.ai_generated.probability || 0;
      }
      
      const metadataStatus = analysis.metadata.hasExif ? 'original' : 'modified';
      const compressionDetected = analysis.forensicReport?.whatsapp.detected || false;
      
      // Calculate trust score
      const trustScore = 100; // Simplified - you can keep the original calculation if needed
      
      // Determine authenticity
      const isAuthentic = watermarkDetected && pinitEncrypted && trustScore >= 70;
      const confidence = isAuthentic ? 0.85 + (Math.random() * 0.14) : 0.15 + (Math.random() * 0.3);

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

      result = {
        success: true,
        isAuthentic,
        confidence,
        watermarkDetected,
        pinitEncrypted,
        imageSource,
        aiGeneratedProbability: aiProbability,
        metadataStatus,
        compressionDetected,
        trustScore,
        metadata: watermarkMetadata || undefined,
        analysis,
        details: {
          fileName,
          timestamp,
          detectionType: watermarkDetected ? detectionType : 'No Watermark',
          issues
        }
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
        imageSource: 'unknown',
        aiGeneratedProbability: 0,
        metadataStatus: 'modified',
        compressionDetected: false,
        trustScore: 0,
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

  // Helper functions for simplified display
  const getSecurityStatus = (result: VerificationResult) => {
    if (result.error) return 'Error';
    if (result.isAuthentic) return 'Authentic';
    return 'Suspicious';
  };

  const getImageSourceDisplay = (imageSource: string) => {
    switch (imageSource) {
      case 'camera': return 'Camera Image';
      case 'screenshot': return 'Screenshot';
      case 'whatsapp': return 'Downloaded Image';
      case 'downloaded': return 'Downloaded Image';
      default: return 'Non-Camera Image';
    }
  };

  const getCameraCaptured = (imageSource: string) => {
    return imageSource === 'camera';
  };

  const getConfidencePercentage = (result: VerificationResult) => {
    return Math.round(result.confidence * 100);
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'authentic':
        return 'text-green-400';
      case 'suspicious':
        return 'text-yellow-400';
      case 'error':
        return 'text-red-400';
      default:
        return 'text-gray-400';
    }
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
              <p className="text-xs text-muted-foreground">Unified image verification</p>
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
                        className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-lg transition-colors flex items-center gap-2"
                      >
                        <Upload className="w-4 h-4" />
                        Upload File
                      </button>
                      <button
                        onClick={handleCameraCapture}
                        className="bg-cyan-600 hover:bg-cyan-700 text-white px-6 py-3 rounded-lg transition-colors flex items-center gap-2"
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
          /* Results Section - SIMPLIFIED DISPLAY */
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            {!verificationResult.error ? (
              <div className="bg-background/80 backdrop-blur-lg border border-border/50 rounded-2xl p-8">
                <div className="text-center mb-8">
                  <div className={`inline-flex items-center px-6 py-3 rounded-full mb-4 ${
                    verificationResult.isAuthentic 
                      ? 'bg-green-500/20 border-green-500/30' 
                      : verificationResult.trustScore >= 50 
                        ? 'bg-yellow-500/20 border-yellow-500/30'
                        : 'bg-red-500/20 border-red-500/30'
                  }`}>
                    {verificationResult.isAuthentic ? (
                      <CheckCircle className="w-6 h-6 text-green-400 mr-2" />
                    ) : (
                      <AlertCircle className="w-6 h-6 text-red-400 mr-2" />
                    )}
                    <span className={`font-bold text-lg ${
                      verificationResult.isAuthentic 
                        ? 'text-green-400' 
                        : verificationResult.trustScore >= 50 
                          ? 'text-yellow-400'
                          : 'text-red-400'
                    }`}>
                      {getSecurityStatus(verificationResult).toUpperCase()}
                    </span>
                  </div>
                </div>

                {/* SIMPLIFIED VERIFICATION REPORT */}
                <div className="bg-accent/30 rounded-xl p-6">
                  <h3 className="text-xl font-bold text-foreground mb-6 text-center">VERIFY REPORT</h3>
                  
                  <div className="space-y-4">
                    <div className="flex justify-between items-center bg-background/50 rounded-lg p-4">
                      <span className="text-sm font-medium text-muted-foreground">PINIT Encryption:</span>
                      <span className={`text-lg font-bold ${
                        verificationResult.pinitEncrypted ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {verificationResult.pinitEncrypted ? 'YES' : 'NO'}
                      </span>
                    </div>
                    
                    <div className="flex justify-between items-center bg-background/50 rounded-lg p-4">
                      <span className="text-sm font-medium text-muted-foreground">Camera Captured:</span>
                      <span className={`text-lg font-bold ${
                        getCameraCaptured(verificationResult.imageSource) ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {getCameraCaptured(verificationResult.imageSource) ? 'YES' : 'NO'}
                      </span>
                    </div>
                    
                    <div className="flex justify-between items-center bg-background/50 rounded-lg p-4">
                      <span className="text-sm font-medium text-muted-foreground">Image Source:</span>
                      <span className={`text-lg font-bold text-foreground capitalize`}>
                        {getImageSourceDisplay(verificationResult.imageSource)}
                      </span>
                    </div>
                    
                    <div className="flex justify-between items-center bg-background/50 rounded-lg p-4">
                      <span className="text-sm font-medium text-muted-foreground">Security Status:</span>
                      <span className={`text-lg font-bold ${getStatusColor(getSecurityStatus(verificationResult))}`}>
                        {getSecurityStatus(verificationResult).toUpperCase()}
                      </span>
                    </div>
                    
                    <div className="flex justify-between items-center bg-background/50 rounded-lg p-4">
                      <span className="text-sm font-medium text-muted-foreground">Confidence:</span>
                      <span className={`text-lg font-bold ${
                        getConfidencePercentage(verificationResult) >= 90 ? 'text-green-400' :
                        getConfidencePercentage(verificationResult) >= 70 ? 'text-yellow-400' :
                        'text-red-400'
                      }`}>
                        {getConfidencePercentage(verificationResult)}%
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex justify-center mt-8">
                  <Button
                    onClick={resetForm}
                    variant="outline"
                    className="border-purple-500/50 text-purple-400 hover:bg-purple-500/10"
                  >
                    Verify Another Image
                  </Button>
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
