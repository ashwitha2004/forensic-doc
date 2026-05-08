import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Upload, Camera, Search, CheckCircle, AlertCircle, Clock, FileText } from "lucide-react";
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

// Old hardcoded detection functions - REMOVED to use forensic results instead
// const detectImageSource = (imageData: string): 'camera' | 'screenshot' | 'whatsapp' | 'downloaded' | 'unknown' => {
//   // Basic heuristics for image source detection
//   if (imageData.includes('WhatsApp') || imageData.includes('WA')) {
//     return 'whatsapp';
//   }
//   if (imageData.includes('Screenshot') || imageData.includes('screen') || imageData.includes('capture')) {
//     return 'screenshot';
//   }
//   if (imageData.includes('download') || imageData.includes('save') || imageData.includes('export')) {
//     return 'downloaded';
//   }
//   if (imageData.includes('camera') || imageData.includes('photo') || imageData.includes('IMG_')) {
//     return 'camera';
//   }
//   return 'unknown';
// };

// const detectAIGenerated = (imageData: string): number => {
//   // Simulated AI detection based on image characteristics
//   // In a real implementation, this would use a trained ML model
//   const characteristics = {
//     hasPerfectSymmetry: Math.random() > 0.7,
//     hasUnrealisticLighting: Math.random() > 0.6,
//     hasDigitalArtifacts: Math.random() > 0.5,
//     hasConsistentTexture: Math.random() > 0.4
//   };
//   
//   let probability = 0;
//   if (characteristics.hasPerfectSymmetry) probability += 25;
//   if (characteristics.hasUnrealisticLighting) probability += 20;
//   if (characteristics.hasDigitalArtifacts) probability += 30;
//   if (characteristics.hasConsistentTexture) probability += 25;
//   
//   return probability;
// };

// const analyzeMetadata = (imageData: string): 'original' | 'modified' => {
//   // Simulated metadata analysis
//   // In a real implementation, this would parse EXIF data
//   return Math.random() > 0.5 ? 'original' : 'modified';
// };

// const detectCompression = (imageData: string): boolean => {
//   // Simulated compression detection
//   // In a real implementation, this would analyze image quality patterns
//   return Math.random() > 0.4;
// };

const calculateTrustScore = (
  watermarkDetected: boolean,
  pinitEncrypted: boolean,
  aiProbability: number,
  imageSource: string,
  metadataStatus: 'original' | 'modified',
  compressionDetected: boolean
): number => {
  let score = 100;
  
  // Watermark detection (most important)
  if (watermarkDetected && pinitEncrypted) {
    score += 40;
  } else if (watermarkDetected) {
    score += 20;
  } else {
    score -= 30;
  }
  
  // AI generation penalty
  score -= (aiProbability * 0.5);
  
  // Source type adjustments
  if (imageSource === 'camera') {
    score += 10;
  } else if (imageSource === 'screenshot') {
    score -= 5;
  } else if (imageSource === 'whatsapp') {
    score -= 10;
  } else if (imageSource === 'downloaded') {
    score -= 15;
  }
  
  // Metadata status
  if (metadataStatus === 'original') {
    score += 15;
  } else {
    score -= 10;
  }
  
  // Compression detection
  if (!compressionDetected) {
    score += 5;
  } else {
    score -= 5;
  }
  
  return Math.max(0, Math.min(100, score));
};

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
        console.log('AI Detection system initialized successfully');
      } catch (error) {
        console.warn('AI Detection initialization failed, will use fallback:', error);
        setAiDetectionReady(true); // Still allow processing with metadata-only
      }
    };

    initializeAIDetection();
  }, []);

  const handleImageSelect = (imageData: string, fileName: string, source: 'upload' | 'camera' = 'upload') => {
    setSelectedImage(imageData);
    setSelectedFileName(fileName);
    setVerificationResult(null);
    // Store source info for later use in analysis
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

      // Try to extract watermarks
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

      // Extract user ID from watermark metadata
      let extractedUserId = null;
      if (watermarkMetadata && 'userId' in watermarkMetadata) {
        extractedUserId = (watermarkMetadata as any).userId;
      } else if (watermarkMetadata && 'pinit_user_id' in watermarkMetadata) {
        extractedUserId = (watermarkMetadata as any).pinit_user_id;
      }
      
      console.log('[VERIFY] Extracted user ID:', extractedUserId);
      
      // Get current logged-in user ID for comparison
      const currentUserId = localStorage.getItem('pinit_user_id') || localStorage.getItem('biovault_user_id');
      console.log('[VERIFY] Current logged-in user:', currentUserId);

      // Get the capture source from localStorage
      const captureSource = localStorage.getItem('current_image_source') as 'upload' | 'camera' | null;
      localStorage.removeItem('current_image_source'); // Clean up after use
      
      // Perform comprehensive forensic analysis with source context
      const analysis = await analyzeImage(selectedImage, selectedFileName || undefined, captureSource || undefined);
      
      // Add debug console logs for forensics
      console.log("[FORENSICS]", analysis.forensicReport);
      if (analysis.forensicReport) {
        console.log("[WHATSAPP DETECTED]", analysis.forensicReport.whatsapp);
      }
      
      // Determine image source using TRUSTED SOURCE PRIORITY
      // Priority: 1. Trusted Camera Capture > 2. Screenshot > 3. WhatsApp > 4. Forensic Camera > 5. Downloaded > 6. Unknown
      let imageSource: 'camera' | 'screenshot' | 'whatsapp' | 'downloaded' | 'unknown';
      
      // PRIORITY 1: Trusted camera source override
      if (captureSource === 'camera') {
        imageSource = "camera";
        console.log('[VERIFY] Using trusted camera source - overriding forensic analysis');
      } else if (analysis.forensicReport) {
        // PRIORITY 2+: Forensic analysis for uploaded files
        const fr = analysis.forensicReport;
        
        // Priority 2: Screenshot
        if (fr.screenshot.detected) {
          imageSource = "screenshot";
        }
        // Priority 3: WhatsApp/Social
        else if (fr.whatsapp.detected) {
          imageSource = "whatsapp";
        }
        // Priority 4: Camera Original (from forensics)
        else if (fr.camera_original.detected) {
          imageSource = "camera";
        }
        // Priority 5: Downloaded/Processed
        else if (fr.downloaded.detected) {
          imageSource = "downloaded";
        }
        // Priority 6: Unknown (lowest priority)
        else {
          imageSource = "unknown";
        }
      } else {
        // Fallback to analysis image type if no forensic report
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
      
      // Use our comprehensive AI detection system
      let aiDetectionResult: IntegratedDetectionResult | null = null;
      let aiProbability = 0;
      let aiTool: string | null = null;
      
      try {
        const aiDetector = getAIDetection();
        aiDetectionResult = await aiDetector.analyzeImage(selectedImage);
        aiProbability = aiDetectionResult.confidence * 100; // Convert to percentage
        aiTool = aiDetectionResult.aiTool;
        
        console.log('AI Detection Result:', {
          aiGenerated: aiDetectionResult.aiGenerated,
          confidence: aiDetectionResult.confidence,
          aiTool: aiDetectionResult.aiTool,
          detectionMethod: aiDetectionResult.detectionMethod,
          processingTime: aiDetectionResult.processingTime
        });
      } catch (error) {
        console.warn('AI detection failed, falling back to forensic analysis:', error);
        // Fallback to existing forensic analysis
        aiProbability = analysis.forensicReport?.ai_generated.probability || 0;
      }
      
      const metadataStatus = analysis.metadata.hasExif ? 'original' : 'modified';
      const compressionDetected = analysis.forensicReport?.whatsapp.detected || false;
      
      // Calculate trust score
      const trustScore = calculateTrustScore(
        watermarkDetected,
        pinitEncrypted,
        aiProbability,
        imageSource,
        metadataStatus,
        compressionDetected
      );
      
      // Determine authenticity based on comprehensive analysis
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
      
      // Enhanced AI detection reporting
      if (aiDetectionResult && aiDetectionResult.aiGenerated) {
        if (aiTool) {
          issues.push(`AI-generated content detected (${aiTool} - ${aiProbability.toFixed(1)}% confidence)`);
        } else {
          issues.push(`AI-generated content detected (${aiProbability.toFixed(1)}% confidence)`);
        }
        
        // Add AI detection method information
        if (aiDetectionResult.detectionMethod === 'model') {
          issues.push('Detected using AI model inference');
        } else if (aiDetectionResult.detectionMethod === 'metadata') {
          issues.push('Detected using metadata analysis');
        } else {
          issues.push('Detected using combined analysis');
        }
      } else if (aiProbability > 50) {
        issues.push(`AI-generated content detected (${aiProbability.toFixed(1)}% probability)`);
      }
      
      if (analysis.indicators && analysis.indicators.length > 0) {
        issues.push(...analysis.indicators);
      }
      if (compressionDetected) {
        issues.push('Image compression detected');
      }
      
      // Add AI detection recommendations if available
      if (aiDetectionResult && aiDetectionResult.recommendations.length > 0) {
        issues.push('AI Detection Recommendations:');
        issues.push(...aiDetectionResult.recommendations.map(rec => `• ${rec}`));
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

      // Store verification result for recent activity
      const recentActivity = {
        id: Date.now().toString(),
        fileName,
        timestamp,
        status: isAuthentic ? 'authentic' : (confidence < 0.5 ? 'fake' : 'suspicious'),
        detectionType
      };

      const existing = localStorage.getItem('recentVerifications');
      const activities = existing ? JSON.parse(existing) : [];
      activities.unshift(recentActivity);
      localStorage.setItem('recentVerifications', JSON.stringify(activities.slice(0, 10)));

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
    setVerificationResult(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const getStatusColor = (isAuthentic: boolean, confidence: number) => {
    if (!isAuthentic && confidence < 0.5) return 'text-red-400 bg-red-500/10 border-red-500/30';
    if (!isAuthentic) return 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30';
    return 'text-green-400 bg-green-500/10 border-green-500/30';
  };

  const getStatusText = (isAuthentic: boolean, confidence: number) => {
    if (!isAuthentic && confidence < 0.5) return 'FAKE';
    if (!isAuthentic) return 'SUSPICIOUS';
    return 'AUTHENTIC';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-black text-white">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="sticky top-0 z-40 bg-gradient-to-r from-slate-950/95 via-purple-950/95 to-slate-950/95 backdrop-blur-xl border-b border-purple-500/30 px-4 py-4 shadow-2xl"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/home")}
              className="p-2 hover:bg-purple-500/20 rounded-lg transition-all"
            >
              <ArrowLeft className="w-5 h-5 text-purple-400" />
            </button>
            <div>
              <h1 className="text-lg font-semibold text-white">Verify Proof</h1>
              <p className="text-xs text-purple-300">Analyze image authenticity</p>
            </div>
          </div>
          <Search className="w-6 h-6 text-purple-400" />
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
                <div className="bg-slate-800/50 border-2 border-dashed border-slate-700/50 rounded-2xl p-12 text-center">
                  <div className="flex flex-col items-center gap-4">
                    <Search className="w-16 h-16 text-slate-500" />
                    <div>
                      <h3 className="text-xl font-semibold text-white mb-2">Select Image to Verify</h3>
                      <p className="text-slate-400 mb-6">
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
                  <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold text-white">Selected Image</h3>
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
          /* Results Section */
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            {verificationResult.success ? (
              <div className="border rounded-2xl p-6">
                <div className="text-center mb-6">
                  <div className={`inline-flex items-center px-4 py-2 rounded-full mb-4 ${
                    verificationResult.isAuthentic 
                      ? 'bg-green-900/20 border-green-500/30' 
                      : verificationResult.trustScore >= 50 
                        ? 'bg-yellow-900/20 border-yellow-500/30'
                        : 'bg-red-900/20 border-red-500/30'
                  }`}>
                    {verificationResult.isAuthentic ? (
                      <CheckCircle className="w-6 h-6 text-green-400 mr-2" />
                    ) : (
                      <AlertCircle className="w-6 h-6 text-red-400 mr-2" />
                    )}
                    <span className={`font-bold ${
                      verificationResult.isAuthentic 
                        ? 'text-green-400' 
                        : verificationResult.trustScore >= 50 
                          ? 'text-yellow-400'
                          : 'text-red-400'
                    }`}>
                      {verificationResult.isAuthentic ? 'AUTHENTIC' : 'SUSPICIOUS'}
                    </span>
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  {/* Verification Report */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                      <FileText className="w-5 h-5" />
                      Verification Report
                    </h3>
                    
                    <div className="space-y-3">
                      <div className="flex justify-between items-center bg-slate-800/50 rounded-lg p-3">
                        <span className="text-sm text-gray-300">PINIT Encryption</span>
                        <span className={`text-sm font-bold ${
                          verificationResult.pinitEncrypted ? 'text-green-400' : 'text-red-400'
                        }`}>
                          {verificationResult.pinitEncrypted ? 'DETECTED' : 'NOT DETECTED'}
                        </span>
                      </div>
                      
                      <div className="flex justify-between items-center bg-slate-800/50 rounded-lg p-3">
                        <span className="text-sm text-gray-300">Image Source</span>
                        <span className="text-sm font-bold text-white capitalize">
                          {verificationResult.imageSource === 'unknown' ? 'Unknown' : verificationResult.imageSource}
                        </span>
                      </div>
                      
                      <div className="flex justify-between items-center bg-slate-800/50 rounded-lg p-3">
                        <span className="text-sm text-gray-300">Screenshot Detection</span>
                        <span className={`text-sm font-bold ${
                          verificationResult.imageSource === 'screenshot' ? 'text-green-400' : 'text-gray-400'
                        }`}>
                          {verificationResult.imageSource === 'screenshot' ? 'YES' : 'NO'}
                        </span>
                      </div>
                      
                      <div className="flex justify-between items-center bg-slate-800/50 rounded-lg p-3">
                        <span className="text-sm text-gray-300">WhatsApp/Compressed</span>
                        <span className={`text-sm font-bold ${
                          verificationResult.imageSource === 'whatsapp' ? 'text-green-400' : 'text-gray-400'
                        }`}>
                          {verificationResult.imageSource === 'whatsapp' ? 'YES' : 'NO'}
                        </span>
                      </div>
                      
                      <div className="flex justify-between items-center bg-slate-800/50 rounded-lg p-3">
                        <span className="text-sm text-gray-300">Downloaded Image</span>
                        <span className={`text-sm font-bold ${
                          verificationResult.imageSource === 'downloaded' ? 'text-green-400' : 'text-gray-400'
                        }`}>
                          {verificationResult.imageSource === 'downloaded' ? 'YES' : 'NO'}
                        </span>
                      </div>
                      
                      <div className="flex justify-between items-center bg-slate-800/50 rounded-lg p-3">
                        <span className="text-sm text-gray-300">Camera Captured</span>
                        <span className={`text-sm font-bold ${
                          verificationResult.imageSource === 'camera' ? 'text-green-400' : 'text-gray-400'
                        }`}>
                          {verificationResult.imageSource === 'camera' ? 'YES' : 'NO'}
                        </span>
                      </div>
                      
                      <div className="flex justify-between items-center bg-slate-800/50 rounded-lg p-3">
                        <span className="text-sm text-gray-300">AI Generated Probability</span>
                        <span className={`text-sm font-bold ${
                          (verificationResult.analysis?.forensicReport?.ai_generated.probability || 0) > 50 ? 'text-red-400' : 'text-gray-400'
                        }`}>
                          {(verificationResult.analysis?.forensicReport?.ai_generated.probability || 0).toFixed(1)}%
                        </span>
                      </div>
                      
                      <div className="flex justify-between items-center bg-slate-800/50 rounded-lg p-3">
                        <span className="text-sm text-gray-300">Metadata Status</span>
                        <span className={`text-sm font-bold ${
                          verificationResult.metadataStatus === 'original' ? 'text-green-400' : 'text-red-400'
                        }`}>
                          {verificationResult.metadataStatus === 'original' ? 'Original' : 'Modified'}
                        </span>
                      </div>
                      
                      <div className="flex justify-between items-center bg-slate-800/50 rounded-lg p-3">
                        <span className="text-sm text-gray-300">Compression Detection</span>
                        <span className={`text-sm font-bold ${
                          !verificationResult.compressionDetected ? 'text-green-400' : 'text-red-400'
                        }`}>
                          {verificationResult.compressionDetected ? 'YES' : 'NO'}
                        </span>
                      </div>
                      
                      <div className="flex justify-between items-center bg-slate-800/50 rounded-lg p-3">
                        <span className="text-sm text-gray-300">Final Trust Score</span>
                        <span className={`text-lg font-bold ${
                          verificationResult.trustScore >= 70 ? 'text-green-400' : 
                          verificationResult.trustScore >= 50 ? 'text-yellow-400' : 'text-red-400'
                        }`}>
                          {verificationResult.trustScore}%
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  {/* Technical Details */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                      <Search className="w-5 h-5" />
                      Technical Details
                    </h3>
                    
                    <div className="bg-slate-800/50 rounded-lg p-4 space-y-3">
                      <div className="text-sm">
                        <span className="text-gray-300">Detection Type:</span>
                        <span className="text-white ml-2">{verificationResult.details.detectionType}</span>
                      </div>
                      
                      <div className="text-sm">
                        <span className="text-gray-300">Watermark:</span>
                        <span className="text-white ml-2">
                          {verificationResult.watermarkDetected ? 'Detected' : 'Not Found'}
                        </span>
                      </div>
                      
                      <div className="text-sm">
                        <span className="text-gray-300">Verification Time:</span>
                        <span className="text-white ml-2">
                          {new Date(verificationResult.details.timestamp).toLocaleString()}
                        </span>
                      </div>
                      
                      {/* Comprehensive Forensic Evidence */}
                      {verificationResult.analysis?.forensicReport && (
                        <div className="text-sm space-y-2">
                          <span className="text-gray-300">Forensic Evidence:</span>
                          <div className="text-white ml-2 space-y-1">
                            {/* Show all forensic detections, even secondary ones */}
                            {verificationResult.analysis.forensicReport.screenshot.detected && (
                              <div className="flex items-center gap-2">
                                <span className="text-blue-400">• Screenshot artifacts detected</span>
                                <span className="text-gray-400">({verificationResult.analysis.forensicReport.screenshot.confidence}% confidence)</span>
                              </div>
                            )}
                            
                            {verificationResult.analysis.forensicReport.whatsapp.detected && (
                              <div className="flex items-center gap-2">
                                <span className="text-green-400">• WhatsApp compression detected</span>
                                <span className="text-gray-400">({verificationResult.analysis.forensicReport.whatsapp.confidence}% confidence)</span>
                              </div>
                            )}
                            
                            {verificationResult.analysis.forensicReport.downloaded.detected && (
                              <div className="flex items-center gap-2">
                                <span className="text-yellow-400">• Download/export artifacts found</span>
                                <span className="text-gray-400">({verificationResult.analysis.forensicReport.downloaded.confidence}% confidence)</span>
                              </div>
                            )}
                            
                            {verificationResult.analysis.forensicReport.camera_original.detected && (
                              <div className="flex items-center gap-2">
                                <span className="text-purple-400">• Camera characteristics detected</span>
                                <span className="text-gray-400">({verificationResult.analysis.forensicReport.camera_original.confidence}% confidence)</span>
                              </div>
                            )}
                            
                            {verificationResult.analysis.forensicReport.ai_generated.probability > 30 && (
                              <div className="flex items-center gap-2">
                                <span className="text-red-400">• AI generation indicators</span>
                                <span className="text-gray-400">({verificationResult.analysis.forensicReport.ai_generated.probability.toFixed(1)}% probability)</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                      
                      {/* Detailed forensic reasons */}
                      {verificationResult.analysis?.forensicReport && (
                        <div className="text-sm space-y-2">
                          <span className="text-gray-300">Detection Details:</span>
                          <div className="text-white ml-2 space-y-1 text-xs">
                            {/* Show reasons for primary detection */}
                            {verificationResult.imageSource === 'screenshot' && verificationResult.analysis.forensicReport.screenshot.reasons.length > 0 && (
                              <div>
                                <span className="text-blue-300">Screenshot evidence:</span>
                                {verificationResult.analysis.forensicReport.screenshot.reasons.map((reason, index) => (
                                  <div key={index} className="text-gray-400 ml-2">• {reason}</div>
                                ))}
                              </div>
                            )}
                            
                            {verificationResult.imageSource === 'whatsapp' && verificationResult.analysis.forensicReport.whatsapp.reasons.length > 0 && (
                              <div>
                                <span className="text-green-300">WhatsApp evidence:</span>
                                {verificationResult.analysis.forensicReport.whatsapp.reasons.map((reason, index) => (
                                  <div key={index} className="text-gray-400 ml-2">• {reason}</div>
                                ))}
                              </div>
                            )}
                            
                            {verificationResult.imageSource === 'downloaded' && verificationResult.analysis.forensicReport.downloaded.reasons.length > 0 && (
                              <div>
                                <span className="text-yellow-300">Download evidence:</span>
                                {verificationResult.analysis.forensicReport.downloaded.reasons.map((reason, index) => (
                                  <div key={index} className="text-gray-400 ml-2">• {reason}</div>
                                ))}
                              </div>
                            )}
                            
                            {verificationResult.imageSource === 'camera' && verificationResult.analysis.forensicReport.camera_original.reasons.length > 0 && (
                              <div>
                                <span className="text-purple-300">Camera evidence:</span>
                                {verificationResult.analysis.forensicReport.camera_original.reasons.map((reason, index) => (
                                  <div key={index} className="text-gray-400 ml-2">• {reason}</div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                      
                      {verificationResult.details.issues.length > 0 && (
                        <div className="text-sm">
                          <span className="text-gray-300">Issues:</span>
                          <div className="text-white ml-2 space-y-1">
                            {verificationResult.details.issues.map((issue, index) => (
                              <p key={index}>• {issue}</p>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex gap-4 justify-center">
                  <button
                    onClick={() => navigate("/detection-result")}
                    className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-lg transition-colors flex items-center gap-2"
                  >
                    <Clock className="w-4 h-4" />
                    View All Results
                  </button>
                  <button
                    onClick={resetForm}
                    className="bg-slate-700 hover:bg-slate-600 text-white px-6 py-3 rounded-lg transition-colors"
                  >
                    Verify Another Image
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-red-900/20 border border-red-500/30 rounded-2xl p-6 text-center">
                <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
                <h2 className="text-2xl font-bold text-red-400 mb-2">Verification Failed</h2>
                <p className="text-red-300 mb-6">
                  {verificationResult.error || 'An error occurred during verification'}
                </p>
                <button
                  onClick={resetForm}
                  className="bg-slate-700 hover:bg-slate-600 text-white px-6 py-3 rounded-lg transition-colors"
                >
                  Try Again
                </button>
              </div>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default VerifyProof;
