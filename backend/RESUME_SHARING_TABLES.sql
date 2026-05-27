-- ================================================================
-- RESUME SECURE SHARING TABLES
-- Run in Supabase → SQL Editor
-- ================================================================

-- ── 1. Share Links ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS resume_share_links (
    id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id  TEXT        NOT NULL,
    asset_id       TEXT        NOT NULL,
    share_token    TEXT        NOT NULL UNIQUE,
    is_active      BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_rsl_token   ON resume_share_links (share_token);
CREATE INDEX IF NOT EXISTS idx_rsl_owner   ON resume_share_links (owner_user_id);
CREATE INDEX IF NOT EXISTS idx_rsl_asset   ON resume_share_links (asset_id);

-- ── 2. View Logs ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS resume_view_logs (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    share_token      TEXT        NOT NULL,
    viewer_ip        TEXT,
    browser_info     TEXT,
    viewed_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    download_attempt BOOLEAN     NOT NULL DEFAULT FALSE,
    duration_seconds INTEGER
);

CREATE INDEX IF NOT EXISTS idx_rvl_token   ON resume_view_logs (share_token);
CREATE INDEX IF NOT EXISTS idx_rvl_time    ON resume_view_logs (viewed_at);

-- ── 3. Access Requests ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS resume_access_requests (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    share_token       TEXT        NOT NULL,
    requester_name    TEXT        NOT NULL,
    requester_email   TEXT        NOT NULL,
    requester_company TEXT,
    message           TEXT,
    status            TEXT        NOT NULL DEFAULT 'pending',
    requested_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    approved_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_rar_token   ON resume_access_requests (share_token);
CREATE INDEX IF NOT EXISTS idx_rar_email   ON resume_access_requests (requester_email);
CREATE INDEX IF NOT EXISTS idx_rar_status  ON resume_access_requests (status);

-- ── RLS — backend uses service role key (bypasses RLS automatically) ─────────
ALTER TABLE resume_share_links     ENABLE ROW LEVEL SECURITY;
ALTER TABLE resume_view_logs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE resume_access_requests ENABLE ROW LEVEL SECURITY;
