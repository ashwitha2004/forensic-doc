/**
 * SecureVault
 * ===========
 * Lists all encrypted documents for the logged-in user.
 * Actions per document: View dashboard, Share link, Delete.
 * Upload button links to /encrypt (no logic duplication).
 */

import { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Database, Upload, Search, FileText, Trash2,
  Share2, ExternalLink, Lock, RefreshCw, Calendar,
  HardDrive, Filter, SortDesc,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";

const BACKEND_URL =
  (import.meta as any).env?.VITE_BACKEND_URL ?? "http://localhost:8000";

// ─── Types ────────────────────────────────────────────────────────────────────

interface VaultAsset {
  asset_id  : string;
  file_name : string;
  file_type : string;
  file_size : number;
  created_at: string;
  is_pinit_protected?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtSize(bytes: number): string {
  if (bytes < 1024)       return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf")                       return "PDF";
  if (["doc","docx"].includes(ext))        return "DOC";
  if (["jpg","jpeg","png","webp","gif"].includes(ext)) return "IMG";
  if (["mp4","mov","avi"].includes(ext))   return "VID";
  return "FILE";
}

function iconColor(type: string): string {
  switch(type) {
    case "PDF": return "text-red-400 bg-red-950/40 border-red-800/40";
    case "DOC": return "text-blue-400 bg-blue-950/40 border-blue-800/40";
    case "IMG": return "text-purple-400 bg-purple-950/40 border-purple-800/40";
    default:    return "text-cyan-400 bg-cyan-950/40 border-cyan-800/40";
  }
}

// ─── Document card ────────────────────────────────────────────────────────────

function AssetCard({
  asset,
  onView,
  onShare,
  onDelete,
}: {
  asset   : VaultAsset;
  onView  : () => void;
  onShare : () => void;
  onDelete: () => void;
}) {
  const type = fileIcon(asset.file_name);
  const clr  = iconColor(type);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 hover:border-slate-700
                    transition-all hover:shadow-lg hover:shadow-slate-950/50 group">
      {/* Header row */}
      <div className="flex items-start gap-3 mb-4">
        <div className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${clr}`}>
          <FileText className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate" title={asset.file_name}>
            {asset.file_name}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${clr}`}>{type}</span>
            <span className="text-xs text-slate-500">{fmtSize(asset.file_size)}</span>
          </div>
        </div>
        <Lock className="w-3.5 h-3.5 text-cyan-600 shrink-0 mt-1" title="AES-256-GCM encrypted" />
      </div>

      {/* Meta */}
      <div className="flex items-center gap-4 text-xs text-slate-500 mb-4">
        <span className="flex items-center gap-1">
          <Calendar className="w-3 h-3" />
          {formatDistanceToNow(new Date(asset.created_at), { addSuffix: true })}
        </span>
        <span className="flex items-center gap-1">
          <HardDrive className="w-3 h-3" />
          {format(new Date(asset.created_at), "MMM d, yyyy")}
        </span>
      </div>

      {/* Asset ID */}
      <p className="text-xs text-slate-600 font-mono truncate mb-4" title={asset.asset_id}>
        ID: {asset.asset_id}
      </p>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={onView}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium
                     bg-cyan-600/15 hover:bg-cyan-600/25 text-cyan-400 rounded-xl border
                     border-cyan-600/25 transition-colors"
        >
          <ExternalLink className="w-3.5 h-3.5" /> Dashboard
        </button>
        <button
          onClick={onShare}
          className="flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-medium
                     bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl border
                     border-slate-700 transition-colors"
        >
          <Share2 className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onDelete}
          className="flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-medium
                     bg-red-950/20 hover:bg-red-950/40 text-red-400 rounded-xl border
                     border-red-800/30 transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

type SortKey = "date" | "name" | "size";
type FilterType = "all" | "PDF" | "DOC" | "IMG" | "FILE";

export default function SecureVault() {
  const navigate = useNavigate();
  const userId   = localStorage.getItem("biovault_userId") || "";

  const [assets,    setAssets]    = useState<VaultAsset[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [query,     setQuery]     = useState("");
  const [sort,      setSort]      = useState<SortKey>("date");
  const [filter,    setFilter]    = useState<FilterType>("all");
  const [deleting,  setDeleting]  = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const r = await fetch(`${BACKEND_URL}/vault/list?user_id=${encodeURIComponent(userId)}`);
      if (r.ok) {
        const d = await r.json();
        setAssets(d.assets ?? []);
      }
    } catch (e) {
      console.error("[SecureVault] load error:", e);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (assetId: string) => {
    if (!confirm("Delete this document? This cannot be undone.")) return;
    setDeleting(assetId);
    try {
      await fetch(`${BACKEND_URL}/vault/${assetId}?user_id=${encodeURIComponent(userId)}`, {
        method: "DELETE",
      });
      setAssets(prev => prev.filter(a => a.asset_id !== assetId));
    } catch (e) {
      console.error("[SecureVault] delete error:", e);
    } finally {
      setDeleting(null);
    }
  };

  // ── Derived list ──────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = [...assets];

    if (filter !== "all") {
      list = list.filter(a => fileIcon(a.file_name) === filter);
    }
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(a => a.file_name.toLowerCase().includes(q));
    }
    switch (sort) {
      case "name": list.sort((a, b) => a.file_name.localeCompare(b.file_name)); break;
      case "size": list.sort((a, b) => b.file_size - a.file_size); break;
      case "date": default:
        list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        break;
    }
    return list;
  }, [assets, filter, query, sort]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 text-white">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Database className="w-6 h-6 text-cyan-400" /> Secure Vault
          </h1>
          <p className="text-slate-400 text-sm mt-0.5">
            {assets.length} encrypted document{assets.length !== 1 ? "s" : ""} · AES-256-GCM protected
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            disabled={loading}
            className="p-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-400
                       hover:text-white transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={() => navigate("/encrypt")}
            className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-700
                       text-white text-sm font-medium rounded-xl transition-colors"
          >
            <Upload className="w-4 h-4" /> Upload
          </button>
        </div>
      </div>

      {/* Filters + Search */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Search */}
        <div className="flex-1 relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search documents…"
            className="w-full pl-9 pr-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl
                       text-sm text-white placeholder-slate-500 focus:outline-none
                       focus:border-cyan-600/50 transition-colors"
          />
        </div>

        {/* Type filter */}
        <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-xl p-1">
          {(["all","PDF","DOC","IMG","FILE"] as FilterType[]).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filter === f
                  ? "bg-slate-700 text-white"
                  : "text-slate-500 hover:text-slate-300"
              }`}
            >
              {f === "all" ? "All" : f}
            </button>
          ))}
        </div>

        {/* Sort */}
        <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-xl p-1">
          <SortDesc className="w-3 h-3 text-slate-500 mx-2" />
          {(["date","name","size"] as SortKey[]).map(s => (
            <button
              key={s}
              onClick={() => setSort(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
                sort === s
                  ? "bg-slate-700 text-white"
                  : "text-slate-500 hover:text-slate-300"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 animate-pulse">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-52 bg-slate-800 rounded-2xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <div className="w-16 h-16 rounded-2xl bg-slate-800 border border-slate-700
                          flex items-center justify-center">
            <Database className="w-8 h-8 text-slate-600" />
          </div>
          <div className="text-center">
            <p className="text-slate-400 font-medium">
              {query ? "No documents match your search" : "Your vault is empty"}
            </p>
            <p className="text-slate-600 text-sm mt-1">
              {query ? "Try a different search term" : "Upload your first encrypted document"}
            </p>
          </div>
          {!query && (
            <button
              onClick={() => navigate("/encrypt")}
              className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-700
                         text-white text-sm font-medium rounded-xl transition-colors mt-2"
            >
              <Upload className="w-4 h-4" /> Upload Document
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(asset => (
            <div key={asset.asset_id} className={deleting === asset.asset_id ? "opacity-40 pointer-events-none" : ""}>
              <AssetCard
                asset={asset}
                onView={()   => navigate(`/resume/dashboard/${asset.asset_id}`)}
                onShare={()  => navigate(`/dashboard/sharing?highlight=${asset.asset_id}`)}
                onDelete={()  => handleDelete(asset.asset_id)}
              />
            </div>
          ))}
        </div>
      )}

      {/* Summary bar */}
      {filtered.length > 0 && (
        <div className="flex items-center gap-4 text-xs text-slate-500 pt-2 border-t border-slate-800">
          <span className="flex items-center gap-1.5">
            <Filter className="w-3 h-3" />
            {filtered.length} of {assets.length} documents
          </span>
          <span>
            Total: {fmtSize(filtered.reduce((s, a) => s + a.file_size, 0))}
          </span>
        </div>
      )}
    </div>
  );
}
