-- ============================================================
-- SECURE SHARING TABLES  (Phase 2 + Phase 4)
-- Run this in Supabase SQL Editor
-- ============================================================

-- ── 1. Share Tokens ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS document_share_tokens (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    share_token  TEXT NOT NULL UNIQUE,
    asset_id     TEXT NOT NULL,
    user_id      TEXT NOT NULL,
    expires_at   TIMESTAMPTZ,
    is_active    BOOLEAN NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_share_tokens_token
    ON document_share_tokens (share_token);

CREATE INDEX IF NOT EXISTS idx_share_tokens_user
    ON document_share_tokens (user_id);

-- ── 2. View Activity Log ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS document_view_activity (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id    TEXT NOT NULL,
    owner_user_id  TEXT NOT NULL,
    viewer_ip      TEXT,
    browser_device TEXT,
    viewed_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    access_type    TEXT NOT NULL DEFAULT 'shared_view',
    share_token    TEXT
);

CREATE INDEX IF NOT EXISTS idx_view_activity_doc
    ON document_view_activity (document_id);

CREATE INDEX IF NOT EXISTS idx_view_activity_owner
    ON document_view_activity (owner_user_id);

CREATE INDEX IF NOT EXISTS idx_view_activity_token
    ON document_view_activity (share_token);

-- ── Row Level Security (RLS) ─────────────────────────────────
-- Backend uses service role key which bypasses RLS.
-- Enable RLS so anonymous users cannot read raw tables directly.

ALTER TABLE document_share_tokens  ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_view_activity ENABLE ROW LEVEL SECURITY;

-- No public access policies — all access goes through the backend service role.
