/**
 * SharingCenter
 * =============
 * Lists every shared document + per-link stats.
 * Approve / reject pending access requests inline.
 * Copy share link, revoke link.
 */

import { useEffect, useState, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Share2, Eye, Clock, CheckCircle, XCircle, Copy,
  Link2, RefreshCw, UserCheck, UserX, AlertTriangle,
  FileText, ChevronDown, ChevronUp, Trash2, Database, Shield,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";

const BACKEND_URL =
  (import.meta as any).env?.VITE_BACKEND_URL ?? "http://localhost:8000";

// ─── Types ────────────────────────────────────────────────────────────────────

interface VaultAsset {
  asset_id  : string;
  file_name : string;
  file_size : number;
  created_at: string;
}

interface ShareLink {
  share_token: string;
  is_active  : boolean;
  created_at : string;
  expires_at?: string;
}

interface AccessRequest {
  id               : string;
  share_token      : string;
  requester_name   : string;
  requester_email  : string;
  status           : "pending" | "approved" | "rejected";
  requested_at     : string;
  approved_at?     : string;
}

interface ViewLog {
  viewer_ip   : string;
  browser_info: string;
  viewed_at   : string;
  share_token : string;
}

interface AssetActivity {
  asset_id        : string;
  asset           : VaultAsset;
  share_links     : ShareLink[];
  requests        : AccessRequest[];
  views           : ViewLog[];
  total_views     : number;
  total_requests  : number;
  pending_requests: number;
}

// ─── Copy helper ──────────────────────────────────────────────────────────────

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).catch(() => {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  });
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const cfg = {
    pending : "bg-yellow-900/30 text-yellow-400 border-yellow-700/40",
    approved: "bg-green-900/30 text-green-400 border-green-700/40",
    rejected: "bg-red-900/30 text-red-400 border-red-700/40",
  }[status] ?? "bg-slate-800 text-slate-400 border-slate-700";

  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${cfg}`}>
      {status}
    </span>
  );
}

// ─── Asset sharing panel ──────────────────────────────────────────────────────

function AssetPanel({
  activity,
  highlighted,
  onRespond,
  onRevoke,
}: {
  activity   : AssetActivity;
  highlighted: boolean;
  onRespond  : (requestId: string, token: string, action: "approved" | "rejected") => void;
  onRevoke   : (token: string) => void;
}) {
  const [expanded, setExpanded] = useState(highlighted || activity.pending_requests > 0);
  const [copied,   setCopied]   = useState<string | null>(null);
  const navigate = useNavigate();

  const shareUrl = (token: string) =>
    `${window.location.origin}/shared-view/${token}`;

  const handleCopy = (token: string) => {
    copyToClipboard(shareUrl(token));
    setCopied(token);
    setTimeout(() => setCopied(null), 2000);
  };

  const pendingReqs = activity.requests.filter(r => r.status === "pending");
  const otherReqs   = activity.requests.filter(r => r.status !== "pending");

  return (
    <div className={`bg-slate-900 border rounded-2xl overflow-hidden transition-all ${
      highlighted ? "border-cyan-600/50 shadow-lg shadow-cyan-900/20" : "border-slate-800"
    }`}>
      {/* Header */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-slate-800/30 transition-colors"
      >
        <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700
                        flex items-center justify-center shrink-0">
          <FileText className="w-5 h-5 text-cyan-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate">{activity.asset.file_name}</p>
          <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-500">
            <span className="flex items-center gap-1">
              <Link2 className="w-3 h-3" />
              {activity.share_links.filter(l => l.is_active).length} active link{activity.share_links.filter(l => l.is_active).length !== 1 ? "s" : ""}
            </span>
            <span className="flex items-center gap-1">
              <Eye className="w-3 h-3" />
              {activity.total_views} view{activity.total_views !== 1 ? "s" : ""}
            </span>
            {activity.pending_requests > 0 && (
              <span className="flex items-center gap-1 text-yellow-400">
                <Clock className="w-3 h-3 animate-pulse" />
                {activity.pending_requests} pending
              </span>
            )}
          </div>
        </div>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-slate-500 shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" />
        )}
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-slate-800 px-5 py-4 space-y-5">

          {/* Share links */}
          {activity.share_links.length > 0 ? (
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                Share Links
              </p>
              <div className="space-y-2">
                {activity.share_links.map(link => (
                  <div key={link.share_token}
                       className="flex items-center gap-2 bg-slate-800/50 rounded-xl px-3 py-2.5 border border-slate-700/50">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${link.is_active ? "bg-green-400" : "bg-slate-600"}`} />
                    <code className="text-xs text-slate-400 flex-1 truncate font-mono">
                      {shareUrl(link.share_token)}
                    </code>
                    <button
                      onClick={() => handleCopy(link.share_token)}
                      className="text-xs text-slate-500 hover:text-white px-2 py-1 rounded-lg
                                 hover:bg-slate-700 transition-colors shrink-0"
                    >
                      {copied === link.share_token ? (
                        <CheckCircle className="w-3.5 h-3.5 text-green-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                    {link.is_active && (
                      <button
                        onClick={() => onRevoke(link.share_token)}
                        className="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded-lg
                                   hover:bg-red-950/30 transition-colors shrink-0"
                        title="Revoke link"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <span className={`text-xs shrink-0 ${link.is_active ? "text-green-400" : "text-slate-500"}`}>
                      {link.is_active ? "Active" : "Revoked"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-4">
              <p className="text-sm text-slate-500">No share links yet</p>
              <button
                onClick={() => navigate(`/dashboard/sharing/${activity.asset_id}`)}
                className="text-xs text-cyan-500 hover:text-cyan-400 transition-colors mt-1"
              >
                Create a share link →
              </button>
            </div>
          )}

          {/* Pending requests */}
          {pendingReqs.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-yellow-400 uppercase tracking-wider mb-3 flex items-center gap-1">
                <Clock className="w-3 h-3" /> Pending Requests ({pendingReqs.length})
              </p>
              <div className="space-y-2">
                {pendingReqs.map(req => (
                  <div key={req.id}
                       className="flex items-center gap-3 bg-yellow-950/20 border border-yellow-700/30
                                  rounded-xl px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-mono text-yellow-300 truncate">{req.requester_email}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {formatDistanceToNow(new Date(req.requested_at), { addSuffix: true })}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => onRespond(req.id, req.share_token, "approved")}
                        className="flex items-center gap-1 px-3 py-1.5 bg-green-600/20 hover:bg-green-600/40
                                   text-green-400 border border-green-600/30 rounded-lg text-xs
                                   transition-colors"
                      >
                        <UserCheck className="w-3 h-3" /> Approve
                      </button>
                      <button
                        onClick={() => onRespond(req.id, req.share_token, "rejected")}
                        className="flex items-center gap-1 px-3 py-1.5 bg-red-600/10 hover:bg-red-600/25
                                   text-red-400 border border-red-600/20 rounded-lg text-xs
                                   transition-colors"
                      >
                        <UserX className="w-3 h-3" /> Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Other requests */}
          {otherReqs.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                Request History
              </p>
              <div className="space-y-1">
                {otherReqs.slice(0, 5).map(req => (
                  <div key={req.id}
                       className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-slate-800/40 transition-colors">
                    {req.status === "approved"
                      ? <CheckCircle className="w-3.5 h-3.5 text-green-400 shrink-0" />
                      : <XCircle    className="w-3.5 h-3.5 text-red-400 shrink-0" />
                    }
                    <span className="text-xs font-mono text-slate-400 flex-1 truncate">
                      {req.requester_email}
                    </span>
                    <StatusBadge status={req.status} />
                    <span className="text-xs text-slate-600 shrink-0">
                      {formatDistanceToNow(new Date(req.requested_at), { addSuffix: true })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent views */}
          {activity.views.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1">
                <Eye className="w-3 h-3" /> Recent Views ({activity.total_views})
              </p>
              <div className="space-y-1">
                {activity.views.slice(0, 4).map((v, i) => (
                  <div key={i} className="flex items-center gap-3 text-xs text-slate-500 px-2 py-1.5">
                    <span className="font-mono text-slate-600">{v.viewer_ip || "—"}</span>
                    <span className="flex-1 truncate text-slate-500">{v.browser_info || "Unknown browser"}</span>
                    <span className="text-slate-600 shrink-0">
                      {format(new Date(v.viewed_at), "MMM d HH:mm")}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Full dashboard link */}
          <div className="pt-3 border-t border-slate-800">
            <button
              onClick={() => navigate(`/dashboard/sharing/${activity.asset_id}`)}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5
                         bg-cyan-600/15 hover:bg-cyan-600/25 border border-cyan-600/30
                         text-cyan-400 hover:text-cyan-300 text-sm font-medium rounded-xl
                         transition-all"
            >
              <Shield className="w-4 h-4" />
              Open Full Dashboard — Requests · Views · Security · Analytics
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function SharingCenter() {
  const [searchParams] = useSearchParams();
  const highlight      = searchParams.get("highlight") ?? "";
  const userId         = localStorage.getItem("biovault_userId") || "";

  const [activities, setActivities] = useState<AssetActivity[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [responding, setResponding] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      // Get all vault assets
      const vr = await fetch(`${BACKEND_URL}/vault/list?user_id=${encodeURIComponent(userId)}`);
      if (!vr.ok) { setLoading(false); return; }
      const vd   = await vr.json();
      const assets: VaultAsset[] = vd.assets ?? [];

      // For each asset, fetch share activity (parallel, errors ignored)
      const results: AssetActivity[] = [];
      await Promise.allSettled(
        assets.map(async (asset) => {
          try {
            const r = await fetch(
              `${BACKEND_URL}/resume/share/activity/${asset.asset_id}?user_id=${encodeURIComponent(userId)}`
            );
            if (r.ok) {
              const d = await r.json();
              // Only include assets that have share links
              if ((d.share_links ?? []).length > 0) {
                results.push({
                  asset_id        : asset.asset_id,
                  asset,
                  share_links     : d.share_links      ?? [],
                  requests        : d.requests         ?? [],
                  views           : d.views            ?? [],
                  total_views     : d.total_views      ?? 0,
                  total_requests  : d.total_requests   ?? 0,
                  pending_requests: d.pending_requests ?? 0,
                });
              }
            }
          } catch { /* ignore */ }
        })
      );

      // Sort: pending first, then by most views
      results.sort((a, b) => b.pending_requests - a.pending_requests || b.total_views - a.total_views);
      setActivities(results);
    } catch (e) {
      console.error("[SharingCenter] load error:", e);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const handleRespond = useCallback(async (
    requestId: string,
    token    : string,
    action   : "approved" | "rejected"
  ) => {
    setResponding(requestId);
    try {
      await fetch(`${BACKEND_URL}/resume/share/respond-request`, {
        method : "POST",
        headers: { "Content-Type": "application/json" },
        body   : JSON.stringify({ request_id: requestId, share_token: token, action, user_id: userId }),
      });
      // Refresh local state
      setActivities(prev => prev.map(act => ({
        ...act,
        requests: act.requests.map(r => r.id === requestId ? { ...r, status: action } : r),
        pending_requests: act.requests.filter(r => r.id !== requestId && r.status === "pending").length,
      })));
    } catch (e) {
      console.error("[SharingCenter] respond error:", e);
    } finally {
      setResponding(null);
    }
  }, [userId]);

  const handleRevoke = useCallback(async (token: string) => {
    if (!confirm("Revoke this share link? The link will stop working immediately.")) return;
    try {
      await fetch(`${BACKEND_URL}/resume/share/${token}`, { method: "DELETE" });
      setActivities(prev => prev.map(act => ({
        ...act,
        share_links: act.share_links.map(l =>
          l.share_token === token ? { ...l, is_active: false } : l
        ),
      })));
    } catch (e) {
      console.error("[SharingCenter] revoke error:", e);
    }
  }, []);

  const totalPending = activities.reduce((s, a) => s + a.pending_requests, 0);
  const totalViews   = activities.reduce((s, a) => s + a.total_views, 0);

  return (
    <div className="space-y-6 text-white">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Share2 className="w-6 h-6 text-cyan-400" /> Sharing Center
          </h1>
          <p className="text-slate-400 text-sm mt-0.5">
            {activities.length} shared document{activities.length !== 1 ? "s" : ""} ·{" "}
            {totalViews} total view{totalViews !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-800 border
                     border-slate-700 text-slate-400 hover:text-white text-sm transition-colors self-start"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Summary stats */}
      {!loading && activities.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Shared Docs",     val: activities.length, color: "text-cyan-400" },
            { label: "Pending Requests",val: totalPending,       color: "text-yellow-400" },
            { label: "Total Views",     val: totalViews,         color: "text-purple-400" },
          ].map(s => (
            <div key={s.label} className="bg-slate-900 border border-slate-800 rounded-2xl px-4 py-3 text-center">
              <p className={`text-2xl font-bold ${s.color}`}>{s.val}</p>
              <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Pending alert */}
      {totalPending > 0 && (
        <div className="flex items-center gap-3 bg-yellow-950/20 border border-yellow-700/30
                        rounded-2xl px-5 py-3">
          <AlertTriangle className="w-4 h-4 text-yellow-400 shrink-0" />
          <p className="text-sm text-yellow-300">
            <strong>{totalPending}</strong> access request{totalPending > 1 ? "s" : ""} awaiting your response
          </p>
        </div>
      )}

      {/* Asset panels */}
      {loading ? (
        <div className="space-y-4 animate-pulse">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-20 bg-slate-800 rounded-2xl" />
          ))}
        </div>
      ) : activities.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <div className="w-16 h-16 rounded-2xl bg-slate-800 border border-slate-700
                          flex items-center justify-center">
            <Database className="w-8 h-8 text-slate-600" />
          </div>
          <div className="text-center">
            <p className="text-slate-400 font-medium">No shared documents yet</p>
            <p className="text-slate-600 text-sm mt-1">
              Share a document from your Secure Vault to see it here
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {activities.map(act => (
            <div key={act.asset_id} className={responding === act.asset_id ? "opacity-60 pointer-events-none" : ""}>
              <AssetPanel
                activity={act}
                highlighted={act.asset_id === highlight}
                onRespond={handleRespond}
                onRevoke={handleRevoke}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
