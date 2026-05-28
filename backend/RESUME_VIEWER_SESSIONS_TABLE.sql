-- ============================================================
-- Resume Viewer Sessions
-- ============================================================
-- Stores one row per unique viewer session (per share token).
-- Complements resume_activity_logs (event-level) with rich
-- session-level analytics: device fingerprint, geolocation,
-- duration, and aggregate security-signal counters.
--
-- Run this once in your Supabase SQL editor.
-- ============================================================

CREATE TABLE IF NOT EXISTS viewer_sessions (
    id                  UUID             PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Identity
    share_token         TEXT             NOT NULL,
    session_id          TEXT             NOT NULL UNIQUE,   -- client-generated, per-browser-session
    viewer_email        TEXT,
    viewer_ip           TEXT,

    -- Device / browser fingerprint
    user_agent          TEXT,
    browser             TEXT,            -- "Chrome 124", "Firefox 125", etc.
    os                  TEXT,            -- "Windows 11", "macOS 14", "iOS 17", etc.
    device_type         TEXT,            -- "mobile" | "tablet" | "desktop"
    screen_size         TEXT,            -- "1920x1080"
    is_first_visit      BOOLEAN          NOT NULL DEFAULT FALSE,

    -- Geolocation (filled after permission granted; NULL until then)
    geo_status          TEXT,            -- "pending" | "granted" | "denied" | "unavailable"
    latitude            DOUBLE PRECISION,
    longitude           DOUBLE PRECISION,
    geo_accuracy        DOUBLE PRECISION, -- metres

    -- Duration (updated on session_end event)
    first_seen          TIMESTAMPTZ      NOT NULL DEFAULT now(),
    last_seen           TIMESTAMPTZ      NOT NULL DEFAULT now(),
    total_duration_ms   BIGINT           NOT NULL DEFAULT 0,
    active_duration_ms  BIGINT           NOT NULL DEFAULT 0,

    -- Security-signal counters (aggregated from events)
    copy_count          INTEGER          NOT NULL DEFAULT 0,
    print_attempts      INTEGER          NOT NULL DEFAULT 0,
    screenshot_signals  INTEGER          NOT NULL DEFAULT 0,
    is_suspicious       BOOLEAN          NOT NULL DEFAULT FALSE,

    created_at          TIMESTAMPTZ      NOT NULL DEFAULT now()
);

-- Indexes for common access patterns
CREATE INDEX IF NOT EXISTS idx_vs_token   ON viewer_sessions (share_token);
CREATE INDEX IF NOT EXISTS idx_vs_session ON viewer_sessions (session_id);
CREATE INDEX IF NOT EXISTS idx_vs_email   ON viewer_sessions (viewer_email);
CREATE INDEX IF NOT EXISTS idx_vs_time    ON viewer_sessions (created_at);
CREATE INDEX IF NOT EXISTS idx_vs_susp    ON viewer_sessions (is_suspicious) WHERE is_suspicious = TRUE;

-- Row-level security (backend uses service-role key → bypasses RLS)
ALTER TABLE viewer_sessions ENABLE ROW LEVEL SECURITY;
