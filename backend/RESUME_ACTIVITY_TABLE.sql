-- ================================================================
-- RESUME ACTIVITY LOGS TABLE
-- Run in Supabase → SQL Editor
-- ================================================================
-- Stores all viewer activity events from the secure resume viewer:
--   resume_opened, copy_attempt, screenshot_signal, print_attempt,
--   save_attempt, tab_hidden, window_blur, devtools_signal, etc.
-- ================================================================

CREATE TABLE IF NOT EXISTS resume_activity_logs (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    share_token   TEXT        NOT NULL,
    session_id    TEXT        NOT NULL,
    viewer_email  TEXT,
    viewer_ip     TEXT,
    event_type    TEXT        NOT NULL,
    event_details JSONB       NOT NULL DEFAULT '{}'::jsonb,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ral_token   ON resume_activity_logs (share_token);
CREATE INDEX IF NOT EXISTS idx_ral_session ON resume_activity_logs (session_id);
CREATE INDEX IF NOT EXISTS idx_ral_type    ON resume_activity_logs (event_type);
CREATE INDEX IF NOT EXISTS idx_ral_time    ON resume_activity_logs (created_at);

-- Backend uses service role key — no public access needed
ALTER TABLE resume_activity_logs ENABLE ROW LEVEL SECURITY;
