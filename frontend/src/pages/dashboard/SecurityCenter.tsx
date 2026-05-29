/**
 * SecurityCenter
 * ==============
 * Suspicious sessions, geo data, IP/device logs, screenshot/print alerts,
 * security score, and full session access history.
 */

import { useEffect, useState, useCallback } from "react";
import {
  Shield, AlertTriangle, MapPin, Monitor, Smartphone,
  Tablet, Copy, Printer, Camera, RefreshCw, CheckCircle,
  Globe, Clock, Eye, Lock, Wifi,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

const BACKEND_URL =
  (import.meta as any).env?.VITE_BACKEND_URL ?? "http://localhost:8000";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ViewerSession {
  session_id        : string;
  viewer_email      : string;
  viewer_ip         : string;
  browser           : string;
  os                : string;
  device_type       : "mobile" | "tablet" | "desktop";
  screen_size       : string;
  is_first_visit    : boolean;
  geo_status        : string;
  latitude?         : number;
  longitude?        : number;
  geo_accuracy?     : number;
  first_seen        : string;
  last_seen         : string;
  total_duration_ms : number;
  active_duration_ms: number;
  copy_count        : number;
  print_attempts    : number;
  screenshot_signals: number;
  is_suspicious     : boolean;
  share_token       : string;
  asset_id?         : string;
  file_name?        : string;
}

// ─── Security score ───────────────────────────────────────────────────────────

function calcScore(sessions: ViewerSession[]): number {
  if (sessions.length === 0) return 100;
  const suspicious   = sessions.filter(s => s.is_suspicious).length;
  const hasScreenshot= sessions.some(s => s.screenshot_signals > 0);
  const hasPrint     = sessions.some(s => s.print_attempts > 0);
  let score = 100;
  score -= Math.min(40, suspicious * 10);
  if (hasScreenshot) score -= 15;
  if (hasPrint)      score -= 10;
  return Math.max(0, score);
}

function ScoreRing({ score }: { score: number }) {
  const r   = 36;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  const color = score >= 80 ? "#22c55e" : score >= 50 ? "#f59e0b" : "#ef4444";

  return (
    <div className="relative w-24 h-24 shrink-0">
      <svg className="w-24 h-24 -rotate-90" viewBox="0 0 80 80">
        <circle cx="40" cy="40" r={r} fill="none" stroke="#1e293b" strokeWidth="6" />
        <circle
          cx="40" cy="40" r={r} fill="none"
          stroke={color} strokeWidth="6"
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          style={{ transition: "stroke-dasharray 0.8s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-bold text-white">{score}</span>
        <span className="text-xs text-slate-500">/ 100</span>
      </div>
    </div>
  );
}

// ─── Session row ──────────────────────────────────────────────────────────────

function SessionRow({ session }: { session: ViewerSession }) {
  const [expanded, setExpanded] = useState(false);
  const dur = session.total_duration_ms
    ? `${Math.round(session.total_duration_ms / 1000)}s`
    : "—";
  const DevIcon =
    session.device_type === "mobile"  ? Smartphone :
    session.device_type === "tablet"  ? Tablet     : Monitor;

  return (
    <div className={`border-b border-slate-800/60 ${session.is_suspicious ? "bg-red-950/10" : ""}`}>
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-3 px-5 py-3.5 text-left hover:bg-slate-800/30 transition-colors"
      >
        {/* Suspicious indicator */}
        {session.is_suspicious
          ? <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 animate-pulse" />
          : <CheckCircle   className="w-4 h-4 text-green-500/50 shrink-0" />
        }

        <DevIcon className="w-3.5 h-3.5 text-slate-500 shrink-0" />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-xs font-mono text-slate-300 truncate">
              {session.viewer_email || "anonymous"}
            </p>
            {session.file_name && (
              <span className="text-xs text-slate-600 truncate hidden sm:block">
                · {session.file_name}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 truncate">
            {session.viewer_ip || "—"} · {session.browser} / {session.os}
          </p>
        </div>

        {/* Counters */}
        <div className="flex items-center gap-2 shrink-0 text-xs">
          {session.copy_count > 0 && (
            <span className="flex items-center gap-0.5 text-orange-400">
              <Copy className="w-3 h-3" />{session.copy_count}
            </span>
          )}
          {session.print_attempts > 0 && (
            <span className="flex items-center gap-0.5 text-orange-400">
              <Printer className="w-3 h-3" />{session.print_attempts}
            </span>
          )}
          {session.screenshot_signals > 0 && (
            <span className="flex items-center gap-0.5 text-red-400">
              <Camera className="w-3 h-3" />{session.screenshot_signals}
            </span>
          )}
          <span className="text-slate-600 hidden sm:block">{dur}</span>
          <span className="text-slate-600">
            {session.first_seen
              ? formatDistanceToNow(new Date(session.first_seen), { addSuffix: true })
              : "—"}
          </span>
        </div>
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="px-5 pb-4 grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs text-slate-400
                        border-t border-slate-800/40 pt-3">
          <Detail label="Session ID"   value={session.session_id?.slice(0, 16) + "…"} />
          <Detail label="IP Address"   value={session.viewer_ip || "—"} mono />
          <Detail label="Browser"      value={session.browser || "—"} />
          <Detail label="OS"           value={session.os || "—"} />
          <Detail label="Screen"       value={session.screen_size || "—"} />
          <Detail label="Device"       value={session.device_type} />
          <Detail label="First seen"   value={session.first_seen ? format(new Date(session.first_seen), "MMM d HH:mm:ss") : "—"} />
          <Detail label="Last seen"    value={session.last_seen  ? format(new Date(session.last_seen),  "MMM d HH:mm:ss") : "—"} />
          <Detail label="Duration"     value={dur} />
          <Detail label="Copy count"   value={String(session.copy_count         ?? 0)} />
          <Detail label="Print tries"  value={String(session.print_attempts     ?? 0)} />
          <Detail label="Screenshots"  value={String(session.screenshot_signals ?? 0)} />
          {session.geo_status === "granted" && session.latitude != null && (
            <>
              <Detail label="Latitude"  value={session.latitude.toFixed(4)} />
              <Detail label="Longitude" value={session.longitude?.toFixed(4) ?? "—"} />
              <Detail label="Geo accuracy" value={`±${Math.round(session.geo_accuracy ?? 0)}m`} />
            </>
          )}
          {session.is_suspicious && (
            <div className="col-span-2 sm:col-span-3">
              <span className="text-red-400 font-semibold">⚠ Flagged as suspicious</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-slate-600 text-xs">{label}</p>
      <p className={`text-slate-300 text-xs ${mono ? "font-mono" : ""} truncate`}>{value}</p>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function SecurityCenter() {
  const userId = localStorage.getItem("biovault_userId") || "";

  const [sessions, setSessions] = useState<ViewerSession[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [filter,   setFilter]   = useState<"all" | "suspicious" | "geo" | "alerts">("all");

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);

    try {
      const vr = await fetch(`${BACKEND_URL}/vault/list?user_id=${encodeURIComponent(userId)}`);
      if (!vr.ok) { setLoading(false); return; }
      const { assets } = await vr.json();

      const all: ViewerSession[] = [];
      await Promise.allSettled(
        (assets ?? []).map(async (a: { asset_id: string; file_name: string }) => {
          try {
            const r = await fetch(
              `${BACKEND_URL}/resume/activity/sessions/${a.asset_id}?user_id=${encodeURIComponent(userId)}`
            );
            if (r.ok) {
              const d = await r.json();
              (d.sessions ?? []).forEach((s: ViewerSession) =>
                all.push({ ...s, file_name: a.file_name, asset_id: a.asset_id })
              );
            }
          } catch { /* ignore */ }
        })
      );

      all.sort((a, b) => {
        if (a.is_suspicious !== b.is_suspicious) return a.is_suspicious ? -1 : 1;
        return new Date(b.first_seen).getTime() - new Date(a.first_seen).getTime();
      });
      setSessions(all);
    } catch (e) {
      console.error("[SecurityCenter] error:", e);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const score      = calcScore(sessions);
  const suspicious = sessions.filter(s => s.is_suspicious);
  const geoSessions= sessions.filter(s => s.geo_status === "granted" && s.latitude != null);
  const alerts     = sessions.filter(s =>
    s.copy_count > 0 || s.print_attempts > 0 || s.screenshot_signals > 0
  );

  const displayed =
    filter === "suspicious" ? suspicious :
    filter === "geo"        ? geoSessions :
    filter === "alerts"     ? alerts :
    sessions;

  const scoreColor = score >= 80 ? "text-green-400" : score >= 50 ? "text-yellow-400" : "text-red-400";

  return (
    <div className="space-y-8 text-white">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="w-6 h-6 text-cyan-400" /> Security Center
          </h1>
          <p className="text-slate-400 text-sm mt-0.5">
            {sessions.length} session{sessions.length !== 1 ? "s" : ""} tracked across all documents
          </p>
        </div>
        <button onClick={load}
          className="flex items-center gap-2 px-3 py-2 bg-slate-800 border border-slate-700
                     rounded-xl text-slate-400 hover:text-white text-sm transition-colors">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {/* Score + summary */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <div className="flex items-center gap-6">
          <ScoreRing score={score} />
          <div className="flex-1">
            <p className="text-slate-400 text-xs uppercase tracking-wider mb-1">Security Score</p>
            <p className={`text-3xl font-bold ${scoreColor}`}>
              {score >= 80 ? "Excellent" : score >= 60 ? "Good" : score >= 40 ? "Fair" : "Needs Review"}
            </p>
            <p className="text-slate-500 text-sm mt-1">
              {suspicious.length > 0
                ? `${suspicious.length} suspicious session${suspicious.length > 1 ? "s" : ""} detected`
                : "No suspicious activity detected"}
            </p>
          </div>
        </div>

        {/* Check list */}
        <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[
            { label: "AES-256-GCM",       ok: true },
            { label: "Activity logging",  ok: true },
            { label: "No suspicious IPs", ok: suspicious.length === 0 },
            { label: "No print attempts", ok: !sessions.some(s => s.print_attempts > 0) },
            { label: "No screenshots",    ok: !sessions.some(s => s.screenshot_signals > 0) },
            { label: "No copy attempts",  ok: !sessions.some(s => s.copy_count > 0) },
          ].map(c => (
            <div key={c.label} className="flex items-center gap-2 text-xs">
              {c.ok
                ? <CheckCircle   className="w-3.5 h-3.5 text-green-400 shrink-0" />
                : <AlertTriangle className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
              }
              <span className={c.ok ? "text-slate-300" : "text-yellow-300"}>{c.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Quick stat row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total Sessions",   val: sessions.length,   icon: Eye,           color: "text-cyan-400"   },
          { label: "Suspicious",       val: suspicious.length, icon: AlertTriangle, color: "text-red-400"    },
          { label: "Geo Tracked",      val: geoSessions.length,icon: MapPin,        color: "text-blue-400"   },
          { label: "Security Alerts",  val: alerts.length,     icon: Camera,        color: "text-orange-400" },
        ].map(s => (
          <div key={s.label}
               className="bg-slate-900 border border-slate-800 rounded-2xl p-4 text-center">
            <s.icon className={`w-5 h-5 ${s.color} mx-auto mb-2`} />
            <p className={`text-2xl font-bold ${s.color} tabular-nums`}>{s.val}</p>
            <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Geo sessions callout */}
      {geoSessions.length > 0 && (
        <div className="bg-slate-900 border border-blue-700/30 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <MapPin className="w-4 h-4 text-blue-400" />
            <h2 className="text-sm font-semibold text-white">Geolocation Data</h2>
            <span className="text-xs text-slate-500">({geoSessions.length} session{geoSessions.length > 1 ? "s" : ""})</span>
          </div>
          <div className="space-y-2">
            {geoSessions.slice(0, 5).map((s, i) => (
              <div key={i} className="flex items-center gap-3 bg-slate-800/50 rounded-xl px-4 py-2.5">
                <Globe className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                <span className="text-xs font-mono text-slate-300 flex-1 truncate">
                  {s.viewer_email || s.viewer_ip || "anonymous"}
                </span>
                <span className="text-xs text-blue-300 font-mono">
                  {s.latitude?.toFixed(4)}, {s.longitude?.toFixed(4)}
                </span>
                <span className="text-xs text-slate-500 shrink-0">
                  ±{Math.round(s.geo_accuracy ?? 0)}m
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Session log */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        {/* Filter bar */}
        <div className="flex items-center gap-1 p-3 border-b border-slate-800 flex-wrap">
          {([
            { key: "all",        label: "All",         count: sessions.length   },
            { key: "suspicious", label: "Suspicious",  count: suspicious.length },
            { key: "geo",        label: "Geo tracked", count: geoSessions.length},
            { key: "alerts",     label: "Alerts",      count: alerts.length     },
          ] as const).map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium
                          transition-colors ${
                filter === f.key
                  ? "bg-cyan-600/20 text-cyan-400 border border-cyan-600/30"
                  : "text-slate-500 hover:text-slate-300 hover:bg-slate-800"
              }`}
            >
              {f.label}
              <span className={`px-1 py-0.5 rounded-md text-xs ${
                filter === f.key ? "bg-cyan-900/40" : "bg-slate-800"
              }`}>{f.count}</span>
            </button>
          ))}
        </div>

        {/* Header row */}
        <div className="hidden sm:grid grid-cols-[24px_24px_1fr_auto] gap-3 px-5 py-2
                        text-xs text-slate-600 uppercase tracking-wider border-b border-slate-800/40">
          <span />
          <span />
          <span>Viewer / Device</span>
          <span>Counters / Time</span>
        </div>

        {/* Session rows */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : displayed.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Lock className="w-8 h-8 text-slate-700" />
            <p className="text-slate-500 text-sm">
              {filter === "all" ? "No sessions yet — share a document to start tracking" : `No ${filter} sessions`}
            </p>
          </div>
        ) : (
          displayed.map((s, i) => <SessionRow key={i} session={s} />)
        )}
      </div>
    </div>
  );
}
