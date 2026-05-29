/**
 * DashboardHome
 * =============
 * Lists all uploaded resumes. Clicking "Open Dashboard" on any card
 * opens the existing ResumeShareDashboard at /dashboard/resume/:assetId.
 *
 * No new analytics, no widgets — just the resume list gateway.
 */

import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  FileText, Eye, Clock, Upload, RefreshCw, Link2, Share2,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const BACKEND_URL =
  (import.meta as any).env?.VITE_BACKEND_URL ?? "http://localhost:8000";

interface VaultAsset {
  asset_id  : string;
  file_name : string;
  file_type : string;
  file_size : number;
  created_at: string;
}

interface ResumeCard {
  asset        : VaultAsset;
  totalViews   : number;
  pendingCount : number;
  activeLinks  : number;
}

export default function DashboardHome() {
  const navigate = useNavigate();
  const userId   = localStorage.getItem("biovault_userId") || "";

  const [cards,   setCards]   = useState<ResumeCard[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const vr = await fetch(`${BACKEND_URL}/vault/list?user_id=${encodeURIComponent(userId)}`);
      if (!vr.ok) { setLoading(false); return; }
      const { assets }: { assets: VaultAsset[] } = await vr.json();

      // Seed cards with vault assets immediately (no dependency on share activity)
      const base: ResumeCard[] = assets.map(a => ({
        asset: a, totalViews: 0, pendingCount: 0, activeLinks: 0,
      }));
      setCards(base);

      // Enrich with share activity where available
      const enriched = [...base];
      await Promise.allSettled(
        assets.map(async (asset, i) => {
          try {
            const r = await fetch(
              `${BACKEND_URL}/resume/share/activity/${asset.asset_id}?user_id=${encodeURIComponent(userId)}`
            );
            if (r.ok) {
              const d = await r.json();
              enriched[i] = {
                asset,
                totalViews  : d.total_views      ?? 0,
                pendingCount: d.pending_requests  ?? 0,
                activeLinks : (d.share_links ?? []).filter((l: any) => l.is_active).length,
              };
            }
          } catch { /* ignore */ }
        })
      );
      setCards([...enriched]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 w-48 bg-slate-800 rounded-xl" />
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-28 bg-slate-800 rounded-2xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6 text-white">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-slate-400 text-sm mt-0.5">Your encrypted resumes</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate("/encrypt")}
            className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-700
                       text-white text-sm font-medium rounded-xl transition-colors"
          >
            <Upload className="w-4 h-4" /> Upload &amp; Encrypt
          </button>
          <button
            onClick={load}
            className="p-2 bg-slate-800 hover:bg-slate-700 border border-slate-700
                       text-slate-400 hover:text-white rounded-xl transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Resume cards */}
      {cards.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <div className="w-16 h-16 rounded-2xl bg-slate-800 border border-slate-700
                          flex items-center justify-center">
            <FileText className="w-8 h-8 text-slate-600" />
          </div>
          <div className="text-center">
            <p className="text-slate-400 font-medium">No resumes yet</p>
            <p className="text-slate-600 text-sm mt-1">
              Encrypt a document to get started
            </p>
          </div>
          <button
            onClick={() => navigate("/encrypt")}
            className="flex items-center gap-2 px-5 py-2.5 bg-cyan-600 hover:bg-cyan-700
                       text-white text-sm font-semibold rounded-xl transition-colors"
          >
            <Upload className="w-4 h-4" /> Upload &amp; Encrypt
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {cards.map(rc => (
            <div
              key={rc.asset.asset_id}
              className="bg-slate-900 border border-slate-800 rounded-2xl px-5 py-4
                         flex items-center gap-4"
            >
              {/* Icon */}
              <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700
                              flex items-center justify-center shrink-0">
                <FileText className="w-5 h-5 text-cyan-400" />
              </div>

              {/* Name + date */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white truncate">
                  {rc.asset.file_name}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {formatDistanceToNow(new Date(rc.asset.created_at), { addSuffix: true })}
                </p>
              </div>

              {/* Stats */}
              <div className="hidden sm:flex items-center gap-4 shrink-0 text-xs text-slate-500">
                <span className="flex items-center gap-1">
                  <Eye className="w-3.5 h-3.5" /> {rc.totalViews}
                </span>
                <span className="flex items-center gap-1">
                  <Link2 className="w-3.5 h-3.5" /> {rc.activeLinks}
                </span>
                {rc.pendingCount > 0 && (
                  <span className="flex items-center gap-1 text-yellow-400 font-medium">
                    <Clock className="w-3.5 h-3.5 animate-pulse" /> {rc.pendingCount} pending
                  </span>
                )}
              </div>

              {/* Open Dashboard button */}
              <button
                onClick={() => navigate(`/dashboard/resume/${rc.asset.asset_id}`)}
                className="flex items-center gap-2 px-4 py-2 bg-cyan-600/15 hover:bg-cyan-600/30
                           border border-cyan-600/30 text-cyan-400 hover:text-cyan-300
                           text-sm font-medium rounded-xl transition-all shrink-0"
              >
                <Share2 className="w-3.5 h-3.5" /> Open Dashboard
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
