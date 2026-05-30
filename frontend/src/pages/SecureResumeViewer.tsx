/**
 * SecureResumeViewer
 * ==================
 * Public page — no login required.
 * Route: /shared-view/:token
 *
 * PDF viewer masking (new):
 *   After each page render, pdf.js text-content positions are used to draw
 *   opaque masking rectangles directly on the canvas over any email / phone
 *   text items. When the viewer's access request is approved, the page
 *   re-renders without the masking step, revealing the original text.
 *   The PDF file is NEVER modified; the mask is a canvas paint-over only.
 *
 * Security preserved:
 *   - AES-256-GCM decryption entirely on backend
 *   - No raw Supabase URLs exposed
 *   - Activity logging intact
 *   - Sidebar masking/unmasking logic unchanged
 *   - Approval is per-viewer-email, never global
 */

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams } from "react-router-dom";
import * as pdfjsLib from "pdfjs-dist";
import { useResumeActivityTracker } from "@/hooks/useResumeActivityTracker";
import {
  Shield, FileText, Eye, EyeOff, Lock, Phone, Mail,
  AlertCircle, CheckCircle, UserPlus, Clock,
  ChevronLeft, ChevronRight,
} from "lucide-react";

// Point pdf.js worker at the bundled copy shipped with pdfjs-dist
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

const BACKEND_URL =
  (import.meta as any).env?.VITE_BACKEND_URL || "";

const POLL_INTERVAL_MS = 5000;
/** Returns a token-scoped key so each share link has independent request state. */
const emailKey = (token: string) => `resume_viewer_email__${token}`;

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

// ─── Canvas masking helpers ───────────────────────────────────────────────────

/** Same patterns as backend — kept in sync intentionally */
const _EMAIL_RE = /[a-zA-Z0-9._%+\-]{2,}@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
const _PHONE_RE = /(?<!\d)(?:\+91[\s\-]?)?(?:\(?\d{2,4}\)?[\s\-]?)?\d{3,5}[\s\-]?\d{4,6}(?!\d)/g;

function _maskEmail(email: string): string {
  const atIdx  = email.lastIndexOf("@");
  const local  = email.slice(0, atIdx);
  const domain = email.slice(atIdx);
  const visible = local.slice(0, 3);
  return `${visible}${"*".repeat(Math.max(3, local.length - 3))}${domain}`;
}

function _maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return "****";
  return `${"X".repeat(digits.length - 4)}${digits.slice(-4)}`;
}

/**
 * Combine two 6-element affine transform matrices:
 *   result = outer ∘ inner   (apply inner first, then outer)
 * Used to convert pdf.js text-item transforms → canvas pixel coordinates.
 */
function _combineTransform(outer: number[], inner: number[]): number[] {
  return [
    outer[0] * inner[0] + outer[2] * inner[1],
    outer[1] * inner[0] + outer[3] * inner[1],
    outer[0] * inner[2] + outer[2] * inner[3],
    outer[1] * inner[2] + outer[3] * inner[3],
    outer[0] * inner[4] + outer[2] * inner[5] + outer[4],
    outer[1] * inner[4] + outer[3] * inner[5] + outer[5],
  ];
}

/**
 * After a pdf.js page has been rendered to `canvas`, paint opaque masking
 * rectangles over every text item that contains an email or phone number.
 * Each box shows the masked variant in cyan monospace.
 *
 * Called with isApproved=true → function returns immediately (no masking).
 * The original PDF bytes are never modified.
 */
async function _applyContactMask(
  page: pdfjsLib.PDFPageProxy,
  viewport: pdfjsLib.PageViewport,
  canvas: HTMLCanvasElement,
  isApproved: boolean,
): Promise<void> {
  if (isApproved) return; // approved viewer — show original text

  let textContent: pdfjsLib.TextContent;
  try {
    textContent = await page.getTextContent();
  } catch {
    return; // best-effort — never block rendering
  }

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  for (const item of textContent.items) {
    // TextMarkedContent items have no `str` — skip them
    if (!("str" in item)) continue;
    const { str, transform, width } = item as any;
    if (!str || typeof str !== "string") continue;

    // Collect all email / phone matches in this text item
    const emails = [...str.matchAll(new RegExp(_EMAIL_RE.source, "g"))].map(m => m[0]);
    const phones = [...str.matchAll(new RegExp(_PHONE_RE.source, "g"))]
      .map(m => m[0].trim())
      .filter(p => p.replace(/\D/g, "").length >= 7);

    if (emails.length === 0 && phones.length === 0) continue;

    // --- Convert PDF text-item origin to canvas pixel coordinates ----------
    //
    // `transform` is the text matrix in PDF user space: [a b c d x y]
    // `viewport.transform` converts PDF user space → canvas pixels (y-flipped)
    // Combined matrix columns:
    //   [0],[1] — x-axis in canvas space
    //   [2],[3] — y-axis in canvas space
    //   [4],[5] — origin (baseline left) in canvas pixels
    //
    const combined  = _combineTransform(viewport.transform, transform);
    const canvasX   = combined[4];
    const canvasY   = combined[5];                     // text baseline (y-down)
    const fontH     = Math.abs(combined[3]) || Math.abs(combined[0]) || 12;
    // item.width is in PDF user space; multiply by viewport scale for canvas px
    const rawW      = (typeof width === "number" && width > 0)
                        ? width * viewport.scale
                        : ctx.measureText(str).width;
    const rectW     = Math.max(rawW, 20);

    // --- Mask box -----------------------------------------------------------
    const pad    = 2;
    const boxTop = canvasY - fontH * 1.15;
    const boxH   = fontH * 1.4;

    // Solid background — matches the "secure" dark palette used by the sidebar
    ctx.fillStyle = "rgba(8, 47, 73, 0.97)";   // very dark cyan-950
    ctx.fillRect(canvasX - pad, boxTop, rectW + pad * 2, boxH);

    // Subtle border so it reads as "redacted" rather than a rendering glitch
    ctx.strokeStyle = "rgba(34, 211, 238, 0.45)"; // cyan-400 @45%
    ctx.lineWidth   = 0.8;
    ctx.strokeRect(canvasX - pad, boxTop, rectW + pad * 2, boxH);

    // Masked text — one line per match; truncate if multiple in one item
    const maskedStr = [
      ...emails.map(_maskEmail),
      ...phones.map(_maskPhone),
    ].join("  ");

    ctx.fillStyle = "#67e8f9";                  // cyan-300
    ctx.font      = `${Math.max(8, fontH * 0.72)}px "Courier New", monospace`;
    ctx.fillText(maskedStr, canvasX + 2, canvasY - fontH * 0.12, rectW - 4);
  }
}

// ─── PDF Viewer component ─────────────────────────────────────────────────────

interface PdfViewerProps {
  pdfBytes: Uint8Array;
  /** When true the masking step is skipped and the raw PDF text shows through */
  isApproved: boolean;
}

function PdfViewer({ pdfBytes, isApproved }: PdfViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [numPages, setNumPages] = useState(0);
  const [pageNum, setPageNum]   = useState(1);
  const [scale, setScale]       = useState(2.0);
  const [pdfDoc, setPdfDoc]     = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const canvasRef               = useRef<HTMLCanvasElement>(null);
  const renderTaskRef           = useRef<pdfjsLib.RenderTask | null>(null);

  // Auto-fit scale to container width when doc first loads
  // so the PDF fills the viewer on any screen size (mobile or desktop)
  const fitScaleToContainer = useCallback(async (doc: pdfjsLib.PDFDocumentProxy) => {
    if (!containerRef.current) return;
    try {
      const page        = await doc.getPage(1);
      const naturalVP   = page.getViewport({ scale: 1 });
      const containerW  = containerRef.current.clientWidth || window.innerWidth;
      // Leave 32px gutter (16px each side)
      const dpr    = window.devicePixelRatio || 1;
      // Target 2.5× logical scale for crispness; cap at 3 to avoid memory issues
      const fitted = Math.max(0.8, Math.min(3, ((containerW - 32) / naturalVP.width) * Math.min(dpr, 2.5)));
      setScale(parseFloat(fitted.toFixed(2)));
    } catch {
      // fall back to 1.4 if page read fails
    }
  }, []);

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
          await fitScaleToContainer(doc);
        }
      } catch (e) {
        console.error("[PDFViewer] load error:", e);
      }
    };
    loadDoc();
    return () => { cancelled = true; };
  }, [pdfBytes, fitScaleToContainer]);

  // Render page → then apply contact masking overlay
  // isApproved is a dependency: changing it re-renders the page (masked or clean)
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return;
    let cancelled = false;

    const renderPage = async () => {
      try {
        if (renderTaskRef.current) {
          renderTaskRef.current.cancel();
          renderTaskRef.current = null;
        }

        const page  = await pdfDoc.getPage(pageNum);
        const dpr   = window.devicePixelRatio || 1;
        // Render at physical pixels for crisp text on high-DPI screens
        const viewport    = page.getViewport({ scale: scale * dpr });
        const cssViewport = page.getViewport({ scale });

        const canvas = canvasRef.current!;
        const ctx    = canvas.getContext("2d")!;
        canvas.height = viewport.height;
        canvas.width  = viewport.width;
        // Display at CSS size so layout is unchanged
        canvas.style.width  = `${cssViewport.width}px`;
        canvas.style.height = `${cssViewport.height}px`;

        // Step 1 — render clean PDF pixels
        const task = page.render({ canvasContext: ctx, viewport });
        renderTaskRef.current = task;
        await task.promise;
        if (cancelled) return;
        renderTaskRef.current = null;

        // Step 2 — paint contact masking on top (no-op when approved)
        await _applyContactMask(page, viewport, canvas, isApproved);
      } catch (e: any) {
        if (e?.name !== "RenderingCancelledException") {
          console.error("[PDFViewer] render error:", e);
        }
      }
    };

    renderPage();
    return () => { cancelled = true; };
  }, [pdfDoc, pageNum, scale, isApproved]); // ← isApproved triggers re-render on approval

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar — unchanged */}
      <div className="flex items-center justify-between bg-slate-800 px-4 py-2 shrink-0">
        <div className="flex items-center gap-2">
          <button onClick={() => setPageNum(p => Math.max(1, p - 1))} disabled={pageNum <= 1}
                  className="p-1 rounded hover:bg-slate-700 disabled:opacity-40 transition-colors">
            <ChevronLeft className="w-4 h-4 text-slate-300" />
          </button>
          <span className="text-xs text-slate-300 tabular-nums">{pageNum} / {numPages}</span>
          <button onClick={() => setPageNum(p => Math.min(numPages, p + 1))} disabled={pageNum >= numPages}
                  className="p-1 rounded hover:bg-slate-700 disabled:opacity-40 transition-colors">
            <ChevronRight className="w-4 h-4 text-slate-300" />
          </button>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setScale(s => Math.max(0.5, s - 0.2))}
                  className="px-2 py-0.5 text-xs bg-slate-700 hover:bg-slate-600 rounded transition-colors text-slate-300">−</button>
          <span className="text-xs text-slate-400 w-12 text-center tabular-nums">{Math.round(scale * 100)}%</span>
          <button onClick={() => setScale(s => Math.min(3, s + 0.2))}
                  className="px-2 py-0.5 text-xs bg-slate-700 hover:bg-slate-600 rounded transition-colors text-slate-300">+</button>
        </div>
      </div>

      {/* Canvas */}
      <div ref={containerRef} className="flex-1 overflow-auto bg-slate-950 flex justify-center py-4">
        <canvas ref={canvasRef} className="shadow-2xl rounded" style={{ maxWidth: "100%" }} />
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function SecureResumeViewer() {
  const { token } = useParams<{ token: string }>();

  const [preview, setPreview]   = useState<SharePreview | null>(null);
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [imgUrl, setImgUrl]     = useState<string | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [showText, setShowText] = useState(false);
  const [showMask, setShowMask] = useState(true);

  // Access-request state (single-click, no form)
  const [reqLoading, setReqLoading] = useState(false);
  const [reqError, setReqError]     = useState<string | null>(null);

  // Approval polling — per-email, never global
  const [accessResult, setAccessResult] = useState<CheckAccessResult | null>(null);
  const [viewerEmail, setViewerEmail]   = useState<string | null>(
    () => (token ? localStorage.getItem(emailKey(token)) : null)
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
        const previewRes = await fetch(`${BACKEND_URL}/resume/share/${token}`);
        if (!previewRes.ok) {
          const err = await previewRes.json().catch(() => ({}));
          throw new Error(err.detail || `Error ${previewRes.status}`);
        }
        const previewData: SharePreview = await previewRes.json();
        setPreview(previewData);

        const fileRes = await fetch(`${BACKEND_URL}/resume/share/${token}/file`);
        if (!fileRes.ok) {
          const err = await fileRes.json().catch(() => ({}));
          throw new Error(err.detail || `Error ${fileRes.status}`);
        }

        const blob  = await fileRes.blob();
        const isPdf = previewData.is_pdf || blob.type === "application/pdf";

        if (isPdf) {
          const buf = await blob.arrayBuffer();
          setPdfBytes(new Uint8Array(buf));
        } else if (blob.type.startsWith("image/")) {
          // Only render as <img> for actual image files (PNG, JPG, etc.)
          const url = URL.createObjectURL(blob);
          revoke    = url;
          setImgUrl(url);
        }
        // else: Word / Office / other non-renderable format — leave pdfBytes
        // and imgUrl null so the document-placeholder branch is shown instead.
      } catch (e: any) {
        setError(e.message || "Failed to load document");
      } finally {
        setLoading(false);
      }
    };

    load();
    return () => { if (revoke) URL.revokeObjectURL(revoke); };
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
      if (data.status === "approved" || data.status === "rejected") {
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      }
    } catch {
      // silent — keep polling
    }
  }, [token]);

  useEffect(() => {
    if (!viewerEmail) return;
    checkAccess(viewerEmail);
    pollRef.current = setInterval(() => checkAccess(viewerEmail), POLL_INTERVAL_MS);
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [viewerEmail, checkAccess]);

  // ── Submit access request — single click, no form ─────────────────────────
  // Identity is derived from the session ID already stored in sessionStorage.
  // No manual text entry required from the viewer.
  const submitRequest = async () => {
    if (!token) return;
    setReqLoading(true);
    setReqError(null);
    try {
      // Derive a stable, unique identifier from the per-token session ID.
      const sid   = sessionStorage.getItem(`rsv_sid__${token}`) ?? `s${Date.now().toString(36)}`;
      const clean = sid.replace(/[^a-z0-9]/gi, "").slice(0, 12);
      const generatedEmail = `viewer-${clean}@pinit.session`;

      const res = await fetch(`${BACKEND_URL}/resume/share/request-access`, {
        method : "POST",
        headers: { "Content-Type": "application/json" },
        body   : JSON.stringify({
          token,
          requester_name : "Viewer",
          requester_email: generatedEmail,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Error ${res.status}`);
      }
      const data = await res.json();
      localStorage.setItem(emailKey(token), generatedEmail);
      setViewerEmail(generatedEmail);
      setAccessResult({ ok: true, approved: false, status: data.status ?? "pending" });
    } catch (e: any) {
      setReqError(e.message || "Failed to send request");
    } finally {
      setReqLoading(false);
    }
  };

  // ── Derived state ──────────────────────────────────────────────────────────
  // Computed before the tracking hook so isApproved can be forwarded to it.
  const isApproved     = accessResult?.approved === true && accessResult.status === "approved";

  // ── Activity tracking — isolated background layer, no UI impact ───────────
  // isApproved is passed so the hook can trigger geolocation after approval.
  useResumeActivityTracker(token, viewerEmail, isApproved);
  const maskedFindings = preview?.findings ?? [];
  const emailFindings  = maskedFindings.filter(f => f.type === "email");
  const phoneFindings  = maskedFindings.filter(f => f.type === "phone");
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

      {/* Top bar — unchanged */}
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

      {/* On mobile: stacked, scrollable; on desktop: fixed-height side-by-side */}
      <div className="flex flex-col lg:flex-row lg:h-[calc(100vh-56px)]">

        {/* ── Document viewer — now passes isApproved to PdfViewer ──────── */}
        <div className="relative overflow-hidden bg-slate-950 h-[55vh] lg:h-auto lg:flex-1">
          {pdfBytes ? (
            <PdfViewer pdfBytes={pdfBytes} isApproved={isApproved} />
          ) : imgUrl ? (
            <div className="w-full h-full flex items-center justify-center p-4 bg-slate-900">
              <img src={imgUrl} alt={preview?.file_name ?? "Document"}
                   className="max-w-full max-h-full object-contain rounded" />
            </div>
          ) : (
            /* Word / Office / non-renderable document */
            <div className="w-full h-full flex flex-col items-center justify-center p-8 gap-5 bg-slate-950">
              <div className="w-20 h-20 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center">
                <FileText className="w-10 h-10 text-cyan-400" />
              </div>
              <div className="text-center max-w-xs">
                <p className="text-white font-semibold text-base mb-1 break-all">
                  {preview?.file_name ?? "Document"}
                </p>
                <p className="text-slate-400 text-sm mb-1">
                  Word document · In-browser preview not supported
                </p>
                {preview?.masked_text && (
                  <p className="text-slate-500 text-xs mt-3">
                    Text content is available — tap <strong className="text-slate-400">Text Preview</strong> in the panel below.
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 pointer-events-none
                          bg-slate-950/80 text-slate-400 text-xs px-3 py-1
                          rounded-full backdrop-blur-sm">
            Secure view only · Contact masked · Activity logged
          </div>
        </div>

        {/* ── Right info panel — identical to before ────────────────────── */}
        <aside className="w-full lg:w-80 bg-slate-900 border-t lg:border-t-0 lg:border-l
                          border-slate-800 flex flex-col lg:overflow-y-auto">

          {/* Sidebar contact section */}
          {maskedFindings.length > 0 && (
            <div className="p-4 border-b border-slate-800">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Contact Info
                </h2>
                {isApproved && (
                  <span className="text-xs text-green-400 flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" /> Access granted
                  </span>
                )}
                {!isApproved && (
                  <span className="text-xs text-slate-500 flex items-center gap-1">
                    <EyeOff className="w-3 h-3" /> Masked
                  </span>
                )}
              </div>

              {/* Email */}
              {emailFindings.length > 0 && (
                <div className="mb-2">
                  <p className="text-xs text-slate-500 mb-1 flex items-center gap-1">
                    <Mail className="w-3 h-3" /> Email
                  </p>
                  {isApproved
                    ? unmaskedEmails.map((f, i) => (
                        <p key={i} className="text-sm font-mono text-green-300 bg-slate-800 px-2 py-1 rounded mb-1">{f.value}</p>
                      ))
                    : emailFindings.map((f, i) => (
                        <p key={i} className="text-sm font-mono text-cyan-300 bg-slate-800 px-2 py-1 rounded mb-1">
                          {f.masked}
                        </p>
                      ))}
                </div>
              )}

              {/* Phone */}
              {phoneFindings.length > 0 && (
                <div>
                  <p className="text-xs text-slate-500 mb-1 flex items-center gap-1">
                    <Phone className="w-3 h-3" /> Phone
                  </p>
                  {isApproved
                    ? unmaskedPhones.map((f, i) => (
                        <p key={i} className="text-sm font-mono text-green-300 bg-slate-800 px-2 py-1 rounded mb-1">{f.value}</p>
                      ))
                    : phoneFindings.map((f, i) => (
                        <p key={i} className="text-sm font-mono text-cyan-300 bg-slate-800 px-2 py-1 rounded mb-1">
                          {f.masked}
                        </p>
                      ))}
                </div>
              )}
            </div>
          )}

          {/* Access-request CTA / status — unchanged */}
          {maskedFindings.length > 0 && (
            <div className="p-4 border-b border-slate-800">
              {!accessResult && !viewerEmail && (
                <div className="space-y-2">
                  <button
                    onClick={submitRequest}
                    disabled={reqLoading}
                    className="w-full bg-cyan-600 hover:bg-cyan-700 disabled:opacity-60 text-white text-sm
                               font-medium py-2.5 px-4 rounded-lg transition-colors flex items-center
                               justify-center gap-2"
                  >
                    {reqLoading
                      ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      : <UserPlus className="w-4 h-4" />}
                    {reqLoading ? "Sending…" : "Request Access"}
                  </button>
                  {reqError && (
                    <p className="text-xs text-red-400 text-center">{reqError}</p>
                  )}
                </div>
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
                    <p className="text-xs text-green-500/80">Full contact info is now visible</p>
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

          {/* Text preview — unchanged */}
          {preview?.masked_text && (
            <div className="p-4 border-b border-slate-800 flex-1 flex flex-col overflow-hidden">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Text Preview</h2>
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

    </div>
  );
}

// ── Badge helper — unchanged ───────────────────────────────────────────────────
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
