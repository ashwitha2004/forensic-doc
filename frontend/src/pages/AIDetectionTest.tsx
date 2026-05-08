import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { Upload, AlertCircle, CheckCircle, Brain, Image as ImageIcon, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getAIDetection, type IntegratedDetectionResult } from "@/utils/aiDetection/aiDetectionIntegration";

const AIDetectionTest = () => {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [detectionResult, setDetectionResult] = useState<IntegratedDetectionResult | null>(null);
  const [aiDetectionReady, setAiDetectionReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
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
        console.warn('AI Detection initialization failed:', error);
        setError('AI Detection initialization failed. Using metadata-only detection.');
        setAiDetectionReady(true); // Still allow processing with metadata-only
      }
    };

    initializeAIDetection();
  }, []);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        if (e.target?.result) {
          setSelectedImage(e.target.result as string);
          setSelectedFileName(file.name);
          setDetectionResult(null);
          setError(null);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const testAIDetection = async () => {
    if (!selectedImage) return;

    setIsProcessing(true);
    setDetectionResult(null);
    setError(null);

    try {
      const aiDetector = getAIDetection();
      const result = await aiDetector.analyzeImage(selectedImage);
      
      setDetectionResult(result);
      console.log('AI Detection Test Result:', result);
    } catch (error) {
      console.error('AI Detection Test Error:', error);
      setError(error instanceof Error ? error.message : 'Unknown error occurred');
    } finally {
      setIsProcessing(false);
    }
  };

  const getStatusIcon = () => {
    if (!detectionResult) return null;
    
    if (detectionResult.aiGenerated) {
      return <AlertCircle className="w-16 h-16 text-red-500" />;
    } else {
      return <CheckCircle className="w-16 h-16 text-green-500" />;
    }
  };

  const getStatusColor = () => {
    if (!detectionResult) return 'text-gray-400';
    
    return detectionResult.aiGenerated ? 'text-red-400' : 'text-green-400';
  };

  const getStatusText = () => {
    if (!detectionResult) return 'No Detection Performed';
    
    if (detectionResult.aiGenerated) {
      return detectionResult.aiTool 
        ? `AI Generated (${detectionResult.aiTool})`
        : 'AI Generated';
    } else {
      return 'Real Image';
    }
  };

  const getConfidenceColor = () => {
    if (!detectionResult) return 'text-gray-400';
    
    if (detectionResult.confidence >= 0.8) return 'text-green-400';
    if (detectionResult.confidence >= 0.6) return 'text-yellow-400';
    return 'text-red-400';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <div className="max-w-4xl mx-auto px-4 py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12"
        >
          <div className="flex justify-center mb-6">
            <div className="p-4 bg-gradient-to-r from-purple-500 to-pink-500 rounded-2xl">
              <Brain className="w-12 h-12 text-white" />
            </div>
          </div>
          <h1 className="text-4xl font-bold text-white mb-4">
            AI Detection Test
          </h1>
          <p className="text-gray-300 text-lg">
            Test our comprehensive AI-generated image detection system
          </p>
          
          {/* Status Indicator */}
          <div className="mt-6 flex justify-center">
            <div className={`px-4 py-2 rounded-full flex items-center gap-2 ${
              aiDetectionReady 
                ? 'bg-green-500/20 text-green-400 border border-green-500/50' 
                : 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/50'
            }`}>
              {aiDetectionReady ? (
                <CheckCircle className="w-4 h-4" />
              ) : (
                <Loader2 className="w-4 h-4 animate-spin" />
              )}
              <span className="text-sm">
                {aiDetectionReady ? 'AI Detection Ready' : 'Initializing...'}
              </span>
            </div>
          </div>
        </motion.div>

        {/* Upload Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 mb-8"
        >
          <div className="text-center">
            <div className="mb-6">
              <ImageIcon className="w-16 h-16 text-purple-400 mx-auto mb-4" />
              <h2 className="text-2xl font-semibold text-white mb-2">
                Upload an Image for Analysis
              </h2>
              <p className="text-gray-300">
                Supports JPEG, PNG, and WebP formats up to 10MB
              </p>
            </div>

            <div className="flex flex-col items-center gap-4">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="hidden"
              />
              
              <Button
                onClick={() => fileInputRef.current?.click()}
                disabled={!aiDetectionReady || isProcessing}
                className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white px-8 py-3"
              >
                <Upload className="w-4 h-4 mr-2" />
                Choose Image
              </Button>

              {selectedFileName && (
                <div className="text-white bg-white/10 px-4 py-2 rounded-lg">
                  Selected: {selectedFileName}
                </div>
              )}
            </div>

            {selectedImage && (
              <div className="mt-6">
                <img
                  src={selectedImage}
                  alt="Selected"
                  className="max-w-full max-h-64 mx-auto rounded-lg shadow-2xl"
                />
                
                <Button
                  onClick={testAIDetection}
                  disabled={isProcessing || !aiDetectionReady}
                  className="mt-4 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 text-white px-8 py-3"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    <>
                      <Brain className="w-4 h-4 mr-2" />
                      Analyze with AI
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>
        </motion.div>

        {/* Error Display */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-red-500/20 border border-red-500/50 rounded-xl p-6 mb-8"
          >
            <div className="flex items-center gap-3 text-red-400">
              <AlertCircle className="w-5 h-5" />
              <span className="font-semibold">Error</span>
            </div>
            <p className="text-red-300 mt-2">{error}</p>
          </motion.div>
        )}

        {/* Results Section */}
        {detectionResult && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white/10 backdrop-blur-lg rounded-2xl p-8"
          >
            <div className="text-center">
              {/* Status Icon */}
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, duration: 0.5, type: "spring" }}
                className="flex justify-center mb-6"
              >
                {getStatusIcon()}
              </motion.div>

              {/* Status Text */}
              <motion.h2
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4, duration: 0.6 }}
                className={`text-3xl font-bold mb-4 ${getStatusColor()}`}
              >
                {getStatusText()}
              </motion.h2>

              {/* Confidence Score */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5, duration: 0.6 }}
                className="mb-8"
              >
                <div className="text-lg text-gray-300 mb-2">Confidence</div>
                <div className={`text-4xl font-bold ${getConfidenceColor()}`}>
                  {(detectionResult.confidence * 100).toFixed(1)}%
                </div>
              </motion.div>

              {/* Detailed Results */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6, duration: 0.6 }}
                className="bg-black/30 rounded-xl p-6 text-left"
              >
                <h3 className="text-lg font-semibold text-white mb-4">Analysis Details</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-400">Detection Method:</span>
                    <span className="ml-2 text-white capitalize">{detectionResult.detectionMethod}</span>
                  </div>
                  <div>
                    <span className="text-gray-400">Processing Time:</span>
                    <span className="ml-2 text-white">{detectionResult.processingTime.toFixed(2)}ms</span>
                  </div>
                  <div>
                    <span className="text-gray-400">AI Tool:</span>
                    <span className="ml-2 text-white">{detectionResult.aiTool || 'Not detected'}</span>
                  </div>
                  <div>
                    <span className="text-gray-400">Model Loaded:</span>
                    <span className="ml-2 text-white">{detectionResult.modelLoaded ? 'Yes' : 'No'}</span>
                  </div>
                </div>

                {detectionResult.recommendations.length > 0 && (
                  <div className="mt-4">
                    <h4 className="text-md font-semibold text-white mb-2">Recommendations:</h4>
                    <ul className="text-gray-300 space-y-1">
                      {detectionResult.recommendations.map((rec, index) => (
                        <li key={index} className="flex items-start gap-2">
                          <span className="text-purple-400 mt-1">•</span>
                          <span>{rec}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </motion.div>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default AIDetectionTest;
