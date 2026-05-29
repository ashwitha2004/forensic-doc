/**
 * Backend Hybrid AI Detection Client
 * Calls POST /api/inference/detect-ai and surfaces the four-signal result.
 */

const BACKEND_URL =
  import.meta.env.VITE_BACKEND_URL ||
  import.meta.env.VITE_API_URL ||
  "";

// ─────────────────────────────────────────────────────────────────────────────
// Response types (mirror backend Pydantic schemas)
// ─────────────────────────────────────────────────────────────────────────────

/** Per-branch AI probabilities returned by the backend as `branch_scores`. */
export interface BranchScores {
  /** DL model — RGB original image branch (0-1 AI probability) */
  cnn_score: number;
  /** DL model — noise/residual branch (0-1 AI probability) */
  residual_score: number;
  /** DL model — FFT frequency branch (0-1 AI probability) */
  fft_score: number;
  /** Heuristic forensic detector AI probability (0-1) */
  forensic_score: number;
  /** Metadata absence AI probability (0-1) */
  metadata_score: number;
}

/** @deprecated alias kept for backward compatibility */
export type SignalBreakdown = BranchScores;

export interface ResidualStats {
  residual_mean_abs: number;
  residual_std: number;
  residual_kurtosis: number;
  channel_correlation: number;
}

export interface ForensicSignals {
  metadata_detected: boolean;
  camera_probability: number;
  ai_probability: number;
  screenshot_probability: number;
  prediction: string;
  forensic_confidence_pct: number;
}

export interface HybridDetectionResult {
  /** Final fused AI probability (0-1) */
  ai_probability: number;
  /** Final fused camera probability (0-1) */
  camera_probability: number;

  /** Deep Learning confidence (0-1) — how certain the DL branches are */
  dl_confidence: number;
  /** Forensic heuristic confidence (0-1) */
  forensic_confidence: number;
  /** Combined fusion confidence (0-1) */
  fusion_confidence: number;

  /** Ordered list of dominant detection reasons */
  dominant_signals: string[];

  /** Raw forensic heuristic signals */
  forensic_signals: ForensicSignals;

  /**
   * Per-branch AI probabilities (field name in backend response: `branch_scores`).
   * Alias `signal_breakdown` also accepted for backward compatibility.
   */
  branch_scores: BranchScores;

  /** Fusion weights used this inference (for debug display) */
  fusion_weights: Record<string, number>;

  /** High-frequency residual statistics */
  residual_stats: ResidualStats | null;

  /** Model version string */
  model_version: string;
  /** Whether DL inference was run */
  dl_available: boolean;
  /** Device used (cuda / cpu / onnx / none) */
  device_used: string;
  /** End-to-end backend processing time in ms */
  processing_time_ms: number;
}

export interface BackendDetectionError {
  error: true;
  message: string;
  detail?: string;
}

export type BackendDetectionResponse =
  | HybridDetectionResult
  | BackendDetectionError;

// ─────────────────────────────────────────────────────────────────────────────
// API client
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run hybrid (DL + forensic) AI detection via the backend.
 *
 * @param file   The image File object from a file input or camera capture.
 * @returns      HybridDetectionResult on success, BackendDetectionError on failure.
 */
export async function detectAI(
  file: File
): Promise<BackendDetectionResponse> {
  const url = `${BACKEND_URL}/api/inference/detect-ai`;
  const form = new FormData();
  form.append("image", file);

  console.log(`[backendDetection] POST ${url}  (file: ${file.name}, ${(file.size / 1024).toFixed(1)} KB)`);

  try {
    const res = await fetch(url, {
      method: "POST",
      body: form,
    });

    console.log(`[backendDetection] Response status: ${res.status} ${res.statusText}`);

    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try {
        const err = await res.json();
        detail = err.detail || err.message || detail;
      } catch {
        // ignore JSON parse error
      }
      console.warn(`[backendDetection] Error response: ${detail}`);
      return { error: true, message: "Detection failed", detail };
    }

    const data: HybridDetectionResult = await res.json();
    console.log(
      `[backendDetection] ✅ ai=${(data.ai_probability * 100).toFixed(1)}%` +
      ` cam=${(data.camera_probability * 100).toFixed(1)}%` +
      ` dl=${data.dl_available ? "yes" : "no"}` +
      ` has_trained=${data.branch_scores ? "yes" : "no"}` +
      ` backend=${data.device_used}` +
      ` ${data.processing_time_ms.toFixed(0)}ms`
    );
    console.log("[backendDetection] branch_scores:", data.branch_scores);
    console.log("[backendDetection] fusion_weights:", data.fusion_weights);
    return data;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[backendDetection] ❌ Network error: ${msg}`);
    return { error: true, message: "Network error", detail: msg };
  }
}

export function isError(r: BackendDetectionResponse): r is BackendDetectionError {
  return (r as BackendDetectionError).error === true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Display helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Human-readable verdict */
export function getVerdict(result: HybridDetectionResult): "AI Generated" | "Real Camera" | "Uncertain" {
  const ai = result.ai_probability;
  const conf = result.fusion_confidence;
  if (ai > 0.6 && conf > 0.4) return "AI Generated";
  if (ai < 0.4 && conf > 0.4) return "Real Camera";
  return "Uncertain";
}

/** Tailwind color class for a 0-1 probability value where high = AI / danger */
export function probabilityColor(p: number): string {
  if (p >= 0.7) return "text-red-400";
  if (p >= 0.45) return "text-yellow-400";
  return "text-green-400";
}

/** Convert 0-1 to percentage string */
export function pct(v: number, decimals = 1): string {
  return `${(v * 100).toFixed(decimals)}%`;
}
