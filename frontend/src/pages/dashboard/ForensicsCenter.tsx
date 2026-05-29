/**
 * ForensicsCenter
 * ===============
 * Dashboard wrapper around the existing DocumentForensics engine.
 * Zero logic changes — just embeds it inside the DashboardLayout
 * with a header and tool description panel.
 *
 * All forensic functionality (AI detection, ELA, OCR, EXIF, etc.)
 * comes entirely from DocumentForensics — untouched.
 */

import DocumentForensics from "@/pages/DocumentForensics";
import { Microscope, Shield, Cpu, FileSearch, Eye, Wand2 } from "lucide-react";

// ─── Capability badge ─────────────────────────────────────────────────────────

function CapBadge({ icon: Icon, label }: { icon: React.ComponentType<{className?: string}>; label: string }) {
  return (
    <div className="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2">
      <Icon className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
      <span className="text-xs text-slate-300">{label}</span>
    </div>
  );
}

export default function ForensicsCenter() {
  return (
    <div className="space-y-6 text-white">

      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Microscope className="w-6 h-6 text-cyan-400" /> Forensics Lab
        </h1>
        <p className="text-slate-400 text-sm mt-0.5">
          Deep document & image analysis — AI detection, manipulation forensics, OCR, EXIF
        </p>
      </div>

      {/* Capability chips */}
      <div className="flex flex-wrap gap-2">
        <CapBadge icon={Cpu}        label="AI Generation Detection" />
        <CapBadge icon={Wand2}      label="Manipulation / ELA Heatmap" />
        <CapBadge icon={FileSearch} label="OCR Text Extraction" />
        <CapBadge icon={Eye}        label="Noise & Frequency Analysis" />
        <CapBadge icon={Shield}     label="Metadata Anomaly Detection" />
        <CapBadge icon={Microscope} label="Per-page PDF Deep Analysis" />
      </div>

      {/* ── Existing DocumentForensics engine — untouched ── */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden">
        <DocumentForensics />
      </div>
    </div>
  );
}
