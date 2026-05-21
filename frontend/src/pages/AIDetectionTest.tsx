import { useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertCircle,
  Brain,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Cpu,
  Image as ImageIcon,
  Loader2,
  Microscope,
  Scan,
  Upload,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  detectAI,
  getVerdict,
  HybridDetectionResult,
  isError,
  pct,
  probabilityColor,
} from "@/utils/backendDetection";

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function ConfidenceBar({
  label,
  icon,
  value,
  color,
  description,
}: {
  label: string;
  icon: React.ReactNode;
  value: number;
  color: string;
  description: string;
}) {
  const pctVal = Math.round(value * 100);
  const barColor =
    value >= 0.7
      ? "bg-red-500"
      : value >= 0.45
      ? "bg-yellow-500"
      : "bg-green-500";

  return (
    <div className="bg-black/30 rounded-xl p-4">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2 text-white font-medium">
          {icon}
          <span className="text-sm">{label}</span>
        </div>
        <span className={`text-sm font-bold ${color}`}>{pctVal}%</span>
      </div>
      <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden mb-1">
        <motion.div
          className={`h-full rounded-full ${barColor}`}
          initial={{ width: 0 }}
          animate={{ width: `${pctVal}%` }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        />
      </div>
      <p className="text-xs text-gray-400">{description}</p>
    </div>
  );
}

function SignalRow({ label, value }: { label: string; value: number }) {
  const color = probabilityColor(value);
  return (
    <div className="flex justify-between items-center py-1 border-b border-white/5 last:border-0">
      <span className="text-gray-400 text-xs">{label}</span>
      <span className={`text-xs font-mono font-bold ${color}`}>{pct(value)}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────

const AIDetectionTest = () => {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<HybridDetectionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    setResult(null);
    setError(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      if (ev.target?.result) setSelectedImage(ev.target.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleAnalyze = async () => {
    if (!selectedFile) return;
    setIsProcessing(true);
    setResult(null);
    setError(null);

    const response = await detectAI(selectedFile);

    if (isError(response)) {
      setError(response.detail || response.message);
    } else {
      setResult(response);
    }
    setIsProcessing(false);
  };

  const verdict = result ? getVerdict(result) : null;
  const verdictColor =
    verdict === "AI Generated"
      ? "text-red-400"
      : verdict === "Real Camera"
      ? "text-green-400"
      : "text-yellow-400";

  const verdictIcon =
    verdict === "AI Generated" ? (
      <AlertCircle className="w-16 h-16 text-red-500" />
    ) : verdict === "Real Camera" ? (
      <CheckCircle className="w-16 h-16 text-green-500" />
    ) : (
      <AlertCircle className="w-16 h-16 text-yellow-500" />
    );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <div className="max-w-4xl mx-auto px-4 py-12">

        {/* Header */}
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
            Hybrid AI Image Detection
          </h1>
          <p className="text-gray-300 text-lg max-w-2xl mx-auto">
            Production-grade forensic analysis combining{" "}
            <span className="text-purple-300 font-semibold">
              three-branch deep learning (RGB · Residual · FFT)
            </span>{" "}
            with classical forensic heuristics.
          </p>

          {/* Pipeline badges */}
          <div className="flex flex-wrap justify-center gap-2 mt-6">
            {[
              { icon: <Cpu className="w-3 h-3" />, label: "DL Inference" },
              { icon: <Scan className="w-3 h-3" />, label: "Residual Analysis" },
              { icon: <Microscope className="w-3 h-3" />, label: "Forensic Heuristics" },
              { icon: <Zap className="w-3 h-3" />, label: "Fusion Layer" },
            ].map((b) => (
              <div
                key={b.label}
                className="flex items-center gap-1 px-3 py-1 rounded-full text-xs bg-purple-500/20 text-purple-300 border border-purple-500/40"
              >
                {b.icon}
                {b.label}
              </div>
            ))}
          </div>
        </motion.div>

        {/* Upload section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 mb-8"
        >
          <div className="text-center">
            <ImageIcon className="w-12 h-12 text-purple-400 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-white mb-2">Upload Image</h2>
            <p className="text-gray-400 text-sm mb-6">
              JPEG · PNG · WebP — max 10 MB
            </p>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleFileChange}
              className="hidden"
            />

            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={isProcessing}
              className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white px-8 py-3"
            >
              <Upload className="w-4 h-4 mr-2" />
              Choose Image
            </Button>

            {selectedImage && (
              <div className="mt-6">
                <img
                  src={selectedImage}
                  alt="Selected"
                  className="max-w-full max-h-64 mx-auto rounded-xl shadow-2xl"
                />
                <p className="text-gray-400 text-xs mt-2">{selectedFile?.name}</p>
                <Button
                  onClick={handleAnalyze}
                  disabled={isProcessing}
                  className="mt-4 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 text-white px-10 py-3 text-base"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Analyzing…
                    </>
                  ) : (
                    <>
                      <Brain className="w-4 h-4 mr-2" />
                      Run Hybrid Analysis
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>
        </motion.div>

        {/* Error */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="bg-red-500/20 border border-red-500/50 rounded-xl p-5 mb-8 flex items-start gap-3"
            >
              <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-red-300 font-semibold">Detection failed</p>
                <p className="text-red-400 text-sm mt-1">{error}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Results */}
        <AnimatePresence>
          {result && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              {/* Uploaded image preview */}
              {selectedImage && (
                <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 flex flex-col items-center gap-3">
                  <p className="text-xs uppercase tracking-widest text-gray-400 font-medium">
                    Uploaded Image Preview
                  </p>
                  <img
                    src={selectedImage}
                    alt="Uploaded preview"
                    className="max-h-[300px] w-auto rounded-xl object-contain shadow-2xl ring-1 ring-white/10"
                  />
                  {selectedFile && (
                    <p className="text-xs text-gray-500">{selectedFile.name}</p>
                  )}
                </div>
              )}

              {/* Verdict card */}
              <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 text-center">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", delay: 0.1 }}
                  className="flex justify-center mb-4"
                >
                  {verdictIcon}
                </motion.div>
                <h2 className={`text-3xl font-bold mb-2 ${verdictColor}`}>
                  {verdict}
                </h2>
                <p className="text-gray-400 text-sm">
                  AI probability:{" "}
                  <span className={`font-bold ${probabilityColor(result.ai_probability)}`}>
                    {pct(result.ai_probability)}
                  </span>
                  {"  ·  "}Camera probability:{" "}
                  <span className={`font-bold ${probabilityColor(result.camera_probability)}`}>
                    {pct(result.camera_probability)}
                  </span>
                </p>
                <div className="flex flex-wrap justify-center gap-3 mt-4 text-xs text-gray-500">
                  <span>Model: {result.model_version}</span>
                  <span>·</span>
                  <span>Device: {result.device_used}</span>
                  <span>·</span>
                  <span>{result.processing_time_ms.toFixed(0)} ms</span>
                  {!result.dl_available && (
                    <>
                      <span>·</span>
                      <span className="text-yellow-400">Forensic-only mode (DL unavailable)</span>
                    </>
                  )}
                </div>
              </div>

              {/* Four confidence scores */}
              <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6">
                <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
                  <Zap className="w-4 h-4 text-purple-400" />
                  Detection Confidence Breakdown
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <ConfidenceBar
                    label="Deep Learning Confidence"
                    icon={<Cpu className="w-4 h-4 text-purple-400" />}
                    value={result.dl_confidence}
                    color={probabilityColor(result.dl_confidence)}
                    description="How certain the trained DL model is (RGB + residual + FFT branches)"
                  />
                  <ConfidenceBar
                    label="Forensic Confidence"
                    icon={<Microscope className="w-4 h-4 text-cyan-400" />}
                    value={result.forensic_confidence}
                    color={probabilityColor(result.forensic_confidence)}
                    description="How certain heuristic detectors are (noise, JPEG artifacts, frequency analysis)"
                  />
                  <ConfidenceBar
                    label="Fusion Confidence"
                    icon={<Zap className="w-4 h-4 text-yellow-400" />}
                    value={result.fusion_confidence}
                    color={probabilityColor(result.fusion_confidence)}
                    description="Combined weighted-fusion confidence across all four evidence streams"
                  />
                  <ConfidenceBar
                    label="AI Probability (final)"
                    icon={<Brain className="w-4 h-4 text-red-400" />}
                    value={result.ai_probability}
                    color={probabilityColor(result.ai_probability)}
                    description="Final fused AI-generated probability (0% = definitely real, 100% = definitely AI)"
                  />
                </div>
              </div>

              {/* Dominant signals */}
              {result.dominant_signals.length > 0 && (
                <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6">
                  <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
                    <Scan className="w-4 h-4 text-blue-400" />
                    Dominant Detection Reasons
                  </h3>
                  <ul className="space-y-2">
                    {result.dominant_signals.map((sig, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
                        <span className="text-purple-400 mt-0.5">›</span>
                        <span>{sig}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Raw signal breakdown (collapsible) */}
              <div className="bg-white/10 backdrop-blur-lg rounded-2xl overflow-hidden">
                <button
                  onClick={() => setShowRaw((v) => !v)}
                  className="w-full flex items-center justify-between p-5 text-white hover:bg-white/5 transition-colors"
                >
                  <span className="font-semibold text-sm flex items-center gap-2">
                    <Microscope className="w-4 h-4 text-gray-400" />
                    Raw Signal Scores
                  </span>
                  {showRaw ? (
                    <ChevronUp className="w-4 h-4 text-gray-400" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-gray-400" />
                  )}
                </button>

                <AnimatePresence>
                  {showRaw && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="px-5 pb-5 grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Branch score breakdown */}
                        <div className="bg-black/30 rounded-xl p-4">
                          <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">
                            Per-Branch AI Scores
                          </p>
                          <SignalRow label="CNN — RGB branch" value={result.branch_scores.cnn_score} />
                          <SignalRow label="Residual — noise branch" value={result.branch_scores.residual_score} />
                          <SignalRow label="FFT — frequency branch" value={result.branch_scores.fft_score} />
                          <SignalRow label="Forensic heuristics" value={result.branch_scores.forensic_score} />
                          <SignalRow label="Metadata reliability" value={result.branch_scores.metadata_score} />
                        </div>

                        {/* Residual stats */}
                        {result.residual_stats && (
                          <div className="bg-black/30 rounded-xl p-4">
                            <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">
                              Residual Fingerprint Stats
                            </p>
                            <SignalRow label="Mean absolute deviation" value={result.residual_stats.residual_mean_abs / 255} />
                            <SignalRow label="Std deviation" value={result.residual_stats.residual_std / 255} />
                            <SignalRow label="Kurtosis (norm)" value={Math.min(result.residual_stats.residual_kurtosis / 10, 1)} />
                            <SignalRow label="Channel correlation" value={Math.abs(result.residual_stats.channel_correlation)} />
                          </div>
                        )}

                        {/* Forensic signals */}
                        <div className="bg-black/30 rounded-xl p-4">
                          <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">
                            Forensic Detector Output
                          </p>
                          <SignalRow label="AI probability" value={result.forensic_signals.ai_probability} />
                          <SignalRow label="Camera probability" value={result.forensic_signals.camera_probability} />
                          <SignalRow label="Screenshot probability" value={result.forensic_signals.screenshot_probability} />
                          <div className="flex justify-between items-center py-1 border-b border-white/5 last:border-0">
                            <span className="text-gray-400 text-xs">Has camera metadata</span>
                            <span className={`text-xs font-mono font-bold ${result.forensic_signals.metadata_detected ? "text-green-400" : "text-red-400"}`}>
                              {result.forensic_signals.metadata_detected ? "Yes" : "No"}
                            </span>
                          </div>
                          <div className="flex justify-between items-center py-1">
                            <span className="text-gray-400 text-xs">Prediction</span>
                            <span className="text-xs font-mono text-white">
                              {result.forensic_signals.prediction}
                            </span>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default AIDetectionTest;
