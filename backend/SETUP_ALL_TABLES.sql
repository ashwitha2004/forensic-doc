-- ============================================================
-- PINIT VAULT — COMPLETE TABLE SETUP
-- Paste this entire script into:
-- Supabase Dashboard → SQL Editor → New Query → Run
--
-- All statements use IF NOT EXISTS so it's safe to re-run.
-- ============================================================


-- ── 1. vault_images  (encrypted document storage) ────────────
CREATE TABLE IF NOT EXISTS public.vault_images (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             TEXT        NOT NULL,
    asset_id            TEXT        NOT NULL UNIQUE,
    certificate_id      TEXT,
    owner_name          TEXT,
    owner_email         TEXT,
    file_hash           TEXT,
    visual_fingerprint  TEXT,
    blockchain_anchor   TEXT,
    resolution          TEXT,
    file_size           TEXT,
    file_name           TEXT,
    file_type           TEXT,
    thumbnail_url       TEXT,
    capture_timestamp   TEXT,
    device_id           TEXT,
    encrypted_data      TEXT,
    iv                  TEXT,
    original_filename   TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_vault_images_user_id  ON public.vault_images (user_id);
CREATE INDEX IF NOT EXISTS idx_vault_images_asset_id ON public.vault_images (asset_id);
ALTER TABLE public.vault_images ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "vault_select" ON public.vault_images FOR SELECT USING (true);
CREATE POLICY IF NOT EXISTS "vault_insert" ON public.vault_images FOR INSERT WITH CHECK (true);
CREATE POLICY IF NOT EXISTS "vault_delete" ON public.vault_images FOR DELETE USING (true);
GRANT ALL ON public.vault_images TO anon, authenticated;


-- ── 2. resume_share_links  (one row per share link) ──────────
CREATE TABLE IF NOT EXISTS public.resume_share_links (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id   TEXT        NOT NULL,
    asset_id        TEXT        NOT NULL,
    share_token     TEXT        NOT NULL UNIQUE,
    is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_rsl_token  ON public.resume_share_links (share_token);
CREATE INDEX IF NOT EXISTS idx_rsl_owner  ON public.resume_share_links (owner_user_id);
CREATE INDEX IF NOT EXISTS idx_rsl_asset  ON public.resume_share_links (asset_id);
ALTER TABLE public.resume_share_links ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.resume_share_links TO anon, authenticated;


-- ── 3. resume_view_logs  (every time a shared resume is opened) ─
CREATE TABLE IF NOT EXISTS public.resume_view_logs (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    share_token       TEXT        NOT NULL,
    viewer_ip         TEXT,
    browser_info      TEXT,
    viewed_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    download_attempt  BOOLEAN     NOT NULL DEFAULT FALSE,
    duration_seconds  INTEGER
);
CREATE INDEX IF NOT EXISTS idx_rvl_token ON public.resume_view_logs (share_token);
CREATE INDEX IF NOT EXISTS idx_rvl_time  ON public.resume_view_logs (viewed_at);
ALTER TABLE public.resume_view_logs ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.resume_view_logs TO anon, authenticated;


-- ── 4. resume_access_requests  (viewers requesting contact info) ─
CREATE TABLE IF NOT EXISTS public.resume_access_requests (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    share_token         TEXT        NOT NULL,
    requester_name      TEXT        NOT NULL,
    requester_email     TEXT        NOT NULL,
    requester_company   TEXT,
    message             TEXT,
    status              TEXT        NOT NULL DEFAULT 'pending',
    requested_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    approved_at         TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_rar_token  ON public.resume_access_requests (share_token);
CREATE INDEX IF NOT EXISTS idx_rar_email  ON public.resume_access_requests (requester_email);
CREATE INDEX IF NOT EXISTS idx_rar_status ON public.resume_access_requests (status);
ALTER TABLE public.resume_access_requests ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.resume_access_requests TO anon, authenticated;


-- ── 5. resume_activity_logs  (raw event stream per session) ──
CREATE TABLE IF NOT EXISTS public.resume_activity_logs (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    share_token   TEXT        NOT NULL,
    session_id    TEXT        NOT NULL,
    viewer_email  TEXT,
    viewer_ip     TEXT,
    event_type    TEXT        NOT NULL,
    event_details JSONB       NOT NULL DEFAULT '{}'::jsonb,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ral_token   ON public.resume_activity_logs (share_token);
CREATE INDEX IF NOT EXISTS idx_ral_session ON public.resume_activity_logs (session_id);
CREATE INDEX IF NOT EXISTS idx_ral_type    ON public.resume_activity_logs (event_type);
CREATE INDEX IF NOT EXISTS idx_ral_time    ON public.resume_activity_logs (created_at);
ALTER TABLE public.resume_activity_logs ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.resume_activity_logs TO anon, authenticated;


-- ── 6. viewer_sessions  (one row per viewer session) ─────────
CREATE TABLE IF NOT EXISTS public.viewer_sessions (
    id                  UUID             PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Identity
    share_token         TEXT             NOT NULL,
    session_id          TEXT             NOT NULL UNIQUE,
    viewer_email        TEXT,
    viewer_ip           TEXT,

    -- Device / browser fingerprint
    user_agent          TEXT,
    browser             TEXT,
    os                  TEXT,
    device_type         TEXT,
    screen_size         TEXT,
    is_first_visit      BOOLEAN          NOT NULL DEFAULT FALSE,

    -- Geolocation
    geo_status          TEXT,
    latitude            DOUBLE PRECISION,
    longitude           DOUBLE PRECISION,
    geo_accuracy        DOUBLE PRECISION,

    -- Duration (updated live every 30 s and on page close)
    first_seen          TIMESTAMPTZ      NOT NULL DEFAULT now(),
    last_seen           TIMESTAMPTZ      NOT NULL DEFAULT now(),
    total_duration_ms   BIGINT           NOT NULL DEFAULT 0,
    active_duration_ms  BIGINT           NOT NULL DEFAULT 0,

    -- Security counters
    copy_count          INTEGER          NOT NULL DEFAULT 0,
    print_attempts      INTEGER          NOT NULL DEFAULT 0,
    screenshot_signals  INTEGER          NOT NULL DEFAULT 0,
    is_suspicious       BOOLEAN          NOT NULL DEFAULT FALSE,

    created_at          TIMESTAMPTZ      NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_vs_token   ON public.viewer_sessions (share_token);
CREATE INDEX IF NOT EXISTS idx_vs_session ON public.viewer_sessions (session_id);
CREATE INDEX IF NOT EXISTS idx_vs_email   ON public.viewer_sessions (viewer_email);
CREATE INDEX IF NOT EXISTS idx_vs_time    ON public.viewer_sessions (created_at);
CREATE INDEX IF NOT EXISTS idx_vs_susp    ON public.viewer_sessions (is_suspicious) WHERE is_suspicious = TRUE;
ALTER TABLE public.viewer_sessions ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.viewer_sessions TO anon, authenticated;


-- ── Verify ────────────────────────────────────────────────────
SELECT table_name
FROM   information_schema.tables
WHERE  table_schema = 'public'
  AND  table_name IN (
         'vault_images',
         'resume_share_links',
         'resume_view_logs',
         'resume_access_requests',
         'resume_activity_logs',
         'viewer_sessions'
       )
ORDER  BY table_name;
