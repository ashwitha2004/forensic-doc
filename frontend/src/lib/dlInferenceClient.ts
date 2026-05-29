/**
 * DL Inference Client
 * ===================
 * Calls the backend /api/inference/detect-ai-base64 endpoint and returns
 * the three-branch (RGB + residual + FFT) classification result.
 *
 * The backend is the PRIMARY classifier (70% weight in the final fusion).
 * Frontend heuristic scores are AUXILIARY (20% frequency + 10% metadata).
 *
 * Graceful degradation: if the backend is unreachable the function returns
 * null and the caller falls back to frontend-only heuristics.
 */

// ── Config ────────────────────────────────────────────────────────────────────

// Backend base URL — reads from env or defaults to same-origin (for production)
// or localhost:8000 for local dev.
const BACKEND_BASE_URL: string =
  (import.meta as any).env?.VITE_BACKEND_URL ||
  (typeof window !== "undefined" && window.location.hostname === "localhost"
    ? ""
    : "");

const DETECT_ENDPOINT = `${BACKEND_BASE_URL}/api/inference/detect-ai-base64`;
const HEALTH_ENDPOINT = `${BACKEND_BASE_URL}/api/inference/health`;

// Timeout for the inference request (ms).
// CPU inference with EfficientNet-B0 (3 branches) can take 60-300 s on a
// laptop CPU without GPU acceleration.  Set conservatively high so the
// frontend never prematurely aborts a valid in-flight request.
const REQUEST_TIMEOUT_MS = 300_000;  // 5 minutes

// Health-check timeout — must be long enough to survive a Render free-tier
// cold start (typically 30-60 s) before the dyno responds to the first request.
const HEALTH_CHECK_TIMEOUT_MS = 65_000;   // 65 s — covers worst-case cold start

// How many times to retry the health check before declaring the backend down.
const HEALTH_CHECK_RETRIES = 2;

// How many times to retry a failed inference call before returning null.
const INFERENCE_RETRIES = 1;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DLBranchScores {
  cnn_score:      number;  // RGB original image branch   (0-1 AI prob)
  residual_score: number;  // Noise/residual branch        (0-1 AI prob)
  fft_score:      number;  // FFT frequency spectrum branch (0-1 AI prob)
  forensic_score: number;  // Heuristic frequency forensic  (0-1 AI prob)
  metadata_score: number;  // EXIF metadata signal          (0-1 AI prob)
}

export interface DLResidualStats {
  residual_mean_abs:   number;
  residual_std:        number;
  residual_kurtosis:   number;
  channel_correlation: number;
}

export interface DLFFTStats {
  hf_ratio:         number;
  spectral_entropy: number;
  radial_falloff:   number;
  fft_ai_proxy?:    number;
  cnn_ai_proxy?:    number;
  resid_ai_proxy?:  number;
}

export interface DLCalibration {
  temperature:          number;
  has_trained_weights:  boolean;
  heuristic_proxy:      boolean;
  model_backend:        string;   // "pytorch" | "onnxruntime" | "none"
}

/** Full response from /api/inference/detect-ai-base64 */
export interface DLInferenceResponse {
  ai_probability:      number;
  camera_probability:  number;

  dl_confidence:       number;
  forensic_confidence: number;
  fusion_confidence:   number;

  dominant_signals: string[];

  branch_scores: DLBranchScores;
  fusion_weights: Record<string, number>;

  residual_stats?: DLResidualStats;
  fft_stats?:      DLFFTStats;

  calibration: DLCalibration;

  model_version:      string;
  dl_available:       boolean;
  device_used:        string;
  processing_time_ms: number;
}

/** Null is returned when the backend is unreachable or returns an error. */
export type DLResult = DLInferenceResponse | null;

// ── Internal helpers ──────────────────────────────────────────────────────────

let _backendReachable: boolean | null = null;   // null = unchecked
let _lastHealthCheckMs: number = 0;             // timestamp of last check
const _HEALTH_RECHECK_MS = 120_000;             // re-check every 2 min after failure

/**
 * Attempt one health-check HTTP request with a per-attempt timeout.
 * Returns true if the backend responded OK, false otherwise.
 */
async function _attemptHealthCheck(attemptIndex: number): Promise<boolean> {
  const t0 = Date.now();
  const isDeployed = typeof window !== "undefined" &&
    window.location.hostname !== "localhost" &&
    window.location.hostname !== "127.0.0.1";

  console.log(
    `[DLClient] Health check attempt ${attemptIndex + 1}/${HEALTH_CHECK_RETRIES + 1}` +
    ` → ${HEALTH_ENDPOINT}` +
    ` (timeout=${HEALTH_CHECK_TIMEOUT_MS / 1000}s, deployed=${isDeployed})`
  );

  const ctrl = new AbortController();
  const tid  = setTimeout(() => ctrl.abort(), HEALTH_CHECK_TIMEOUT_MS);
  try {
    const res = await fetch(HEALTH_ENDPOINT, { method: "GET", signal: ctrl.signal });
    clearTimeout(tid);
    const elapsed = Date.now() - t0;

    if (res.ok) {
      const json = await res.json().catch(() => ({}));
      console.log(
        `[DLClient] Backend health: ✅ OK in ${elapsed}ms` +
        ` (dl_available=${json.dl_available}, has_trained=${json.has_trained_weights},` +
        ` device=${json.device}, backend=${json.backend})`
      );
      return true;
    }
    console.warn(`[DLClient] Health check HTTP ${res.status} after ${elapsed}ms`);
    return false;
  } catch (err: unknown) {
    clearTimeout(tid);
    const elapsed = Date.now() - t0;
    const isAbort = err instanceof Error && err.name === "AbortError";
    if (isAbort) {
      console.warn(
        `[DLClient] Health check timed out after ${elapsed}ms` +
        (isDeployed ? " — Render cold start may still be in progress." : "")
      );
    } else {
      console.warn(`[DLClient] Health check network error after ${elapsed}ms:`, err);
    }
    return false;
  }
}

/**
 * Check backend liveness with retry.  On a Render free-tier deployment the
 * first request often hits a cold start (30-60 s sleep), so we allow up to
 * HEALTH_CHECK_RETRIES additional attempts before giving up.
 */
async function _checkBackendHealth(): Promise<boolean> {
  // If cached true, always trust it (backend up = stays up in this session)
  if (_backendReachable === true) return true;

  // If recently failed, avoid hammering — wait _HEALTH_RECHECK_MS before retry
  const now = Date.now();
  if (_backendReachable === false && now - _lastHealthCheckMs < _HEALTH_RECHECK_MS) {
    console.log(
      `[DLClient] Skipping health check — last failure was ${Math.round((now - _lastHealthCheckMs) / 1000)}s ago` +
      ` (cooldown=${_HEALTH_RECHECK_MS / 1000}s)`
    );
    return false;
  }

  _lastHealthCheckMs = Date.now();

  for (let i = 0; i <= HEALTH_CHECK_RETRIES; i++) {
    const ok = await _attemptHealthCheck(i);
    if (ok) {
      _backendReachable = true;
      return true;
    }
    if (i < HEALTH_CHECK_RETRIES) {
      // Brief pause before next retry — no exponential back-off needed since
      // HEALTH_CHECK_TIMEOUT_MS already provides the natural spacing.
      console.log(`[DLClient] Retrying health check…`);
    }
  }

  _backendReachable = false;
  _lastHealthCheckMs = Date.now();
  console.warn(
    `[DLClient] Backend unreachable after ${HEALTH_CHECK_RETRIES + 1} attempts — ` +
    `running in frontend-only mode.`
  );
  return false;
}

// Reset cached health so the next call re-checks immediately
export function resetBackendHealthCache(): void {
  _backendReachable = null;
  _lastHealthCheckMs = 0;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Run three-branch DL inference on the given image.
 *
 * @param base64Data  Data URL or raw base64 string (JPEG / PNG / WebP)
 * @param filename    Filename hint used for extension detection on the server
 * @param groundTruth Optional ground-truth label for server-side confusion matrix
 * @returns           DLInferenceResponse or null if backend is unavailable
 */
export async function runDLInference(
  base64Data: string,
  filename:   string = "image.jpg",
  groundTruth?: "ai" | "camera",
): Promise<DLResult> {
  // Quick health gate — avoid hanging requests when backend is known down
  const healthy = await _checkBackendHealth();
  if (!healthy) return null;

  const body: Record<string, unknown> = { image_base64: base64Data, filename };
  if (groundTruth) body.ground_truth = groundTruth;

  for (let attempt = 0; attempt <= INFERENCE_RETRIES; attempt++) {
    const t0   = Date.now();
    const ctrl = new AbortController();
    const tid  = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);

    if (attempt > 0) {
      console.log(`[DLClient] Inference retry ${attempt}/${INFERENCE_RETRIES}…`);
    }

    try {
      const response = await fetch(DETECT_ENDPOINT, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
        signal:  ctrl.signal,
      });
      clearTimeout(tid);

      const elapsed = Date.now() - t0;

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        console.warn(
          `[DLClient] Backend returned ${response.status} after ${elapsed}ms: ${text.slice(0, 200)}`
        );
        if (attempt < INFERENCE_RETRIES) continue;
        return null;
      }

      const data: DLInferenceResponse = await response.json();
      console.log(
        `[DLClient] ✅ Inference complete in ${elapsed}ms: ` +
        `ai=${(data.ai_probability * 100).toFixed(1)}% ` +
        `cam=${(data.camera_probability * 100).toFixed(1)}% ` +
        `(backend=${data.calibration?.model_backend ?? "unknown"})`
      );
      console.log("[DLClient] Branch scores:", data.branch_scores);
      console.log("[DLClient] Fusion weights:", data.fusion_weights);

      return data;
    } catch (err: unknown) {
      clearTimeout(tid);
      const elapsed = Date.now() - t0;
      const isAbort = err instanceof Error && err.name === "AbortError";

      if (isAbort) {
        console.warn(
          `[DLClient] Inference timed out after ${elapsed}ms` +
          (attempt < INFERENCE_RETRIES ? " — will retry." : " — falling back to frontend heuristics.")
        );
      } else {
        console.warn(`[DLClient] Fetch error after ${elapsed}ms:`, err);
      }

      if (attempt < INFERENCE_RETRIES) continue;

      // All attempts exhausted — mark backend temporarily unreachable
      _backendReachable = false;
      _lastHealthCheckMs = Date.now();
      return null;
    }
  }

  return null; // unreachable but satisfies TS
}

/**
 * Retrieve the confusion-matrix stats accumulated on the server since restart.
 * Returns null if backend is unavailable.
 */
export async function fetchConfusionMatrix(): Promise<Record<string, number | null> | null> {
  if (!(await _checkBackendHealth())) return null;
  try {
    const res = await fetch(`${BACKEND_BASE_URL}/api/inference/confusion-matrix`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Derive a single fused AI-probability from a DL result using the spec weights:
 *   DL model  70% → CNN 35% + residual 20% + FFT 15%
 *   Frequency 20% (forensic_score)
 *   Metadata  10%
 *
 * This mirrors the server-side fusion for diagnostic display — the server
 * already runs the full fusion, so clients should prefer `ai_probability`
 * directly.  This helper is exposed for testing and transparency.
 */
export function computeFusedProbability(result: DLInferenceResponse): number {
  const w = result.fusion_weights;
  const s = result.branch_scores;
  const total =
    (w["cnn"]       || 0.35) * s.cnn_score      +
    (w["residual"]  || 0.20) * s.residual_score  +
    (w["fft_dl"]    || 0.15) * s.fft_score       +
    (w["frequency"] || 0.20) * s.forensic_score  +
    (w["metadata"]  || 0.10) * s.metadata_score;
  return Math.max(0, Math.min(1, total));
}
