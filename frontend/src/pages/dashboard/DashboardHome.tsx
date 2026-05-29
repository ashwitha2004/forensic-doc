/**
 * DashboardHome — Resume Command Center
 * =======================================
 * UI-only reorganization. All data fetching reuses the exact same API
 * endpoints already used by ActivityCenter and SharingCenter.
 *
 * Sections:
 *  1. Compact action buttons
 *  2. Quick Security Insights (4 stat cards)
 *  3. Security Tracking Summary (6 counters from sessions)
 *  4. Recent Uploaded Resumes (cards with Open Dashboard)
 *  5. Pending Access Requests (inline approve / reject)
 *  6. Recent Activity Feed
 */

import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Upload, Share2, Microscope, Activity,
  Eye, Users, AlertTriangle, Clock,
  Copy, Printer, Camera, CheckCircle, XCircle,
  FileText, Link2, UserCheck, UserX, RefreshCw,
  Shield, BarChart2,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";

const BACKEND_URL =
  (import.meta as any).env?.VITE_BACKEND_URL ?? "http://localhost:8000";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface VaultAsset {
  asset_id  : string;
  file_name : string;
  file_type : string;
  file_size : number;
  created_at: string;
}

interface ShareLink {
  share_token: string;
  is_active  : boolean;
}

interface AccessRequest {
  id               : string;
  share_token      : string;
  requester_email  : string;
  requester_name   : string;
  status           : "pending" | "approved" | "rejected";
  requested_at     : string;
}

interface ViewerSession {
  copy_count        : number;
  print_attempts    : number;
  screenshot_signals: number;
  is_suspicious     : boolean;
  device_type       : "desktop" | "mobile" | "tablet";
  viewer_email      : string;
  first_seen        : string;
  browser           : string;
}

interface ResumeCard {
  asset        : VaultAsset;
  activeLinks  : number;
  totalViews   : number;
  pendingCount : number;
  totalRequests: number;
}

interface PendingRow {
  request  : AccessRequest;
  fileName : string;
  assetId  : string;
}

interface SecurityMetrics {
  totalViews       : number;
  totalSessions    : number;
  suspiciousCount  : number;
  copyCount        : number;
  printAttempts    : number;
  screenshotSignals: number;
  approvedViewers  : number;
  activeShared     : number;
  pendingTotal     : number;
  alertCount       : number;
}

interface ActivityEvent {
  kind   : "view" | "request" | "session";
  label  : string;
  sub    : string;
  time   : string;
  color  : string;
}

// ─── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({
  label, value, icon: Icon, color, sublabel,
}: {
  label   : string;
  value   : number | string;
  icon    : React.ComponentType<{ className?: string }>;
  color   : "cyan" | "green" | "yellow" | "red" | "purple";
  sublabel?: string;
}) {
  const cfg = {
    cyan  : "from-cyan-500/20 to-cyan-600/10 border-cyan-600/30 text-cyan-400",
    green : "from-green-500/20 to-green-600/10 border-green-600/30 text-green-400",
    yellow: "from-yellow-500/20 to-yellow-600/10 border-yellow-600/30 text-yellow-400",
    red   : "from-red-500/20 to-red-600/10 border-red-600/30 text-red-400",
    purple: "from-purple-500/20 to-purple-600/10 border-purple-600/30 text-purple-400",
  }[color];
  const iconColor = cfg.split(" ").pop()!;
  return (
    <div className={`bg-gradient-to-br ${cfg} border rounded-2xl p-5`}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-slate-400 text-xs font-medium uppercase tracking-wider">{label}</p>
        <Icon className={`w-5 h-5 ${iconColor}`} />
      </div>
      <p className="text-3xl font-bold text-white tabular-nums">{value}</p>
      {sublabel && <p className="text-xs text-slate-500 mt-1">{sublabel}</p>}
    </div>
  );
}

// ─── Security counter tile ──────────────────────────────────────────────────────

function SecTile({
  label, value, icon: Icon, color,
}: {
  label: string;
  value: number;
  icon : React.ComponentType<{ className?: string }>;
  color: string;
}) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-slate-500 uppercase tracking-wider">{label}</p>
        <Icon className={`w-4 h-4 ${color}`} />
      </div>
      <p className="text-2xl font-bold text-white tabular-nums">{value}</p>
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────────

export default function DashboardHome() {
  const navigate = useNavigate();
  const userId   = localStorage.getItem("biovault_userId") || "";

  const [loading,      setLoading]      = useState(true);
  const [resumes,      setResumes]      = useState<ResumeCard[]>([]);
  const [pending,      setPending]      = useState<PendingRow[]>([]);
  const [metrics,      setMetrics]      = useState<SecurityMetrics | null>(null);
  const [feed,         setFeed]         = useState<ActivityEvent[]>([]);
  const [responding,   setResponding]   = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      // 1. Vault assets
      const vr = await fetch(`${BACKEND_URL}/vault/list?user_id=${encodeURIComponent(userId)}`);
      if (!vr.ok) { setLoading(false); return; }
      const { assets }: { assets: VaultAsset[] } = await vr.json();

      // 2. Share activity + sessions per asset (parallel)
      const resumeCards  : ResumeCard[]     = [];
      const pendingRows  : PendingRow[]     = [];
      const feedEvents   : ActivityEvent[]  = [];

      let totalViews        = 0;
      let totalSessions     = 0;
      let suspiciousCount   = 0;
      let copyCount         = 0;
      let printAttempts     = 0;
      let screenshotSignals = 0;
      let approvedViewers   = 0;
      let activeShared      = 0;
      let pendingTotal      = 0;

      // Pre-populate resumeCards with ALL vault assets — never gated on share activity
      for (const asset of assets) {
        resumeCards.push({ asset, activeLinks: 0, totalViews: 0, pendingCount: 0, totalRequests: 0 });
      }

      await Promise.allSettled(
        assets.map(async (asset, idx) => {
          // share/activity — enrich the already-added resumeCard
          try {
            const r = await fetch(
              `${BACKEND_URL}/resume/share/activity/${asset.asset_id}?user_id=${encodeURIComponent(userId)}`
            );
            if (r.ok) {
              const d = await r.json();
              const links    : ShareLink[]     = d.share_links ?? [];
              const requests : AccessRequest[] = d.requests    ?? [];
              const views                      = d.views       ?? [];
              const active   = links.filter((l: ShareLink) => l.is_active).length;
              const pc       = requests.filter((rq: AccessRequest) => rq.status === "pending").length;
              const approved = requests.filter((rq: AccessRequest) => rq.status === "approved").length;

              totalViews      += d.total_views ?? 0;
              pendingTotal    += pc;
              approvedViewers += approved;
              if (active > 0) activeShared++;

              // Enrich the pre-added card
              resumeCards[idx] = {
                asset,
                activeLinks  : active,
                totalViews   : d.total_views ?? 0,
                pendingCount : pc,
                totalRequests: requests.length,
              };

              // pending rows
              requests.filter((rq: AccessRequest) => rq.status === "pending").forEach(rq => {
                pendingRows.push({ request: rq, fileName: asset.file_name, assetId: asset.asset_id });
              });

              // feed: views
              views.slice(0, 3).forEach((v: any) => {
                feedEvents.push({
                  kind : "view",
                  label: "Resume opened",
                  sub  : `${asset.file_name} · ${v.viewer_ip || "unknown"}`,
                  time : v.viewed_at,
                  color: "text-cyan-400",
                });
              });

              // feed: requests
              requests.slice(0, 2).forEach((rq: AccessRequest) => {
                feedEvents.push({
                  kind : "request",
                  label: rq.status === "pending" ? "Access requested" :
                         rq.status === "approved" ? "Access approved"  : "Access rejected",
                  sub  : `${asset.file_name} · ${rq.requester_email}`,
                  time : rq.requested_at,
                  color: rq.status === "approved" ? "text-green-400" :
                         rq.status === "rejected"  ? "text-red-400"   : "text-yellow-400",
                });
              });
            }
          } catch { /* ignore */ }

          // viewer sessions (security metrics)
          try {
            const r = await fetch(
              `${BACKEND_URL}/resume/activity/sessions/${asset.asset_id}?user_id=${encodeURIComponent(userId)}`
            );
            if (r.ok) {
              const d = await r.json();
              const sessions: ViewerSession[] = d.sessions ?? [];
              totalSessions += sessions.length;
              for (const s of sessions) {
                copyCount         += s.copy_count         ?? 0;
                printAttempts     += s.print_attempts     ?? 0;
                screenshotSignals += s.screenshot_signals ?? 0;
                if (s.is_suspicious) suspiciousCount++;
              }
              // feed: sessions
              sessions.slice(0, 2).forEach(s => {
                feedEvents.push({
                  kind : "session",
                  label: s.is_suspicious ? "Suspicious session" : "Session started",
                  sub  : `${asset.file_name} · ${s.viewer_email || "anonymous"} · ${s.browser || ""}`,
                  time : s.first_seen,
                  color: s.is_suspicious ? "text-red-400" : "text-blue-400",
                });
              });
            }
          } catch { /* ignore */ }
        })
      );

      // Sort resume cards: pending first, then by views
      resumeCards.sort((a, b) => b.pendingCount - a.pendingCount || b.totalViews - a.totalViews);
      // Sort feed by time desc
      feedEvents.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
      // Sort pending by date desc
      pendingRows.sort((a, b) =>
        new Date(b.request.requested_at).getTime() - new Date(a.request.requested_at).getTime()
      );

      setResumes(resumeCards);
      setPending(pendingRows);
      setFeed(feedEvents.slice(0, 20));
      setMetrics({
        totalViews,
        totalSessions,
        suspiciousCount,
        copyCount,
        printAttempts,
        screenshotSignals,
        approvedViewers,
        activeShared,
        pendingTotal,
        alertCount: suspiciousCount,
      });
    } catch (e) {
      console.error("[DashboardHome] load error:", e);
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
      setPending(prev => prev.filter(p => p.request.id !== requestId));
      setMetrics(m => m ? { ...m, pendingTotal: Math.max(0, m.pendingTotal - 1) } : m);
    } catch (e) {
      console.error("[DashboardHome] respond error:", e);
    } finally {
      setResponding(null);
    }
  }, [userId]);

  // ── Loading skeleton ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 w-72 bg-slate-800 rounded-xl" />
        <div className="flex gap-2">
          {[...Array(4)].map((_, i) => <div key={i} className="h-9 w-36 bg-slate-800 rounded-xl" />)}
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-28 bg-slate-800 rounded-2xl" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-72 bg-slate-800 rounded-2xl" />
          <div className="h-72 bg-slate-800 rounded-2xl" />
        </div>
      </div>
    );
  }

  const m = metrics ?? {
    totalViews: 0, totalSessions: 0, suspiciousCount: 0,
    copyCount: 0, printAttempts: 0, screenshotSignals: 0,
    approvedViewers: 0, activeShared: 0, pendingTotal: 0, alertCount: 0,
  };

  return (
    <div className="space-y-8 text-white">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="w-6 h-6 text-cyan-400" /> Resume Command Center
          </h1>
          <p className="text-slate-400 text-sm mt-0.5">
            Welcome back, <span className="text-cyan-400 font-mono">{userId}</span>
          </p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 px-3 py-2 bg-slate-800 border border-slate-700
                     rounded-xl text-slate-400 hover:text-white text-sm transition-colors self-start"
        >
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {/* ── Compact action buttons ──────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => navigate("/encrypt")}
          className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-700
                     text-white text-sm font-medium rounded-xl transition-colors"
        >
          <Upload className="w-4 h-4" /> Upload &amp; Encrypt
        </button>
        <button
          onClick={() => navigate("/dashboard/sharing")}
          className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700
                     border border-slate-700 text-slate-300 hover:text-white text-sm
                     font-medium rounded-xl transition-colors"
        >
          <Share2 className="w-4 h-4" /> Manage Sharing
        </button>
        <button
          onClick={() => navigate("/dashboard/forensics")}
          className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700
                     border border-slate-700 text-slate-300 hover:text-white text-sm
                     font-medium rounded-xl transition-colors"
        >
          <Microscope className="w-4 h-4" /> Unified Forensics
        </button>
        <button
          onClick={() => navigate("/dashboard/activity")}
          className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700
                     border border-slate-700 text-slate-300 hover:text-white text-sm
                     font-medium rounded-xl transition-colors"
        >
          <BarChart2 className="w-4 h-4" /> Activity
        </button>
      </div>

      {/* ── Alerts ─────────────────────────────────────────────────────────── */}
      {m.alertCount > 0 && (
        <div className="flex items-center gap-3 bg-red-950/30 border border-red-700/40
                        rounded-2xl px-5 py-4">
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-red-300">Suspicious activity detected</p>
            <p className="text-xs text-red-400/70">One or more sessions flagged. Review Security Center.</p>
          </div>
          <button
            onClick={() => navigate("/dashboard/security")}
            className="text-xs text-red-400 hover:text-red-300 font-medium px-3 py-1.5
                       bg-red-900/30 rounded-lg border border-red-700/30 transition-colors"
          >
            Review →
          </button>
        </div>
      )}
      {m.pendingTotal > 0 && (
        <div className="flex items-center gap-3 bg-yellow-950/30 border border-yellow-700/40
                        rounded-2xl px-5 py-4">
          <Clock className="w-5 h-5 text-yellow-400 shrink-0 animate-pulse" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-yellow-300">
              {m.pendingTotal} pending access request{m.pendingTotal > 1 ? "s" : ""}
            </p>
            <p className="text-xs text-yellow-400/70">Viewers waiting for approval to see contact info.</p>
          </div>
          <button
            onClick={() => navigate("/dashboard/sharing")}
            className="text-xs text-yellow-400 hover:text-yellow-300 font-medium px-3 py-1.5
                       bg-yellow-900/30 rounded-lg border border-yellow-700/30 transition-colors"
          >
            Manage →
          </button>
        </div>
      )}

      {/* ── Quick Security Insights (4 cards) ──────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Active Shared Resumes" value={m.activeShared}
          icon={Share2}                 color="cyan"
          sublabel="With active links"
        />
        <StatCard
          label="Pending Requests"      value={m.pendingTotal}
          icon={Clock}                  color="yellow"
          sublabel="Awaiting your review"
        />
        <StatCard
          label="Approved Viewers"      value={m.approvedViewers}
          icon={Users}                  color="green"
          sublabel="Granted contact access"
        />
        <StatCard
          label="Security Alerts"       value={m.alertCount}
          icon={AlertTriangle}          color={m.alertCount > 0 ? "red" : "purple"}
          sublabel={m.alertCount > 0 ? "Review required" : "All clear"}
        />
      </div>

      {/* ── Security Tracking Summary (6 tiles) ────────────────────────────── */}
      <div>
        <h2 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          <Activity className="w-4 h-4 text-cyan-400" /> Security Tracking Summary
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
          <SecTile label="Total Views"     value={m.totalViews}        icon={Eye}           color="text-cyan-400"   />
          <SecTile label="Viewer Sessions" value={m.totalSessions}     icon={Users}         color="text-blue-400"   />
          <SecTile label="Suspicious"      value={m.suspiciousCount}   icon={AlertTriangle} color="text-red-400"    />
          <SecTile label="Copy Attempts"   value={m.copyCount}         icon={Copy}          color="text-orange-400" />
          <SecTile label="Print Attempts"  value={m.printAttempts}     icon={Printer}       color="text-orange-400" />
          <SecTile label="Screenshot Sigs" value={m.screenshotSignals} icon={Camera}        color="text-red-400"    />
        </div>
      </div>

      {/* ── Main grid: Resumes + Pending requests ──────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Recent Uploaded Resumes */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <FileText className="w-4 h-4 text-cyan-400" /> Recent Uploaded Resumes
            </h2>
            <button
              onClick={() => navigate("/dashboard/vault")}
              className="text-xs text-cyan-500 hover:text-cyan-400 transition-colors"
            >
              View all →
            </button>
          </div>

          {resumes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <FileText className="w-8 h-8 text-slate-700" />
              <p className="text-slate-500 text-sm">No shared resumes yet</p>
              <button
                onClick={() => navigate("/encrypt")}
                className="text-xs text-cyan-500 hover:text-cyan-400 transition-colors"
              >
                Upload &amp; encrypt your first document →
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-800/50">
              {resumes.slice(0, 6).map(rc => (
                <div key={rc.asset.asset_id} className="px-5 py-3.5">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700
                                    flex items-center justify-center shrink-0 mt-0.5">
                      <FileText className="w-4 h-4 text-cyan-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">{rc.asset.file_name}</p>
                      <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-slate-500">
                        <span>
                          {formatDistanceToNow(new Date(rc.asset.created_at), { addSuffix: true })}
                        </span>
                        <span className="flex items-center gap-0.5">
                          <Link2 className="w-3 h-3" /> {rc.activeLinks} link{rc.activeLinks !== 1 ? "s" : ""}
                        </span>
                        <span className="flex items-center gap-0.5">
                          <Eye className="w-3 h-3" /> {rc.totalViews} view{rc.totalViews !== 1 ? "s" : ""}
                        </span>
                        {rc.pendingCount > 0 && (
                          <span className="flex items-center gap-0.5 text-yellow-400">
                            <Clock className="w-3 h-3 animate-pulse" /> {rc.pendingCount} pending
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => navigate(`/dashboard/sharing/${rc.asset.asset_id}`)}
                    className="mt-2.5 w-full text-xs flex items-center justify-center gap-1.5
                               px-3 py-2 bg-cyan-600/10 hover:bg-cyan-600/20 border border-cyan-600/25
                               text-cyan-400 hover:text-cyan-300 rounded-xl transition-all font-medium"
                  >
                    <Share2 className="w-3 h-3" /> Open Dashboard
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pending Access Requests */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <Clock className="w-4 h-4 text-yellow-400" /> Pending Access Requests
              {pending.length > 0 && (
                <span className="text-xs bg-yellow-900/40 text-yellow-400 border border-yellow-700/30
                                 px-2 py-0.5 rounded-full">{pending.length}</span>
              )}
            </h2>
            <button
              onClick={() => navigate("/dashboard/sharing")}
              className="text-xs text-cyan-500 hover:text-cyan-400 transition-colors"
            >
              Sharing Center →
            </button>
          </div>

          {pending.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <CheckCircle className="w-8 h-8 text-green-600" />
              <p className="text-slate-500 text-sm">No pending requests</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-800/50 max-h-96 overflow-y-auto">
              {pending.map(row => (
                <div
                  key={row.request.id}
                  className={`px-5 py-3.5 transition-opacity ${
                    responding === row.request.id ? "opacity-40 pointer-events-none" : ""
                  }`}
                >
                  <div className="flex items-start gap-3 mb-2.5">
                    <Clock className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5 animate-pulse" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-mono text-slate-300 truncate">
                        {row.request.requester_email}
                      </p>
                      <p className="text-xs text-slate-500 truncate mt-0.5">{row.fileName}</p>
                      <p className="text-xs text-slate-600">
                        {formatDistanceToNow(new Date(row.request.requested_at), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleRespond(row.request.id, row.request.share_token, "approved")}
                      className="flex-1 flex items-center justify-center gap-1 py-2 px-3
                                 bg-green-600/20 hover:bg-green-600/40 border border-green-600/30
                                 text-green-400 text-xs font-medium rounded-xl transition-colors"
                    >
                      <UserCheck className="w-3.5 h-3.5" /> Approve
                    </button>
                    <button
                      onClick={() => handleRespond(row.request.id, row.request.share_token, "rejected")}
                      className="flex-1 flex items-center justify-center gap-1 py-2 px-3
                                 bg-red-600/10 hover:bg-red-600/25 border border-red-600/20
                                 text-red-400 text-xs font-medium rounded-xl transition-colors"
                    >
                      <UserX className="w-3.5 h-3.5" /> Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Recent Activity Feed ────────────────────────────────────────────── */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <Activity className="w-4 h-4 text-cyan-400" /> Recent Activity Feed
          </h2>
          <button
            onClick={() => navigate("/dashboard/activity")}
            className="text-xs text-cyan-500 hover:text-cyan-400 transition-colors"
          >
            Full Activity Center →
          </button>
        </div>

        {feed.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-2">
            <Activity className="w-8 h-8 text-slate-700" />
            <p className="text-slate-500 text-sm">No activity yet</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-800/60">
            {feed.slice(0, 12).map((ev, i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-3 hover:bg-slate-800/30 transition-colors">
                <div className={`w-2 h-2 rounded-full shrink-0 ${ev.color.replace("text-","bg-")}`} />
                <div className="flex-1 min-w-0">
                  <p className={`text-xs font-medium ${ev.color}`}>{ev.label}</p>
                  <p className="text-xs text-slate-500 truncate mt-0.5">{ev.sub}</p>
                </div>
                <span className="text-xs text-slate-600 shrink-0">
                  {(() => {
                    try { return format(new Date(ev.time), "MMM d HH:mm"); }
                    catch { return "—"; }
                  })()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
