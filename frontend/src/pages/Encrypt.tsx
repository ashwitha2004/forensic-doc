import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Upload, Camera, Shield, Download, CheckCircle, AlertCircle } from "lucide-react";
import { embedAdvancedWatermark, type AdvancedWatermarkMetadata } from "@/lib/advancedSteganography";
import { embedSimpleWatermark, type SimpleWatermarkMetadata } from "@/lib/simpleSteganography";
import { appStorage } from "@/lib/storage";
import { CameraCapture } from "@/components/CameraCapture";

interface EncryptionResult {
  success: boolean;
  processedImage?: string;
  metadata?: AdvancedWatermarkMetadata | SimpleWatermarkMetadata;
  error?: string;
}

const Encrypt = () => {
  const navigate = useNavigate();
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [encryptionResult, setEncryptionResult] = useState<EncryptionResult | null>(null);
  const [encryptionMode, setEncryptionMode] = useState<'advanced' | 'simple'>('advanced');
  const [showCameraModal, setShowCameraModal] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const handleImageSelect = (imageData: string) => {
    setSelectedImage(imageData);
    setEncryptionResult(null);
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        if (e.target?.result) {
          handleImageSelect(e.target.result as string);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCameraCapture = () => {
    setShowCameraModal(true);
  };

  const handleCameraCaptureComplete = (imageData: string) => {
    setSelectedImage(imageData);
    setEncryptionResult(null);
    setShowCameraModal(false);
  };

  const processEncryption = async () => {
    if (!selectedImage) return;

    setIsProcessing(true);
    setEncryptionResult(null);

    try {
      // Get real authenticated PINIT user ID
      const realUserId = localStorage.getItem('pinit_user_id') || localStorage.getItem('biovault_user_id') || 'USR-UNKNOWN';
      
      console.log('[ENCRYPT] Logged in user:', realUserId);
      
      let result: EncryptionResult;

      if (encryptionMode === 'advanced') {
        const processedImage = await embedAdvancedWatermark(selectedImage, realUserId);
        result = {
          success: true,
          processedImage: processedImage,
          metadata: {
            userId: realUserId,
            gps: {
              available: false,
              source: 'Unknown'
            },
            timestamp: new Date().toISOString(),
            deviceId: null,
            deviceName: null,
            ipAddress: null,
            deviceSource: 'Unknown',
            ipSource: 'Unknown',
            gpsSource: 'Unknown',
            originalResolution: null,
            confidence: 'High',
            found: true,
            pinitEncrypted: true
          }
        };
      } else {
        const processedImage = await embedSimpleWatermark(selectedImage, realUserId, new Date().toISOString());
        result = {
          success: true,
          processedImage: processedImage,
          metadata: { userId: realUserId, timestamp: new Date().toISOString(), method: 'simple', pinitEncrypted: true }
        };
      }
      
      console.log('[ENCRYPT] Embedded user ID:', realUserId);

      setEncryptionResult(result);

      // Store encryption result for recent activity
      const recentActivity = {
        id: Date.now().toString(),
        type: 'encryption',
        fileName: `encrypted_image_${Date.now()}.jpg`,
        timestamp: new Date().toISOString(),
        mode: encryptionMode,
        status: 'success'
      };

      const existing = localStorage.getItem('recentVerifications');
      const activities = existing ? JSON.parse(existing) : [];
      activities.unshift(recentActivity);
      localStorage.setItem('recentVerifications', JSON.stringify(activities.slice(0, 10)));

    } catch (error) {
      console.error('Encryption failed:', error);
      setEncryptionResult({
        success: false,
        error: error instanceof Error ? error.message : 'Encryption failed'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadImage = () => {
    if (encryptionResult?.processedImage) {
      const link = document.createElement('a');
      link.href = encryptionResult.processedImage;
      link.download = `encrypted_image_${Date.now()}.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const resetForm = () => {
    setSelectedImage(null);
    setEncryptionResult(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-black text-white">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="sticky top-0 z-40 bg-gradient-to-r from-slate-950/95 via-cyan-950/95 to-slate-950/95 backdrop-blur-xl border-b border-cyan-500/30 px-4 py-4 shadow-2xl"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/home")}
              className="p-2 hover:bg-cyan-500/20 rounded-lg transition-all"
            >
              <ArrowLeft className="w-5 h-5 text-cyan-400" />
            </button>
            <div>
              <h1 className="text-lg font-semibold text-white">Image Encryption</h1>
              <p className="text-xs text-cyan-300">Apply secure watermarking</p>
            </div>
          </div>
          <Shield className="w-6 h-6 text-cyan-400" />
        </div>
      </motion.div>

      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {!encryptionResult ? (
          <>
            {/* Encryption Mode Selection */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-8"
            >
              <h2 className="text-xl font-semibold mb-4 text-white">Choose Encryption Mode</h2>
              <div className="grid md:grid-cols-2 gap-4">
                <button
                  onClick={() => setEncryptionMode('advanced')}
                  className={`p-4 rounded-lg border transition-all ${
                    encryptionMode === 'advanced'
                      ? 'bg-cyan-600/20 border-cyan-500/50 text-cyan-300'
                      : 'bg-slate-800/50 border-slate-700/50 text-gray-300 hover:bg-slate-800/70'
                  }`}
                >
                  <h3 className="font-semibold mb-2">Advanced Encryption</h3>
                  <p className="text-sm opacity-80">
                    Multi-layer watermarking with enhanced security features
                  </p>
                </button>
                <button
                  onClick={() => setEncryptionMode('simple')}
                  className={`p-4 rounded-lg border transition-all ${
                    encryptionMode === 'simple'
                      ? 'bg-purple-600/20 border-purple-500/50 text-purple-300'
                      : 'bg-slate-800/50 border-slate-700/50 text-gray-300 hover:bg-slate-800/70'
                  }`}
                >
                  <h3 className="font-semibold mb-2">Simple Encryption</h3>
                  <p className="text-sm opacity-80">
                    Basic watermarking for quick protection
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
                    <Upload className="w-16 h-16 text-slate-500" />
                    <div>
                      <h3 className="text-xl font-semibold text-white mb-2">Select Image to Encrypt</h3>
                      <p className="text-slate-400 mb-6">
                        Choose an image file to apply secure watermarking
                      </p>
                    </div>
                    <div className="flex gap-4">
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="bg-cyan-600 hover:bg-cyan-700 text-white px-6 py-3 rounded-lg transition-colors flex items-center gap-2"
                      >
                        <Upload className="w-4 h-4" />
                        Upload File
                      </button>
                      <button
                        onClick={handleCameraCapture}
                        className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-lg transition-colors flex items-center gap-2"
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
                    <input
                      ref={cameraInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
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
                        alt="Selected for encryption"
                        className="w-full h-64 object-contain"
                      />
                    </div>
                  </div>

                  <div className="flex justify-center">
                    <button
                      onClick={processEncryption}
                      disabled={isProcessing}
                      className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 disabled:opacity-50 text-white px-8 py-4 rounded-lg transition-all flex items-center gap-3 text-lg font-semibold"
                    >
                      <Shield className="w-5 h-5" />
                      {isProcessing ? 'Processing...' : 'Encrypt Image'}
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
            {encryptionResult.success ? (
              <div className="bg-green-900/20 border border-green-500/30 rounded-2xl p-6 text-center">
                <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
                <h2 className="text-2xl font-bold text-green-400 mb-2">Encryption Successful!</h2>
                <p className="text-green-300 mb-6">
                  Your image has been protected with {encryptionMode} watermarking
                </p>
                {encryptionResult.metadata && (
                  <div className="bg-slate-800/50 rounded-lg p-4 mb-6 text-left">
                    <h3 className="text-sm font-semibold text-white mb-2">Encryption Details</h3>
                    <div className="text-xs text-slate-300 space-y-1">
                      <p>Mode: {encryptionMode}</p>
                      <p>Timestamp: {new Date().toISOString()}</p>
                      <p>Watermark ID: {(encryptionResult.metadata as any).watermarkId || 'N/A'}</p>
                    </div>
                  </div>
                )}
                <div className="flex gap-4 justify-center">
                  <button
                    onClick={downloadImage}
                    className="bg-cyan-600 hover:bg-cyan-700 text-white px-6 py-3 rounded-lg transition-colors flex items-center gap-2"
                  >
                    <Download className="w-4 h-4" />
                    Download Encrypted Image
                  </button>
                  <button
                    onClick={resetForm}
                    className="bg-slate-700 hover:bg-slate-600 text-white px-6 py-3 rounded-lg transition-colors"
                  >
                    Encrypt Another Image
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-red-900/20 border border-red-500/30 rounded-2xl p-6 text-center">
                <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
                <h2 className="text-2xl font-bold text-red-400 mb-2">Encryption Failed</h2>
                <p className="text-red-300 mb-6">
                  {encryptionResult.error || 'An error occurred during encryption'}
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

export default Encrypt;
