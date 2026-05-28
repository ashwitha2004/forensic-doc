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
  Activity,
  Cpu,
  Printer,
  Clipboard,
  Camera,
  EyeOff,
  MousePointer,
  Monitor,
  Smartphone,
  Tablet,
  MapPin,
  Globe,
  Timer,
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

// ── Security timeline types (new) ─────────────────────────────────────────────

interface ActivityEvent {
  session_id    : string;
  viewer_email  : string | null;
  viewer_ip     : string | null;
  event_type    : string;
  event_details : Record<string, unknown>;
  created_at    : string;
  share_token   : string;
}

interface SessionSummary {
  session_id    : string;
  viewer_email  : string | null;
  viewer_ip     : string | null;
  first_seen    : string;
  last_seen     : string;
  event_count   : number;
  is_suspicious : boolean;
}

interface TimelineData {
  ok          : boolean;
  asset_id    : string;
  total       : number;
  event_counts: Record<string, number>;
  sessions    : SessionSummary[];
  events      : ActivityEvent[];
}

// ── Rich viewer-session analytics type (new) ──────────────────────────────────

interface ViewerSession {
  session_id         : string;
  share_token        : string;
  viewer_email       : string | null;
  viewer_ip          : string | null;
  browser            : string | null;
  os                 : string | null;
  device_type        : "mobile" | "tablet" | "desktop" | null;
  screen_size        : string | null;
  is_first_visit     : boolean;
  geo_status         : string | null;   // "pending"|"granted"|"denied"|"unavailable"
  latitude           : number | null;
  longitude          : number | null;
  geo_accuracy       : number | null;
  first_seen         : string;
  last_seen          : string;
  total_duration_ms  : number;
  active_duration_ms : number;
  copy_count         : number;
  print_attempts     : number;
  screenshot_signals : number;
  is_suspicious      : boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ResumeShareDashboard() {
  const { assetId } = useParams<{ assetId: string }>();
  const navigate    = useNavigate();

  const [data, setData]         = useState<DashboardData | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"requests" | "views" | "links" | "security">("requests");
  const [copied, setCopied]     = useState<string | null>(null);
  const [responding, setResponding] = useState<string | null>(null);
  const [shareLoading, setShareLoading] = useState(false);

  // Security timeline state (loaded lazily when Security tab is opened)
  const [timeline, setTimeline]         = useState<TimelineData | null>(null);
  const [timelineLoading, setTLLoading] = useState(false);

  // Viewer-sessions state (loaded lazily alongside timeline)
  const [viewerSessions, setViewerSessions]   = useState<ViewerSession[] | null>(null);
  const [sessionsLoading, setSessionsLoading] = useState(false);

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

  // ── Security timeline — loaded lazily when tab is first opened ────────────
  const loadTimeline = useCallback(async () => {
    if (!assetId || !userId) return;
    setTLLoading(true);
    try {
      const res = await fetch(
        `${BACKEND_URL}/resume/activity/timeline/${assetId}?user_id=${encodeURIComponent(userId)}`
      );
      if (res.ok) setTimeline(await res.json());
    } catch { /* silent */ }
    finally { setTLLoading(false); }
  }, [assetId, userId]);

  // ── Viewer sessions — loaded alongside timeline ───────────────────────────
  const loadSessions = useCallback(async () => {
    if (!assetId || !userId) return;
    setSessionsLoading(true);
    try {
      const res = await fetch(
        `${BACKEND_URL}/resume/activity/sessions/${assetId}?user_id=${encodeURIComponent(userId)}`
      );
      // Always call setViewerSessions — even on error — so it's never left as null.
      // Leaving it null causes !viewerSessions to stay true and the effect re-fires
      // in an infinite retry loop.
      if (res.ok) {
        const data = await res.json();
        setViewerSessions(data.sessions ?? []);
      } else {
        setViewerSessions([]); // non-ok → stop retrying
      }
    } catch {
      setViewerSessions([]); // network error → stop retrying
    } finally {
      setSessionsLoading(false);
    }
  }, [assetId, userId]);

  useEffect(() => {
    if (activeTab === "security") {
      if (!timeline && !timelineLoading) loadTimeline();
      if (!viewerSessions && !sessionsLoading) loadSessions();
    }
  }, [activeTab, timeline, timelineLoading, loadTimeline,
      viewerSessions, sessionsLoading, loadSessions]);

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
        <div className="flex gap-1 border-b border-slate-800 overflow-x-auto">
          {(["requests", "views", "links", "security"] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap capitalize transition-colors border-b-2 -mb-px
                ${activeTab === tab
                  ? tab === "security" ? "border-red-500 text-red-400"
                                       : "border-cyan-500 text-cyan-400"
                  : "border-transparent text-slate-500 hover:text-slate-300"}`}
            >
              {tab === "requests" ? `Requests (${data?.total_requests ?? 0})` :
               tab === "views"    ? `Views (${data?.total_views ?? 0})` :
               tab === "links"    ? `Share Links (${data?.share_links?.length ?? 0})` :
                                    `🛡 Security`}
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
        {/* ── Tab: Security Timeline (new — additive only) ──────────────── */}
        {activeTab === "security" && (
          <div className="space-y-4">

            {/* Loading */}
            {timelineLoading && (
              <div className="flex items-center justify-center py-12 gap-3">
                <div className="w-6 h-6 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-sm text-slate-400">Loading security events…</span>
              </div>
            )}

            {!timelineLoading && timeline && (
              <>
                {/* Refresh button */}
                <div className="flex justify-end">
                  <button
                    onClick={() => { loadTimeline(); loadSessions(); }}
                    className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-white
                               bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    <RefreshCw className="w-3 h-3" /> Refresh
                  </button>
                </div>

                {/* ── Viewer Sessions panel ─────────────────────────────── */}
                {(viewerSessions ?? []).length > 0 && (
                  <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
                      <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5" /> Viewer Sessions
                      </h3>
                      <span className="text-xs text-slate-600">{viewerSessions!.length} sessions</span>
                    </div>
                    <div className="divide-y divide-slate-800/60 max-h-[480px] overflow-y-auto">
                      {viewerSessions!.map(s => (
                        <div
                          key={s.session_id}
                          className={`px-4 py-3 space-y-2 ${s.is_suspicious ? "bg-red-950/10" : ""}`}
                        >
                          {/* Row 1 — identity + device badges */}
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-xs font-medium text-white truncate">
                                {s.viewer_email ?? s.viewer_ip ?? s.session_id.slice(0, 16) + "…"}
                              </p>
                              <p className="text-xs text-slate-500">
                                {s.viewer_ip && s.viewer_email ? s.viewer_ip : ""}
                              </p>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                              {/* Device type badge */}
                              {s.device_type && (
                                <span className="flex items-center gap-0.5 text-xs bg-slate-800 text-slate-300
                                                 border border-slate-700/40 px-1.5 py-0.5 rounded">
                                  {s.device_type === "mobile"  ? <Smartphone className="w-3 h-3" /> :
                                   s.device_type === "tablet"  ? <Tablet className="w-3 h-3" /> :
                                                                  <Monitor className="w-3 h-3" />}
                                  {s.device_type}
                                </span>
                              )}
                              {/* Browser badge */}
                              {s.browser && (
                                <span className="text-xs bg-slate-800 text-slate-300 border border-slate-700/40
                                                 px-1.5 py-0.5 rounded truncate max-w-[90px]">
                                  {s.browser}
                                </span>
                              )}
                              {/* OS badge */}
                              {s.os && (
                                <span className="text-xs bg-slate-800 text-slate-400 border border-slate-700/40
                                                 px-1.5 py-0.5 rounded truncate max-w-[90px]">
                                  {s.os}
                                </span>
                              )}
                              {/* Suspicious flag */}
                              {s.is_suspicious && (
                                <span className="text-xs bg-red-900/40 border border-red-700/40 text-red-300
                                                 px-2 py-0.5 rounded-full">
                                  ⚠ Suspicious
                                </span>
                              )}
                              {/* First visit */}
                              {s.is_first_visit && (
                                <span className="text-xs bg-cyan-900/30 border border-cyan-700/30 text-cyan-400
                                                 px-1.5 py-0.5 rounded">
                                  1st visit
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Row 2 — geolocation */}
                          <div className="flex items-center gap-3 flex-wrap">
                            {s.geo_status === "granted" && s.latitude != null && s.longitude != null ? (
                              <span className="flex items-center gap-1 text-xs text-green-400">
                                <MapPin className="w-3 h-3" />
                                {s.latitude.toFixed(4)}, {s.longitude.toFixed(4)}
                                {s.geo_accuracy != null && (
                                  <span className="text-slate-500">±{Math.round(s.geo_accuracy)}m</span>
                                )}
                              </span>
                            ) : s.geo_status === "denied" ? (
                              <span className="flex items-center gap-1 text-xs text-slate-500">
                                <MapPin className="w-3 h-3" /> Location denied
                              </span>
                            ) : s.geo_status === "pending" || !s.geo_status ? (
                              <span className="flex items-center gap-1 text-xs text-slate-600">
                                <Globe className="w-3 h-3" /> Location pending
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-xs text-slate-600">
                                <Globe className="w-3 h-3" /> Location unavailable
                              </span>
                            )}

                            {/* Duration */}
                            {s.total_duration_ms > 0 && (
                              <span className="flex items-center gap-1 text-xs text-slate-400">
                                <Timer className="w-3 h-3" />
                                {_fmtDuration(s.total_duration_ms)}
                                {s.active_duration_ms > 0 && (
                                  <span className="text-slate-600">
                                    ({_fmtDuration(s.active_duration_ms)} active)
                                  </span>
                                )}
                              </span>
                            )}
                          </div>

                          {/* Row 3 — security counters */}
                          {(s.copy_count > 0 || s.print_attempts > 0 || s.screenshot_signals > 0) && (
                            <div className="flex items-center gap-2 flex-wrap">
                              {s.copy_count > 0 && (
                                <span className="flex items-center gap-0.5 text-xs text-yellow-400">
                                  <Clipboard className="w-3 h-3" /> {s.copy_count} cop{s.copy_count === 1 ? "y" : "ies"}
                                </span>
                              )}
                              {s.print_attempts > 0 && (
                                <span className="flex items-center gap-0.5 text-xs text-yellow-400">
                                  <Printer className="w-3 h-3" /> {s.print_attempts} print
                                </span>
                              )}
                              {s.screenshot_signals > 0 && (
                                <span className="flex items-center gap-0.5 text-xs text-red-400">
                                  <Camera className="w-3 h-3" /> {s.screenshot_signals} screenshot
                                </span>
                              )}
                            </div>
                          )}

                          {/* Row 4 — timestamps */}
                          <p className="text-xs text-slate-600">
                            First seen: {new Date(s.first_seen).toLocaleString()}
                            {s.last_seen !== s.first_seen && (
                              <>  ·  Last: {new Date(s.last_seen).toLocaleString()}</>
                            )}
                            {s.screen_size && <> · {s.screen_size}</>}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Sessions loading state */}
                {sessionsLoading && (
                  <div className="flex items-center gap-2 py-2">
                    <div className="w-4 h-4 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
                    <span className="text-xs text-slate-500">Loading sessions…</span>
                  </div>
                )}

                {/* Event-type breakdown */}
                {Object.keys(timeline.event_counts).length > 0 && (
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                    <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                      Event Breakdown
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {Object.entries(timeline.event_counts)
                        .sort((a, b) => b[1] - a[1])
                        .map(([type, count]) => (
                          <div key={type}
                               className={`flex items-center justify-between px-3 py-2 rounded-lg border
                                 ${_eventSeverity(type) === "high"
                                   ? "bg-red-950/30 border-red-800/40"
                                   : _eventSeverity(type) === "med"
                                   ? "bg-yellow-950/20 border-yellow-800/30"
                                   : "bg-slate-800/50 border-slate-700/30"}`}>
                            <div className="flex items-center gap-1.5 min-w-0">
                              <EventIcon type={type} />
                              <span className="text-xs text-slate-300 truncate">{_humaniseType(type)}</span>
                            </div>
                            <span className={`text-xs font-bold ml-2 shrink-0
                              ${_eventSeverity(type) === "high" ? "text-red-400"
                              : _eventSeverity(type) === "med"  ? "text-yellow-400"
                              :                                    "text-slate-400"}`}>
                              {count}
                            </span>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                {/* Suspicious sessions */}
                {timeline.sessions.filter(s => s.is_suspicious).length > 0 && (
                  <div className="bg-red-950/20 border border-red-800/30 rounded-xl p-4">
                    <h3 className="text-xs font-semibold text-red-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5" /> Suspicious Sessions
                    </h3>
                    <div className="space-y-2">
                      {timeline.sessions.filter(s => s.is_suspicious).map(s => (
                        <div key={s.session_id}
                             className="flex items-center justify-between bg-slate-900/60 border border-red-900/30
                                        rounded-lg px-3 py-2.5 gap-3">
                          <div className="min-w-0">
                            <p className="text-xs font-mono text-red-300 truncate">
                              {s.viewer_email || s.viewer_ip || s.session_id.slice(0, 16) + "…"}
                            </p>
                            <p className="text-xs text-slate-500">
                              {s.event_count} events · {new Date(s.first_seen).toLocaleString()}
                            </p>
                          </div>
                          <span className="text-xs bg-red-900/40 border border-red-700/40 text-red-300
                                           px-2 py-0.5 rounded-full shrink-0">
                            Suspicious
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Full event timeline */}
                {timeline.events.length === 0 ? (
                  <EmptyState icon={<Activity className="w-10 h-10 text-slate-600" />}
                              message="No activity events recorded yet. Events appear once viewers open a shared link." />
                ) : (
                  <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
                      <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                        Event Timeline
                      </h3>
                      <span className="text-xs text-slate-600">{timeline.total} total</span>
                    </div>
                    <div className="divide-y divide-slate-800/60 max-h-[520px] overflow-y-auto">
                      {timeline.events.map((ev, i) => {
                        const sev = _eventSeverity(ev.event_type);
                        return (
                          <div key={i}
                               className={`flex items-start gap-3 px-4 py-3
                                 ${sev === "high" ? "bg-red-950/10" : ""}`}>
                            <div className={`mt-0.5 shrink-0 w-6 h-6 rounded-full flex items-center justify-center
                              ${sev === "high" ? "bg-red-900/40"
                              : sev === "med"  ? "bg-yellow-900/30"
                              :                  "bg-slate-800"}`}>
                              <EventIcon type={ev.event_type} size={12} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={`text-xs font-medium
                                  ${sev === "high" ? "text-red-300"
                                  : sev === "med"  ? "text-yellow-300"
                                  :                  "text-slate-300"}`}>
                                  {_humaniseType(ev.event_type)}
                                </span>
                                {ev.viewer_email && (
                                  <span className="text-xs text-slate-500 truncate max-w-[140px]">
                                    {ev.viewer_email}
                                  </span>
                                )}
                              </div>
                              {Object.keys(ev.event_details ?? {}).length > 0 && (
                                <p className="text-xs text-slate-600 mt-0.5 font-mono truncate">
                                  {Object.entries(ev.event_details)
                                    .map(([k, v]) => `${k}: ${v}`)
                                    .join(" · ")
                                    .slice(0, 120)}
                                </p>
                              )}
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-xs text-slate-500">
                                {new Date(ev.created_at).toLocaleTimeString()}
                              </p>
                              <p className="text-xs text-slate-700">
                                {new Date(ev.created_at).toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}

            {!timelineLoading && !timeline && (
              <EmptyState icon={<Activity className="w-10 h-10 text-slate-600" />}
                          message="No activity data yet" />
            )}
          </div>
        )}

      </div>
    </div>
  );
}

// ── Duration formatter ────────────────────────────────────────────────────────

function _fmtDuration(ms: number): string {
  if (ms < 1_000)  return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60_000);
  const secs = Math.round((ms % 60_000) / 1000);
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}

// ── Security helper functions (new) ───────────────────────────────────────────

const _HIGH_EVENTS = new Set([
  "screenshot_signal", "devtools_signal", "devtools_attempt", "view_source_attempt",
]);
const _MED_EVENTS = new Set([
  "copy_attempt", "print_attempt", "save_attempt", "right_click", "text_selection",
]);

function _eventSeverity(type: string): "high" | "med" | "low" {
  if (_HIGH_EVENTS.has(type)) return "high";
  if (_MED_EVENTS.has(type))  return "med";
  return "low";
}

function _humaniseType(type: string): string {
  const map: Record<string, string> = {
    resume_opened       : "Resume Opened",
    copy_attempt        : "Copy Attempt",
    text_selection      : "Text Selected",
    print_attempt       : "Print Attempt",
    save_attempt        : "Save Attempt",
    view_source_attempt : "View Source Attempt",
    right_click         : "Right Click",
    screenshot_signal   : "Screenshot Signal",
    devtools_attempt    : "DevTools Attempt",
    devtools_signal     : "DevTools Detected",
    tab_hidden          : "Tab Switched Away",
    tab_visible         : "Tab Returned",
    window_blur         : "Window Blur",
    window_focus        : "Window Focus",
    session_end         : "Session Ended",
  };
  return map[type] ?? type.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function EventIcon({ type, size = 10 }: { type: string; size?: number }) {
  const s = { width: size, height: size };
  const sev = _eventSeverity(type);
  const col = sev === "high" ? "text-red-400" : sev === "med" ? "text-yellow-400" : "text-slate-400";
  if (type === "copy_attempt" || type === "text_selection") return <Clipboard style={s} className={col} />;
  if (type === "print_attempt")        return <Printer  style={s} className={col} />;
  if (type === "screenshot_signal")    return <Camera   style={s} className={col} />;
  if (type.startsWith("devtools"))     return <Cpu      style={s} className={col} />;
  if (type === "save_attempt" || type === "view_source_attempt") return <EyeOff style={s} className={col} />;
  if (type === "right_click")          return <MousePointer style={s} className={col} />;
  if (type === "resume_opened" || type === "session_end") return <Monitor style={s} className={col} />;
  if (type.startsWith("tab") || type.startsWith("window")) return <Eye style={s} className={col} />;
  return <Activity style={s} className={col} />;
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
