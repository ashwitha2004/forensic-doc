/**
 * SettingsPage
 * ============
 * User profile, account info, storage usage, security preferences.
 * Read-only for settings that live in the backend — no API rewrites.
 */

import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Settings, User, HardDrive, Shield, Lock, RefreshCw,
  LogOut, ChevronRight, Info, Database, FileText,
} from "lucide-react";

const BACKEND_URL =
  (import.meta as any).env?.VITE_BACKEND_URL ?? "http://localhost:8000";

// ─── Section card ─────────────────────────────────────────────────────────────

function Section({
  title, icon: Icon, children,
}: {
  title   : string;
  icon    : React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-800">
        <Icon className="w-4 h-4 text-cyan-400" />
        <h2 className="text-sm font-semibold text-white">{title}</h2>
      </div>
      <div className="p-5 space-y-4">{children}</div>
    </div>
  );
}

// ─── Info row ─────────────────────────────────────────────────────────────────

function InfoRow({
  label, value, mono, action,
}: {
  label  : string;
  value  : string;
  mono?  : boolean;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-xs text-slate-500">{label}</p>
        <p className={`text-sm text-slate-200 mt-0.5 ${mono ? "font-mono" : ""}`}>{value}</p>
      </div>
      {action && (
        <button
          onClick={action.onClick}
          className="text-xs text-cyan-500 hover:text-cyan-400 px-3 py-1.5 bg-slate-800
                     hover:bg-slate-700 rounded-xl transition-colors shrink-0 flex items-center gap-1"
        >
          {action.label} <ChevronRight className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

// ─── Toggle row ───────────────────────────────────────────────────────────────

function ToggleRow({
  label, description, value, badge,
}: {
  label      : string;
  description: string;
  value      : boolean;
  badge?     : string;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm text-slate-200">{label}</p>
          {badge && (
            <span className="text-xs px-1.5 py-0.5 bg-cyan-900/30 text-cyan-400
                             border border-cyan-700/30 rounded-full font-medium">
              {badge}
            </span>
          )}
        </div>
        <p className="text-xs text-slate-500 mt-0.5">{description}</p>
      </div>
      <div className={`shrink-0 w-10 h-6 rounded-full flex items-center px-1 transition-colors ${
        value ? "bg-cyan-600 justify-end" : "bg-slate-700 justify-start"
      }`}>
        <div className="w-4 h-4 rounded-full bg-white shadow" />
      </div>
    </div>
  );
}

// ─── Storage bar ─────────────────────────────────────────────────────────────

function StorageBar({ used, total }: { used: number; total: number }) {
  const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
  const color = pct > 80 ? "bg-red-500" : pct > 60 ? "bg-yellow-500" : "bg-cyan-500";

  return (
    <div>
      <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
        <span>{fmtSize(used)} used</span>
        <span>{pct}% of {fmtSize(total)}</span>
      </div>
      <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${color} transition-all duration-700`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function fmtSize(bytes: number): string {
  if (bytes < 1024)              return `${bytes} B`;
  if (bytes < 1024 * 1024)      return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3)        return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

// ─── Main component ───────────────────────────────────────────────────────────

interface VaultAsset { file_size: number; file_type: string }

export default function SettingsPage() {
  const navigate = useNavigate();
  const userId   = localStorage.getItem("biovault_userId") || "—";

  const [assets,     setAssets]     = useState<VaultAsset[]>([]);
  const [loading,    setLoading]    = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${BACKEND_URL}/vault/list?user_id=${encodeURIComponent(userId)}`);
      if (r.ok) {
        const d = await r.json();
        setAssets(d.assets ?? []);
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const handleLogout = () => {
    localStorage.removeItem("biovault_token");
    localStorage.removeItem("biovault_userId");
    navigate("/login");
  };

  const totalBytes   = assets.reduce((s, a) => s + (a.file_size ?? 0), 0);
  const pdfCount     = assets.filter(a => a.file_type?.includes("pdf")).length;
  const docCount     = assets.filter(a =>
    a.file_type?.includes("word") || a.file_type?.includes("document")
  ).length;
  const imgCount     = assets.filter(a => a.file_type?.startsWith("image/")).length;
  const otherCount   = assets.length - pdfCount - docCount - imgCount;
  const STORAGE_LIMIT = 1024 * 1024 * 1024; // 1 GB display limit

  return (
    <div className="space-y-6 text-white max-w-2xl">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Settings className="w-6 h-6 text-cyan-400" /> Settings
        </h1>
        <p className="text-slate-400 text-sm mt-0.5">Account profile and platform preferences</p>
      </div>

      {/* Account */}
      <Section title="Account" icon={User}>
        <InfoRow label="User ID"    value={userId}     mono />
        <InfoRow label="Platform"   value="PINIT Vault" />
        <InfoRow label="Auth method" value="Token-based (biovault)" />
        <InfoRow
          label="Session"
          value={localStorage.getItem("biovault_token") ? "Active" : "Not authenticated"}
          action={{ label: "Sign out", onClick: handleLogout }}
        />
      </Section>

      {/* Storage */}
      <Section title="Storage Usage" icon={HardDrive}>
        {loading ? (
          <div className="h-16 bg-slate-800 rounded-xl animate-pulse" />
        ) : (
          <>
            <StorageBar used={totalBytes} total={STORAGE_LIMIT} />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
              {[
                { label: "PDFs",    count: pdfCount,   color: "text-red-400"    },
                { label: "Docs",    count: docCount,   color: "text-blue-400"   },
                { label: "Images",  count: imgCount,   color: "text-purple-400" },
                { label: "Other",   count: otherCount, color: "text-slate-400"  },
              ].map(t => (
                <div key={t.label} className="bg-slate-800/60 rounded-xl p-3 text-center">
                  <p className={`text-lg font-bold ${t.color} tabular-nums`}>{t.count}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{t.label}</p>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between text-xs pt-1">
              <span className="text-slate-500">
                {assets.length} document{assets.length !== 1 ? "s" : ""} · {fmtSize(totalBytes)} total
              </span>
              <button
                onClick={() => navigate("/dashboard/vault")}
                className="text-cyan-500 hover:text-cyan-400 transition-colors flex items-center gap-1"
              >
                <Database className="w-3 h-3" /> Manage Vault
              </button>
            </div>
          </>
        )}
      </Section>

      {/* Security */}
      <Section title="Security" icon={Shield}>
        <ToggleRow
          label="AES-256-GCM encryption"
          description="All documents encrypted before upload"
          value={true}
          badge="Always on"
        />
        <ToggleRow
          label="Activity tracking"
          description="Log every view, session, and device on shared documents"
          value={true}
          badge="Always on"
        />
        <ToggleRow
          label="Geolocation on approval"
          description="Request viewer location after owner approves access"
          value={true}
        />
        <ToggleRow
          label="Copy / print detection"
          description="Detect and log copy & print attempts"
          value={true}
        />
        <ToggleRow
          label="Screenshot signals"
          description="Detect potential screenshot events (best effort)"
          value={true}
        />
      </Section>

      {/* About */}
      <Section title="About" icon={Info}>
        <InfoRow label="Platform"       value="PINIT Vault" />
        <InfoRow label="Version"        value="2.0.0 — Unified Dashboard" />
        <InfoRow label="Backend"        value={BACKEND_URL} mono />
        <InfoRow label="Encryption"     value="AES-256-GCM (Supabase vault)" />
        <InfoRow label="Forensics"      value="CNN · Residual · FFT · ELA" />
      </Section>

      {/* Danger zone */}
      <div className="bg-red-950/20 border border-red-800/30 rounded-2xl p-5">
        <h2 className="text-sm font-semibold text-red-300 mb-4 flex items-center gap-2">
          <Lock className="w-4 h-4" /> Danger Zone
        </h2>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-300">Sign out of PINIT Vault</p>
            <p className="text-xs text-slate-500 mt-0.5">Clears local session — documents remain in vault</p>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700
                       text-white text-sm font-medium rounded-xl transition-colors"
          >
            <LogOut className="w-4 h-4" /> Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
