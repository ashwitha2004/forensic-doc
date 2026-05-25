/**
 * Document Forensic Intelligence Page
 * =====================================
 * Accepts an image (JPEG/PNG/TIFF/WebP) or PDF, optionally a reference text,
 * and runs the full backend document forensics pipeline:
 *   • ELA + noise heatmap
 *   • Layout / font inconsistency
 *   • Metadata extraction & flags
 *   • OCR text extraction
 *   • Text diff vs reference (if provided)
 *
 * Route: /document-forensics
 */

import { useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  FileText,
  ImageIcon,
  Loader2,
  MapPin,
  Microscope,
  ScanLine,
  Shield,
  Upload,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";

// ─────────────────────────────────────────────────────────────────────────────
// Types (mirror backend schemas)
// ─────────────────────────────────────────────────────────────────────────────

interface RegionFlag {
  x: number; y: number; width: number; height: number;
  reason: string; severity: number;
}

interface MetadataResult {
  file_type: string; mime_type?: string; file_size_kb?: number;
  camera_make?: string; camera_model?: string; capture_datetime?: string;
  gps_present: boolean; software_tag?: string; exif_present: boolean;
  pdf_author?: string; pdf_creator?: string; pdf_producer?: string;
  pdf_creation_date?: string; pdf_modification_date?: string; pdf_page_count?: number;
  metadata_suspicious: boolean; metadata_notes: string[];
}

interface OCRResult {
  ocr_available: boolean; extracted_text?: string;
  word_count?: number; avg_confidence?: number;
}

interface TextComparisonResult {
  reference_provided: boolean; similarity_ratio?: number;
  added_words: string[]; removed_words: string[];
  changed_lines: string[]; tamper_score: number;
}

interface TamperingSignals {
  ela_score?: number; noise_inconsistency?: number;
  layout_score?: number; metadata_score: number;
  text_diff_score: number;
}

interface ForensicsResult {
  tamper_probability: number;
  verdict: "Authentic" | "Suspicious" | "Likely Tampered";
  confidence: number;
  dominant_signals: string[];
  heatmap_base64?: string;
  flagged_regions: RegionFlag[];
  metadata?: MetadataResult;
  ocr?: OCRResult;
  text_comparison?: TextComparisonResult;
  signals: TamperingSignals;
  processing_time_ms: number;
  modules_run: string[];
  warnings: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────

const BACKEND_URL: string =
  (import.meta as any).env?.VITE_BACKEND_URL ||
  (typeof window !== "undefined" && window.location.hostname === "localhost"
    ? "http://localhost:8000"
    : "");

const ANALYZE_ENDPOINT = `${BACKEND_URL}/api/document-forensics/analyze`;

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function ScoreBar({
  label, score, description,
}: { label: string; score: number | undefined; description: string }) {
  if (score === undefined || score === null) {
    return (
      <div className="bg-black/25 rounded-xl p-4">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm text-white/70 font-medium">{label}</span>
          <span className="text-xs text-slate-500">N/A</span>
        </div>
        <p className="text-xs text-slate-500">{description}</p>
      </div>
    );
  }
  const pct  = Math.round(score * 100);
  const bar  = score >= 0.6 ? "bg-red-500" : score >= 0.35 ? "bg-amber-500" : "bg-emerald-500";
  const text = score >= 0.6 ? "text-red-400" : score >= 0.35 ? "text-amber-400" : "text-emerald-400";
  return (
    <div className="bg-black/25 rounded-xl p-4">
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm text-white font-medium">{label}</span>
        <span className={`text-sm font-bold font-mono ${text}`}>{pct}%</span>
      </div>
      <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden mb-1">
        <motion.div
          className={`h-full rounded-full ${bar}`}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.7, ease: "easeOut" }}
        />
      </div>
      <p className="text-xs text-slate-400">{description}</p>
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value?: string | number | boolean }) {
  if (value === undefined || value === null) return null;
  const display = typeof value === "boolean" ? (value ? "Yes" : "No") : String(value);
  return (
    <div className="flex justify-between items-start py-1.5 border-b border-white/5 last:border-0 gap-4">
      <span className="text-xs text-slate-400 shrink-0">{label}</span>
      <span className="text-xs text-white font-mono text-right break-all">{display}</span>
    </div>
  );
}

function ExpandableSection({
  title, icon, children, defaultOpen = false,
}: {
  title: string; icon: React.ReactNode;
  children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-slate-900/60 border border-white/8 rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-2 text-white font-semibold text-sm">
          {icon}
          {title}
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page component
// ─────────────────────────────────────────────────────────────────────────────

const DocumentForensics = () => {
  const fileInputRef    = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);   // data URL for images
  const [refText, setRefText] = useState("");
  const [processing, setProcessing] = useState(false);
  const [result, setResult]         = useState<ForensicsResult | null>(null);
  const [error, setError]           = useState<string | null>(null);
  const [step, setStep]             = useState<string>("idle");  // progress label

  // ── File selection ─────────────────────────────────────────────────────────

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setResult(null);
    setError(null);

    if (f.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = ev => setPreview(ev.target?.result as string);
      reader.readAsDataURL(f);
    } else {
      setPreview(null);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (!f) return;
    setFile(f);
    setResult(null);
    setError(null);
    if (f.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = ev => setPreview(ev.target?.result as string);
      reader.readAsDataURL(f);
    } else {
      setPreview(null);
    }
  };

  const reset = () => {
    setFile(null);
    setPreview(null);
    setResult(null);
    setError(null);
    setRefText("");
    setStep("idle");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ── Analysis ───────────────────────────────────────────────────────────────

  const runAnalysis = async () => {
    if (!file) return;
    setProcessing(true);
    setResult(null);
    setError(null);

    try {
      setStep("Extracting metadata…");
      const form = new FormData();
      form.append("file", file);
      if (refText.trim()) form.append("reference_text", refText.trim());

      setStep("Running forensic pipeline…");

      const res = await fetch(ANALYZE_ENDPOINT, {
        method: "POST",
        body: form,
      });

      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try { const j = await res.json(); msg = j.detail || j.message || msg; } catch {}
        throw new Error(msg);
      }

      setStep("Processing results…");
      const data: ForensicsResult = await res.json();
      setResult(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setProcessing(false);
      setStep("idle");
    }
  };

  // ── Derived display values ─────────────────────────────────────────────────

  const verdictColor = !result ? "" :
    result.verdict === "Likely Tampered" ? "text-red-400" :
    result.verdict === "Suspicious"      ? "text-amber-400" :
    "text-emerald-400";

  const verdictIcon = !result ? null :
    result.verdict === "Likely Tampered" ? <XCircle className="w-8 h-8 text-red-400" /> :
    result.verdict === "Suspicious"      ? <AlertTriangle className="w-8 h-8 text-amber-400" /> :
    <CheckCircle className="w-8 h-8 text-emerald-400" />;

  const verdictBorder = !result ? "" :
    result.verdict === "Likely Tampered" ? "border-red-500/40" :
    result.verdict === "Suspicious"      ? "border-amber-500/40" :
    "border-emerald-500/40";

  const verdictGlow = !result ? "" :
    result.verdict === "Likely Tampered" ? "shadow-red-900/30" :
    result.verdict === "Suspicious"      ? "shadow-amber-900/30" :
    "shadow-emerald-900/30";

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white">
      <div className="max-w-4xl mx-auto px-4 py-10 space-y-8">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Microscope className="w-7 h-7 text-violet-400" />
            <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-violet-400 via-purple-300 to-fuchsia-400 bg-clip-text text-transparent">
              Document Forensic Intelligence
            </h1>
          </div>
          <p className="text-slate-400 text-sm max-w-xl mx-auto">
            Detect tampering, splicing, and forgery in images and PDF documents using
            Error Level Analysis, noise forensics, layout inspection, and OCR comparison.
          </p>
        </div>

        {/* ── Upload card ─────────────────────────────────────────────────── */}
        {!result && (
          <div className="bg-slate-900/70 border border-white/10 rounded-3xl p-6 space-y-5">

            {/* Drop zone */}
            <div
              onDrop={handleDrop}
              onDragOver={e => e.preventDefault()}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-white/15 rounded-2xl p-10 flex flex-col items-center gap-3
                         cursor-pointer hover:border-violet-500/50 hover:bg-violet-950/10 transition-all duration-200"
            >
              {preview ? (
                <img src={preview} alt="Preview" className="max-h-[200px] rounded-xl object-contain shadow-xl" />
              ) : file ? (
                <div className="flex flex-col items-center gap-2">
                  <FileText className="w-14 h-14 text-violet-400" />
                  <p className="text-white font-medium text-sm">{file.name}</p>
                </div>
              ) : (
                <>
                  <Upload className="w-12 h-12 text-slate-500" />
                  <p className="text-slate-400 text-sm font-medium">
                    Drop image or PDF here, or <span className="text-violet-400 underline">click to browse</span>
                  </p>
                  <p className="text-slate-600 text-xs">JPEG, PNG, TIFF, WebP, BMP, PDF, TXT · max 20 MB</p>
                </>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/tiff,image/webp,image/bmp,application/pdf,text/plain,.txt"
              className="hidden"
              onChange={handleFilePick}
            />

            {/* File info */}
            {file && (
              <div className="flex items-center justify-between text-xs text-slate-400 bg-black/20 rounded-xl px-4 py-2">
                <span className="font-medium text-white">{file.name}</span>
                <span>{(file.size / 1024).toFixed(0)} KB · {file.type || "unknown"}</span>
              </div>
            )}

            {/* Reference text */}
            <div className="space-y-1">
              <label className="text-xs text-slate-400 uppercase tracking-widest font-medium">
                Reference Text <span className="text-slate-600 normal-case">(optional — paste original document text for OCR comparison)</span>
              </label>
              <textarea
                value={refText}
                onChange={e => setRefText(e.target.value)}
                rows={4}
                placeholder="Paste the genuine text content of this document here…"
                className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-sm text-white
                           placeholder-slate-600 resize-none focus:outline-none focus:border-violet-500/50 transition-colors"
              />
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 bg-red-950/40 border border-red-500/30 rounded-xl px-4 py-3 text-red-300 text-sm">
                <XCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 justify-end">
              {file && (
                <Button variant="outline" onClick={reset}
                  className="border-white/15 text-slate-400 hover:text-white hover:border-white/30">
                  Clear
                </Button>
              )}
              <Button
                onClick={runAnalysis}
                disabled={!file || processing}
                className="bg-violet-600 hover:bg-violet-500 text-white font-semibold px-6"
              >
                {processing ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {step || "Analyzing…"}
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <ScanLine className="w-4 h-4" />
                    Analyze Document
                  </span>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* ── Results ─────────────────────────────────────────────────────── */}
        <AnimatePresence>
          {result && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="space-y-5"
            >
              {/* Verdict banner */}
              <div className={`bg-slate-900/80 border ${verdictBorder} rounded-3xl p-6 shadow-2xl ${verdictGlow}`}>
                <div className="flex flex-col sm:flex-row items-center gap-5">
                  <div className="flex-shrink-0">{verdictIcon}</div>
                  <div className="flex-1 text-center sm:text-left">
                    <p className="text-xs uppercase tracking-widest text-slate-400 font-medium mb-1">
                      Forensic Verdict
                    </p>
                    <h2 className={`text-3xl font-bold ${verdictColor}`}>{result.verdict}</h2>
                    <p className="text-slate-400 text-sm mt-1">
                      Tamper probability:{" "}
                      <span className={`font-bold font-mono ${verdictColor}`}>
                        {Math.round(result.tamper_probability * 100)}%
                      </span>
                      {" "}·{" "}
                      Confidence:{" "}
                      <span className="text-white font-mono">
                        {Math.round(result.confidence * 100)}%
                      </span>
                    </p>
                  </div>
                  <div className="flex-shrink-0 text-right hidden sm:block">
                    <p className="text-xs text-slate-500">{result.processing_time_ms.toFixed(0)} ms</p>
                    <p className="text-xs text-slate-600">{result.modules_run.join(", ")}</p>
                  </div>
                </div>

                {/* Dominant signals */}
                <div className="mt-4 flex flex-wrap gap-2">
                  {result.dominant_signals.map(sig => (
                    <span key={sig}
                      className="text-xs px-3 py-1 rounded-full bg-white/8 border border-white/12 text-slate-300">
                      {sig}
                    </span>
                  ))}
                </div>

                {/* Warnings */}
                {result.warnings.length > 0 && (
                  <div className="mt-3 space-y-1">
                    {result.warnings.map((w, i) => (
                      <p key={i} className="text-xs text-amber-400/80 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3 shrink-0" />{w}
                      </p>
                    ))}
                  </div>
                )}
              </div>

              {/* Heatmap + original */}
              {result.heatmap_base64 && (
                <ExpandableSection
                  title="Tamper Heatmap"
                  icon={<ImageIcon className="w-4 h-4 text-violet-400" />}
                  defaultOpen
                >
                  <div className="grid sm:grid-cols-2 gap-4 mt-1">
                    {preview && (
                      <div className="space-y-1">
                        <p className="text-xs text-slate-500 uppercase tracking-widest">Original</p>
                        <img src={preview} alt="Original" className="rounded-xl w-full object-contain max-h-64" />
                      </div>
                    )}
                    <div className="space-y-1">
                      <p className="text-xs text-slate-500 uppercase tracking-widest">Heatmap (ELA + Noise)</p>
                      <img src={result.heatmap_base64} alt="Tamper heatmap"
                        className="rounded-xl w-full object-contain max-h-64" />
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-slate-500">
                    Red/warm areas indicate elevated Error Level Analysis residuals or noise inconsistency.
                    Genuine photographs show uniform heatmaps; tampered regions appear as distinct hot spots.
                  </p>

                  {/* Flagged regions */}
                  {result.flagged_regions.length > 0 && (
                    <div className="mt-4 space-y-2">
                      <p className="text-xs uppercase tracking-widest text-slate-400 font-medium">
                        Flagged Regions ({result.flagged_regions.length})
                      </p>
                      {result.flagged_regions.map((r, i) => (
                        <div key={i}
                          className="flex items-center justify-between bg-black/20 rounded-lg px-4 py-2 text-xs">
                          <span className="text-slate-300 flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-red-400" />
                            {r.x},{r.y} — {r.width}×{r.height}px
                          </span>
                          <span className={`font-mono font-bold ${r.severity >= 0.6 ? "text-red-400" : "text-amber-400"}`}>
                            {Math.round(r.severity * 100)}% suspicious
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </ExpandableSection>
              )}

              {/* Signal breakdown */}
              <ExpandableSection
                title="Signal Breakdown"
                icon={<Shield className="w-4 h-4 text-blue-400" />}
                defaultOpen
              >
                <div className="grid sm:grid-cols-2 gap-3 mt-1">
                  <ScoreBar
                    label="ELA (Error Level Analysis)"
                    score={result.signals.ela_score}
                    description="Re-compression residual — detects spliced regions"
                  />
                  <ScoreBar
                    label="Noise Inconsistency"
                    score={result.signals.noise_inconsistency}
                    description="Sensor noise pattern mismatch across image blocks"
                  />
                  <ScoreBar
                    label="Layout Inconsistency"
                    score={result.signals.layout_score}
                    description="Sharpness / font variance between document regions"
                  />
                  <ScoreBar
                    label="Metadata Anomaly"
                    score={result.signals.metadata_score}
                    description="Missing or suspicious EXIF / PDF metadata"
                  />
                  <ScoreBar
                    label="Text Content Mismatch"
                    score={result.signals.text_diff_score}
                    description="OCR vs reference text dissimilarity"
                  />
                </div>
              </ExpandableSection>

              {/* Metadata */}
              {result.metadata && (
                <ExpandableSection
                  title="Metadata"
                  icon={<FileText className="w-4 h-4 text-cyan-400" />}
                >
                  {result.metadata.metadata_suspicious && (
                    <div className="mb-3 flex items-center gap-2 bg-amber-950/40 border border-amber-600/30 rounded-xl px-4 py-2 text-amber-300 text-xs">
                      <AlertTriangle className="w-3 h-3 shrink-0" />
                      Suspicious metadata detected
                    </div>
                  )}
                  <div className="space-y-0 divide-y divide-white/5">
                    <MetaRow label="File type"       value={result.metadata.file_type} />
                    <MetaRow label="MIME"             value={result.metadata.mime_type} />
                    <MetaRow label="File size"        value={result.metadata.file_size_kb ? `${result.metadata.file_size_kb} KB` : undefined} />
                    <MetaRow label="EXIF present"     value={result.metadata.exif_present} />
                    <MetaRow label="Camera make"      value={result.metadata.camera_make} />
                    <MetaRow label="Camera model"     value={result.metadata.camera_model} />
                    <MetaRow label="Captured"         value={result.metadata.capture_datetime} />
                    <MetaRow label="GPS"              value={result.metadata.gps_present} />
                    <MetaRow label="Software"         value={result.metadata.software_tag} />
                    <MetaRow label="PDF author"       value={result.metadata.pdf_author} />
                    <MetaRow label="PDF creator"      value={result.metadata.pdf_creator} />
                    <MetaRow label="PDF producer"     value={result.metadata.pdf_producer} />
                    <MetaRow label="PDF created"      value={result.metadata.pdf_creation_date} />
                    <MetaRow label="PDF modified"     value={result.metadata.pdf_modification_date} />
                    <MetaRow label="PDF pages"        value={result.metadata.pdf_page_count} />
                  </div>
                  {result.metadata.metadata_notes.length > 0 && (
                    <div className="mt-3 space-y-1">
                      {result.metadata.metadata_notes.map((n, i) => (
                        <p key={i} className="text-xs text-slate-400 flex items-start gap-1">
                          <span className="text-violet-400 mt-0.5">•</span>{n}
                        </p>
                      ))}
                    </div>
                  )}
                </ExpandableSection>
              )}

              {/* OCR text */}
              {result.ocr?.ocr_available && result.ocr.extracted_text && (
                <ExpandableSection
                  title={`OCR Extracted Text${result.ocr.word_count ? ` (${result.ocr.word_count} words)` : ""}`}
                  icon={<ScanLine className="w-4 h-4 text-emerald-400" />}
                >
                  {result.ocr.avg_confidence !== undefined && (
                    <p className="text-xs text-slate-500 mb-2">
                      Average character confidence: <span className="text-white font-mono">{result.ocr.avg_confidence?.toFixed(1)}%</span>
                    </p>
                  )}
                  <pre className="bg-black/30 rounded-xl p-4 text-xs text-slate-300 whitespace-pre-wrap max-h-72 overflow-y-auto font-mono leading-relaxed">
                    {result.ocr.extracted_text}
                  </pre>
                </ExpandableSection>
              )}

              {/* Text comparison */}
              {result.text_comparison?.reference_provided && (
                <ExpandableSection
                  title={`Text Comparison — ${Math.round((result.text_comparison.similarity_ratio ?? 0) * 100)}% match`}
                  icon={<FileText className="w-4 h-4 text-amber-400" />}
                >
                  <div className="space-y-3">
                    <ScoreBar
                      label="Content Mismatch Score"
                      score={result.text_comparison.tamper_score}
                      description="Higher score = more divergence from reference text"
                    />

                    {result.text_comparison.removed_words.length > 0 && (
                      <div>
                        <p className="text-xs text-red-400 uppercase tracking-widest mb-1 font-medium">
                          Words removed from reference ({result.text_comparison.removed_words.length})
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {result.text_comparison.removed_words.map((w, i) => (
                            <span key={i} className="text-xs bg-red-950/40 border border-red-600/30 text-red-300 px-2 py-0.5 rounded-full">
                              {w}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {result.text_comparison.added_words.length > 0 && (
                      <div>
                        <p className="text-xs text-emerald-400 uppercase tracking-widest mb-1 font-medium">
                          Words added vs reference ({result.text_comparison.added_words.length})
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {result.text_comparison.added_words.map((w, i) => (
                            <span key={i} className="text-xs bg-emerald-950/40 border border-emerald-600/30 text-emerald-300 px-2 py-0.5 rounded-full">
                              {w}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {result.text_comparison.changed_lines.length > 0 && (
                      <div>
                        <p className="text-xs text-slate-400 uppercase tracking-widest mb-1 font-medium">
                          Changed lines
                        </p>
                        <pre className="bg-black/30 rounded-xl p-3 text-xs font-mono max-h-56 overflow-y-auto leading-relaxed">
                          {result.text_comparison.changed_lines.map((line, i) => (
                            <span key={i}
                              className={
                                line.startsWith("-") ? "text-red-400" :
                                line.startsWith("+") ? "text-emerald-400" :
                                "text-slate-400"
                              }
                            >
                              {line}{"\n"}
                            </span>
                          ))}
                        </pre>
                      </div>
                    )}
                  </div>
                </ExpandableSection>
              )}

              {/* Analyze another */}
              <div className="flex justify-center pt-2">
                <Button variant="outline" onClick={reset}
                  className="border-white/15 text-slate-400 hover:text-white hover:border-white/30">
                  Analyze Another Document
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default DocumentForensics;
