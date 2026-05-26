/**
 * Resolves the backend base URL at runtime.
 *
 * Priority:
 *   1. VITE_BACKEND_URL env variable (set in .env / hosting dashboard)
 *   2. Vite proxy — same-origin empty string works when vite.config.ts
 *      proxies /api → http://127.0.0.1:8000  (local dev default)
 *   3. Explicit localhost:8000 fallback for non-proxied local dev
 */
export function getBackendUrl(): string {
  // Env variable wins if supplied
  const envUrl = (import.meta as any).env?.VITE_BACKEND_URL as string | undefined;
  if (envUrl) return envUrl.replace(/\/$/, '');

  // In production (non-localhost) assume same-origin API (reverse proxy / hosting)
  if (
    typeof window !== 'undefined' &&
    window.location.hostname !== 'localhost' &&
    window.location.hostname !== '127.0.0.1'
  ) {
    return '';
  }

  // Local dev — Vite proxies /api, so empty string works; explicit fallback for safety
  return 'http://localhost:8000';
}
