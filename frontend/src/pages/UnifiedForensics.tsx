import { useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Shield, Upload, ArrowLeft, AlertTriangle, CheckCircle, XCircle,
  ChevronDown, ChevronUp, FileText, Image, Brain, Layers, Info,
  Loader2, RefreshCw
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { HexGrid } from "@/components/HexGrid";
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
  ai_probability: number;
  doc_tamper_prob: number;
  dominant_signals: string[];
  signal_breakdown: Record<string, unknown>;
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

const ACCEPTED_TYPES = [
  "image/jpeg", "image/png", "image/webp", "image/bmp", "image/tiff",
  "application/pdf", "text/plain",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];
const ACCEPTED_EXT  = ".jpg,.jpeg,.png,.webp,.bmp,.tiff,.tif,.pdf,.txt,.doc,.docx";
const MAX_SIZE_MB   = 30;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function verdictColor(verdict: string) {
  if (verdict.includes("Tampered") || verdict.includes("AI-Generated"))
    return { border: "border-red-500/60",    bg: "bg-red-500/10",    text: "text-red-400",    icon: <XCircle className="w-6 h-6" /> };
  if (verdict.includes("Suspicious"))
    return { border: "border-amber-500/60",  bg: "bg-amber-500/10",  text: "text-amber-400",  icon: <AlertTriangle className="w-6 h-6" /> };
  return   { border: "border-green-500/60",  bg: "bg-green-500/10",  text: "text-green-400",  icon: <CheckCircle className="w-6 h-6" /> };
}

function pct(v: number, scale = 1) {
  return Math.round(v * scale);
}

function barColor(score: number) {
  if (score >= 0.65) return "bg-red-500";
  if (score >= 0.40) return "bg-amber-500";
  return "bg-green-500";
}

// ─── Collapsible Section ──────────────────────────────────────────────────────

function Section({ title, icon, children, defaultOpen = false }: {
  title: string; icon: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-border/50 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 bg-background/60 hover:bg-background/80 transition-colors"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
          {icon}{title}
        </span>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="px-5 py-4 bg-background/30 border-t border-border/30">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Score Bar ────────────────────────────────────────────────────────────────

function ScoreBar({ label, value, max = 1 }: { label: string; value: number; max?: number }) {
  const ratio = Math.min(Math.max(value / max, 0), 1);
  const pctVal = Math.round(ratio * 100);
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-muted-foreground">{label}</span>
        <span className={ratio >= 0.65 ? "text-red-400" : ratio >= 0.40 ? "text-amber-400" : "text-green-400"}>
          {pctVal}%
        </span>
      </div>
      <div className="h-2 bg-border/40 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${barColor(ratio)}`}
          style={{ width: `${pctVal}%` }}
        />
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const UnifiedForensics = () => {
  const navigate = useNavigate();
  const fileInputRef  = useRef<HTMLInputElement>(null);
  const [dragOver,    setDragOver]    = useState(false);
  const [file,        setFile]        = useState<File | null>(null);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [result,      setResult]      = useState<UnifiedResponse | null>(null);

  // ── File selection ───────────────────────────────────────────────────────
  const handleFile = useCallback((f: File) => {
    if (f.size > MAX_SIZE_MB * 1024 * 1024) {
      setError(`File too large. Maximum size is ${MAX_SIZE_MB} MB.`);
      return;
    }
    setFile(f);
    setResult(null);
    setError(null);
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) handleFile(dropped);
  }, [handleFile]);

  // ── Analysis ─────────────────────────────────────────────────────────────
  const analyze = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const base = getBackendUrl();
      const fd   = new FormData();
      fd.append("file", file);

      const resp = await fetch(`${base}/api/unified-forensics/analyze`, {
        method: "POST",
        body:   fd,
      });

      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error((body as { detail?: string }).detail || `HTTP ${resp.status}`);
      }

      const data: UnifiedResponse = await resp.json();
      setResult(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setFile(null);
    setResult(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ── Render ───────────────────────────────────────────────────────────────
  const vc = result ? verdictColor(result.verdict) : null;

  return (
    <div className="min-h-screen relative overflow-hidden">
      <HexGrid />
      <div className="relative z-10">

        {/* Header */}
        <header className="bg-background/80 backdrop-blur-xl border-b border-border/50">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <div className="flex items-center gap-3">
                <button onClick={() => navigate("/home")} className="text-muted-foreground hover:text-foreground transition-colors">
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-500 to-cyan-500 flex items-center justify-center">
                  <Layers className="w-4 h-4 text-white" />
                </div>
                <h1 className="text-xl font-bold text-foreground">Unified Forensics</h1>
              </div>
              <span className="text-xs text-muted-foreground font-mono hidden sm:block">
                AI Detection + Document Forensics
              </span>
            </div>
          </div>
        </header>

        <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6">

          {/* Upload Zone */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              onClick={() => !file && fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-10 text-center transition-all cursor-pointer
                ${dragOver ? "border-emerald-500 bg-emerald-500/5" : "border-border/50 hover:border-emerald-500/50 bg-background/40"}`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_EXT}
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />

              {file ? (
                <div className="space-y-3">
                  <div className="w-12 h-12 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto">
                    {file.type.startsWith("image/") ? <Image className="w-6 h-6 text-emerald-400" /> : <FileText className="w-6 h-6 text-emerald-400" />}
                  </div>
                  <p className="text-sm font-medium text-foreground">{file.name}</p>
                  <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</p>
                  <div className="flex gap-3 justify-center pt-2">
                    <Button
                      onClick={e => { e.stopPropagation(); analyze(); }}
                      disabled={loading}
                      className="bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-700 hover:to-cyan-700"
                    >
                      {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Analyzing…</> : <><Brain className="w-4 h-4 mr-2" />Run Unified Analysis</>}
                    </Button>
                    <Button variant="outline" onClick={e => { e.stopPropagation(); reset(); }} size="sm">
                      <RefreshCw className="w-4 h-4 mr-1" />Clear
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <Upload className="w-10 h-10 text-muted-foreground mx-auto" />
                  <p className="text-sm text-muted-foreground">
                    Drag & drop or <span className="text-emerald-400 underline underline-offset-2">browse</span>
                  </p>
                  <p className="text-xs text-muted-foreground/60">
                    Images, PDF, TXT, DOC, DOCX &bull; Max {MAX_SIZE_MB} MB
                  </p>
                </div>
              )}
            </div>
          </motion.div>

          {/* Error */}
          {error && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="border border-red-500/40 bg-red-500/10 rounded-xl px-5 py-4 flex items-start gap-3">
              <XCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <p className="text-sm text-red-300">{error}</p>
            </motion.div>
          )}

          {/* Loading */}
          {loading && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="border border-emerald-500/30 bg-emerald-500/5 rounded-xl px-5 py-8 text-center">
              <Loader2 className="w-8 h-8 text-emerald-400 animate-spin mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Running unified forensic pipeline…</p>
              <p className="text-xs text-muted-foreground/60 mt-1">AI detection + document forensics + fusion</p>
            </motion.div>
          )}

          {/* Results */}
          {result && vc && (
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">

              {/* Verdict Banner */}
              <div className={`border ${vc.border} ${vc.bg} rounded-xl px-6 py-5 flex items-start gap-4`}>
                <span className={vc.text}>{vc.icon}</span>
                <div className="flex-1 min-w-0">
                  <h2 className={`text-lg font-bold ${vc.text}`}>{result.verdict}</h2>
                  <div className="flex flex-wrap gap-4 mt-1 text-xs text-muted-foreground">
                    <span>Fused score: <strong>{pct(result.fused_score * 100)}%</strong></span>
                    <span>Confidence: <strong>{pct(result.confidence * 100)}%</strong></span>
                    <span>Type: <strong className="capitalize">{result.file_type}</strong></span>
                    <span>{result.processing_time_ms.toFixed(0)} ms</span>
                    <span>{result.file_size_kb} KB</span>
                  </div>
                  {result.dominant_signals.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-3">
                      {result.dominant_signals.map(s => (
                        <span key={s} className="text-xs px-2 py-0.5 rounded-full bg-background/50 border border-border/40 text-muted-foreground">{s}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Branch status pills */}
              <div className="flex flex-wrap gap-2">
                <span className={`text-xs px-3 py-1 rounded-full border ${result.ai_branch_used ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-400" : "border-border/40 text-muted-foreground"}`}>
                  {result.ai_branch_used ? "✓" : "—"} AI Detection {result.ai_error ? `(${result.ai_error})` : ""}
                </span>
                <span className={`text-xs px-3 py-1 rounded-full border ${result.doc_branch_used ? "border-violet-500/40 bg-violet-500/10 text-violet-400" : "border-border/40 text-muted-foreground"}`}>
                  {result.doc_branch_used ? "✓" : "—"} Document Forensics {result.doc_error ? `(${result.doc_error})` : ""}
                </span>
                {result.page_count > 0 && (
                  <span className="text-xs px-3 py-1 rounded-full border border-border/40 text-muted-foreground">
                    {result.page_count} PDF page{result.page_count !== 1 ? "s" : ""} analysed
                  </span>
                )}
              </div>

              {/* Score Breakdown */}
              <Section title="Score Breakdown" icon={<Shield className="w-4 h-4 text-cyan-400" />} defaultOpen>
                <div className="grid gap-3 sm:grid-cols-2">
                  {result.ai_branch_used && (
                    <ScoreBar label="AI-generation probability" value={result.ai_probability} max={100} />
                  )}
                  {result.doc_branch_used && (
                    <ScoreBar label="Document tampering probability" value={result.doc_tamper_prob} />
                  )}
                  <ScoreBar label="Fused score" value={result.fused_score} />
                  <ScoreBar label="Overall confidence" value={result.confidence} />

                  {/* detailed sub-scores from signal_breakdown */}
                  {result.signal_breakdown?.doc_signals && (() => {
                    const ds = result.signal_breakdown.doc_signals as Record<string, number>;
                    return (
                      <>
                        {Object.entries(ds).map(([k, v]) => (
                          <ScoreBar key={k} label={k.replace(/_/g, " ")} value={Number(v)} />
                        ))}
                      </>
                    );
                  })()}
                </div>
              </Section>

              {/* ELA Heatmap */}
              {result.heatmap_base64 && (
                <Section title="Tampering Heatmap (ELA)" icon={<Image className="w-4 h-4 text-orange-400" />}>
                  <img
                    src={result.heatmap_base64}
                    alt="ELA heatmap"
                    className="w-full rounded-lg border border-border/30 max-h-[420px] object-contain"
                  />
                  <p className="text-xs text-muted-foreground mt-2">
                    Hot pixels (red/yellow) indicate potential re-compression or tampering artefacts.
                  </p>
                  {result.flagged_regions.length > 0 && (
                    <div className="mt-3 space-y-1">
                      <p className="text-xs font-semibold text-muted-foreground mb-1">Flagged regions ({result.flagged_regions.length})</p>
                      {result.flagged_regions.slice(0, 8).map((r, i) => (
                        <div key={i} className="text-xs text-muted-foreground font-mono">
                          Region {i + 1}: ({r.x},{r.y}) {r.w}x{r.h}px — severity {Math.round(r.severity * 100)}%
                          {r.label ? ` [${r.label}]` : ""}
                        </div>
                      ))}
                    </div>
                  )}
                </Section>
              )}

              {/* Per-page PDF results */}
              {result.page_results.length > 0 && (
                <Section title={`Per-Page AI Results (${result.page_results.length} pages)`} icon={<FileText className="w-4 h-4 text-blue-400" />}>
                  <div className="space-y-3">
                    {result.page_results.map(pr => (
                      <div key={pr.page} className="bg-background/40 rounded-lg p-3 border border-border/30">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-semibold text-foreground">Page {pr.page}</span>
                          {pr.error && <span className="text-xs text-red-400">{pr.error}</span>}
                        </div>
                        {!pr.error && (
                          <div className="grid gap-2 sm:grid-cols-2">
                            <ScoreBar label="AI probability" value={pr.ai_probability} max={100} />
                            <ScoreBar label="Camera probability" value={pr.camera_probability} max={100} />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {/* Metadata */}
              {result.metadata && (
                <Section title="File Metadata" icon={<Info className="w-4 h-4 text-purple-400" />}>
                  <div className="space-y-2 text-sm">
                    {result.metadata.software && (
                      <div className="flex gap-2">
                        <span className="text-muted-foreground w-36 shrink-0">Software:</span>
                        <span className="text-foreground font-mono text-xs">{result.metadata.software}</span>
                      </div>
                    )}
                    {result.metadata.creation_date && (
                      <div className="flex gap-2">
                        <span className="text-muted-foreground w-36 shrink-0">Created:</span>
                        <span className="text-foreground text-xs">{result.metadata.creation_date}</span>
                      </div>
                    )}
                    {result.metadata.modification_date && (
                      <div className="flex gap-2">
                        <span className="text-muted-foreground w-36 shrink-0">Modified:</span>
                        <span className="text-foreground text-xs">{result.metadata.modification_date}</span>
                      </div>
                    )}
                    {(result.metadata.suspicious_flags ?? []).length > 0 && (
                      <div>
                        <p className="text-muted-foreground mb-1">Suspicious flags:</p>
                        <div className="flex flex-wrap gap-1">
                          {result.metadata.suspicious_flags!.map(f => (
                            <span key={f} className="text-xs px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-400">{f}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {result.metadata.raw && (
                      <details className="mt-2">
                        <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">Raw metadata</summary>
                        <pre className="text-xs font-mono mt-2 bg-background/60 rounded p-3 overflow-auto max-h-48 text-muted-foreground">
                          {JSON.stringify(result.metadata.raw, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                </Section>
              )}

              {/* OCR Text */}
              {result.ocr?.text && (
                <Section title="Extracted Text (OCR)" icon={<FileText className="w-4 h-4 text-emerald-400" />}>
                  <div className="space-y-2">
                    <div className="flex gap-4 text-xs text-muted-foreground mb-2">
                      <span>{result.ocr.word_count} words</span>
                      {result.ocr.language && <span>Language: {result.ocr.language}</span>}
                      {result.ocr.confidence != null && <span>Confidence: {Math.round(result.ocr.confidence)}%</span>}
                    </div>
                    <pre className="text-xs font-mono bg-background/60 rounded-lg p-4 overflow-auto max-h-60 text-muted-foreground whitespace-pre-wrap">
                      {result.ocr.text}
                    </pre>
                  </div>
                </Section>
              )}

              {/* Raw signal breakdown */}
              <Section title="Technical Details" icon={<Brain className="w-4 h-4 text-cyan-400" />}>
                <pre className="text-xs font-mono bg-background/60 rounded-lg p-4 overflow-auto max-h-72 text-muted-foreground">
                  {JSON.stringify(result.signal_breakdown, null, 2)}
                </pre>
              </Section>

            </motion.div>
          )}
        </main>
      </div>
    </div>
  );
};

export default UnifiedForensics;
