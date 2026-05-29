import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Upload,
  Camera,
  Shield,
  Download,
  CheckCircle,
  AlertCircle,
  FileText,
  Lock,
  Share2,
  Copy,
  BarChart2,
  ExternalLink,
} from "lucide-react";
import { embedAdvancedWatermark, type AdvancedWatermarkMetadata } from "@/lib/advancedSteganography";
import { embedSimpleWatermark, type SimpleWatermarkMetadata } from "@/lib/simpleSteganography";
import { appStorage } from "@/lib/storage";
import { CameraCapture } from "@/components/CameraCapture";

// ─────────────────────────────────────────────────────────────────────────────
// Types — unchanged image result + new document result fields
// ─────────────────────────────────────────────────────────────────────────────

interface EncryptionResult {
  success: boolean;
  // Image steganography output (unchanged)
  processedImage?: string;
  metadata?: AdvancedWatermarkMetadata | SimpleWatermarkMetadata;
  // Document vault-upload output (new)
  assetId?: string;
  fileName?: string;
  fileSize?: string;
  fileType?: string;
  error?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// File-type helpers
// ─────────────────────────────────────────────────────────────────────────────

/** MIME types and extensions that are treated as images (use steganography path). */
const IMAGE_MIME_PREFIXES = ["image/jpeg", "image/png", "image/webp", "image/tiff", "image/bmp", "image/gif"];
const IMAGE_EXTENSIONS    = new Set(["jpg", "jpeg", "png", "webp", "tiff", "tif", "bmp", "gif"]);

function isImageFile(file: File): boolean {
  if (IMAGE_MIME_PREFIXES.some(m => file.type === m)) return true;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return IMAGE_EXTENSIONS.has(ext);
}

/** Human-readable label for the file type badge. */
function fileLabel(file: File): string {
  const ext = file.name.split(".").pop()?.toUpperCase() ?? "FILE";
  if (file.type === "application/pdf" || ext === "PDF")  return "PDF";
  if (file.type === "application/msword" || ext === "DOC")  return "DOC";
  if (file.type.includes("wordprocessingml") || ext === "DOCX") return "DOCX";
  if (file.type === "text/plain" || ext === "TXT")  return "TXT";
  return ext;
}

/** Icon + colour for non-image file type. */
function DocIcon({ file, size = 16 }: { file: File; size?: number }) {
  const label = fileLabel(file);
  const colour =
    label === "PDF"  ? "text-red-400"  :
    label === "DOC"  ? "text-blue-400" :
    label === "DOCX" ? "text-blue-400" :
    label === "TXT"  ? "text-slate-300" :
    "text-purple-400";

  return (
    <div className="flex flex-col items-center gap-2">
      <FileText style={{ width: size, height: size }} className={colour} />
      <span className={`text-xs font-bold uppercase tracking-wider ${colour}`}>{label}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Backend URL (mirrors dlInferenceClient pattern)
// ─────────────────────────────────────────────────────────────────────────────

const BACKEND_URL: string =
  (import.meta as any).env?.VITE_BACKEND_URL ||
  (typeof window !== "undefined" && window.location.hostname === "localhost"
    ? "http://localhost:8000"
    : "");

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

const Encrypt = () => {
  const navigate = useNavigate();

  // ── Existing image state (unchanged) ──────────────────────────────────────
  const [selectedImage, setSelectedImage]       = useState<string | null>(null);
  const [isProcessing, setIsProcessing]         = useState(false);
  const [encryptionResult, setEncryptionResult] = useState<EncryptionResult | null>(null);
  const [encryptionMode, setEncryptionMode]     = useState<"advanced" | "simple">("advanced");
  const [showCameraModal, setShowCameraModal]   = useState(false);

  const fileInputRef   = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // ── New state for document support ────────────────────────────────────────
  const [selectedFile, setSelectedFile]     = useState<File | null>(null);
  const [fileCategory, setFileCategory]     = useState<"image" | "document" | null>(null);

  // ── Share link state ───────────────────────────────────────────────────────
  const [shareToken, setShareToken]         = useState<string | null>(null);
  const [shareLoading, setShareLoading]     = useState(false);
  const [shareError, setShareError]         = useState<string | null>(null);
  const [shareCopied, setShareCopied]       = useState(false);

  // ── Existing image helpers (unchanged) ────────────────────────────────────

  const handleImageSelect = (imageData: string) => {
    setSelectedImage(imageData);
    setEncryptionResult(null);
  };

  // ── File upload handler — routes image vs document ────────────────────────

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setEncryptionResult(null);

    if (isImageFile(file)) {
      // ── Image path: identical to original handleFileUpload ──────────────
      setFileCategory("image");
      const reader = new FileReader();
      reader.onload = (e) => {
        if (e.target?.result) handleImageSelect(e.target.result as string);
      };
      reader.readAsDataURL(file);
    } else {
      // ── Document path: store file reference only ────────────────────────
      setFileCategory("document");
      setSelectedImage(null);
    }
  };

  // ── Camera (unchanged) ───────────────────────────────────────────────────

  const handleCameraCapture = () => setShowCameraModal(true);

  const handleCameraCaptureComplete = (imageData: string) => {
    setSelectedImage(imageData);
    setSelectedFile(null);
    setFileCategory("image");
    setEncryptionResult(null);
    setShowCameraModal(false);
  };

  // ── Image steganography (unchanged, verbatim from original) ──────────────

  const processImageEncryption = async () => {
    if (!selectedImage) return;

    setIsProcessing(true);
    setEncryptionResult(null);

    try {
      const realUserId =
        localStorage.getItem("pinit_user_id") ||
        localStorage.getItem("biovault_userId") ||      // camelCase — written by auth/logout
        localStorage.getItem("biovault_user_id") ||    // underscore — legacy
        "USR-UNKNOWN";

      console.log("[ENCRYPT] Logged in user:", realUserId);

      let result: EncryptionResult;

      if (encryptionMode === "advanced") {
        const processedImage = await embedAdvancedWatermark(selectedImage, realUserId);
        result = {
          success: true,
          processedImage,
          metadata: {
            userId: realUserId,
            gps: { available: false, source: "Unknown" },
            timestamp: new Date().toISOString(),
            deviceId: null,
            deviceName: null,
            ipAddress: null,
            deviceSource: "Unknown",
            ipSource: "Unknown",
            gpsSource: "Unknown",
            originalResolution: null,
            confidence: "High",
            found: true,
            pinitEncrypted: true,
          },
        };
      } else {
        const processedImage = await embedSimpleWatermark(
          selectedImage,
          realUserId,
          new Date().toISOString()
        );
        result = {
          success: true,
          processedImage,
          metadata: {
            userId: realUserId,
            timestamp: new Date().toISOString(),
            method: "simple",
            pinitEncrypted: true,
          },
        };
      }

      console.log("[ENCRYPT] Embedded user ID:", realUserId);
      setEncryptionResult(result);

      // Store encryption result for recent activity (unchanged)
      const recentActivity = {
        id: Date.now().toString(),
        type: "encryption",
        fileName: `encrypted_image_${Date.now()}.jpg`,
        timestamp: new Date().toISOString(),
        mode: encryptionMode,
        status: "success",
      };
      const existing   = localStorage.getItem("recentVerifications");
      const activities = existing ? JSON.parse(existing) : [];
      activities.unshift(recentActivity);
      localStorage.setItem("recentVerifications", JSON.stringify(activities.slice(0, 10)));
    } catch (error) {
      console.error("Encryption failed:", error);
      setEncryptionResult({
        success: false,
        error: error instanceof Error ? error.message : "Encryption failed",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // ── Document vault upload (new — calls existing /vault/upload endpoint) ──

  const uploadDocument = async () => {
    if (!selectedFile) return;

    setIsProcessing(true);
    setEncryptionResult(null);

    try {
      // Check all known key variants so we match whatever the auth module stored
      const realUserId =
        localStorage.getItem("pinit_user_id") ||
        localStorage.getItem("biovault_userId") ||      // camelCase — used by auth/logout
        localStorage.getItem("biovault_user_id") ||    // underscore — legacy key
        "USR-UNKNOWN";

      const fileSizeKB = (selectedFile.size / 1024).toFixed(1);
      console.log("[ENCRYPT] encryption started —", selectedFile.name,
                  `| ${fileSizeKB} KB | ${selectedFile.type} | user: ${realUserId}`);

      const form = new FormData();
      form.append("file", selectedFile, selectedFile.name);   // explicit filename for MIME detection
      form.append("user_id", realUserId);

      const res = await fetch(`${BACKEND_URL}/vault/upload`, {
        method: "POST",
        body: form,
        // ⚠️ Do NOT set Content-Type here — the browser must set the multipart
        // boundary automatically, otherwise the server can't parse form fields.
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
        throw new Error(err.detail || `Upload failed: ${res.status}`);
      }

      const data = await res.json();
      console.log("[ENCRYPT] encrypted size —", data.encrypted_size,
                  `| method: ${data.encryption || "AES-256-GCM"}`);
      console.log("[ENCRYPT] upload success — asset_id:", data.asset_id,
                  "| file:", data.file_name, "| vault stored as encrypted binary");

      setEncryptionResult({
        success:  true,
        assetId:  data.asset_id,
        fileName: data.file_name,
        fileSize: data.file_size,
        fileType: data.file_type,
      });

      // Activity log (same shape as image path)
      const recentActivity = {
        id:        Date.now().toString(),
        type:      "encryption",
        fileName:  data.file_name,
        timestamp: new Date().toISOString(),
        mode:      "vault-upload",
        status:    "success",
      };
      const existing   = localStorage.getItem("recentVerifications");
      const activities = existing ? JSON.parse(existing) : [];
      activities.unshift(recentActivity);
      localStorage.setItem("recentVerifications", JSON.stringify(activities.slice(0, 10)));
    } catch (error) {
      console.error("Document upload failed:", error);
      setEncryptionResult({
        success: false,
        error: error instanceof Error ? error.message : "Upload failed",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // ── Dispatcher: routes to the right processing path ──────────────────────

  const processEncryption = () => {
    if (fileCategory === "image") return processImageEncryption();
    if (fileCategory === "document") return uploadDocument();
  };

  // ── Image download (unchanged) ────────────────────────────────────────────

  const downloadImage = () => {
    if (encryptionResult?.processedImage) {
      const link = document.createElement("a");
      link.href = encryptionResult.processedImage;
      link.download = `encrypted_image_${Date.now()}.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  // ── Download encrypted document from vault ────────────────────────────────

  const downloadDocument = async () => {
    if (!encryptionResult?.assetId) return;

    const realUserId =
      localStorage.getItem("pinit_user_id") ||
      localStorage.getItem("biovault_user_id") ||
      "USR-UNKNOWN";

    const url = `${BACKEND_URL}/vault/${encryptionResult.assetId}/download?user_id=${encodeURIComponent(realUserId)}`;
    const link = document.createElement("a");
    link.href = url;
    link.download = encryptionResult.fileName ?? "document";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // ── Create share link for vaulted document ────────────────────────────────

  const shareDocument = async () => {
    if (!encryptionResult?.assetId) return;
    setShareLoading(true);
    setShareError(null);

    try {
      const realUserId =
        localStorage.getItem("pinit_user_id") ||
        localStorage.getItem("biovault_userId") ||
        localStorage.getItem("biovault_user_id") ||
        "USR-UNKNOWN";

      const res = await fetch(`${BACKEND_URL}/resume/share/create`, {
        method : "POST",
        headers: { "Content-Type": "application/json" },
        body   : JSON.stringify({ asset_id: encryptionResult.assetId, user_id: realUserId }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
        throw new Error(err.detail || "Failed to create share link");
      }

      const data = await res.json();
      setShareToken(data.share_token);
    } catch (error) {
      setShareError(error instanceof Error ? error.message : "Failed to create share link");
    } finally {
      setShareLoading(false);
    }
  };

  // ── Copy share link to clipboard ──────────────────────────────────────────

  const copyShareLink = () => {
    if (!shareToken) return;
    const url = `${window.location.origin}/shared-view/${shareToken}`;
    navigator.clipboard.writeText(url).then(() => {
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2500);
    });
  };

  // ── Reset (extended to clear new state) ──────────────────────────────────

  const resetForm = () => {
    setSelectedImage(null);
    setSelectedFile(null);
    setFileCategory(null);
    setEncryptionResult(null);
    setShareToken(null);
    setShareError(null);
    setShareCopied(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ── Derived display helpers ───────────────────────────────────────────────

  const hasSelection = selectedImage !== null || selectedFile !== null;
  const isDoc        = fileCategory === "document";

  const buttonLabel = isProcessing
    ? isDoc ? "Uploading…" : "Processing…"
    : isDoc ? "Secure Upload & Encrypt"
            : encryptionMode === "advanced" ? "Encrypt Image" : "Encrypt Image";

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-black text-white">

      {/* ── Header (unchanged) ─────────────────────────────────────────────── */}
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
              <h1 className="text-lg font-semibold text-white">Secure Encryption</h1>
              <p className="text-xs text-cyan-300">Watermark images · Encrypt & vault documents</p>
            </div>
          </div>
          <Shield className="w-6 h-6 text-cyan-400" />
        </div>
      </motion.div>

      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {!encryptionResult ? (
          <>
            {/* ── Encryption mode selector — shown for images only ──────── */}
            {(!hasSelection || fileCategory === "image") && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-8"
              >
                <h2 className="text-xl font-semibold mb-4 text-white">Choose Encryption Mode</h2>
                <div className="grid md:grid-cols-2 gap-4">
                  <button
                    onClick={() => setEncryptionMode("advanced")}
                    className={`p-4 rounded-lg border transition-all ${
                      encryptionMode === "advanced"
                        ? "bg-cyan-600/20 border-cyan-500/50 text-cyan-300"
                        : "bg-slate-800/50 border-slate-700/50 text-gray-300 hover:bg-slate-800/70"
                    }`}
                  >
                    <h3 className="font-semibold mb-2">Advanced Encryption</h3>
                    <p className="text-sm opacity-80">
                      Multi-layer watermarking with enhanced security features
                    </p>
                  </button>
                  <button
                    onClick={() => setEncryptionMode("simple")}
                    className={`p-4 rounded-lg border transition-all ${
                      encryptionMode === "simple"
                        ? "bg-purple-600/20 border-purple-500/50 text-purple-300"
                        : "bg-slate-800/50 border-slate-700/50 text-gray-300 hover:bg-slate-800/70"
                    }`}
                  >
                    <h3 className="font-semibold mb-2">Simple Encryption</h3>
                    <p className="text-sm opacity-80">
                      Basic watermarking for quick protection
                    </p>
                  </button>
                </div>
              </motion.div>
            )}

            {/* ── Document mode banner ─────────────────────────────────── */}
            {fileCategory === "document" && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-8 bg-cyan-900/20 border border-cyan-700/40 rounded-xl p-4 flex items-center gap-3"
              >
                <Lock className="w-5 h-5 text-cyan-400 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-cyan-300">Secure Vault Storage</p>
                  <p className="text-xs text-cyan-400/70">
                    Your file will be encrypted and stored securely in your personal vault.
                    Pixel-level watermarking is available for image files only.
                  </p>
                </div>
              </motion.div>
            )}

            {/* ── Upload area ───────────────────────────────────────────── */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              {!hasSelection ? (
                /* ── Drop / pick zone ───────────────────────────────────── */
                <div className="bg-slate-800/50 border-2 border-dashed border-slate-700/50 rounded-2xl p-12 text-center">
                  <div className="flex flex-col items-center gap-4">
                    <Upload className="w-16 h-16 text-slate-500" />
                    <div>
                      <h3 className="text-xl font-semibold text-white mb-2">
                        Select File to Encrypt
                      </h3>
                      <p className="text-slate-400 mb-1">
                        Images are watermarked · Documents are encrypted and vaulted
                      </p>
                      <p className="text-slate-500 text-xs">
                        JPG · PNG · WEBP · TIFF · BMP · PDF · DOC · DOCX · TXT
                      </p>
                    </div>

                    <div className="flex gap-4 flex-wrap justify-center mt-2">
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
                    </div>

                    {/* Camera modal (unchanged) */}
                    {showCameraModal && (
                      <CameraCapture
                        onCapture={handleCameraCaptureComplete}
                        onClose={() => setShowCameraModal(false)}
                      />
                    )}

                    {/* Hidden file inputs */}
                    {/* Accept all file types — backend handles MIME validation */}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="*/*"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                    {/* Camera input — images only (unchanged) */}
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
                /* ── File selected: preview + action ───────────────────── */
                <div className="space-y-6">
                  <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold text-white">
                        {fileCategory === "image" ? "Selected Image" : "Selected File"}
                      </h3>
                      <button
                        onClick={resetForm}
                        className="text-slate-400 hover:text-white transition-colors text-sm"
                      >
                        Clear
                      </button>
                    </div>

                    <div className="bg-slate-900/50 rounded-lg overflow-hidden">
                      {fileCategory === "image" && selectedImage ? (
                        /* ── Image preview (identical to original) ──────── */
                        <img
                          src={selectedImage}
                          alt="Selected for encryption"
                          className="w-full h-64 object-contain"
                        />
                      ) : (
                        /* ── Document preview placeholder ───────────────── */
                        <div className="flex flex-col items-center justify-center h-64 gap-4">
                          {selectedFile && <DocIcon file={selectedFile} size={64} />}
                          <div className="text-center">
                            <p className="text-white font-medium text-sm">
                              {selectedFile?.name}
                            </p>
                            <p className="text-slate-400 text-xs mt-1">
                              {selectedFile
                                ? `${(selectedFile.size / 1024).toFixed(0)} KB · ${fileLabel(selectedFile)}`
                                : ""}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex justify-center">
                    <button
                      onClick={processEncryption}
                      disabled={isProcessing}
                      className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 disabled:opacity-50 text-white px-8 py-4 rounded-lg transition-all flex items-center gap-3 text-lg font-semibold"
                    >
                      <Shield className="w-5 h-5" />
                      {buttonLabel}
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </>
        ) : (
          /* ── Results section ──────────────────────────────────────────── */
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            {encryptionResult.success ? (
              <div className="bg-green-900/20 border border-green-500/30 rounded-2xl p-6 text-center">
                <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />

                {/* ── Image success (unchanged labels) ─────────────────── */}
                {encryptionResult.processedImage ? (
                  <>
                    <h2 className="text-2xl font-bold text-green-400 mb-2">
                      Encryption Successful!
                    </h2>
                    <p className="text-green-300 mb-6">
                      Your image has been protected with {encryptionMode} watermarking
                    </p>
                    {encryptionResult.metadata && (
                      <div className="bg-slate-800/50 rounded-lg p-4 mb-6 text-left">
                        <h3 className="text-sm font-semibold text-white mb-2">Encryption Details</h3>
                        <div className="text-xs text-slate-300 space-y-1">
                          <p>Mode: {encryptionMode}</p>
                          <p>Timestamp: {new Date().toISOString()}</p>
                          <p>Watermark ID: {(encryptionResult.metadata as any).watermarkId || "N/A"}</p>
                        </div>
                      </div>
                    )}
                    <div className="flex gap-4 justify-center flex-wrap">
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
                  </>
                ) : (
                  /* ── Document success ──────────────────────────────────── */
                  <>
                    <h2 className="text-2xl font-bold text-green-400 mb-2">
                      File Encrypted &amp; Stored!
                    </h2>
                    <p className="text-green-300 mb-6">
                      Your document has been securely encrypted and saved to your vault
                    </p>
                    <div className="bg-slate-800/50 rounded-lg p-4 mb-6 text-left">
                      <h3 className="text-sm font-semibold text-white mb-2">Vault Details</h3>
                      <div className="text-xs text-slate-300 space-y-1">
                        <p>File: {encryptionResult.fileName}</p>
                        <p>Size: {encryptionResult.fileSize}</p>
                        <p>Type: {encryptionResult.fileType}</p>
                        <p>Asset ID: {encryptionResult.assetId}</p>
                        <p>Timestamp: {new Date().toISOString()}</p>
                      </div>
                    </div>

                    {/* ── Share link section ─────────────────────────────── */}
                    {!shareToken ? (
                      <div className="mb-6">
                        <button
                          onClick={shareDocument}
                          disabled={shareLoading}
                          className="w-full bg-gradient-to-r from-purple-600 to-cyan-600
                                     hover:from-purple-700 hover:to-cyan-700
                                     disabled:opacity-50 text-white px-6 py-3 rounded-lg
                                     transition-all flex items-center justify-center gap-2 font-semibold"
                        >
                          {shareLoading
                            ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            : <Share2 className="w-4 h-4" />}
                          {shareLoading ? "Creating Secure Link…" : "Share Resume Securely"}
                        </button>
                        {shareError && (
                          <p className="mt-2 text-xs text-red-400 text-center">{shareError}</p>
                        )}
                      </div>
                    ) : (
                      <div className="mb-6 bg-slate-800/60 border border-cyan-700/40 rounded-xl p-4">
                        <p className="text-xs text-cyan-400 font-semibold mb-2 flex items-center gap-1">
                          <Share2 className="w-3 h-3" /> Secure Share Link Created
                        </p>
                        <div className="flex items-center gap-2 bg-slate-950/60 rounded-lg px-3 py-2 mb-3">
                          <code className="flex-1 text-xs text-cyan-300 truncate font-mono">
                            {`${window.location.origin}/shared-view/${shareToken}`}
                          </code>
                          <button
                            onClick={copyShareLink}
                            className="shrink-0 p-1 hover:bg-slate-700 rounded transition-colors"
                          >
                            {shareCopied
                              ? <CheckCircle className="w-4 h-4 text-green-400" />
                              : <Copy className="w-4 h-4 text-slate-400" />}
                          </button>
                        </div>
                        <div className="flex gap-2">
                          <a
                            href={`/shared-view/${shareToken}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-full bg-cyan-700/30 hover:bg-cyan-700/50 border border-cyan-700/40
                                       text-cyan-300 text-xs font-medium py-2 rounded-lg transition-colors
                                       flex items-center justify-center gap-1"
                          >
                            <ExternalLink className="w-3 h-3" /> Preview Shared View
                          </a>
                        </div>
                      </div>
                    )}

                    <div className="flex gap-4 justify-center flex-wrap">
                      <button
                        onClick={downloadDocument}
                        className="bg-cyan-600 hover:bg-cyan-700 text-white px-6 py-3 rounded-lg transition-colors flex items-center gap-2"
                      >
                        <Download className="w-4 h-4" />
                        Download Encrypted File
                      </button>
                      <button
                        onClick={resetForm}
                        className="bg-slate-700 hover:bg-slate-600 text-white px-6 py-3 rounded-lg transition-colors"
                      >
                        Encrypt Another File
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              /* ── Error (unchanged) ─────────────────────────────────────── */
              <div className="bg-red-900/20 border border-red-500/30 rounded-2xl p-6 text-center">
                <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
                <h2 className="text-2xl font-bold text-red-400 mb-2">Encryption Failed</h2>
                <p className="text-red-300 mb-6">
                  {encryptionResult.error || "An error occurred during encryption"}
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
