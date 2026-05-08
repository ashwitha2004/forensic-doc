import { useNavigate, useLocation } from 'react-router-dom';
import { HexGrid } from '@/components/HexGrid';
import { Button } from '@/components/ui/button';
import { StatusIndicator } from '@/components/StatusIndicator';
import { Shield, CheckCircle, XCircle, AlertCircle, ArrowLeft, Download } from 'lucide-react';
import { motion } from 'framer-motion';

interface DetectionResult {
  status: 'authentic' | 'fake' | 'suspicious' | 'error';
  confidence: number;
  details: string;
  timestamp: string;
  documentId?: string;
}

const DetectionResult = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const result = location.state as DetectionResult;

  if (!result) {
    navigate('/verify-proof');
    return null;
  }

  const getStatusIcon = () => {
    switch (result.status) {
      case 'authentic':
        return <CheckCircle className="w-16 h-16 text-green-500" />;
      case 'fake':
        return <XCircle className="w-16 h-16 text-red-500" />;
      case 'suspicious':
        return <AlertCircle className="w-16 h-16 text-yellow-500" />;
      default:
        return <AlertCircle className="w-16 h-16 text-gray-500" />;
    }
  };

  const getStatusColor = () => {
    switch (result.status) {
      case 'authentic':
        return 'text-green-400';
      case 'fake':
        return 'text-red-400';
      case 'suspicious':
        return 'text-yellow-400';
      default:
        return 'text-gray-400';
    }
  };

  const getStatusText = () => {
    switch (result.status) {
      case 'authentic':
        return 'Document is Authentic';
      case 'fake':
        return 'Document is Fake';
      case 'suspicious':
        return 'Document is Suspicious';
      default:
        return 'Detection Error';
    }
  };

  const getConfidenceColor = () => {
    if (result.confidence >= 90) return 'text-green-400';
    if (result.confidence >= 70) return 'text-yellow-400';
    return 'text-red-400';
  };

  return (
    <div className="min-h-screen relative overflow-hidden">
      <HexGrid />
      <div className="relative z-10">
        {/* Header */}
        <header className="bg-background/80 backdrop-blur-xl border-b border-border/50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <div className="flex items-center gap-3">
                <Button
                  onClick={() => navigate('/verify-proof')}
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-foreground"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Verification
                </Button>
              </div>
              <StatusIndicator status="active" />
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6 }}
            className="text-center"
          >
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
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.6 }}
              className={`text-3xl font-bold mb-4 ${getStatusColor()}`}
            >
              {getStatusText()}
            </motion.h1>

            {/* Confidence Score */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 0.6 }}
              className="mb-8"
            >
              <div className="text-lg text-muted-foreground mb-2">Confidence Score</div>
              <div className={`text-4xl font-bold ${getConfidenceColor()}`}>
                {result.confidence}%
              </div>
            </motion.div>

            {/* Details */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6, duration: 0.6 }}
              className="bg-background/80 backdrop-blur-xl border border-border/50 rounded-xl p-6 mb-8 text-left"
            >
              <h3 className="text-lg font-semibold text-foreground mb-4">Analysis Details</h3>
              <p className="text-muted-foreground mb-4">{result.details}</p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Detection Time:</span>
                  <span className="ml-2 text-foreground">{result.timestamp}</span>
                </div>
                {result.documentId && (
                  <div>
                    <span className="text-muted-foreground">Document ID:</span>
                    <span className="ml-2 text-foreground font-mono">{result.documentId}</span>
                  </div>
                )}
              </div>
            </motion.div>

            {/* Action Buttons */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7, duration: 0.6 }}
              className="flex flex-col sm:flex-row gap-4 justify-center"
            >
              <Button
                onClick={() => navigate('/verify-proof')}
                className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700"
              >
                <Shield className="w-4 h-4 mr-2" />
                Verify Another Document
              </Button>
              
              <Button
                variant="outline"
                className="border-cyan-500/50 text-cyan-400 hover:bg-cyan-500/10"
              >
                <Download className="w-4 h-4 mr-2" />
                Download Report
              </Button>
            </motion.div>
          </motion.div>
        </main>
      </div>
    </div>
  );
};

export default DetectionResult;
