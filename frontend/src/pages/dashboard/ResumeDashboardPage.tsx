/**
 * ResumeDashboardPage
 * ===================
 * Single-page (no tabs) resume share dashboard.
 * Route: /dashboard/resume/:assetId
 *
 * Shows:
 *  1. Stats: Total Views, Requests, Pending, Active Links
 *  2. Pending access requests — Approve / Reject
 *  3. All viewer sessions — IP, location, time spent, screenshot attempts,
 *     suspicious activity, first seen, last seen, copy & print counts
 *
 * Uses the same APIs as ResumeShareDashboard and ActivityCenter.
 * No tabs. One scrollable page.
 */

import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft, Upload, RefreshCw, Eye, Users, Clock, Link2,
  CheckCircle, XCircle, UserCheck, UserX, AlertTriangle,
  MapPin, Monitor, Smartphone, Tablet, Copy, Printer,
  Camera, Globe, Timer, Shield,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";

const BACKEND_URL =
  (import.meta as any).env?.VITE_BACKEND_URL ?? "";

// ─── Types ──────────────────────────────────────────────────────────────────────

interface ShareLink { share_token: string; is_active: boolean }

interface AccessRequest {
  id              : string;
  share_token     : string;
  requester_name  : string;
  requester_email : string;
  requester_company?: string;
  message?        : string;
  status          : "pending" | "approved" | "rejected";
  requested_at    : string;
}

interface ViewerSession {
  session_id        : string;
  viewer_email      : string;
  viewer_ip         : string;
  browser           : string;
  os                : string;
  device_type       : "desktop" | "mobile" | "tablet";
  screen_size?      : string;
  is_first_visit    : boolean;
  geo_status        : string;
  latitude?         : number;
  longitude?        : number;
  first_seen        : string;
  last_seen         : string;
  total_duration_ms?: number;
  copy_count        : number;
  print_attempts    : number;
  screenshot_signals: number;
  is_suspicious     : boolean;
  share_token       : string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

function fmsDuration(ms?: number) {
  if (!ms) return "—";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function DeviceIcon({ type }: { type: string }) {
  if (type === "mobile") return <Smartphone className="w-4 h-4 text-cyan-400" />;
  if (type === "tablet") return <Tablet     className="w-4 h-4 text-purple-400" />;
  return                        <Monitor    className="w-4 h-4 text-blue-400" />;
}

function StatTile({
  icon, label, value, color,
}: {
  icon : React.ReactNode;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-slate-500 uppercase tracking-wider">{label}</span>
        {icon}
      </div>
      <p className={`text-3xl font-bold tabular-nums ${color}`}>{value}</p>
    </div>
  );
}

// ─── Main ───────────────────────────────────────────────────────────────────────

export default function ResumeDashboardPage() {
  const { assetId } = useParams<{ assetId: string }>();
  const navigate    = useNavigate();
  const userId      =
    localStorage.getItem("pinit_user_id") ||
    localStorage.getItem("biovault_userId") ||
    localStorage.getItem("biovault_user_id") ||
    "";

  const [activity,    setActivity]    = useState<{
    total_views: number; total_requests: number;
    pending_requests: number; share_links: ShareLink[];
    requests: AccessRequest[];
  } | null>(null);
  const [sessions,    setSessions]    = useState<ViewerSession[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [responding,  setResponding]  = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!assetId || !userId) return;
    setLoading(true);

    // Fetch both in parallel but render as soon as the FASTER one returns
    const activityPromise = fetch(
      `${BACKEND_URL}/resume/share/activity/${assetId}?user_id=${encodeURIComponent(userId)}`
    );
    const sessionsPromise = fetch(
      `${BACKEND_URL}/resume/activity/sessions/${assetId}?user_id=${encodeURIComponent(userId)}`
    );

    // Show activity (requests/stats) the moment it arrives — don't wait for sessions
    activityPromise.then(async r => {
      if (r.ok) setActivity(await r.json());
      setLoading(false);   // ← unblock the UI as soon as activity data is ready
    }).catch(() => setLoading(false));

    // Sessions load in the background — viewer tracking section updates when ready
    sessionsPromise.then(async r => {
      if (!r.ok) return;
      const d = await r.json();
      const list: ViewerSession[] = d.sessions ?? [];
      list.sort((a, b) => new Date(b.first_seen).getTime() - new Date(a.first_seen).getTime());
      setSessions(list);
    }).catch(() => {});
  }, [assetId, userId]);

  useEffect(() => { load(); }, [load]);

  const handleRespond = useCallback(async (
    requestId: string,
    token    : string,
    action   : "approved" | "rejected"
  ) => {
    setResponding(requestId);
    // Backend expects "approve" / "reject" (not past tense)
    const apiAction = action === "approved" ? "approve" : "reject";
    try {
      const res = await fetch(`${BACKEND_URL}/resume/share/respond-request`, {
        method : "POST",
        headers: { "Content-Type": "application/json" },
        body   : JSON.stringify({ request_id: requestId, share_token: token, action: apiAction, user_id: userId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.error("[ResumeDashboard] respond error:", res.status, err);
        return;
      }
      // Update local state optimistically
      setActivity(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          requests: prev.requests.map(r =>
            r.id === requestId ? { ...r, status: action } : r
          ),
          pending_requests: prev.requests.filter(
            r => r.id !== requestId && r.status === "pending"
          ).length,
        };
      });
      // Re-fetch sessions so newly approved viewer's tracking appears
      if (action === "approved") {
        setTimeout(load, 800);
      }
    } catch (e) {
      console.error("[ResumeDashboard] respond exception:", e);
    } finally {
      setResponding(null);
    }
  }, [userId, load]);

  const pending   = (activity?.requests ?? []).filter(r => r.status === "pending");
  const responded = (activity?.requests ?? []).filter(r => r.status !== "pending");
  const activeLinks = (activity?.share_links ?? []).filter(l => l.is_active).length;

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-4 animate-pulse p-2">
        <div className="h-8 w-56 bg-slate-800 rounded-xl" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-24 bg-slate-800 rounded-2xl" />)}
        </div>
        {[...Array(3)].map((_, i) => <div key={i} className="h-28 bg-slate-800 rounded-2xl" />)}
      </div>
    );
  }

  return (
    <div className="space-y-6 text-white">

      {/* ── Header ───────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate("/dashboard")}
          className="p-2 hover:bg-slate-800 rounded-xl transition-colors text-slate-400 hover:text-white"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <Shield className="w-5 h-5 text-cyan-400" />
        <div className="flex-1">
          <h1 className="text-lg font-semibold text-white">Resume Share Dashboard</h1>
          <p className="text-xs text-slate-500 font-mono">{assetId?.slice(0, 20)}…</p>
        </div>
        <button
          onClick={() => navigate("/encrypt")}
          className="flex items-center gap-2 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-700
                     text-white text-xs font-medium rounded-lg transition-colors"
        >
          <Upload className="w-3.5 h-3.5" /> Upload &amp; Encrypt
        </button>
        <button
          onClick={load}
          className="p-2 hover:bg-slate-800 rounded-xl transition-colors text-slate-400 hover:text-white"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* ── Stats ────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile
          icon={<Eye   className="w-4 h-4 text-cyan-400" />}
          label="Total Views" value={activity?.total_views ?? 0} color="text-cyan-400"
        />
        <StatTile
          icon={<Users className="w-4 h-4 text-purple-400" />}
          label="Requests"    value={activity?.total_requests ?? 0} color="text-purple-400"
        />
        <StatTile
          icon={<Clock className="w-4 h-4 text-yellow-400" />}
          label="Pending"     value={activity?.pending_requests ?? 0} color="text-yellow-400"
        />
        <StatTile
          icon={<Link2 className="w-4 h-4 text-green-400" />}
          label="Active Links" value={activeLinks} color="text-green-400"
        />
      </div>

      {/* ── Pending requests ─────────────────────────────────────────────────── */}
      {pending.length > 0 && (
        <div className="bg-slate-900 border border-yellow-700/30 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-800 flex items-center gap-2">
            <Clock className="w-4 h-4 text-yellow-400 animate-pulse" />
            <h2 className="text-sm font-semibold text-white">
              Pending Requests
              <span className="ml-2 text-xs bg-yellow-900/40 text-yellow-400 border border-yellow-700/30
                               px-2 py-0.5 rounded-full">{pending.length}</span>
            </h2>
          </div>
          <div className="divide-y divide-slate-800/60">
            {pending.map(req => (
              <div
                key={req.id}
                className={`px-5 py-4 transition-opacity ${
                  responding === req.id ? "opacity-40 pointer-events-none" : ""
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white">
                      {req.requester_name || "Anonymous"}
                    </p>
                    <p className="text-xs text-slate-400 font-mono mt-0.5">{req.requester_email}</p>
                    {req.requester_company && (
                      <p className="text-xs text-slate-500 mt-0.5">{req.requester_company}</p>
                    )}
                    {req.message && (
                      <p className="text-xs text-slate-500 mt-1 italic">"{req.message}"</p>
                    )}
                    <p className="text-xs text-slate-600 mt-1">
                      {formatDistanceToNow(new Date(req.requested_at), { addSuffix: true })}
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => handleRespond(req.id, req.share_token, "approved")}
                      className="flex items-center gap-2 px-4 py-2 bg-green-600/20 hover:bg-green-600/40
                                 border border-green-600/30 text-green-400 text-sm font-medium
                                 rounded-xl transition-colors"
                    >
                      <UserCheck className="w-4 h-4" /> Approve
                    </button>
                    <button
                      onClick={() => handleRespond(req.id, req.share_token, "rejected")}
                      className="flex items-center gap-2 px-4 py-2 bg-red-600/10 hover:bg-red-600/25
                                 border border-red-600/20 text-red-400 text-sm font-medium
                                 rounded-xl transition-colors"
                    >
                      <UserX className="w-4 h-4" /> Reject
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Viewer sessions (activity tracking) ─────────────────────────────── */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-cyan-400" />
            <h2 className="text-sm font-semibold text-white">
              Viewer Activity
            </h2>
            <span className="text-xs bg-slate-800 text-slate-400 border border-slate-700
                             px-2 py-0.5 rounded-full">{sessions.length}</span>
          </div>
        </div>

        {sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Eye className="w-8 h-8 text-slate-700" />
            <p className="text-slate-500 text-sm">No viewer sessions yet</p>
            <p className="text-slate-600 text-xs">
              Sessions appear here once someone views the shared resume
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-800/60">
            {sessions.map((s, i) => (
              <div key={s.session_id || i} className="px-5 py-5">

                {/* Row 1: identity + device + suspicious badge */}
                <div className="flex items-start gap-3 mb-4">
                  <DeviceIcon type={s.device_type} />
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-white">
                        {s.viewer_email || "Anonymous viewer"}
                      </span>
                      {s.is_first_visit && (
                        <span className="text-xs bg-blue-900/30 text-blue-400 border border-blue-700/30
                                         px-2 py-0.5 rounded-full">1st visit</span>
                      )}
                      {s.is_suspicious && (
                        <span className="flex items-center gap-1 text-xs bg-red-900/30 text-red-400
                                         border border-red-700/30 px-2 py-0.5 rounded-full">
                          <AlertTriangle className="w-3 h-3" /> Suspicious
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {s.browser} / {s.os}
                      {s.screen_size && ` · ${s.screen_size}`}
                    </p>
                  </div>
                </div>

                {/* Row 2: detail grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">

                  {/* IP */}
                  <div className="bg-slate-800/50 rounded-xl px-3 py-2.5">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Globe className="w-3 h-3 text-slate-500" />
                      <span className="text-xs text-slate-500 uppercase tracking-wider">IP Address</span>
                    </div>
                    <p className="text-xs font-mono text-slate-300">{s.viewer_ip || "—"}</p>
                  </div>

                  {/* Location */}
                  <div className="bg-slate-800/50 rounded-xl px-3 py-2.5">
                    <div className="flex items-center gap-1.5 mb-1">
                      <MapPin className="w-3 h-3 text-slate-500" />
                      <span className="text-xs text-slate-500 uppercase tracking-wider">Location</span>
                    </div>
                    <p className="text-xs text-slate-300">
                      {s.latitude != null && s.longitude != null
                        ? `${s.latitude.toFixed(4)}, ${s.longitude.toFixed(4)}`
                        : s.geo_status || "—"}
                    </p>
                  </div>

                  {/* Time spent */}
                  <div className="bg-slate-800/50 rounded-xl px-3 py-2.5">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Timer className="w-3 h-3 text-slate-500" />
                      <span className="text-xs text-slate-500 uppercase tracking-wider">Time Spent</span>
                    </div>
                    <p className="text-xs text-slate-300">{fmsDuration(s.total_duration_ms)}</p>
                  </div>

                  {/* First seen */}
                  <div className="bg-slate-800/50 rounded-xl px-3 py-2.5">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Clock className="w-3 h-3 text-slate-500" />
                      <span className="text-xs text-slate-500 uppercase tracking-wider">First Seen</span>
                    </div>
                    <p className="text-xs text-slate-300">
                      {s.first_seen ? format(new Date(s.first_seen), "MMM d, HH:mm") : "—"}
                    </p>
                  </div>

                  {/* Last seen */}
                  <div className="bg-slate-800/50 rounded-xl px-3 py-2.5">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Eye className="w-3 h-3 text-slate-500" />
                      <span className="text-xs text-slate-500 uppercase tracking-wider">Last Seen</span>
                    </div>
                    <p className="text-xs text-slate-300">
                      {s.last_seen
                        ? formatDistanceToNow(new Date(s.last_seen), { addSuffix: true })
                        : "—"}
                    </p>
                  </div>

                  {/* Screenshot signals */}
                  <div className={`rounded-xl px-3 py-2.5 ${
                    s.screenshot_signals > 0
                      ? "bg-red-950/30 border border-red-700/30"
                      : "bg-slate-800/50"
                  }`}>
                    <div className="flex items-center gap-1.5 mb-1">
                      <Camera className={`w-3 h-3 ${s.screenshot_signals > 0 ? "text-red-400" : "text-slate-500"}`} />
                      <span className={`text-xs uppercase tracking-wider ${
                        s.screenshot_signals > 0 ? "text-red-400" : "text-slate-500"
                      }`}>Screenshots</span>
                    </div>
                    <p className={`text-xs font-semibold ${
                      s.screenshot_signals > 0 ? "text-red-300" : "text-slate-300"
                    }`}>{s.screenshot_signals}</p>
                  </div>

                  {/* Copy attempts */}
                  <div className={`rounded-xl px-3 py-2.5 ${
                    s.copy_count > 0
                      ? "bg-orange-950/20 border border-orange-700/20"
                      : "bg-slate-800/50"
                  }`}>
                    <div className="flex items-center gap-1.5 mb-1">
                      <Copy className={`w-3 h-3 ${s.copy_count > 0 ? "text-orange-400" : "text-slate-500"}`} />
                      <span className={`text-xs uppercase tracking-wider ${
                        s.copy_count > 0 ? "text-orange-400" : "text-slate-500"
                      }`}>Copy Attempts</span>
                    </div>
                    <p className={`text-xs font-semibold ${
                      s.copy_count > 0 ? "text-orange-300" : "text-slate-300"
                    }`}>{s.copy_count}</p>
                  </div>

                  {/* Print attempts */}
                  <div className={`rounded-xl px-3 py-2.5 ${
                    s.print_attempts > 0
                      ? "bg-orange-950/20 border border-orange-700/20"
                      : "bg-slate-800/50"
                  }`}>
                    <div className="flex items-center gap-1.5 mb-1">
                      <Printer className={`w-3 h-3 ${s.print_attempts > 0 ? "text-orange-400" : "text-slate-500"}`} />
                      <span className={`text-xs uppercase tracking-wider ${
                        s.print_attempts > 0 ? "text-orange-400" : "text-slate-500"
                      }`}>Print Attempts</span>
                    </div>
                    <p className={`text-xs font-semibold ${
                      s.print_attempts > 0 ? "text-orange-300" : "text-slate-300"
                    }`}>{s.print_attempts}</p>
                  </div>

                </div>

                {/* Suspicious warning */}
                {s.is_suspicious && (
                  <div className="mt-3 flex items-center gap-2 bg-red-950/20 border border-red-700/30
                                  rounded-xl px-4 py-2.5">
                    <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                    <p className="text-xs text-red-300">
                      This session has been flagged as suspicious — unusually high copy/screenshot/print signals.
                    </p>
                  </div>
                )}

              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Responded requests history ────────────────────────────────────────── */}
      {responded.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-800 flex items-center gap-2">
            <Shield className="w-4 h-4 text-slate-500" />
            <h2 className="text-sm font-semibold text-white">Request History</h2>
          </div>
          <div className="divide-y divide-slate-800/60">
            {responded.map(req => (
              <div key={req.id} className="flex items-center gap-4 px-5 py-3.5">
                {req.status === "approved"
                  ? <CheckCircle className="w-4 h-4 text-green-400 shrink-0" />
                  : <XCircle    className="w-4 h-4 text-red-400 shrink-0" />
                }
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-300 truncate">
                    {req.requester_name || req.requester_email}
                  </p>
                  <p className="text-xs text-slate-500 font-mono truncate">{req.requester_email}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full border font-medium shrink-0 ${
                  req.status === "approved"
                    ? "bg-green-900/30 text-green-400 border-green-700/40"
                    : "bg-red-900/30 text-red-400 border-red-700/40"
                }`}>{req.status}</span>
                <span className="text-xs text-slate-600 shrink-0">
                  {formatDistanceToNow(new Date(req.requested_at), { addSuffix: true })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
