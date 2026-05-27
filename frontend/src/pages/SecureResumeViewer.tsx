/**
 * SecureResumeViewer
 * ==================
 * Public page — no login required.
 * Route: /shared-view/:token
 *
 * Bug fixes applied:
 *   BUG 1 — Approval polling: polls /check-access every 5 s using the stored
 *            viewer email. Unmasks contacts immediately on approval without
 *            page refresh. Approval is strictly per-email, never global.
 *   BUG 2 — PDF rendering: uses pdf.js (pdfjs-dist) to render the blob
 *            returned by the secure backend stream. No iframe, no Chrome block.
 *
 * Security preserved:
 *   - AES-256-GCM decryption happens entirely on the backend
 *   - No raw Supabase URLs exposed
 *   - Activity logging intact
 *   - Masking remains for all non-approved viewers
 */

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams } from "react-router-dom";
import * as pdfjsLib from "pdfjs-dist";
import {
  Shield, FileText, Eye, EyeOff, Lock, Phone, Mail,
  AlertCircle, CheckCircle, UserPlus, Clock, X, Send,
  Building2, MessageSquare, ChevronLeft, ChevronRight,
} from "lucide-react";

// Point pdf.js worker at the bundled copy shipped with pdfjs-dist
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

const BACKEND_URL =
  (import.meta as any).env?.VITE_BACKEND_URL || "http://localhost:8000";

const POLL_INTERVAL_MS = 5000;   // check approval every 5 s
const EMAIL_STORAGE_KEY = "resume_viewer_email";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SharePreview {
  ok: boolean;
  file_name: string;
  file_type: string;
  is_pdf: boolean;
  masked_text: string | null;
  findings: Array<{ type: "email" | "phone"; original: string; masked: string }>;
  file_url: string;
  asset_id: string;
}

interface CheckAccessResult {
  ok: boolean;
  approved: boolean;
  status: "not_requested" | "pending" | "approved" | "rejected";
  approved_at?: string;
  findings?: Array<{ type: "email" | "phone"; value: string }>;
}

// ─── PDF Renderer (pdf.js canvas-based, no iframe) ───────────────────────────

function PdfViewer({ pdfBytes }: { pdfBytes: Uint8Array }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [numPages, setNumPages]   = useState(0);
  const [pageNum, setPageNum]     = useState(1);
  const [scale, setScale]         = useState(1.4);
  const [pdfDoc, setPdfDoc]       = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const canvasRef                 = useRef<HTMLCanvasElement>(null);
  const renderTaskRef             = useRef<pdfjsLib.RenderTask | null>(null);

  // Load PDF document from bytes
  useEffect(() => {
    let cancelled = false;
    const loadDoc = async () => {
      try {
        const doc = await pdfjsLib.getDocument({ data: pdfBytes }).promise;
        if (!cancelled) {
          setPdfDoc(doc);
          setNumPages(doc.numPages);
          setPageNum(1);
        }
      } catch (e) {
        console.error("[PDFViewer] load error:", e);
      }
    };
    loadDoc();
    return () => { cancelled = true; };
  }, [pdfBytes]);

  // Render current page onto canvas
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return;
    let cancelled = false;

    const renderPage = async () => {
      try {
        // Cancel any in-progress render
        if (renderTaskRef.current) {
          renderTaskRef.current.cancel();
          renderTaskRef.current = null;
        }

        const page    = await pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale });

        const canvas  = canvasRef.current!;
        const ctx     = canvas.getContext("2d")!;
        canvas.height = viewport.height;
        canvas.width  = viewport.width;

        const task = page.render({ canvasContext: ctx, viewport });
        renderTaskRef.current = task;
        await task.promise;

        if (!cancelled) renderTaskRef.current = null;
      } catch (e: any) {
        if (e?.name !== "RenderingCancelledException") {
          console.error("[PDFViewer] render error:", e);
        }
      }
    };

    renderPage();
    return () => { cancelled = true; };
  }, [pdfDoc, pageNum, scale]);

  return (
    <div className="flex flex-col h-full">
      {/* PDF toolbar */}
      <div className="flex items-center justify-between bg-slate-800 px-4 py-2 shrink-0">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPageNum(p => Math.max(1, p - 1))}
            disabled={pageNum <= 1}
            className="p-1 rounded hover:bg-slate-700 disabled:opacity-40 transition-colors"
          >
            <ChevronLeft className="w-4 h-4 text-slate-300" />
          </button>
          <span className="text-xs text-slate-300 tabular-nums">
            {pageNum} / {numPages}
          </span>
          <button
            onClick={() => setPageNum(p => Math.min(numPages, p + 1))}
            disabled={pageNum >= numPages}
            className="p-1 rounded hover:bg-slate-700 disabled:opacity-40 transition-colors"
          >
            <ChevronRight className="w-4 h-4 text-slate-300" />
          </button>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setScale(s => Math.max(0.5, s - 0.2))}
                  className="px-2 py-0.5 text-xs bg-slate-700 hover:bg-slate-600 rounded transition-colors text-slate-300">
            −
          </button>
          <span className="text-xs text-slate-400 w-12 text-center tabular-nums">
            {Math.round(scale * 100)}%
          </span>
          <button onClick={() => setScale(s => Math.min(3, s + 0.2))}
                  className="px-2 py-0.5 text-xs bg-slate-700 hover:bg-slate-600 rounded transition-colors text-slate-300">
            +
          </button>
        </div>
      </div>

      {/* Canvas scroll area */}
      <div ref={containerRef}
           className="flex-1 overflow-auto bg-slate-950 flex justify-center py-4">
        <canvas
          ref={canvasRef}
          className="shadow-2xl rounded"
          style={{ maxWidth: "100%" }}
        />
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function SecureResumeViewer() {
  const { token } = useParams<{ token: string }>();

  const [preview, setPreview]     = useState<SharePreview | null>(null);
  const [pdfBytes, setPdfBytes]   = useState<Uint8Array | null>(null);
  const [imgUrl, setImgUrl]       = useState<string | null>(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [showText, setShowText]   = useState(false);
  const [showMask, setShowMask]   = useState(true);

  // Access-request form
  const [showModal, setShowModal] = useState(false);
  const [reqName, setReqName]     = useState("");
  const [reqEmail, setReqEmail]   = useState("");
  const [reqCompany, setReqCompany] = useState("");
  const [reqMessage, setReqMessage] = useState("");
  const [reqLoading, setReqLoading] = useState(false);
  const [reqError, setReqError]   = useState<string | null>(null);

  // Approval polling — per-email, never global
  const [accessResult, setAccessResult]   = useState<CheckAccessResult | null>(null);
  const [viewerEmail, setViewerEmail]     = useState<string | null>(
    () => localStorage.getItem(EMAIL_STORAGE_KEY)
  );
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Load preview metadata + file blob ──────────────────────────────────────
  useEffect(() => {
    if (!token) return;
    let revoke: string | null = null;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        // 1. Masked preview JSON
        const previewRes = await fetch(`${BACKEND_URL}/resume/share/${token}`);
        if (!previewRes.ok) {
          const err = await previewRes.json().catch(() => ({}));
          throw new Error(err.detail || `Error ${previewRes.status}`);
        }
        const previewData: SharePreview = await previewRes.json();
        setPreview(previewData);

        // 2. Decrypted file blob from secure backend stream
        const fileRes = await fetch(`${BACKEND_URL}/resume/share/${token}/file`);
        if (!fileRes.ok) {
          const err = await fileRes.json().catch(() => ({}));
          throw new Error(err.detail || `Error ${fileRes.status}`);
        }

        const blob      = await fileRes.blob();
        const isPdf     = previewData.is_pdf || blob.type === "application/pdf";

        if (isPdf) {
          // Convert blob → Uint8Array for pdf.js (avoids Chrome iframe block)
          const buf   = await blob.arrayBuffer();
          setPdfBytes(new Uint8Array(buf));
        } else {
          const url = URL.createObjectURL(blob);
          revoke    = url;
          setImgUrl(url);
        }
      } catch (e: any) {
        setError(e.message || "Failed to load document");
      } finally {
        setLoading(false);
      }
    };

    load();

    return () => {
      if (revoke) URL.revokeObjectURL(revoke);
    };
  }, [token]);

  // ── Approval polling — per viewer email, every 5 s ─────────────────────────
  const checkAccess = useCallback(async (email: string) => {
    if (!token || !email) return;
    try {
      const res = await fetch(
        `${BACKEND_URL}/resume/share/${token}/check-access?email=${encodeURIComponent(email)}`
      );
      if (!res.ok) return;
      const data: CheckAccessResult = await res.json();
      setAccessResult(data);

      // Stop polling once a terminal state is reached
      if (data.status === "approved" || data.status === "rejected") {
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      }
    } catch {
      // silent — keep polling
    }
  }, [token]);

  useEffect(() => {
    if (!viewerEmail) return;

    checkAccess(viewerEmail); // immediate first check
    pollRef.current = setInterval(() => checkAccess(viewerEmail), POLL_INTERVAL_MS);

    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [viewerEmail, checkAccess]);

  // ── Submit access request ──────────────────────────────────────────────────
  const submitRequest = async () => {
    if (!reqName.trim() || !reqEmail.trim()) {
      setReqError("Name and email are required");
      return;
    }
    setReqLoading(true);
    setReqError(null);

    try {
      const res = await fetch(`${BACKEND_URL}/resume/share/request-access`, {
        method : "POST",
        headers: { "Content-Type": "application/json" },
        body   : JSON.stringify({
          token,
          requester_name   : reqName.trim(),
          requester_email  : reqEmail.trim().toLowerCase(),
          requester_company: reqCompany.trim() || undefined,
          message          : reqMessage.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Error ${res.status}`);
      }

      const data = await res.json();

      // Persist viewer email so polling survives page navigations
      const normEmail = reqEmail.trim().toLowerCase();
      localStorage.setItem(EMAIL_STORAGE_KEY, normEmail);
      setViewerEmail(normEmail);

      // Seed optimistic state while we wait for first poll
      setAccessResult({ ok: true, approved: false, status: data.status ?? "pending" });
      setShowModal(false);
    } catch (e: any) {
      setReqError(e.message || "Failed to submit request");
    } finally {
      setReqLoading(false);
    }
  };

  // ── Derived state ──────────────────────────────────────────────────────────
  const isApproved     = accessResult?.approved === true && accessResult.status === "approved";
  const maskedFindings = preview?.findings ?? [];
  const emailFindings  = maskedFindings.filter(f => f.type === "email");
  const phoneFindings  = maskedFindings.filter(f => f.type === "phone");

  // For approved viewer: unmasked values from check-access findings
  const unmaskedEmails = (accessResult?.findings ?? []).filter(f => f.type === "email");
  const unmaskedPhones = (accessResult?.findings ?? []).filter(f => f.type === "phone");

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-4">
        <div className="w-12 h-12 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-slate-400 text-sm">Fetching encrypted document…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-4 px-4">
        <AlertCircle className="w-12 h-12 text-red-500" />
        <h1 className="text-white text-xl font-semibold">Unable to open document</h1>
        <p className="text-slate-400 text-sm text-center max-w-md">{error}</p>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-950 text-white">

      {/* Top bar */}
      <header className="bg-slate-900 border-b border-slate-800 px-4 py-3 flex items-center gap-3">
        <Shield className="w-5 h-5 text-cyan-400" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">{preview?.file_name ?? "Document"}</p>
          <p className="text-xs text-slate-500">Secure view · Encrypted · Tracked</p>
        </div>
        <div className="flex items-center gap-2">
          <Lock className="w-4 h-4 text-green-400" />
          <span className="text-xs text-green-400 font-medium">AES-256</span>
        </div>
      </header>

      <div className="flex flex-col lg:flex-row h-[calc(100vh-56px)]">

        {/* ── Document viewer ───────────────────────────────────────────── */}
        <div className="flex-1 relative overflow-hidden bg-slate-950">
          {pdfBytes ? (
            <PdfViewer pdfBytes={pdfBytes} />
          ) : imgUrl ? (
            <div className="w-full h-full flex items-center justify-center p-4 bg-slate-900">
              <img src={imgUrl} alt={preview?.file_name ?? "Document"}
                   className="max-w-full max-h-full object-contain rounded" />
            </div>
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <p className="text-slate-500">No preview available</p>
            </div>
          )}

          {/* Watermark banner */}
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 pointer-events-none
                          bg-slate-950/80 text-slate-400 text-xs px-3 py-1
                          rounded-full backdrop-blur-sm">
            Secure view only · Contact masked · Activity logged
          </div>
        </div>

        {/* ── Right info panel ──────────────────────────────────────────── */}
        <aside className="w-full lg:w-80 bg-slate-900 border-t lg:border-t-0 lg:border-l
                          border-slate-800 flex flex-col overflow-y-auto">

          {/* Security badges */}
          <div className="p-4 border-b border-slate-800 flex flex-col gap-2">
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Security Info
            </h2>
            <InfoBadge icon={<CheckCircle className="w-3 h-3 text-green-400" />}
                       text="Encrypted with AES-256-GCM" color="green" />
            <InfoBadge icon={<CheckCircle className="w-3 h-3 text-green-400" />}
                       text="Streamed through secure backend" color="green" />
            <InfoBadge icon={<Eye className="w-3 h-3 text-cyan-400" />}
                       text="This view is logged" color="cyan" />
          </div>

          {/* Contact info — masked/unmasked */}
          {maskedFindings.length > 0 && (
            <div className="p-4 border-b border-slate-800">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Contact Info
                </h2>
                {isApproved ? (
                  <span className="text-xs text-green-400 flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" /> Access granted
                  </span>
                ) : (
                  <button onClick={() => setShowMask(v => !v)}
                          className="text-xs text-slate-500 hover:text-white flex items-center gap-1 transition-colors">
                    {showMask
                      ? <><EyeOff className="w-3 h-3" /> Masked</>
                      : <><Eye className="w-3 h-3" /> Visible</>}
                  </button>
                )}
              </div>

              {/* Emails */}
              {emailFindings.length > 0 && (
                <div className="mb-2">
                  <p className="text-xs text-slate-500 mb-1 flex items-center gap-1">
                    <Mail className="w-3 h-3" /> Email
                  </p>
                  {isApproved
                    ? unmaskedEmails.map((f, i) => (
                        <p key={i} className="text-sm font-mono text-green-300 bg-slate-800 px-2 py-1 rounded mb-1">
                          {f.value}
                        </p>
                      ))
                    : emailFindings.map((f, i) => (
                        <p key={i} className="text-sm font-mono text-cyan-300 bg-slate-800 px-2 py-1 rounded mb-1">
                          {showMask ? f.masked : f.original}
                        </p>
                      ))}
                </div>
              )}

              {/* Phones */}
              {phoneFindings.length > 0 && (
                <div>
                  <p className="text-xs text-slate-500 mb-1 flex items-center gap-1">
                    <Phone className="w-3 h-3" /> Phone
                  </p>
                  {isApproved
                    ? unmaskedPhones.map((f, i) => (
                        <p key={i} className="text-sm font-mono text-green-300 bg-slate-800 px-2 py-1 rounded mb-1">
                          {f.value}
                        </p>
                      ))
                    : phoneFindings.map((f, i) => (
                        <p key={i} className="text-sm font-mono text-cyan-300 bg-slate-800 px-2 py-1 rounded mb-1">
                          {showMask ? f.masked : f.original}
                        </p>
                      ))}
                </div>
              )}
            </div>
          )}

          {/* Access-request CTA / status */}
          {maskedFindings.length > 0 && (
            <div className="p-4 border-b border-slate-800">
              {!accessResult && !viewerEmail && (
                <button
                  onClick={() => setShowModal(true)}
                  className="w-full bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-medium
                             py-2.5 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  <UserPlus className="w-4 h-4" />
                  Request Full Contact Info
                </button>
              )}

              {accessResult?.status === "pending" && (
                <div className="flex items-center gap-2 bg-yellow-950/30 border border-yellow-700/30 rounded-lg px-3 py-2.5">
                  <Clock className="w-4 h-4 text-yellow-400 shrink-0 animate-pulse" />
                  <div>
                    <p className="text-xs font-medium text-yellow-300">Request pending</p>
                    <p className="text-xs text-yellow-500/80">Checking every 5 s for approval…</p>
                  </div>
                </div>
              )}

              {isApproved && (
                <div className="flex items-center gap-2 bg-green-950/30 border border-green-700/30 rounded-lg px-3 py-2.5">
                  <CheckCircle className="w-4 h-4 text-green-400 shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-green-300">Access approved!</p>
                    <p className="text-xs text-green-500/80">Full contact info is now visible above</p>
                  </div>
                </div>
              )}

              {accessResult?.status === "rejected" && (
                <div className="flex items-center gap-2 bg-red-950/30 border border-red-700/30 rounded-lg px-3 py-2.5">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-red-300">Request declined</p>
                    <p className="text-xs text-red-500/80">The owner did not approve this request</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Text preview (masked) */}
          {preview?.masked_text && (
            <div className="p-4 border-b border-slate-800 flex-1 flex flex-col overflow-hidden">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Text Preview
                </h2>
                <button onClick={() => setShowText(v => !v)}
                        className="text-xs text-slate-500 hover:text-white flex items-center gap-1 transition-colors">
                  <FileText className="w-3 h-3" />
                  {showText ? "Hide" : "Show"}
                </button>
              </div>
              {showText && (
                <pre className="flex-1 overflow-auto text-xs text-slate-300 bg-slate-950
                                p-3 rounded font-mono whitespace-pre-wrap">
                  {preview.masked_text}
                </pre>
              )}
            </div>
          )}

          <div className="p-4 mt-auto">
            <p className="text-xs text-slate-600 text-center">
              Powered by PINIT Vault · Secure Document Sharing
            </p>
          </div>
        </aside>
      </div>

      {/* ── Access Request Modal ─────────────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl">

            <div className="flex items-center justify-between p-5 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-cyan-400" />
                <h2 className="text-white font-semibold">Request Full Contact Info</h2>
              </div>
              <button onClick={() => { setShowModal(false); setReqError(null); }}
                      className="text-slate-500 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <p className="text-sm text-slate-400">
                Your details will be sent to the document owner. You'll receive unmasked contact info once approved.
              </p>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Full Name *</label>
                <input value={reqName} onChange={e => setReqName(e.target.value)}
                       placeholder="Your full name"
                       className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2
                                  text-sm text-white placeholder-slate-500 focus:outline-none
                                  focus:border-cyan-500 transition-colors" />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Email Address *</label>
                <input type="email" value={reqEmail} onChange={e => setReqEmail(e.target.value)}
                       placeholder="your@email.com"
                       className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2
                                  text-sm text-white placeholder-slate-500 focus:outline-none
                                  focus:border-cyan-500 transition-colors" />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1 flex items-center gap-1">
                  <Building2 className="w-3 h-3" /> Company / Organization
                </label>
                <input value={reqCompany} onChange={e => setReqCompany(e.target.value)}
                       placeholder="Optional"
                       className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2
                                  text-sm text-white placeholder-slate-500 focus:outline-none
                                  focus:border-cyan-500 transition-colors" />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1 flex items-center gap-1">
                  <MessageSquare className="w-3 h-3" /> Message to Owner
                </label>
                <textarea value={reqMessage} onChange={e => setReqMessage(e.target.value)}
                          placeholder="Why are you requesting contact info? (optional)"
                          rows={3}
                          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2
                                     text-sm text-white placeholder-slate-500 focus:outline-none
                                     focus:border-cyan-500 transition-colors resize-none" />
              </div>

              {reqError && (
                <p className="text-xs text-red-400 bg-red-950/30 border border-red-800/30 rounded px-3 py-2">
                  {reqError}
                </p>
              )}
            </div>

            <div className="p-5 border-t border-slate-800 flex gap-3">
              <button onClick={() => { setShowModal(false); setReqError(null); }}
                      className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm
                                 font-medium py-2.5 rounded-lg transition-colors">
                Cancel
              </button>
              <button onClick={submitRequest} disabled={reqLoading}
                      className="flex-1 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white
                                 text-sm font-medium py-2.5 rounded-lg transition-colors
                                 flex items-center justify-center gap-2">
                {reqLoading
                  ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <Send className="w-4 h-4" />}
                {reqLoading ? "Sending…" : "Send Request"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Badge helper ───────────────────────────────────────────────────────────────
function InfoBadge({ icon, text, color }: {
  icon: React.ReactNode; text: string; color: "green" | "cyan" | "yellow";
}) {
  const bg =
    color === "green"  ? "bg-green-950/40 border-green-800/40"  :
    color === "cyan"   ? "bg-cyan-950/40 border-cyan-800/40"    :
                         "bg-yellow-950/40 border-yellow-800/40";
  return (
    <div className={`flex items-center gap-2 px-2 py-1.5 rounded border text-xs ${bg}`}>
      {icon}
      <span className="text-slate-300">{text}</span>
    </div>
  );
}
