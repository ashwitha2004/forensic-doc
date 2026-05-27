/**
 * SecureResumeViewer
 * ==================
 * Public page — no login required.
 * Accessed via:  /shared-view/<token>
 *
 * Phase 2: Streams decrypted document through backend (no raw S3 URLs).
 * Phase 3: Shows masked contact info; viewer can request unmasked access.
 * Phase 4: Every open is logged on the backend.
 */

import { useEffect, useState, useRef } from "react";
import { useParams } from "react-router-dom";
import {
  Shield,
  FileText,
  Eye,
  EyeOff,
  Lock,
  Phone,
  Mail,
  AlertCircle,
  CheckCircle,
  UserPlus,
  Clock,
  X,
  Send,
  Building2,
  MessageSquare,
} from "lucide-react";

const BACKEND_URL =
  (import.meta as any).env?.VITE_BACKEND_URL || "http://localhost:8000";

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
  pending_request_count: number;
}

interface AccessCheckResult {
  ok: boolean;
  status: "not_requested" | "pending" | "approved" | "rejected";
  approved_at?: string;
  findings?: Array<{ type: "email" | "phone"; value: string }>;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SecureResumeViewer() {
  const { token } = useParams<{ token: string }>();

  const [preview, setPreview]       = useState<SharePreview | null>(null);
  const [blobUrl, setBlobUrl]       = useState<string | null>(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [showText, setShowText]     = useState(false);
  const [showMask, setShowMask]     = useState(true);

  // Access-request flow
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [reqName, setReqName]       = useState("");
  const [reqEmail, setReqEmail]     = useState("");
  const [reqCompany, setReqCompany] = useState("");
  const [reqMessage, setReqMessage] = useState("");
  const [reqLoading, setReqLoading] = useState(false);
  const [reqError, setReqError]     = useState<string | null>(null);
  const [requestId, setRequestId]   = useState<string | null>(null);

  // Access-check state (poll after submission)
  const [accessStatus, setAccessStatus] = useState<AccessCheckResult | null>(null);
  const [pollEmail, setPollEmail]        = useState<string | null>(null);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const pollRef   = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Fetch preview metadata + file blob ────────────────────────────────────
  useEffect(() => {
    if (!token) return;

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

        // 2. Decrypted file blob
        const fileRes = await fetch(`${BACKEND_URL}/resume/share/${token}/file`);
        if (!fileRes.ok) {
          const err = await fileRes.json().catch(() => ({}));
          throw new Error(err.detail || `Error ${fileRes.status}`);
        }
        const blob = await fileRes.blob();
        setBlobUrl(URL.createObjectURL(blob));
      } catch (e: any) {
        setError(e.message || "Failed to load document");
      } finally {
        setLoading(false);
      }
    };

    load();

    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // ── Poll access status after request is submitted ─────────────────────────
  useEffect(() => {
    if (!pollEmail || !token) return;

    const checkAccess = async () => {
      try {
        const res = await fetch(
          `${BACKEND_URL}/resume/share/${token}/check-access?requester_email=${encodeURIComponent(pollEmail)}`
        );
        if (res.ok) {
          const data: AccessCheckResult = await res.json();
          setAccessStatus(data);
          if (data.status === "approved" || data.status === "rejected") {
            if (pollRef.current) clearInterval(pollRef.current);
          }
        }
      } catch {
        // silent — keep polling
      }
    };

    checkAccess(); // immediate first check
    pollRef.current = setInterval(checkAccess, 10000); // every 10s
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [pollEmail, token]);

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
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          requester_name   : reqName.trim(),
          requester_email  : reqEmail.trim(),
          requester_company: reqCompany.trim() || undefined,
          message          : reqMessage.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Error ${res.status}`);
      }

      const data = await res.json();
      setRequestId(data.request_id);
      setPollEmail(reqEmail.trim());
      setAccessStatus({ ok: true, status: "pending" });
      setShowRequestModal(false);
    } catch (e: any) {
      setReqError(e.message || "Failed to submit request");
    } finally {
      setReqLoading(false);
    }
  };

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-4">
        <div className="w-12 h-12 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-slate-400 text-sm">Fetching encrypted document…</p>
      </div>
    );
  }

  // ── Error ──────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-4 px-4">
        <AlertCircle className="w-12 h-12 text-red-500" />
        <h1 className="text-white text-xl font-semibold">Unable to open document</h1>
        <p className="text-slate-400 text-sm text-center max-w-md">{error}</p>
      </div>
    );
  }

  const isPdf          = preview?.is_pdf ?? false;
  const maskedFindings = preview?.findings ?? [];
  const emailFindings  = maskedFindings.filter((f) => f.type === "email");
  const phoneFindings  = maskedFindings.filter((f) => f.type === "phone");
  const isApproved     = accessStatus?.status === "approved";

  // ── Main viewer ────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-950 text-white">

      {/* ── Top bar ─────────────────────────────────────────────────────── */}
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

        {/* ── Left — PDF / file viewer ─────────────────────────────────── */}
        <div className="flex-1 bg-slate-900 relative overflow-hidden">
          {blobUrl && isPdf ? (
            <iframe
              ref={iframeRef}
              src={blobUrl}
              title="Secure Document Viewer"
              className="w-full h-full border-0"
              sandbox="allow-scripts allow-same-origin"
            />
          ) : blobUrl ? (
            <div className="w-full h-full flex items-center justify-center p-4">
              <img
                src={blobUrl}
                alt={preview?.file_name ?? "Document"}
                className="max-w-full max-h-full object-contain rounded"
              />
            </div>
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <p className="text-slate-500">No preview available</p>
            </div>
          )}

          <div className="absolute bottom-2 left-1/2 -translate-x-1/2
                          bg-slate-950/80 text-slate-400 text-xs px-3 py-1
                          rounded-full backdrop-blur-sm pointer-events-none">
            Secure view only · Contact masked · Activity logged
          </div>
        </div>

        {/* ── Right — info panel ───────────────────────────────────────── */}
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

          {/* Phase 3 — masked contact info ───────────────────────────── */}
          {maskedFindings.length > 0 && (
            <div className="p-4 border-b border-slate-800">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Contact Info
                </h2>
                {!isApproved && (
                  <button
                    onClick={() => setShowMask((v) => !v)}
                    className="text-xs text-slate-500 hover:text-white flex items-center gap-1 transition-colors"
                  >
                    {showMask
                      ? <><EyeOff className="w-3 h-3" /> Masked</>
                      : <><Eye className="w-3 h-3" /> Visible</>}
                  </button>
                )}
                {isApproved && (
                  <span className="text-xs text-green-400 flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" /> Access granted
                  </span>
                )}
              </div>

              {emailFindings.length > 0 && (
                <div className="mb-2">
                  <p className="text-xs text-slate-500 mb-1 flex items-center gap-1">
                    <Mail className="w-3 h-3" /> Email
                  </p>
                  {emailFindings.map((f, i) => (
                    <p key={i} className="text-sm font-mono text-cyan-300 bg-slate-800 px-2 py-1 rounded mb-1">
                      {isApproved
                        ? (accessStatus?.findings?.find(x => x.type === "email")?.value ?? f.original)
                        : (showMask ? f.masked : f.original)}
                    </p>
                  ))}
                </div>
              )}

              {phoneFindings.length > 0 && (
                <div>
                  <p className="text-xs text-slate-500 mb-1 flex items-center gap-1">
                    <Phone className="w-3 h-3" /> Phone
                  </p>
                  {phoneFindings.map((f, i) => (
                    <p key={i} className="text-sm font-mono text-cyan-300 bg-slate-800 px-2 py-1 rounded mb-1">
                      {isApproved
                        ? (accessStatus?.findings?.find(x => x.type === "phone")?.value ?? f.original)
                        : (showMask ? f.masked : f.original)}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Access request section ───────────────────────────────────── */}
          {maskedFindings.length > 0 && (
            <div className="p-4 border-b border-slate-800">
              {!accessStatus && (
                <button
                  onClick={() => setShowRequestModal(true)}
                  className="w-full bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-medium
                             py-2.5 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  <UserPlus className="w-4 h-4" />
                  Request Full Contact Info
                </button>
              )}

              {accessStatus?.status === "pending" && (
                <div className="flex items-center gap-2 bg-yellow-950/30 border border-yellow-700/30
                                rounded-lg px-3 py-2.5">
                  <Clock className="w-4 h-4 text-yellow-400 shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-yellow-300">Request pending</p>
                    <p className="text-xs text-yellow-500/80">Waiting for owner approval…</p>
                  </div>
                </div>
              )}

              {accessStatus?.status === "approved" && (
                <div className="flex items-center gap-2 bg-green-950/30 border border-green-700/30
                                rounded-lg px-3 py-2.5">
                  <CheckCircle className="w-4 h-4 text-green-400 shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-green-300">Access approved!</p>
                    <p className="text-xs text-green-500/80">Full contact info is now visible</p>
                  </div>
                </div>
              )}

              {accessStatus?.status === "rejected" && (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2 bg-red-950/30 border border-red-700/30
                                  rounded-lg px-3 py-2.5">
                    <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                    <div>
                      <p className="text-xs font-medium text-red-300">Request declined</p>
                      <p className="text-xs text-red-500/80">The owner did not approve this request</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Text preview ────────────────────────────────────────────── */}
          {preview?.masked_text && (
            <div className="p-4 border-b border-slate-800 flex-1 overflow-hidden flex flex-col">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Text Preview
                </h2>
                <button
                  onClick={() => setShowText((v) => !v)}
                  className="text-xs text-slate-500 hover:text-white flex items-center gap-1 transition-colors"
                >
                  <FileText className="w-3 h-3" />
                  {showText ? "Hide" : "Show"}
                </button>
              </div>
              {showText && (
                <pre className="flex-1 overflow-auto text-xs text-slate-300
                                bg-slate-950 p-3 rounded font-mono whitespace-pre-wrap">
                  {preview.masked_text}
                </pre>
              )}
            </div>
          )}

          {/* Footer */}
          <div className="p-4 mt-auto">
            <p className="text-xs text-slate-600 text-center">
              Powered by PINIT Vault · Secure Document Sharing
            </p>
          </div>
        </aside>
      </div>

      {/* ── Access Request Modal ─────────────────────────────────────────── */}
      {showRequestModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm
                        flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl">

            {/* Modal header */}
            <div className="flex items-center justify-between p-5 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-cyan-400" />
                <h2 className="text-white font-semibold">Request Full Contact Info</h2>
              </div>
              <button onClick={() => { setShowRequestModal(false); setReqError(null); }}
                      className="text-slate-500 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal body */}
            <div className="p-5 space-y-4">
              <p className="text-sm text-slate-400">
                Fill in your details and the document owner will review your request.
                You'll receive unmasked contact info once approved.
              </p>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Full Name *</label>
                <input
                  value={reqName}
                  onChange={(e) => setReqName(e.target.value)}
                  placeholder="Your full name"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2
                             text-sm text-white placeholder-slate-500 focus:outline-none
                             focus:border-cyan-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Email Address *</label>
                <input
                  type="email"
                  value={reqEmail}
                  onChange={(e) => setReqEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2
                             text-sm text-white placeholder-slate-500 focus:outline-none
                             focus:border-cyan-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1 flex items-center gap-1">
                  <Building2 className="w-3 h-3" /> Company / Organization
                </label>
                <input
                  value={reqCompany}
                  onChange={(e) => setReqCompany(e.target.value)}
                  placeholder="Optional"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2
                             text-sm text-white placeholder-slate-500 focus:outline-none
                             focus:border-cyan-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1 flex items-center gap-1">
                  <MessageSquare className="w-3 h-3" /> Message to Owner
                </label>
                <textarea
                  value={reqMessage}
                  onChange={(e) => setReqMessage(e.target.value)}
                  placeholder="Why are you requesting contact info? (optional)"
                  rows={3}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2
                             text-sm text-white placeholder-slate-500 focus:outline-none
                             focus:border-cyan-500 transition-colors resize-none"
                />
              </div>

              {reqError && (
                <p className="text-xs text-red-400 bg-red-950/30 border border-red-800/30 rounded px-3 py-2">
                  {reqError}
                </p>
              )}
            </div>

            {/* Modal footer */}
            <div className="p-5 border-t border-slate-800 flex gap-3">
              <button
                onClick={() => { setShowRequestModal(false); setReqError(null); }}
                className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium
                           py-2.5 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={submitRequest}
                disabled={reqLoading}
                className="flex-1 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white text-sm font-medium
                           py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
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

// ── Small badge helper ─────────────────────────────────────────────────────────
function InfoBadge({
  icon, text, color,
}: {
  icon: React.ReactNode;
  text: string;
  color: "green" | "cyan" | "yellow";
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
