/**
 * useResumeActivityTracker  (v2 — Advanced Tracking & Viewer Intelligence)
 * =========================================================================
 * Isolated activity-tracking hook for the SecureResumeViewer page.
 * Runs entirely in the background — zero UI impact, zero re-renders.
 *
 * Events tracked (activity log):
 *   resume_opened       — first event on mount (with first-visit flag)
 *   copy_attempt        — Ctrl+C or copy event (with char count)
 *   text_selection      — mouseup with non-trivial selection
 *   print_attempt       — Ctrl+P or beforeprint event
 *   save_attempt        — Ctrl+S
 *   view_source_attempt — Ctrl+U
 *   right_click         — contextmenu
 *   screenshot_signal   — PrintScreen / Cmd+Shift+3/4/5
 *   devtools_attempt    — F12 / Ctrl+Shift+I
 *   devtools_signal     — window-size heuristic (outer − inner > 160px)
 *   tab_hidden          — visibilitychange → hidden
 *   tab_visible         — visibilitychange → visible
 *   window_blur         — window loses focus
 *   window_focus        — window regains focus
 *   session_end         — beforeunload / hook cleanup (with duration stats)
 *
 * Session upserts (viewer_sessions):
 *   start      — on mount with device/browser/OS/screen info
 *   geo_update — after browser geolocation resolves (triggered when isApproved becomes true)
 *   end        — on cleanup with duration + security counters
 *
 * Architecture:
 *   Events are queued in memory and flushed every 15 s, or when 10+ events
 *   accumulate, or on page unload (via navigator.sendBeacon for reliability).
 *   No state is lifted to the parent component — purely side effects.
 *
 * Does NOT touch:
 *   PDF rendering, masking logic, approval flow, sidebar, Supabase storage,
 *   AES encryption, existing backend routes, or any other system.
 */

import { useEffect, useRef } from "react";

const BACKEND_URL        = (import.meta as any).env?.VITE_BACKEND_URL || "";
const FLUSH_INTERVAL_MS  = 15_000;  // batch-send events every 15 s
const FLUSH_BATCH_SIZE   = 10;      // or when queue reaches 10 events
const SESSION_LIVE_MS    = 30_000;  // push live duration+counters every 30 s

type TrackEvent = {
  event_type   : string;
  event_details: Record<string, unknown>;
  timestamp    : string;
};

// ─── Session helpers (per-token scoping) ─────────────────────────────────────

function getSessionId(token: string): string {
  const key = `rsv_sid__${token}`;
  let sid   = sessionStorage.getItem(key);
  if (!sid) {
    sid = typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
    sessionStorage.setItem(key, sid);
  }
  return sid;
}

/** Returns true on first visit; false on repeated visits. */
function recordVisit(token: string): boolean {
  const key = `rsv_fv__${token}`;
  if (localStorage.getItem(key)) return false;
  localStorage.setItem(key, Date.now().toString());
  return true;
}

// ─── Device / Browser / OS parser ────────────────────────────────────────────

interface UAInfo {
  browser    : string;
  os         : string;
  device_type: "mobile" | "tablet" | "desktop";
}

function _parseUA(ua: string): UAInfo {
  // ── Device type ──────────────────────────────────────────────────────────
  const isMobile  = /Mobi|Android|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  const isTablet  = /iPad|Tablet|PlayBook|Silk/i.test(ua)
                 || (/Android/i.test(ua) && !/Mobi/i.test(ua));
  const device_type: UAInfo["device_type"] =
    isMobile ? "mobile" : isTablet ? "tablet" : "desktop";

  // ── Browser ───────────────────────────────────────────────────────────────
  let browser = "Unknown";
  if (/Edg\//i.test(ua)) {
    const m = ua.match(/Edg\/(\d+)/i);
    browser = `Edge ${m?.[1] ?? ""}`.trim();
  } else if (/OPR\/|Opera\//i.test(ua)) {
    const m = ua.match(/(?:OPR|Opera)\/(\d+)/i);
    browser = `Opera ${m?.[1] ?? ""}`.trim();
  } else if (/Chrome\//i.test(ua) && !/Chromium/i.test(ua)) {
    const m = ua.match(/Chrome\/(\d+)/);
    browser = `Chrome ${m?.[1] ?? ""}`.trim();
  } else if (/Firefox\//i.test(ua)) {
    const m = ua.match(/Firefox\/(\d+)/);
    browser = `Firefox ${m?.[1] ?? ""}`.trim();
  } else if (/Safari\//i.test(ua) && !/Chrome/i.test(ua)) {
    const m = ua.match(/Version\/(\d+)/);
    browser = `Safari ${m?.[1] ?? ""}`.trim();
  } else if (/MSIE |Trident\//i.test(ua)) {
    browser = "Internet Explorer";
  }

  // ── OS ────────────────────────────────────────────────────────────────────
  let os = "Unknown";
  if (/Windows NT 10\.0/i.test(ua))      os = "Windows 10/11";
  else if (/Windows NT 6\.3/i.test(ua))  os = "Windows 8.1";
  else if (/Windows NT 6\.1/i.test(ua))  os = "Windows 7";
  else if (/Windows/i.test(ua))          os = "Windows";
  else if (/iPhone OS (\d+)/i.test(ua)) {
    const m = ua.match(/iPhone OS (\d+)/i);
    os = `iOS ${m?.[1] ?? ""}`.trim();
  } else if (/iPad.*OS (\d+)/i.test(ua)) {
    const m = ua.match(/OS (\d+)/i);
    os = `iPadOS ${m?.[1] ?? ""}`.trim();
  } else if (/Android (\d+)/i.test(ua)) {
    const m = ua.match(/Android (\d+)/i);
    os = `Android ${m?.[1] ?? ""}`.trim();
  } else if (/Mac OS X (\d+[_\d]*)/i.test(ua)) {
    const m = ua.match(/Mac OS X ([\d_]+)/i);
    os = `macOS ${(m?.[1] ?? "").replace(/_/g, ".")}`.trim();
  } else if (/Linux/i.test(ua)) {
    os = "Linux";
  }

  return { browser, os, device_type };
}

// ─── Session upsert (fire-and-forget) ────────────────────────────────────────

async function _upsertSession(payload: Record<string, unknown>): Promise<void> {
  try {
    await fetch(`${BACKEND_URL}/resume/activity/session`, {
      method   : "POST",
      headers  : { "Content-Type": "application/json" },
      body     : JSON.stringify(payload),
      keepalive: true,
    });
  } catch {
    /* silent — never block viewer */
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useResumeActivityTracker(
  token       : string | undefined,
  viewerEmail : string | null,
  isApproved  : boolean = false,
): void {
  // Refs keep latest values without triggering re-runs of the main effect
  const emailRef      = useRef<string | null>(viewerEmail);
  const approvedRef   = useRef<boolean>(isApproved);
  const sessionIdRef  = useRef<string>("");

  useEffect(() => { emailRef.current    = viewerEmail; }, [viewerEmail]);
  useEffect(() => { approvedRef.current = isApproved;  }, [isApproved]);

  // ── Geolocation effect — fires once when isApproved first becomes true ──────
  useEffect(() => {
    if (!token || !isApproved) return;
    const sid = sessionIdRef.current;
    if (!sid) return; // main effect not yet mounted

    if (!("geolocation" in navigator)) {
      _upsertSession({
        action      : "geo_update",
        share_token : token,
        session_id  : sid,
        viewer_email: emailRef.current || undefined,
        geo_status  : "unavailable",
      });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        _upsertSession({
          action      : "geo_update",
          share_token : token,
          session_id  : sid,
          viewer_email: emailRef.current || undefined,
          geo_status  : "granted",
          latitude    : pos.coords.latitude,
          longitude   : pos.coords.longitude,
          geo_accuracy: pos.coords.accuracy,
        });
      },
      () => {
        // Permission denied or timed out
        _upsertSession({
          action      : "geo_update",
          share_token : token,
          session_id  : sid,
          viewer_email: emailRef.current || undefined,
          geo_status  : "denied",
        });
      },
      { timeout: 10_000, maximumAge: 300_000 },
    );
  }, [isApproved, token]); // ← only re-runs when approval state changes

  // ── Main effect — event listeners, batching, session start/end ───────────────
  useEffect(() => {
    if (!token) return;

    // ── Session bootstrap ────────────────────────────────────────────────
    const sessionId         = getSessionId(token);
    sessionIdRef.current    = sessionId;   // share with geolocation effect

    const startMs    = Date.now();
    let   activeMs   = 0;
    let   activeFrom = Date.now();
    let   isVisible  = !document.hidden;
    let   copyCount          = 0;
    let   cutCount           = 0;
    let   lastCopyMs         = 0;   // prevent double-count (keydown + copy event)
    let   blurCount          = 0;
    let   printAttempts      = 0;
    let   screenshotSignals  = 0;
    let   screenRecSignals   = 0;
    let   dvtSignal          = false;   // prevent duplicate devtools events
    // Screen recording heuristic — track rapid repeated tab hides
    let   tabHideCount       = 0;
    let   tabHideWindowStart = Date.now();

    // ── Flush ────────────────────────────────────────────────────────────
    const queueRef: TrackEvent[] = [];
    let   timerHandle: ReturnType<typeof setInterval> | null = null;

    const flush = (beacon = false): void => {
      const events = queueRef.splice(0);
      if (events.length === 0) return;

      const payload = JSON.stringify({
        share_token : token,
        session_id  : sessionId,
        viewer_email: emailRef.current || null,
        events,
      });

      if (beacon && typeof navigator.sendBeacon === "function") {
        navigator.sendBeacon(
          `${BACKEND_URL}/resume/activity/log`,
          new Blob([payload], { type: "application/json" }),
        );
      } else {
        fetch(`${BACKEND_URL}/resume/activity/log`, {
          method  : "POST",
          headers : { "Content-Type": "application/json" },
          body    : payload,
          keepalive: true,
        }).catch(() => {/* silent — never block viewer */});
      }
    };

    // ── Push a single event ───────────────────────────────────────────────
    const push = (type: string, details: Record<string, unknown> = {}): void => {
      queueRef.push({
        event_type   : type,
        event_details: details,
        timestamp    : new Date().toISOString(),
      });
      if (queueRef.length >= FLUSH_BATCH_SIZE) flush();
    };

    // ── Helpers ───────────────────────────────────────────────────────────
    const pauseActive = () => {
      if (isVisible) { activeMs += Date.now() - activeFrom; isVisible = false; }
    };
    const resumeActive = () => {
      activeFrom = Date.now(); isVisible = true;
    };

    // ── Session start upsert ─────────────────────────────────────────────
    const isFirstVisit = recordVisit(token);
    const ua           = navigator.userAgent;
    const { browser, os, device_type } = _parseUA(ua);

    _upsertSession({
      action       : "start",
      share_token  : token,
      session_id   : sessionId,
      viewer_email : emailRef.current || undefined,
      user_agent   : ua.slice(0, 512),
      browser,
      os,
      device_type,
      screen_size  : `${screen.width}x${screen.height}`,
      is_first_visit: isFirstVisit,
    });

    // ── Initial "resume opened" event ─────────────────────────────────────
    push("resume_opened", {
      is_first_visit: isFirstVisit,
      browser,
      os,
      device_type,
      screen_size   : `${screen.width}x${screen.height}`,
      referrer      : document.referrer || null,
    });

    // ── Immediate security counter flush ─────────────────────────────────
    const pushSecurityUpdate = () => {
      const hasSuspiciousEvents =
        screenshotSignals > 0 || screenRecSignals > 0 ||
        (copyCount + cutCount) > 5 || printAttempts > 0;
      _upsertSession({
        action            : "end",
        share_token       : token,
        session_id        : sessionId,
        viewer_email      : emailRef.current || undefined,
        total_duration_ms : Date.now() - startMs,
        copy_count        : copyCount + cutCount,
        print_attempts    : printAttempts,
        screenshot_signals: screenshotSignals + screenRecSignals,
        is_suspicious     : hasSuspiciousEvents,
        last_seen         : new Date().toISOString(),
      });
    };

    // ── Copy / Cut / SelectStart ──────────────────────────────────────────
    const onCopy = (): void => {
      // De-duplicate: keydown (Ctrl+C) and the browser copy event both fire
      const now = Date.now();
      if (now - lastCopyMs < 50) return;   // same copy, ignore duplicate
      lastCopyMs = now;

      const selChars = window.getSelection()?.toString().length ?? 0;
      copyCount++;
      push("copy_attempt", { count: copyCount, selected_chars: selChars });
      pushSecurityUpdate();
      // If no text selected, check if clipboard has an image (Win+PrtScn)
      if (selChars === 0) onClipboardChange();
    };

    const onCut = (): void => {
      cutCount++;
      push("copy_attempt", {
        method        : "cut",
        count         : copyCount + cutCount,
        selected_chars: window.getSelection()?.toString().length ?? 0,
      });
      pushSecurityUpdate();
    };

    const onSelectStart = (): void => {
      push("text_selection_start", {});
    };

    const onMouseUp = (): void => {
      const sel = window.getSelection()?.toString().trim();
      if (sel && sel.length > 5) push("text_selection", { chars: sel.length });
    };

    // ── Keyboard shortcuts ────────────────────────────────────────────────
    const onKeyDown = (e: KeyboardEvent): void => {
      const ctrl = e.ctrlKey || e.metaKey;

      if (ctrl && e.key === "c")  { onCopy();  return; }

      if (ctrl && e.key === "p")  {
        e.preventDefault();
        printAttempts++;
        push("print_attempt", { method: "Ctrl+P" });
        pushSecurityUpdate();
        return;
      }
      if (ctrl && e.key === "s")  {
        e.preventDefault();
        push("save_attempt", { method: "Ctrl+S" });
        return;
      }
      if (ctrl && (e.key === "u" || e.key === "U")) {
        e.preventDefault();
        push("view_source_attempt", { method: "Ctrl+U" });
        return;
      }

      // Screenshot signals — catch all PrintScreen variants
      if (e.key === "PrintScreen" || e.key === "Print" || e.key === "Snapshot") {
        screenshotSignals++;
        push("screenshot_signal", {
          method: e.metaKey ? "Win+PrtScn" : e.altKey ? "Alt+PrtScn" : "PrintScreen",
          label : "Possible Screenshot Attempt",
        });
        pushSecurityUpdate();
        return;
      }
      if (e.metaKey && e.shiftKey && ["3", "4", "5"].includes(e.key)) {
        screenshotSignals++;
        push("screenshot_signal", { method: `Cmd+Shift+${e.key}` });
        pushSecurityUpdate();
        return;
      }

      // DevTools keyboard shortcuts
      if (
        e.key === "F12" ||
        (ctrl && e.shiftKey && ["i", "I", "j", "J"].includes(e.key))
      ) {
        push("devtools_attempt", {
          method: e.key === "F12" ? "F12" : `Ctrl+Shift+${e.key.toUpperCase()}`,
        });
      }
    };

    // ── Right-click ───────────────────────────────────────────────────────
    const onContextMenu = (): void => push("right_click", {});

    // ── Print dialog ──────────────────────────────────────────────────────
    const onBeforePrint = (): void => {
      printAttempts++;
      push("print_attempt", { method: "browser_print_dialog", phase: "start" });
      pushSecurityUpdate();
    };

    const onAfterPrint = (): void => {
      push("print_attempt", { method: "browser_print_dialog", phase: "end" });
    };

    // ── Visibility — also detects rapid hide/show (screen recording heuristic)
    const onVisChange = (): void => {
      if (document.hidden) {
        pauseActive();
        push("tab_hidden", { active_ms_so_far: activeMs });

        // Screen recording heuristic: ≥3 hides within 30 s
        const now = Date.now();
        if (now - tabHideWindowStart > 30_000) {
          tabHideCount       = 0;
          tabHideWindowStart = now;
        }
        tabHideCount++;
        if (tabHideCount >= 3) {
          screenRecSignals++;
          tabHideCount = 0; // reset window
          push("screen_recording_signal", {
            method : "repeated_visibility_loss",
            count  : screenRecSignals,
            label  : "Possible Screen Recording",
          });
          pushSecurityUpdate();
        }
      } else {
        resumeActive();
        push("tab_visible", {});
      }
    };

    const onBlur = (): void => {
      blurCount++;
      pauseActive();
      push("window_blur", { blur_count: blurCount });
    };

    const onFocus = (): void => {
      resumeActive();
      push("window_focus", { blur_count: blurCount });
    };

    // ── DevTools window-size heuristic ────────────────────────────────────
    const onResize = (): void => {
      const wDiff = window.outerWidth  - window.innerWidth;
      const hDiff = window.outerHeight - window.innerHeight;
      const open  = wDiff > 160 || hDiff > 160;
      if (open && !dvtSignal) {
        dvtSignal = true;
        push("devtools_signal", { width_diff: wDiff, height_diff: hDiff });
      } else if (!open) {
        dvtSignal = false;   // reset so it can fire again if re-opened
      }
    };

    // ── Session end ───────────────────────────────────────────────────────
    const onUnload = (): void => {
      pauseActive();

      const hasSuspiciousEvents =
        (screenshotSignals + screenRecSignals) > 0 ||
        (copyCount + cutCount) > 5 || printAttempts > 0;

      push("session_end", {
        total_ms          : Date.now() - startMs,
        active_ms         : activeMs,
        copies            : copyCount + cutCount,
        blurs             : blurCount,
        prints            : printAttempts,
        screenshots       : screenshotSignals,
        screen_recordings : screenRecSignals,
      });
      flush(true);   // sendBeacon for guaranteed delivery on page close

      // Upsert final session stats (beacon so it survives page close)
      const sessionPayload = JSON.stringify({
        action            : "end",
        share_token       : token,
        session_id        : sessionId,
        viewer_email      : emailRef.current || undefined,
        total_duration_ms : Date.now() - startMs,
        active_duration_ms: activeMs,
        copy_count        : copyCount + cutCount,
        print_attempts    : printAttempts,
        screenshot_signals: screenshotSignals + screenRecSignals,
        is_suspicious     : hasSuspiciousEvents,
      });
      if (typeof navigator.sendBeacon === "function") {
        navigator.sendBeacon(
          `${BACKEND_URL}/resume/activity/session`,
          new Blob([sessionPayload], { type: "application/json" }),
        );
      } else {
        fetch(`${BACKEND_URL}/resume/activity/session`, {
          method   : "POST",
          headers  : { "Content-Type": "application/json" },
          body     : sessionPayload,
          keepalive: true,
        }).catch(() => {});
      }
    };

    // ── Clipboard image write = Win+PrtScn heuristic ─────────────────────────
    // When Win+PrtScn fires, Windows writes an image to clipboard.
    // The browser fires a 'copy' event with no selection text — detect that.
    const onClipboardChange = async (): Promise<void> => {
      try {
        if (!navigator.clipboard?.read) return;
        const items = await navigator.clipboard.read();
        for (const item of items) {
          if (item.types.some(t => t.startsWith("image/"))) {
            screenshotSignals++;
            push("screenshot_signal", { method: "clipboard_image", label: "Possible Screenshot Attempt" });
            pushSecurityUpdate();
            break;
          }
        }
      } catch { /* clipboard permission may be denied — ignore */ }
    };

    // ── getDisplayMedia interception (screen recording / screen share) ──────
    let _origGetDisplayMedia: typeof navigator.mediaDevices.getDisplayMedia | null = null;
    try {
      if (navigator.mediaDevices?.getDisplayMedia) {
        _origGetDisplayMedia = navigator.mediaDevices.getDisplayMedia.bind(navigator.mediaDevices);
        (navigator.mediaDevices as any).getDisplayMedia = async (opts?: any) => {
          screenRecSignals++;
          push("screen_recording_signal", {
            method: "getDisplayMedia",
            label : "Possible Screen Recording",
            count : screenRecSignals,
          });
          pushSecurityUpdate();
          return _origGetDisplayMedia!(opts);
        };
      }
    } catch { /* read-only in some browsers — ignore */ }

    // ── Register all listeners ────────────────────────────────────────────
    document.addEventListener("copy",             onCopy,        { passive: true });
    document.addEventListener("cut",              onCut,         { passive: true });
    document.addEventListener("selectstart",      onSelectStart, { passive: true });
    document.addEventListener("keydown",          onKeyDown);
    document.addEventListener("mouseup",          onMouseUp,     { passive: true });
    document.addEventListener("contextmenu",      onContextMenu, { passive: true });
    document.addEventListener("visibilitychange", onVisChange,   { passive: true });
    window  .addEventListener("beforeprint",      onBeforePrint, { passive: true });
    window  .addEventListener("afterprint",       onAfterPrint,  { passive: true });
    window  .addEventListener("blur",             onBlur,        { passive: true });
    window  .addEventListener("focus",            onFocus,       { passive: true });
    window  .addEventListener("resize",           onResize,      { passive: true });
    window  .addEventListener("beforeunload",     onUnload);

    timerHandle = setInterval(flush, FLUSH_INTERVAL_MS);

    // ── Live session update every 30 s ─────────────────────────────────────
    // Writes current duration + security counters while viewer is still on page,
    // so the owner dashboard shows live data without waiting for session_end.
    const liveTimer = setInterval(() => {
      if (isVisible) activeMs += Date.now() - activeFrom;
      activeFrom = Date.now();
      const hasSuspiciousEvents =
        (screenshotSignals + screenRecSignals) > 0 ||
        (copyCount + cutCount) > 5 || printAttempts > 0;
      _upsertSession({
        action            : "end",
        share_token       : token,
        session_id        : sessionId,
        viewer_email      : emailRef.current || undefined,
        total_duration_ms : Date.now() - startMs,
        active_duration_ms: activeMs,
        copy_count        : copyCount + cutCount,
        print_attempts    : printAttempts,
        screenshot_signals: screenshotSignals + screenRecSignals,
        is_suspicious     : hasSuspiciousEvents,
        last_seen         : new Date().toISOString(),
      });
    }, SESSION_LIVE_MS);

    onResize(); // immediate devtools check on load

    return () => {
      // Restore original getDisplayMedia
      try {
        if (_origGetDisplayMedia && navigator.mediaDevices) {
          navigator.mediaDevices.getDisplayMedia = _origGetDisplayMedia;
        }
      } catch { /* ignore */ }

      document.removeEventListener("copy",             onCopy);
      document.removeEventListener("cut",              onCut);
      document.removeEventListener("selectstart",      onSelectStart);
      document.removeEventListener("keydown",          onKeyDown);
      document.removeEventListener("mouseup",          onMouseUp);
      document.removeEventListener("contextmenu",      onContextMenu);
      document.removeEventListener("visibilitychange", onVisChange);
      window  .removeEventListener("beforeprint",      onBeforePrint);
      window  .removeEventListener("afterprint",       onAfterPrint);
      window  .removeEventListener("blur",             onBlur);
      window  .removeEventListener("focus",            onFocus);
      window  .removeEventListener("resize",           onResize);
      window  .removeEventListener("beforeunload",     onUnload);
      if (timerHandle) clearInterval(timerHandle);
      clearInterval(liveTimer);
      // Flush any remaining queued events + send final session state
      onUnload();
    };
  }, [token]); // ← only re-runs if token changes; refs track latest email/approval
}
