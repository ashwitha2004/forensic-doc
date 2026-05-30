/**
 * ActivityCenter
 * ==============
 * Unified analytics across all shared documents:
 * views, sessions, device breakdown, copy/print/screenshot counters,
 * approval timeline, and a daily-views bar chart (recharts).
 */

import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Activity, Eye, Users, Clock, Copy, Printer,
  Camera, RefreshCw, FileText, Monitor, Smartphone,
  Tablet, Globe, CheckCircle, XCircle, AlertTriangle,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { format, parseISO, subDays, startOfDay } from "date-fns";

const BACKEND_URL =
  (import.meta as any).env?.VITE_BACKEND_URL ?? "";

// ─── Types ────────────────────────────────────────────────────────────────────

interface VaultAsset { asset_id: string; file_name: string }

interface ViewLog {
  viewer_ip   : string;
  browser_info: string;
  viewed_at   : string;
  share_token : string;
}

interface AccessRequest {
  id             : string;
  requester_email: string;
  status         : string;
  requested_at   : string;
  approved_at?   : string;
}

interface ViewerSession {
  session_id        : string;
  viewer_email      : string;
  browser           : string;
  os                : string;
  device_type       : "mobile" | "tablet" | "desktop";
  first_seen        : string;
  last_seen         : string;
  total_duration_ms : number;
  copy_count        : number;
  print_attempts    : number;
  screenshot_signals: number;
  is_suspicious     : boolean;
  geo_status        : string;
  latitude?         : number;
  longitude?        : number;
  share_token       : string;
}

interface AggData {
  totalViews       : number;
  totalSessions    : number;
  totalRequests    : number;
  totalApproved    : number;
  totalRejected    : number;
  copyCount        : number;
  printAttempts    : number;
  screenshotSignals: number;
  suspiciousCount  : number;
  deviceBreakdown  : { desktop: number; mobile: number; tablet: number };
  dailyViews       : { date: string; views: number }[];
  sessions         : (ViewerSession & { file_name: string })[];
  requests         : (AccessRequest & { file_name: string })[];
  recentViews      : (ViewLog & { file_name: string })[];
}

// ─── Stat tile ────────────────────────────────────────────────────────────────

function Tile({
  label, value, icon: Icon, color, small,
}: {
  label : string;
  value : number | string;
  icon  : React.ComponentType<{ className?: string }>;
  color : string;
  small?: boolean;
}) {
  return (
    <div className={`bg-slate-900 border border-slate-800 rounded-2xl p-4 ${small ? "" : "p-5"}`}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-slate-500 uppercase tracking-wider">{label}</p>
        <Icon className={`w-4 h-4 ${color}`} />
      </div>
      <p className={`font-bold text-white tabular-nums ${small ? "text-2xl" : "text-3xl"}`}>{value}</p>
    </div>
  );
}

// ─── Device icon ─────────────────────────────────────────────────────────────

function DeviceIcon({ type }: { type: string }) {
  if (type === "mobile")  return <Smartphone className="w-3.5 h-3.5 text-cyan-400" />;
  if (type === "tablet")  return <Tablet     className="w-3.5 h-3.5 text-purple-400" />;
  return <Monitor className="w-3.5 h-3.5 text-blue-400" />;
}

// ─── Custom recharts tooltip ──────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs shadow-xl">
      <p className="text-slate-400 mb-1">{label}</p>
      <p className="text-cyan-400 font-bold">{payload[0].value} views</p>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ActivityCenter() {
  const navigate  = useNavigate();
  const userId    = localStorage.getItem("biovault_userId") || "";

  const [data,    setData]    = useState<AggData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab,     setTab]     = useState<"sessions" | "requests" | "views">("sessions");

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);

    try {
      // 1. Get vault assets
      const vr = await fetch(`${BACKEND_URL}/vault/list?user_id=${encodeURIComponent(userId)}`);
      if (!vr.ok) { setLoading(false); return; }
      const { assets }: { assets: VaultAsset[] } = await vr.json();

      // 2. Fetch share activity + sessions per asset (parallel)
      const allViews    : (ViewLog        & { file_name: string })[] = [];
      const allRequests : (AccessRequest  & { file_name: string })[] = [];
      const allSessions : (ViewerSession  & { file_name: string })[] = [];

      await Promise.allSettled(
        assets.map(async (asset) => {
          // share activity (views + requests)
          try {
            const r = await fetch(
              `${BACKEND_URL}/resume/share/activity/${asset.asset_id}?user_id=${encodeURIComponent(userId)}`
            );
            if (r.ok) {
              const d = await r.json();
              (d.views    ?? []).forEach((v: ViewLog)         => allViews.push({ ...v, file_name: asset.file_name }));
              (d.requests ?? []).forEach((q: AccessRequest)   => allRequests.push({ ...q, file_name: asset.file_name }));
            }
          } catch { /* ignore */ }

          // viewer sessions
          try {
            const r = await fetch(
              `${BACKEND_URL}/resume/activity/sessions/${asset.asset_id}?user_id=${encodeURIComponent(userId)}`
            );
            if (r.ok) {
              const d = await r.json();
              (d.sessions ?? []).forEach((s: ViewerSession) =>
                allSessions.push({ ...s, file_name: asset.file_name })
              );
            }
          } catch { /* ignore */ }
        })
      );

      // 3. Aggregate
      const deviceBreakdown = { desktop: 0, mobile: 0, tablet: 0 };
      let copyCount = 0, printAttempts = 0, screenshotSignals = 0, suspiciousCount = 0;

      for (const s of allSessions) {
        if (s.device_type === "mobile")  deviceBreakdown.mobile++;
        else if (s.device_type === "tablet") deviceBreakdown.tablet++;
        else deviceBreakdown.desktop++;
        copyCount         += s.copy_count         ?? 0;
        printAttempts     += s.print_attempts     ?? 0;
        screenshotSignals += s.screenshot_signals ?? 0;
        if (s.is_suspicious) suspiciousCount++;
      }

      // Daily views (last 14 days)
      const now = new Date();
      const dailyMap: Record<string, number> = {};
      for (let i = 13; i >= 0; i--) {
        dailyMap[format(subDays(now, i), "MMM d")] = 0;
      }
      for (const v of allViews) {
        try {
          const key = format(startOfDay(parseISO(v.viewed_at)), "MMM d");
          if (key in dailyMap) dailyMap[key] = (dailyMap[key] ?? 0) + 1;
        } catch { /* ignore bad dates */ }
      }
      const dailyViews = Object.entries(dailyMap).map(([date, views]) => ({ date, views }));

      // Sort
      allViews.sort((a, b) => new Date(b.viewed_at).getTime() - new Date(a.viewed_at).getTime());
      allSessions.sort((a, b) => new Date(b.first_seen).getTime() - new Date(a.first_seen).getTime());
      allRequests.sort((a, b) => new Date(b.requested_at).getTime() - new Date(a.requested_at).getTime());

      setData({
        totalViews       : allViews.length,
        totalSessions    : allSessions.length,
        totalRequests    : allRequests.length,
        totalApproved    : allRequests.filter(r => r.status === "approved").length,
        totalRejected    : allRequests.filter(r => r.status === "rejected").length,
        copyCount,
        printAttempts,
        screenshotSignals,
        suspiciousCount,
        deviceBreakdown,
        dailyViews,
        sessions  : allSessions,
        requests  : allRequests,
        recentViews: allViews,
      });
    } catch (e) {
      console.error("[ActivityCenter] error:", e);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  // ── Loading skeleton ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 w-48 bg-slate-800 rounded-xl" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => <div key={i} className="h-24 bg-slate-800 rounded-2xl" />)}
        </div>
        <div className="h-56 bg-slate-800 rounded-2xl" />
        <div className="h-64 bg-slate-800 rounded-2xl" />
      </div>
    );
  }

  const d = data!;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-8 text-white">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="w-6 h-6 text-cyan-400" /> Activity Center
          </h1>
          <p className="text-slate-400 text-sm mt-0.5">Unified analytics across all documents</p>
        </div>
        <button onClick={load}
          className="flex items-center gap-2 px-3 py-2 bg-slate-800 border border-slate-700
                     rounded-xl text-slate-400 hover:text-white text-sm transition-colors">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {/* Stat tiles — row 1 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Tile label="Total Views"     value={d?.totalViews     ?? 0} icon={Eye}     color="text-cyan-400"   />
        <Tile label="Sessions"        value={d?.totalSessions  ?? 0} icon={Users}   color="text-blue-400"   />
        <Tile label="Requests"        value={d?.totalRequests  ?? 0} icon={Clock}   color="text-yellow-400" />
        <Tile label="Approved"        value={d?.totalApproved  ?? 0} icon={CheckCircle} color="text-green-400" />
      </div>

      {/* Stat tiles — row 2 (security counters) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Tile label="Copy Attempts"   value={d?.copyCount         ?? 0} icon={Copy}    color="text-orange-400" small />
        <Tile label="Print Attempts"  value={d?.printAttempts     ?? 0} icon={Printer} color="text-orange-400" small />
        <Tile label="Screenshot Sigs" value={d?.screenshotSignals ?? 0} icon={Camera}  color="text-red-400"    small />
        <Tile label="Suspicious"      value={d?.suspiciousCount   ?? 0} icon={AlertTriangle} color="text-red-400" small />
      </div>

      {/* Daily views chart */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
        <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
          <Eye className="w-4 h-4 text-cyan-400" /> Views — Last 14 Days
        </h2>
        {(d?.dailyViews ?? []).every(x => x.views === 0) ? (
          <div className="h-40 flex items-center justify-center text-slate-600 text-sm">
            No view data yet
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={d?.dailyViews ?? []} barSize={20}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
              <XAxis
                dataKey="date" tick={{ fill: "#64748b", fontSize: 11 }}
                axisLine={false} tickLine={false}
                interval={Math.floor((d?.dailyViews?.length ?? 14) / 7)}
              />
              <YAxis tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="views" fill="#06b6d4" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Device breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {[
          { key: "desktop", icon: Monitor,    label: "Desktop",  color: "text-blue-400",   val: d?.deviceBreakdown?.desktop ?? 0 },
          { key: "mobile",  icon: Smartphone, label: "Mobile",   color: "text-cyan-400",   val: d?.deviceBreakdown?.mobile  ?? 0 },
          { key: "tablet",  icon: Tablet,     label: "Tablet",   color: "text-purple-400", val: d?.deviceBreakdown?.tablet  ?? 0 },
        ].map(item => {
          const total = (d?.totalSessions ?? 0) || 1;
          const pct   = Math.round((item.val / total) * 100);
          return (
            <div key={item.key} className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
              <div className="flex items-center gap-3 mb-3">
                <item.icon className={`w-5 h-5 ${item.color}`} />
                <p className="text-sm font-medium text-white">{item.label}</p>
                <p className={`ml-auto text-lg font-bold tabular-nums ${item.color}`}>{item.val}</p>
              </div>
              <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${item.color.replace("text-","bg-")}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="text-xs text-slate-500 mt-1.5">{pct}% of sessions</p>
            </div>
          );
        })}
      </div>

      {/* Tabbed detail table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        {/* Tabs */}
        <div className="flex border-b border-slate-800">
          {([
            { key: "sessions", label: "Sessions",    count: d?.totalSessions  ?? 0 },
            { key: "requests", label: "Requests",    count: d?.totalRequests  ?? 0 },
            { key: "views",    label: "View Logs",   count: d?.totalViews     ?? 0 },
          ] as const).map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-5 py-3.5 text-sm font-medium transition-colors border-b-2 ${
                tab === t.key
                  ? "text-cyan-400 border-cyan-500"
                  : "text-slate-500 hover:text-slate-300 border-transparent"
              }`}
            >
              {t.label}
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                tab === t.key ? "bg-cyan-900/40 text-cyan-400" : "bg-slate-800 text-slate-500"
              }`}>{t.count}</span>
            </button>
          ))}
        </div>

        {/* Sessions tab */}
        {tab === "sessions" && (
          <div className="divide-y divide-slate-800/60">
            {(d?.sessions ?? []).length === 0 ? (
              <p className="text-slate-500 text-sm text-center py-12">No session data yet</p>
            ) : (
              (d?.sessions ?? []).slice(0, 20).map((s, i) => (
                <div key={i} className="flex items-center gap-4 px-5 py-3.5 hover:bg-slate-800/30 transition-colors">
                  <DeviceIcon type={s.device_type} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-mono text-slate-300 truncate">{s.viewer_email || "anonymous"}</p>
                      {s.is_suspicious && (
                        <AlertTriangle className="w-3 h-3 text-red-400 shrink-0" />
                      )}
                    </div>
                    <p className="text-xs text-slate-500 truncate">{s.file_name} · {s.browser} / {s.os}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 text-xs text-slate-500">
                    {s.copy_count > 0 && (
                      <span className="flex items-center gap-1 text-orange-400">
                        <Copy className="w-3 h-3" />{s.copy_count}
                      </span>
                    )}
                    {s.print_attempts > 0 && (
                      <span className="flex items-center gap-1 text-orange-400">
                        <Printer className="w-3 h-3" />{s.print_attempts}
                      </span>
                    )}
                    {s.screenshot_signals > 0 && (
                      <span className="flex items-center gap-1 text-red-400">
                        <Camera className="w-3 h-3" />{s.screenshot_signals}
                      </span>
                    )}
                    <span className="text-slate-600">
                      {s.first_seen ? format(new Date(s.first_seen), "MMM d HH:mm") : "—"}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Requests tab */}
        {tab === "requests" && (
          <div className="divide-y divide-slate-800/60">
            {(d?.requests ?? []).length === 0 ? (
              <p className="text-slate-500 text-sm text-center py-12">No access requests yet</p>
            ) : (
              (d?.requests ?? []).slice(0, 20).map((r, i) => (
                <div key={i} className="flex items-center gap-4 px-5 py-3.5 hover:bg-slate-800/30 transition-colors">
                  {r.status === "approved"
                    ? <CheckCircle className="w-4 h-4 text-green-400 shrink-0" />
                    : r.status === "rejected"
                    ? <XCircle    className="w-4 h-4 text-red-400 shrink-0" />
                    : <Clock      className="w-4 h-4 text-yellow-400 shrink-0 animate-pulse" />
                  }
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-mono text-slate-300 truncate">{r.requester_email}</p>
                    <p className="text-xs text-slate-500 truncate">{r.file_name}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 text-xs">
                    <span className={`px-2 py-0.5 rounded-full border font-medium ${
                      r.status === "approved" ? "bg-green-900/30 text-green-400 border-green-700/40" :
                      r.status === "rejected" ? "bg-red-900/30 text-red-400 border-red-700/40" :
                                                "bg-yellow-900/30 text-yellow-400 border-yellow-700/40"
                    }`}>{r.status}</span>
                    <span className="text-slate-600">
                      {format(new Date(r.requested_at), "MMM d HH:mm")}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Views tab */}
        {tab === "views" && (
          <div className="divide-y divide-slate-800/60">
            {(d?.recentViews ?? []).length === 0 ? (
              <p className="text-slate-500 text-sm text-center py-12">No view logs yet</p>
            ) : (
              (d?.recentViews ?? []).slice(0, 30).map((v, i) => (
                <div key={i} className="flex items-center gap-4 px-5 py-3 hover:bg-slate-800/30 transition-colors">
                  <Globe className="w-4 h-4 text-slate-600 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-mono text-slate-400 truncate">{v.viewer_ip || "—"}</p>
                    <p className="text-xs text-slate-500 truncate">{v.file_name} · {v.browser_info || "Unknown"}</p>
                  </div>
                  <span className="text-xs text-slate-600 shrink-0">
                    {format(new Date(v.viewed_at), "MMM d HH:mm")}
                  </span>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Security CTA */}
      {(d?.suspiciousCount ?? 0) > 0 && (
        <div className="flex items-center justify-between bg-red-950/20 border border-red-700/30
                        rounded-2xl px-5 py-4">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400" />
            <div>
              <p className="text-sm font-semibold text-red-300">
                {d.suspiciousCount} suspicious session{d.suspiciousCount > 1 ? "s" : ""} detected
              </p>
              <p className="text-xs text-red-400/70">Review full details in Security Center</p>
            </div>
          </div>
          <button
            onClick={() => navigate("/dashboard/security")}
            className="text-xs text-red-400 hover:text-red-300 px-4 py-2 bg-red-900/30
                       border border-red-700/30 rounded-xl transition-colors"
          >
            Security Center →
          </button>
        </div>
      )}
    </div>
  );
}
