/**
 * DashboardHome
 * =============
 * Overview page: stat cards, recent documents, quick actions, security alerts.
 * Fetches /vault/list and then /resume/share/activity per asset (capped at 10).
 */

import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Database, Share2, AlertTriangle, Eye, Upload,
  FileText, Clock, Shield, Activity, ArrowRight,
  CheckCircle, XCircle, TrendingUp, Microscope, BarChart2,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const BACKEND_URL =
  (import.meta as any).env?.VITE_BACKEND_URL ?? "http://localhost:8000";

// ─── Types ────────────────────────────────────────────────────────────────────

interface VaultAsset {
  asset_id   : string;
  file_name  : string;
  file_type  : string;
  file_size  : number;
  created_at : string;
}

interface ShareActivity {
  asset_id        : string;
  total_views     : number;
  total_requests  : number;
  pending_requests: number;
  share_links     : { is_active: boolean }[];
}

interface DashStats {
  totalDocuments : number;
  activeLinks    : number;
  pendingRequests: number;
  totalViews     : number;
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({
  label, value, icon: Icon, color, sublabel,
}: {
  label   : string;
  value   : number | string;
  icon    : React.ComponentType<{ className?: string }>;
  color   : "cyan" | "green" | "yellow" | "red" | "purple";
  sublabel?: string;
}) {
  const colors = {
    cyan  : "from-cyan-500/20 to-cyan-600/10 border-cyan-600/30 text-cyan-400",
    green : "from-green-500/20 to-green-600/10 border-green-600/30 text-green-400",
    yellow: "from-yellow-500/20 to-yellow-600/10 border-yellow-600/30 text-yellow-400",
    red   : "from-red-500/20 to-red-600/10 border-red-600/30 text-red-400",
    purple: "from-purple-500/20 to-purple-600/10 border-purple-600/30 text-purple-400",
  }[color];

  return (
    <div className={`bg-gradient-to-br ${colors} border rounded-2xl p-5`}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-slate-400 text-xs font-medium uppercase tracking-wider">{label}</p>
        <Icon className={`w-5 h-5 ${colors.split(" ").pop()}`} />
      </div>
      <p className="text-3xl font-bold text-white tabular-nums">{value}</p>
      {sublabel && <p className="text-xs text-slate-500 mt-1">{sublabel}</p>}
    </div>
  );
}

// ─── Recent document row ──────────────────────────────────────────────────────

function DocRow({ asset, onClick }: { asset: VaultAsset; onClick: () => void }) {
  const ext = asset.file_name.split(".").pop()?.toUpperCase() ?? "FILE";
  const kb  = Math.round(asset.file_size / 1024);

  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 w-full text-left px-4 py-3 hover:bg-slate-800/50
                 rounded-xl transition-colors group"
    >
      <div className="w-9 h-9 rounded-lg bg-slate-800 border border-slate-700 flex items-center
                      justify-center shrink-0">
        <FileText className="w-4 h-4 text-cyan-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white font-medium truncate">{asset.file_name}</p>
        <p className="text-xs text-slate-500">
          {ext} · {kb > 0 ? `${kb} KB` : "< 1 KB"} ·{" "}
          {formatDistanceToNow(new Date(asset.created_at), { addSuffix: true })}
        </p>
      </div>
      <ArrowRight className="w-4 h-4 text-slate-600 group-hover:text-slate-400 transition-colors shrink-0" />
    </button>
  );
}

// ─── Quick action card ────────────────────────────────────────────────────────

function QuickAction({
  icon: Icon, label, description, onClick, color,
}: {
  icon       : React.ComponentType<{ className?: string }>;
  label      : string;
  description: string;
  onClick    : () => void;
  color      : string;
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-start gap-3 p-5 rounded-2xl bg-slate-900 border
                 border-slate-800 hover:border-slate-700 text-left transition-all
                 hover:shadow-lg hover:shadow-slate-900/50 group w-full"
    >
      <div className={`w-10 h-10 rounded-xl ${color} flex items-center justify-center
                       group-hover:scale-110 transition-transform`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div>
        <p className="text-sm font-semibold text-white mb-0.5">{label}</p>
        <p className="text-xs text-slate-500">{description}</p>
      </div>
    </button>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function DashboardHome() {
  const navigate = useNavigate();
  const userId   = localStorage.getItem("biovault_userId") || "";

  const [assets,    setAssets]    = useState<VaultAsset[]>([]);
  const [stats,     setStats]     = useState<DashStats | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [hasSuspicious, setHasSuspicious] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      // 1. Fetch vault list
      const vaultRes = await fetch(`${BACKEND_URL}/vault/list?user_id=${encodeURIComponent(userId)}`);
      const vaultData = vaultRes.ok ? await vaultRes.json() : { assets: [], total: 0 };
      const vaultAssets: VaultAsset[] = vaultData.assets ?? [];
      setAssets(vaultAssets);

      // 2. Fetch share activity for up to 10 most recent assets
      const toCheck = vaultAssets.slice(0, 10);
      const activities: ShareActivity[] = [];

      await Promise.allSettled(
        toCheck.map(async (a) => {
          try {
            const r = await fetch(
              `${BACKEND_URL}/resume/share/activity/${a.asset_id}?user_id=${encodeURIComponent(userId)}`
            );
            if (r.ok) {
              const d = await r.json();
              activities.push({ asset_id: a.asset_id, ...d });
            }
          } catch {
            // ignore per-asset fetch failures
          }
        })
      );

      // 3. Aggregate stats
      let activeLinks     = 0;
      let pendingRequests = 0;
      let totalViews      = 0;
      let suspicious      = false;

      for (const act of activities) {
        activeLinks     += (act.share_links ?? []).filter(l => l.is_active).length;
        pendingRequests += act.pending_requests ?? 0;
        totalViews      += act.total_views ?? 0;
      }

      // 4. Check for suspicious sessions (best-effort)
      try {
        for (const a of toCheck.slice(0, 5)) {
          const r = await fetch(
            `${BACKEND_URL}/resume/activity/sessions/${a.asset_id}?user_id=${encodeURIComponent(userId)}`
          );
          if (r.ok) {
            const d = await r.json();
            if ((d.sessions ?? []).some((s: any) => s.is_suspicious)) {
              suspicious = true;
              break;
            }
          }
        }
      } catch { /* best-effort */ }

      setStats({ totalDocuments: vaultAssets.length, activeLinks, pendingRequests, totalViews });
      setHasSuspicious(suspicious);
    } catch (e) {
      console.error("[DashboardHome] load error:", e);
      setStats({ totalDocuments: 0, activeLinks: 0, pendingRequests: 0, totalViews: 0 });
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  // ── Loading skeleton ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 w-64 bg-slate-800 rounded-xl" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-28 bg-slate-800 rounded-2xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-64 bg-slate-800 rounded-2xl" />
          <div className="h-64 bg-slate-800 rounded-2xl" />
        </div>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-8 text-white">

      {/* Page title */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            Welcome back, <span className="text-cyan-400 font-mono">{userId}</span>
          </p>
        </div>
        <button
          onClick={load}
          className="text-xs text-slate-500 hover:text-slate-300 transition-colors px-3 py-1.5
                     bg-slate-800 rounded-lg border border-slate-700"
        >
          Refresh
        </button>
      </div>

      {/* Security alert banner */}
      {hasSuspicious && (
        <div className="flex items-center gap-3 bg-red-950/30 border border-red-700/40
                        rounded-2xl px-5 py-4">
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-red-300">Suspicious activity detected</p>
            <p className="text-xs text-red-400/70">One or more sessions have been flagged. Review Security Center.</p>
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

      {/* Pending requests banner */}
      {(stats?.pendingRequests ?? 0) > 0 && (
        <div className="flex items-center gap-3 bg-yellow-950/30 border border-yellow-700/40
                        rounded-2xl px-5 py-4">
          <Clock className="w-5 h-5 text-yellow-400 shrink-0 animate-pulse" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-yellow-300">
              {stats!.pendingRequests} pending access request{stats!.pendingRequests > 1 ? "s" : ""}
            </p>
            <p className="text-xs text-yellow-400/70">Viewers are waiting for approval to see contact info.</p>
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

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Documents"     value={stats?.totalDocuments ?? 0}
          icon={Database}       color="cyan"
          sublabel="Encrypted & stored"
        />
        <StatCard
          label="Share Links"   value={stats?.activeLinks ?? 0}
          icon={Share2}         color="green"
          sublabel="Active links"
        />
        <StatCard
          label="Pending"       value={stats?.pendingRequests ?? 0}
          icon={Clock}          color="yellow"
          sublabel="Access requests"
        />
        <StatCard
          label="Total Views"   value={stats?.totalViews ?? 0}
          icon={Eye}            color="purple"
          sublabel="Across all shares"
        />
      </div>

      {/* Main grid: Recent docs + Quick actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Recent documents */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-cyan-400" />
              <h2 className="text-sm font-semibold text-white">Recent Documents</h2>
            </div>
            <button
              onClick={() => navigate("/dashboard/vault")}
              className="text-xs text-cyan-500 hover:text-cyan-400 transition-colors"
            >
              View all →
            </button>
          </div>

          {assets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Database className="w-8 h-8 text-slate-700" />
              <p className="text-slate-500 text-sm">No documents yet</p>
              <button
                onClick={() => navigate("/encrypt")}
                className="text-xs text-cyan-500 hover:text-cyan-400 transition-colors"
              >
                Upload your first document →
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-800/50 px-2 py-2">
              {assets.slice(0, 6).map(a => (
                <DocRow
                  key={a.asset_id}
                  asset={a}
                  onClick={() => navigate(`/resume/dashboard/${a.asset_id}`)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Quick actions + Security overview */}
        <div className="space-y-6">
          <div>
            <h2 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-cyan-400" /> Quick Actions
            </h2>
            <div className="grid grid-cols-1 gap-3">
              <QuickAction
                icon={Upload}      color="bg-cyan-600"
                label="Upload & Encrypt"
                description="Securely encrypt a new document or image"
                onClick={() => navigate("/encrypt")}
              />
              <QuickAction
                icon={Share2}      color="bg-blue-600"
                label="Manage Sharing"
                description="View links, approve requests, revoke access"
                onClick={() => navigate("/dashboard/sharing")}
              />
              <QuickAction
                icon={Microscope}  color="bg-purple-600"
                label="Run Forensics"
                description="Detect manipulation, check AI generation"
                onClick={() => navigate("/dashboard/forensics")}
              />
              <QuickAction
                icon={BarChart2}   color="bg-emerald-700"
                label="Resume Share Analytics"
                description="View links, requests, approvals & session tracking per document"
                onClick={() => navigate("/dashboard/sharing")}
              />
            </div>
          </div>

          {/* Security status */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Shield className="w-4 h-4 text-cyan-400" />
              <h2 className="text-sm font-semibold text-white">Security Status</h2>
            </div>
            <div className="space-y-3">
              <SecurityLine
                label="End-to-end encryption"
                status="active"
                detail="AES-256-GCM"
              />
              <SecurityLine
                label="Activity tracking"
                status="active"
                detail="All views logged"
              />
              <SecurityLine
                label="Suspicious sessions"
                status={hasSuspicious ? "warning" : "ok"}
                detail={hasSuspicious ? "Review required" : "None detected"}
              />
              <SecurityLine
                label="Pending approvals"
                status={(stats?.pendingRequests ?? 0) > 0 ? "warning" : "ok"}
                detail={
                  (stats?.pendingRequests ?? 0) > 0
                    ? `${stats!.pendingRequests} waiting`
                    : "All clear"
                }
              />
            </div>
            <button
              onClick={() => navigate("/dashboard/security")}
              className="mt-4 w-full text-xs text-slate-400 hover:text-white py-2 px-3
                         bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors
                         flex items-center justify-center gap-2"
            >
              <Activity className="w-3 h-3" /> Full Security Report
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Security line helper ─────────────────────────────────────────────────────

function SecurityLine({
  label, status, detail,
}: {
  label : string;
  status: "active" | "ok" | "warning" | "error";
  detail: string;
}) {
  const icon =
    status === "active" || status === "ok"
      ? <CheckCircle className="w-3.5 h-3.5 text-green-400 shrink-0" />
      : status === "warning"
      ? <AlertTriangle className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
      : <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />;

  return (
    <div className="flex items-center gap-2.5 text-xs">
      {icon}
      <span className="text-slate-300 flex-1">{label}</span>
      <span className={`text-xs font-mono ${
        status === "warning" ? "text-yellow-400" :
        status === "error"   ? "text-red-400" :
                               "text-green-400"
      }`}>{detail}</span>
    </div>
  );
}
