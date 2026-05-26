/**
 * Document Forensic Intelligence — Unified Engine
 * ================================================
 * Single entry-point for ALL forensic verification:
 *   • AI-generated image / document detection  (CNN · Residual · FFT)
 *   • ELA tamper heatmap + flagged-region overlay
 *   • Noise inconsistency analysis
 *   • Layout / font inconsistency
 *   • Metadata extraction and anomaly detection
 *   • OCR text extraction + reference comparison
 *   • Per-page PDF deep-analysis
 *
 * Supported:  JPG · JPEG · PNG · WEBP · BMP · TIFF · PDF · DOC · DOCX · TXT
 * Backend:    POST /api/unified-forensics/analyze
 * Route:      /document-forensics
 */

import { useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle,
  ArrowLeft,
  Brain,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Cpu,
  FileText,
  ImageIcon,
  Loader2,
  MapPin,
  Microscope,
  ScanLine,
  Shield,
  Upload,
  XCircle,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { getBackendUrl } from "@/lib/backendUrl";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PageResult {
  page: number;
  ai_probability: number;
  camera_probability: number;
  fusion_confidence: number;
  error?: string | null;
}

interface FlaggedRegion {
  x: number; y: number; w: number; h: number;
  severity: number; label?: string | null;
}

interface MetadataResult {
  software?: string | null;
  creation_date?: string | null;
  modification_date?: string | null;
  suspicious_flags?: string[];
  raw?: Record<string, unknown> | null;
}

interface OCRResult {
  text?: string | null;
  word_count?: number;
  confidence?: number;
  language?: string | null;
}

interface UnifiedResponse {
  verdict: string;
  fused_score: number;
  confidence: number;
  ai_probability: number;       // 0-100
  doc_tamper_prob: number;      // 0-1
  dominant_signals: string[];
  signal_breakdown: Record<string, any>;
  ai_branch_used: boolean;
  doc_branch_used: boolean;
  ai_error?: string | null;
  doc_error?: string | null;
  page_results: PageResult[];
  page_count: number;
  heatmap_base64?: string | null;
  flagged_regions: FlaggedRegion[];
  metadata?: MetadataResult | null;
  ocr?: OCRResult | null;
  file_type: string;
  filename: string;
  file_size_kb: number;
  processing_time_ms: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ACCEPTED_EXT = ".jpg,.jpeg,.png,.webp,.bmp,.tiff,.tif,.pdf,.txt,.doc,.docx";
const MAX_SIZE_MB  = 30;

const FILE_TYPE_LABELS: Record<string, string> = {
  "image/jpeg":       "JPEG",
  "image/png":        "PNG",
  "image/webp":       "WebP",
  "image/bmp":        "BMP",
  "image/tiff":       "TIFF",
  "application/pdf":  "PDF",
  "text/plain":       "TXT",
  "application/msword": "DOC",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "DOCX",
};

// ─── Verdict helpers ──────────────────────────────────────────────────────────

function verdictStyle(verdict: string): {
  color: string; border: string; glow: string; icon: React.ReactNode;
} {
  const v = verdict.toLowerCase();
  if (v.includes("authentic") || v.includes("clean")) return {
    color:  "text-emerald-400",
    border: "border-emerald-500/40",
    glow:   "shadow-emerald-900/30",
    icon:   <CheckCircle className="w-9 h-9 text-emerald-400" />,
  };
  if (v.includes("ai") || v.includes("synthetic") || v.includes("generated")) return {
    color:  "text-violet-400",
    border: "border-violet-500/40",
    glow:   "shadow-violet-900/30",
    icon:   <Brain className="w-9 h-9 text-violet-400" />,
  };
  if (v.includes("tampered") || v.includes("forged") || v.includes("fake")) return {
    color:  "text-red-400",
    border: "border-red-500/40",
    glow:   "shadow-red-900/30",
    icon:   <XCircle className="w-9 h-9 text-red-400" />,
  };
  // suspicious / regenerated / edited
  return {
    color:  "text-amber-400",
    border: "border-amber-500/40",
    glow:   "shadow-amber-900/30",
    icon:   <AlertTriangle className="w-9 h-9 text-amber-400" />,
  };
}

function probColor(p: number): string {
  return p >= 65 ? "text-red-400" : p >= 40 ? "text-amber-400" : "text-emerald-400";
}

function probBar(p: number): string {
  return p >= 65 ? "bg-red-500" : p >= 40 ? "bg-amber-500" : "bg-emerald-500";
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ScoreBar({
  label, value, description, invert = false,
}: { label: string; value: number | undefined; description: string; invert?: boolean }) {
  if (value === undefined || value === null) return (
    <div className="bg-black/20 rounded-xl p-4">
      <div className="flex justify-between mb-1">
        <span className="text-sm text-white/70">{label}</span>
        <span className="text-xs text-slate-600">N/A</span>
      </div>
      <p className="text-xs text-slate-600">{description}</p>
    </div>
  );
  const pct  = Math.round(value);
  const risk = invert ? (100 - pct) : pct;
  const bar  = risk >= 60 ? "bg-red-500" : risk >= 35 ? "bg-amber-500" : "bg-emerald-500";
  const txt  = risk >= 60 ? "text-red-400" : risk >= 35 ? "text-amber-400" : "text-emerald-400";
  return (
    <div className="bg-black/20 rounded-xl p-4">
      <div className="flex justify-between mb-1">
        <span className="text-sm text-white font-medium">{label}</span>
        <span className={`text-sm font-bold font-mono ${txt}`}>{pct}%</span>
      </div>
      <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden mb-1">
        <motion.div className={`h-full rounded-full ${bar}`}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.7, ease: "easeOut" }}
        />
      </div>
      <p className="text-xs text-slate-500">{description}</p>
    </div>
  );
}

function Section({
  title, icon, children, defaultOpen = false,
}: { title: string; icon: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-slate-900/60 border border-white/8 rounded-2xl overflow-hidden">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-white/5 transition-colors">
        <div className="flex items-center gap-2 text-white font-semibold text-sm">{icon}{title}</div>
        {open ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
            <div className="px-4 pb-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value?: string | number | boolean | null }) {
  if (value === undefined || value === null || value === "") return null;
  const display = typeof value === "boolean" ? (value ? "Yes" : "No") : String(value);
  return (
    <div className="flex justify-between items-start py-1.5 border-b border-white/5 last:border-0 gap-4">
      <span className="text-xs text-slate-400 shrink-0">{label}</span>
      <span className="text-xs text-white font-mono text-right break-all">{display}</span>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

const DocumentForensics = () => {
  const navigate      = useNavigate();
  const fileInputRef  = useRef<HTMLInputElement>(null);

  const [file, setFile]         = useState<File | null>(null);
  const [preview, setPreview]   = useState<string | null>(null);
  const [refText, setRefText]   = useState("");
  const [processing, setProcessing] = useState(false);
  const [step, setStep]         = useState<string>("idle");
  const [result, setResult]     = useState<UnifiedResponse | null>(null);
  const [error, setError]       = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  // ── File pick ──────────────────────────────────────────────────────────────

  const applyFile = useCallback((f: File) => {
    if (f.size > MAX_SIZE_MB * 1024 * 1024) {
      setError(`File too large (${(f.size / 1024 / 1024).toFixed(1)} MB). Max ${MAX_SIZE_MB} MB.`);
      return;
    }
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
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) applyFile(f);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) applyFile(f);
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
      setStep("Uploading file…");
      const form = new FormData();
      form.append("file", file);
      if (refText.trim()) form.append("reference_text", refText.trim());

      setStep("Running forensic pipeline…");
      const endpoint = `${getBackendUrl()}/api/unified-forensics/analyze`;
      const res = await fetch(endpoint, { method: "POST", body: form });

      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try { const j = await res.json(); msg = j.detail || j.message || msg; } catch {}
        throw new Error(msg);
      }

      setStep("Processing results…");
      const data: UnifiedResponse = await res.json();
      setResult(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setProcessing(false);
      setStep("idle");
    }
  };

  // ── Derived ────────────────────────────────────────────────────────────────

  const vs = result ? verdictStyle(result.verdict) : null;

  // Extract DL branch scores from signal_breakdown if available
  const aiDetails  = result?.signal_breakdown?.ai_details as Record<string, any> | undefined;
  const rawDL      = aiDetails?.raw_dl as Record<string, any> | undefined;
  const dlSignals  = aiDetails?.dominant_signals as string[] | undefined;

  const aiPct      = result ? Math.round(result.ai_probability) : 0;
  const cameraPct  = result ? Math.round(100 - result.ai_probability) : 0;
  const tamperPct  = result ? Math.round(result.doc_tamper_prob * 100) : 0;

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white">
      <div className="max-w-4xl mx-auto px-4 py-10 space-y-6">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 mb-2">
          <button onClick={() => navigate("/home")}
            className="p-2 rounded-lg hover:bg-white/8 text-slate-400 hover:text-white transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2">
            <Microscope className="w-6 h-6 text-violet-400" />
            <h1 className="text-2xl font-bold bg-gradient-to-r from-violet-400 via-purple-300 to-fuchsia-400 bg-clip-text text-transparent">
              Document Forensic Intelligence
            </h1>
          </div>
        </div>

        <p className="text-slate-400 text-sm max-w-2xl">
          Detects AI-generated documents, edited certificates, fake IDs, tampered government
          proofs, regenerated PDFs, and screenshot fraud — combining deep-learning AI detection
          with ELA heatmaps, noise forensics, layout analysis, OCR comparison, and metadata inspection.
        </p>

        {/* Capability chips */}
        <div className="flex flex-wrap gap-2">
          {[
            "AI-Generated", "Fake Certificates", "Edited IDs", "Tampered Aadhaar/PAN",
            "Regenerated PDFs", "Screenshot Fraud", "Synthetic Passports", "Forged Marksheets",
          ].map(c => (
            <span key={c}
              className="text-[10px] px-2.5 py-1 rounded-full bg-violet-950/50 border border-violet-700/30 text-violet-300 font-medium">
              {c}
            </span>
          ))}
        </div>

        {/* ── Upload card ─────────────────────────────────────────────────── */}
        {!result && (
          <div className="bg-slate-900/70 border border-white/10 rounded-3xl p-6 space-y-5">

            {/* Drop zone */}
            <div
              onDrop={handleDrop}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-10 flex flex-col items-center gap-3 cursor-pointer transition-all duration-200
                ${dragOver
                  ? "border-violet-400/70 bg-violet-950/20"
                  : "border-white/15 hover:border-violet-500/50 hover:bg-violet-950/10"}`}
            >
              {preview ? (
                <img src={preview} alt="Preview"
                  className="max-h-[220px] rounded-xl object-contain shadow-xl ring-1 ring-white/10" />
              ) : file ? (
                <div className="flex flex-col items-center gap-2">
                  <FileText className="w-14 h-14 text-violet-400" />
                  <p className="text-white font-medium text-sm">{file.name}</p>
                  <span className="text-xs text-slate-500">
                    {FILE_TYPE_LABELS[file.type] ?? file.type} · {(file.size / 1024).toFixed(0)} KB
                  </span>
                </div>
              ) : (
                <>
                  <Upload className="w-12 h-12 text-slate-500" />
                  <div className="text-center">
                    <p className="text-slate-300 text-sm font-medium">
                      Drop document or image here, or{" "}
                      <span className="text-violet-400 underline underline-offset-2">click to browse</span>
                    </p>
                    <p className="text-slate-600 text-xs mt-1.5">
                      JPG · PNG · WebP · BMP · TIFF · PDF · DOC · DOCX · TXT · max {MAX_SIZE_MB} MB
                    </p>
                  </div>
                </>
              )}
            </div>
            <input ref={fileInputRef} type="file" accept={ACCEPTED_EXT}
              className="hidden" onChange={handleFileChange} />

            {/* File info strip */}
            {file && (
              <div className="flex items-center justify-between text-xs text-slate-400 bg-black/20 rounded-xl px-4 py-2">
                <span className="font-medium text-white truncate max-w-[60%]">{file.name}</span>
                <span>
                  {FILE_TYPE_LABELS[file.type] ?? file.type} · {(file.size / 1024).toFixed(0)} KB
                </span>
              </div>
            )}

            {/* Reference text */}
            <div className="space-y-1.5">
              <label className="text-xs text-slate-400 uppercase tracking-widest font-medium">
                Reference Text{" "}
                <span className="text-slate-600 normal-case">(optional — paste original document text for OCR comparison)</span>
              </label>
              <textarea value={refText} onChange={e => setRefText(e.target.value)} rows={3}
                placeholder="Paste the genuine text of this document for tamper comparison…"
                className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-sm text-white
                           placeholder-slate-600 resize-none focus:outline-none focus:border-violet-500/50 transition-colors" />
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 bg-red-950/40 border border-red-500/30 rounded-xl px-4 py-3 text-red-300 text-sm">
                <XCircle className="w-4 h-4 shrink-0" />{error}
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
              <Button onClick={runAnalysis} disabled={!file || processing}
                className="bg-violet-600 hover:bg-violet-500 text-white font-semibold px-7">
                {processing ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />{step || "Analyzing…"}
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <ScanLine className="w-4 h-4" />Run Forensic Analysis
                  </span>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* ── Results ─────────────────────────────────────────────────────── */}
        <AnimatePresence>
          {result && vs && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }} className="space-y-4">

              {/* ── Verdict banner ──────────────────────────────────────── */}
              <div className={`bg-slate-900/80 border ${vs.border} rounded-3xl p-6 shadow-2xl ${vs.glow}`}>
                <div className="flex flex-col sm:flex-row items-center gap-5">
                  <div className="shrink-0">{vs.icon}</div>
                  <div className="flex-1 text-center sm:text-left">
                    <p className="text-[10px] uppercase tracking-widest text-slate-400 mb-1">Forensic Verdict</p>
                    <h2 className={`text-3xl font-bold ${vs.color}`}>{result.verdict}</h2>
                    <p className="text-slate-400 text-sm mt-1">
                      Fused risk score:{" "}
                      <span className={`font-bold font-mono ${vs.color}`}>
                        {Math.round(result.fused_score * 100)}%
                      </span>
                      {" "}·{" "}Confidence:{" "}
                      <span className="text-white font-mono">{Math.round(result.confidence * 100)}%</span>
                    </p>
                  </div>
                  <div className="shrink-0 text-right text-xs text-slate-500 hidden sm:block">
                    <p>{result.processing_time_ms.toFixed(0)} ms</p>
                    <p>{result.file_type} · {result.file_size_kb} KB</p>
                    {!result.ai_branch_used && <p className="text-amber-500/70 mt-1">DL offline · doc-only mode</p>}
                  </div>
                </div>

                {/* Dominant signals */}
                {result.dominant_signals.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {result.dominant_signals.map(sig => (
                      <span key={sig}
                        className="text-xs px-3 py-1 rounded-full bg-white/8 border border-white/12 text-slate-300">
                        {sig}
                      </span>
                    ))}
                  </div>
                )}

                {/* Branch errors */}
                {(result.ai_error || result.doc_error) && (
                  <div className="mt-3 space-y-1">
                    {result.ai_error && (
                      <p className="text-xs text-amber-400/70 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3 shrink-0" />
                        AI branch: {result.ai_error}
                      </p>
                    )}
                    {result.doc_error && (
                      <p className="text-xs text-amber-400/70 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3 shrink-0" />
                        Doc branch: {result.doc_error}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* ── AI Detection ─────────────────────────────────────────── */}
              <Section title="AI Detection Analysis" icon={<Brain className="w-4 h-4 text-violet-400" />} defaultOpen>
                <div className="space-y-3 mt-1">
                  <div className="grid sm:grid-cols-2 gap-3">
                    {/* AI probability */}
                    <div className="bg-black/20 rounded-xl p-4">
                      <div className="flex justify-between mb-1.5">
                        <span className="text-sm text-white font-medium">AI-Generated Probability</span>
                        <span className={`text-sm font-bold font-mono ${probColor(aiPct)}`}>{aiPct}%</span>
                      </div>
                      <div className="w-full h-2.5 bg-white/10 rounded-full overflow-hidden mb-1">
                        <motion.div className={`h-full rounded-full ${probBar(aiPct)}`}
                          initial={{ width: 0 }} animate={{ width: `${aiPct}%` }}
                          transition={{ duration: 0.8, ease: "easeOut" }} />
                      </div>
                      <p className="text-xs text-slate-500">Probability that content was generated by an AI/diffusion model</p>
                    </div>

                    {/* Camera probability */}
                    <div className="bg-black/20 rounded-xl p-4">
                      <div className="flex justify-between mb-1.5">
                        <span className="text-sm text-white font-medium">Authentic Camera Probability</span>
                        <span className={`text-sm font-bold font-mono ${probColor(100 - cameraPct)}`}>{cameraPct}%</span>
                      </div>
                      <div className="w-full h-2.5 bg-white/10 rounded-full overflow-hidden mb-1">
                        <motion.div className="h-full rounded-full bg-emerald-500"
                          initial={{ width: 0 }} animate={{ width: `${cameraPct}%` }}
                          transition={{ duration: 0.8, ease: "easeOut" }} />
                      </div>
                      <p className="text-xs text-slate-500">Probability of genuine camera capture with authentic sensor noise</p>
                    </div>
                  </div>

                  {/* DL Branch scores */}
                  {rawDL && (
                    <div className="bg-slate-800/40 border border-violet-700/20 rounded-xl p-4 space-y-2">
                      <p className="text-[10px] font-semibold text-violet-400 uppercase tracking-widest mb-3">
                        Deep Learning Branch Scores
                      </p>
                      {([
                        ["CNN (RGB Image)",     rawDL.cnn_score,      "Spatial texture & colour pattern analysis"],
                        ["Residual (Noise)",    rawDL.residual_score, "Sensor noise fingerprint analysis"],
                        ["FFT (Frequency)",     rawDL.fft_score,      "Frequency-domain decay analysis"],
                        ["Forensic Heuristic",  rawDL.forensic_score, "Classical spectral forensic analysis"],
                        ["Metadata Reliability",rawDL.metadata_score, "EXIF & file-level metadata signal"],
                      ] as [string, number, string][]).filter(([, v]) => v !== undefined).map(([label, score, desc]) => (
                        <div key={label} title={desc}>
                          <div className="flex items-center gap-3">
                            <span className="text-[10px] text-slate-400 w-36 shrink-0">{label}</span>
                            <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                              <motion.div
                                className={score > 0.65 ? "h-full rounded-full bg-red-500" : score > 0.4 ? "h-full rounded-full bg-amber-500" : "h-full rounded-full bg-emerald-500"}
                                initial={{ width: 0 }}
                                animate={{ width: `${score * 100}%` }}
                                transition={{ duration: 0.7 }}
                              />
                            </div>
                            <span className={`text-[11px] font-mono font-bold w-10 text-right ${score > 0.65 ? "text-red-400" : score > 0.4 ? "text-amber-400" : "text-emerald-400"}`}>
                              {(score * 100).toFixed(0)}%
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* DL dominant signals */}
                  {dlSignals && dlSignals.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-[10px] text-slate-500 uppercase tracking-widest">AI Detection Signals</p>
                      {dlSignals.map((s, i) => (
                        <p key={i} className="text-xs text-slate-300 flex items-start gap-1.5">
                          <Zap className="w-3 h-3 text-violet-400 mt-0.5 shrink-0" />{s}
                        </p>
                      ))}
                    </div>
                  )}

                  {!result.ai_branch_used && (
                    <div className="flex items-center gap-2 bg-amber-950/30 border border-amber-600/20 rounded-xl px-4 py-2.5 text-amber-300/80 text-xs">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      AI detection backend unavailable — result based on document forensics only.
                    </div>
                  )}
                </div>
              </Section>

              {/* ── Document Forensics ───────────────────────────────────── */}
              <Section title="Document Tamper Analysis" icon={<Shield className="w-4 h-4 text-blue-400" />} defaultOpen>
                <div className="space-y-3 mt-1">
                  {/* Tamper probability */}
                  <div className="bg-black/20 rounded-xl p-4">
                    <div className="flex justify-between mb-1.5">
                      <span className="text-sm text-white font-medium">Document Tamper Probability</span>
                      <span className={`text-sm font-bold font-mono ${probColor(tamperPct)}`}>{tamperPct}%</span>
                    </div>
                    <div className="w-full h-2.5 bg-white/10 rounded-full overflow-hidden mb-1">
                      <motion.div className={`h-full rounded-full ${probBar(tamperPct)}`}
                        initial={{ width: 0 }} animate={{ width: `${tamperPct}%` }}
                        transition={{ duration: 0.8, ease: "easeOut" }} />
                    </div>
                    <p className="text-xs text-slate-500">
                      Combined ELA + noise + layout + metadata signal indicating document manipulation
                    </p>
                  </div>

                  {/* Signal breakdown from doc forensics */}
                  {result.signal_breakdown?.doc_details && (() => {
                    const d = result.signal_breakdown.doc_details as Record<string, any>;
                    const sigs = d.signals ?? d.tamper_signals ?? {};
                    return Object.keys(sigs).length > 0 ? (
                      <div className="grid sm:grid-cols-2 gap-3">
                        {sigs.ela_score !== undefined && (
                          <ScoreBar label="ELA Score"
                            value={Math.round(sigs.ela_score * 100)}
                            description="Error Level Analysis — detects re-compression splices" />
                        )}
                        {sigs.noise_inconsistency !== undefined && (
                          <ScoreBar label="Noise Inconsistency"
                            value={Math.round(sigs.noise_inconsistency * 100)}
                            description="Sensor noise pattern mismatch across image blocks" />
                        )}
                        {sigs.layout_score !== undefined && (
                          <ScoreBar label="Layout Inconsistency"
                            value={Math.round(sigs.layout_score * 100)}
                            description="Font/sharpness variance between document regions" />
                        )}
                        {sigs.metadata_score !== undefined && (
                          <ScoreBar label="Metadata Anomaly"
                            value={Math.round(sigs.metadata_score * 100)}
                            description="Missing or suspicious EXIF / PDF metadata" />
                        )}
                        {sigs.text_diff_score !== undefined && (
                          <ScoreBar label="Text Content Mismatch"
                            value={Math.round(sigs.text_diff_score * 100)}
                            description="OCR vs reference text divergence" />
                        )}
                      </div>
                    ) : null;
                  })()}
                </div>
              </Section>

              {/* ── Heatmap ──────────────────────────────────────────────── */}
              {result.heatmap_base64 && (
                <Section title="Tamper Heatmap (ELA + Noise)" icon={<ImageIcon className="w-4 h-4 text-violet-400" />} defaultOpen>
                  <div className="space-y-4 mt-1">
                    <div className="grid sm:grid-cols-2 gap-4">
                      {preview && (
                        <div className="space-y-1.5">
                          <p className="text-[10px] uppercase tracking-widest text-slate-500">Original</p>
                          <img src={preview} alt="Original"
                            className="rounded-xl w-full object-contain max-h-64 ring-1 ring-white/10" />
                        </div>
                      )}
                      <div className="space-y-1.5">
                        <p className="text-[10px] uppercase tracking-widest text-slate-500">Heatmap</p>
                        <img src={result.heatmap_base64} alt="Tamper heatmap"
                          className="rounded-xl w-full object-contain max-h-64 ring-1 ring-white/10" />
                      </div>
                    </div>
                    <p className="text-xs text-slate-500">
                      Warm / red areas = elevated ELA residuals or noise inconsistency. Authentic images show
                      uniform heatmaps; tampered or AI-generated regions appear as distinct hot spots.
                    </p>

                    {/* Flagged regions */}
                    {result.flagged_regions.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs uppercase tracking-widest text-slate-400 font-medium">
                          Suspicious Regions ({result.flagged_regions.length})
                        </p>
                        {result.flagged_regions.map((r, i) => (
                          <div key={i}
                            className="flex items-center justify-between bg-black/20 rounded-lg px-4 py-2 text-xs">
                            <span className="text-slate-300 flex items-center gap-1.5">
                              <MapPin className="w-3 h-3 text-red-400" />
                              {r.label ?? `Region ${i + 1}`} — {r.x},{r.y} · {r.w}×{r.h}px
                            </span>
                            <span className={`font-mono font-bold ${r.severity >= 0.6 ? "text-red-400" : "text-amber-400"}`}>
                              {Math.round(r.severity * 100)}%
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </Section>
              )}

              {/* ── Per-page PDF ─────────────────────────────────────────── */}
              {result.page_count > 1 && result.page_results.length > 0 && (
                <Section
                  title={`PDF Page Analysis (${result.page_count} pages)`}
                  icon={<Cpu className="w-4 h-4 text-cyan-400" />}
                  defaultOpen
                >
                  <div className="space-y-2 mt-1">
                    {result.page_results.map(p => (
                      <div key={p.page}
                        className="flex items-center gap-4 bg-black/20 rounded-xl px-4 py-3 text-xs">
                        <span className="text-slate-400 w-16 shrink-0 font-medium">Page {p.page}</span>
                        <div className="flex-1 space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-slate-500 w-12 shrink-0">AI</span>
                            <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${probBar(p.ai_probability)}`}
                                style={{ width: `${p.ai_probability}%` }} />
                            </div>
                            <span className={`font-mono font-bold w-9 text-right ${probColor(p.ai_probability)}`}>
                              {p.ai_probability.toFixed(0)}%
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-slate-500 w-12 shrink-0">Camera</span>
                            <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                              <div className="h-full rounded-full bg-emerald-500"
                                style={{ width: `${p.camera_probability}%` }} />
                            </div>
                            <span className="font-mono font-bold w-9 text-right text-emerald-400">
                              {p.camera_probability.toFixed(0)}%
                            </span>
                          </div>
                        </div>
                        {p.error && (
                          <span className="text-amber-400/70 text-[10px] shrink-0">{p.error}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {/* ── OCR ─────────────────────────────────────────────────── */}
              {result.ocr?.text && (
                <Section
                  title={`OCR Extracted Text${result.ocr.word_count ? ` (${result.ocr.word_count} words)` : ""}`}
                  icon={<ScanLine className="w-4 h-4 text-emerald-400" />}
                >
                  <div className="space-y-2 mt-1">
                    {result.ocr.confidence !== undefined && result.ocr.confidence > 0 && (
                      <p className="text-xs text-slate-500">
                        Confidence: <span className="text-white font-mono">{result.ocr.confidence.toFixed(1)}%</span>
                        {result.ocr.language && (
                          <> · Language: <span className="text-white font-mono">{result.ocr.language}</span></>
                        )}
                      </p>
                    )}
                    <pre className="bg-black/30 rounded-xl p-4 text-xs text-slate-300 whitespace-pre-wrap
                                    max-h-72 overflow-y-auto font-mono leading-relaxed">
                      {result.ocr.text}
                    </pre>
                  </div>
                </Section>
              )}

              {/* ── Metadata ─────────────────────────────────────────────── */}
              {result.metadata && (
                <Section title="File Metadata" icon={<FileText className="w-4 h-4 text-cyan-400" />}>
                  <div className="space-y-3 mt-1">
                    {result.metadata.suspicious_flags && result.metadata.suspicious_flags.length > 0 && (
                      <div className="flex items-start gap-2 bg-amber-950/40 border border-amber-600/30 rounded-xl px-4 py-3 text-amber-300 text-xs">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        <div className="space-y-0.5">
                          {result.metadata.suspicious_flags.map((f, i) => <p key={i}>{f}</p>)}
                        </div>
                      </div>
                    )}
                    <div className="divide-y divide-white/5">
                      <MetaRow label="Software" value={result.metadata.software} />
                      <MetaRow label="Created" value={result.metadata.creation_date} />
                      <MetaRow label="Modified" value={result.metadata.modification_date} />
                      <MetaRow label="File type" value={result.file_type} />
                      <MetaRow label="File size" value={`${result.file_size_kb} KB`} />
                    </div>
                    {result.metadata.raw && Object.keys(result.metadata.raw).length > 0 && (
                      <details className="text-xs text-slate-500 cursor-pointer">
                        <summary className="hover:text-slate-300 transition-colors">Show raw metadata</summary>
                        <pre className="mt-2 bg-black/30 rounded-xl p-3 text-[10px] font-mono max-h-48 overflow-y-auto">
                          {JSON.stringify(result.metadata.raw, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                </Section>
              )}

              {/* ── Re-analyze button ────────────────────────────────────── */}
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
