/**
 * ResumeShareDashboard
 * ====================
 * Owner-only page (login required).
 * Accessed via: /resume/dashboard/:assetId
 *
 * Shows:
 *   - Active share links for the asset
 *   - View activity log
 *   - Pending access requests (approve / reject)
 */

import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Shield,
  Eye,
  Users,
  Clock,
  CheckCircle,
  XCircle,
  Link2,
  Copy,
  Trash2,
  RefreshCw,
  AlertCircle,
  Building2,
  Mail,
  MessageSquare,
} from "lucide-react";

const BACKEND_URL =
  (import.meta as any).env?.VITE_BACKEND_URL || "http://localhost:8000";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ViewLog {
  viewer_ip: string;
  browser_info: string;
  viewed_at: string;
  download_attempt: boolean;
  share_token?: string;
}

interface AccessRequest {
  id: string;
  requester_name: string;
  requester_email: string;
  requester_company?: string;
  message?: string;
  status: "pending" | "approved" | "rejected";
  requested_at: string;
  approved_at?: string;
  share_token?: string;
}

interface ShareLink {
  share_token: string;
  is_active: boolean;
  created_at: string;
  expires_at?: string;
}

interface DashboardData {
  ok: boolean;
  asset_id: string;
  total_views: number;
  total_requests: number;
  pending_requests: number;
  share_links: ShareLink[];
  views: ViewLog[];
  requests: AccessRequest[];
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ResumeShareDashboard() {
  const { assetId } = useParams<{ assetId: string }>();
  const navigate    = useNavigate();

  const [data, setData]         = useState<DashboardData | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"requests" | "views" | "links">("requests");
  const [copied, setCopied]     = useState<string | null>(null);
  const [responding, setResponding] = useState<string | null>(null);
  const [shareLoading, setShareLoading] = useState(false);

  const userId =
    localStorage.getItem("pinit_user_id") ||
    localStorage.getItem("biovault_userId") ||
    localStorage.getItem("biovault_user_id") ||
    "";

  const load = useCallback(async () => {
    if (!assetId || !userId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `${BACKEND_URL}/resume/share/activity/${assetId}?user_id=${encodeURIComponent(userId)}`
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Error ${res.status}`);
      }
      setData(await res.json());
    } catch (e: any) {
      setError(e.message || "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, [assetId, userId]);

  useEffect(() => { load(); }, [load]);

  // ── Create new share link ──────────────────────────────────────────────────
  const createShareLink = async () => {
    if (!assetId || !userId) return;
    setShareLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/resume/share/create`, {
        method : "POST",
        headers: { "Content-Type": "application/json" },
        body   : JSON.stringify({ asset_id: assetId, user_id: userId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Error ${res.status}`);
      }
      await load(); // refresh
    } catch (e: any) {
      setError(e.message || "Failed to create share link");
    } finally {
      setShareLoading(false);
    }
  };

  // ── Revoke share link ──────────────────────────────────────────────────────
  const revokeLink = async (token: string) => {
    try {
      await fetch(
        `${BACKEND_URL}/resume/share/${token}?user_id=${encodeURIComponent(userId)}`,
        { method: "DELETE" }
      );
      await load();
    } catch {
      /* silent */
    }
  };

  // ── Respond to access request ──────────────────────────────────────────────
  const respond = async (requestId: string, action: "approve" | "reject") => {
    setResponding(requestId);
    try {
      const res = await fetch(`${BACKEND_URL}/resume/share/respond-request`, {
        method : "POST",
        headers: { "Content-Type": "application/json" },
        body   : JSON.stringify({ request_id: requestId, user_id: userId, action }),
      });
      if (res.ok) await load();
    } catch {
      /* silent */
    } finally {
      setResponding(null);
    }
  };

  // ── Copy share URL ─────────────────────────────────────────────────────────
  const copyLink = (token: string) => {
    const url = `${window.location.origin}/shared-view/${token}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(token);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  // ── Loading / error states ─────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-4">
        <div className="w-10 h-10 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-slate-400 text-sm">Loading dashboard…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-4 px-4">
        <AlertCircle className="w-12 h-12 text-red-500" />
        <h1 className="text-white text-xl font-semibold">Dashboard Error</h1>
        <p className="text-slate-400 text-sm text-center max-w-md">{error}</p>
        <button onClick={load}
                className="bg-cyan-600 hover:bg-cyan-700 text-white px-5 py-2 rounded-lg text-sm transition-colors">
          Retry
        </button>
      </div>
    );
  }

  const pendingRequests = (data?.requests ?? []).filter(r => r.status === "pending");
  const activeLinks     = (data?.share_links ?? []).filter(l => l.is_active);

  return (
    <div className="min-h-screen bg-slate-950 text-white">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 bg-slate-900/95 backdrop-blur border-b border-slate-800 px-4 py-4">
        <div className="flex items-center gap-3 max-w-5xl mx-auto">
          <button onClick={() => navigate(-1)}
                  className="p-2 hover:bg-slate-800 rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5 text-cyan-400" />
          </button>
          <Shield className="w-5 h-5 text-cyan-400" />
          <div className="flex-1">
            <h1 className="text-base font-semibold text-white">Resume Share Dashboard</h1>
            <p className="text-xs text-slate-500">Asset: {assetId?.slice(0, 16)}…</p>
          </div>
          <button onClick={load}
                  className="p-2 hover:bg-slate-800 rounded-lg transition-colors text-slate-400 hover:text-white">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">

        {/* ── Stats row ─────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard icon={<Eye className="w-5 h-5 text-cyan-400" />}
                    label="Total Views" value={data?.total_views ?? 0} color="cyan" />
          <StatCard icon={<Users className="w-5 h-5 text-purple-400" />}
                    label="Requests" value={data?.total_requests ?? 0} color="purple" />
          <StatCard icon={<Clock className="w-5 h-5 text-yellow-400" />}
                    label="Pending" value={data?.pending_requests ?? 0} color="yellow" />
          <StatCard icon={<Link2 className="w-5 h-5 text-green-400" />}
                    label="Active Links" value={activeLinks.length} color="green" />
        </div>

        {/* ── Create share link button ───────────────────────────────────── */}
        <div className="flex justify-end">
          <button
            onClick={createShareLink}
            disabled={shareLoading}
            className="bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white text-sm
                       font-medium px-5 py-2.5 rounded-lg transition-colors flex items-center gap-2"
          >
            {shareLoading
              ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : <Link2 className="w-4 h-4" />}
            {shareLoading ? "Creating…" : "New Share Link"}
          </button>
        </div>

        {/* ── Tabs ──────────────────────────────────────────────────────── */}
        <div className="flex gap-1 border-b border-slate-800">
          {(["requests", "views", "links"] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2.5 text-sm font-medium capitalize transition-colors border-b-2 -mb-px
                ${activeTab === tab
                  ? "border-cyan-500 text-cyan-400"
                  : "border-transparent text-slate-500 hover:text-slate-300"}`}
            >
              {tab === "requests" ? `Requests (${data?.total_requests ?? 0})` :
               tab === "views"    ? `Views (${data?.total_views ?? 0})` :
                                    `Share Links (${data?.share_links?.length ?? 0})`}
            </button>
          ))}
        </div>

        {/* ── Tab: Requests ─────────────────────────────────────────────── */}
        {activeTab === "requests" && (
          <div className="space-y-3">
            {pendingRequests.length > 0 && (
              <p className="text-xs text-yellow-400 bg-yellow-950/30 border border-yellow-700/30
                            rounded-lg px-3 py-2">
                {pendingRequests.length} pending request{pendingRequests.length > 1 ? "s" : ""} awaiting your review
              </p>
            )}

            {(data?.requests ?? []).length === 0 ? (
              <EmptyState icon={<Users className="w-10 h-10 text-slate-600" />}
                          message="No access requests yet" />
            ) : (
              (data?.requests ?? []).map(req => (
                <div key={req.id}
                     className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-white">{req.requester_name}</span>
                        <StatusBadge status={req.status} />
                      </div>

                      <div className="mt-1 space-y-0.5">
                        <p className="text-xs text-slate-400 flex items-center gap-1">
                          <Mail className="w-3 h-3" /> {req.requester_email}
                        </p>
                        {req.requester_company && (
                          <p className="text-xs text-slate-400 flex items-center gap-1">
                            <Building2 className="w-3 h-3" /> {req.requester_company}
                          </p>
                        )}
                        {req.message && (
                          <p className="text-xs text-slate-500 flex items-start gap-1 mt-1">
                            <MessageSquare className="w-3 h-3 mt-0.5 shrink-0" />
                            <span className="italic">{req.message}</span>
                          </p>
                        )}
                      </div>

                      <p className="text-xs text-slate-600 mt-1.5">
                        {new Date(req.requested_at).toLocaleString()}
                      </p>
                    </div>

                    {req.status === "pending" && (
                      <div className="flex gap-2 shrink-0">
                        <button
                          onClick={() => respond(req.id, "approve")}
                          disabled={responding === req.id}
                          className="bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white
                                     text-xs px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1"
                        >
                          {responding === req.id
                            ? <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            : <CheckCircle className="w-3 h-3" />}
                          Approve
                        </button>
                        <button
                          onClick={() => respond(req.id, "reject")}
                          disabled={responding === req.id}
                          className="bg-slate-700 hover:bg-red-800 disabled:opacity-50 text-white
                                     text-xs px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1"
                        >
                          <XCircle className="w-3 h-3" />
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* ── Tab: Views ────────────────────────────────────────────────── */}
        {activeTab === "views" && (
          <div className="space-y-2">
            {(data?.views ?? []).length === 0 ? (
              <EmptyState icon={<Eye className="w-10 h-10 text-slate-600" />}
                          message="No views recorded yet" />
            ) : (
              (data?.views ?? []).map((view, i) => (
                <div key={i}
                     className="bg-slate-900 border border-slate-800 rounded-lg px-4 py-3
                                flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm text-white font-mono truncate">
                      {view.viewer_ip || "Unknown IP"}
                    </p>
                    <p className="text-xs text-slate-500 truncate">
                      {view.browser_info || "Unknown browser"}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs text-slate-400">
                      {new Date(view.viewed_at).toLocaleDateString()}
                    </p>
                    <p className="text-xs text-slate-600">
                      {new Date(view.viewed_at).toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* ── Tab: Share Links ──────────────────────────────────────────── */}
        {activeTab === "links" && (
          <div className="space-y-3">
            {(data?.share_links ?? []).length === 0 ? (
              <EmptyState icon={<Link2 className="w-10 h-10 text-slate-600" />}
                          message="No share links yet — click 'New Share Link' to create one" />
            ) : (
              (data?.share_links ?? []).map(link => (
                <div key={link.share_token}
                     className={`bg-slate-900 border rounded-xl p-4 flex items-center gap-3
                       ${link.is_active ? "border-slate-700" : "border-slate-800 opacity-50"}`}>
                  <Link2 className={`w-4 h-4 shrink-0 ${link.is_active ? "text-cyan-400" : "text-slate-600"}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-mono text-slate-300 truncate">
                      {link.share_token.slice(0, 24)}…
                    </p>
                    <p className="text-xs text-slate-500">
                      Created {new Date(link.created_at).toLocaleDateString()}
                      {link.expires_at && ` · Expires ${new Date(link.expires_at).toLocaleDateString()}`}
                    </p>
                  </div>
                  {link.is_active && (
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => copyLink(link.share_token)}
                        className="p-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
                        title="Copy link"
                      >
                        {copied === link.share_token
                          ? <CheckCircle className="w-4 h-4 text-green-400" />
                          : <Copy className="w-4 h-4 text-slate-400" />}
                      </button>
                      <button
                        onClick={() => revokeLink(link.share_token)}
                        className="p-1.5 bg-slate-800 hover:bg-red-900/50 rounded-lg transition-colors"
                        title="Revoke link"
                      >
                        <Trash2 className="w-4 h-4 text-slate-400 hover:text-red-400" />
                      </button>
                    </div>
                  )}
                  {!link.is_active && (
                    <span className="text-xs text-slate-600 shrink-0">Revoked</span>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Small helper components ────────────────────────────────────────────────────

function StatCard({
  icon, label, value, color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: "cyan" | "purple" | "yellow" | "green";
}) {
  const bg =
    color === "cyan"   ? "border-cyan-800/30 bg-cyan-950/20"   :
    color === "purple" ? "border-purple-800/30 bg-purple-950/20" :
    color === "yellow" ? "border-yellow-800/30 bg-yellow-950/20" :
                         "border-green-800/30 bg-green-950/20";
  return (
    <div className={`rounded-xl border p-4 ${bg}`}>
      <div className="flex items-center gap-2 mb-1">{icon}
        <span className="text-xs text-slate-400">{label}</span>
      </div>
      <p className="text-2xl font-bold text-white">{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "pending"  ? "bg-yellow-900/40 text-yellow-300 border-yellow-700/30" :
    status === "approved" ? "bg-green-900/40 text-green-300 border-green-700/30"   :
                            "bg-red-900/40 text-red-300 border-red-700/30";
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border capitalize ${cls}`}>
      {status}
    </span>
  );
}

function EmptyState({ icon, message }: { icon: React.ReactNode; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      {icon}
      <p className="text-sm text-slate-500">{message}</p>
    </div>
  );
}
