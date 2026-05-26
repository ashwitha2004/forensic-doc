-- ============================================================================
-- PINIT VAULT — FULL SCHEMA SETUP
-- Run this once in your new Supabase project:
--   supabase.com/dashboard → SQL Editor → New query → paste → Run
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. biometric_users  (authentication)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.biometric_users (
    id                  BIGSERIAL PRIMARY KEY,
    user_id             TEXT NOT NULL UNIQUE,
    device_token        TEXT NOT NULL,
    webauthn_credential JSONB,
    face_embedding      FLOAT8[],
    is_active           BOOLEAN DEFAULT true,
    created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_biometric_users_user_id
    ON public.biometric_users(user_id);
CREATE INDEX IF NOT EXISTS idx_biometric_users_device_token
    ON public.biometric_users(device_token);

ALTER TABLE public.biometric_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "biometric_select_all" ON public.biometric_users;
DROP POLICY IF EXISTS "biometric_insert_all" ON public.biometric_users;
DROP POLICY IF EXISTS "biometric_update_all" ON public.biometric_users;

CREATE POLICY "biometric_select_all" ON public.biometric_users FOR SELECT USING (true);
CREATE POLICY "biometric_insert_all" ON public.biometric_users FOR INSERT WITH CHECK (true);
CREATE POLICY "biometric_update_all" ON public.biometric_users FOR UPDATE USING (true);

GRANT ALL ON public.biometric_users TO authenticated;
GRANT ALL ON public.biometric_users TO service_role;
GRANT ALL ON public.biometric_users TO anon;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. audit_log  (action audit trail — used by log_action())
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.audit_log (
    id         BIGSERIAL PRIMARY KEY,
    user_id    TEXT,
    action     TEXT,
    details    JSONB,
    ip_address TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON public.audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_action  ON public.audit_log(action);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_insert_all" ON public.audit_log;
DROP POLICY IF EXISTS "audit_select_all" ON public.audit_log;

CREATE POLICY "audit_insert_all" ON public.audit_log FOR INSERT WITH CHECK (true);
CREATE POLICY "audit_select_all" ON public.audit_log FOR SELECT USING (true);

GRANT ALL ON public.audit_log TO service_role;
GRANT INSERT ON public.audit_log TO anon;
GRANT INSERT ON public.audit_log TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. vault_images  (encrypted image + document vault)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.vault_images (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id            TEXT NOT NULL,
    asset_id           TEXT NOT NULL UNIQUE,

    -- identity / cert fields (image encryption path)
    certificate_id     TEXT,
    owner_name         TEXT,
    owner_email        TEXT,
    watermark_id       TEXT,
    file_hash          TEXT,
    visual_fingerprint TEXT,
    blockchain_anchor  TEXT,

    -- file metadata
    resolution         TEXT,
    file_size          TEXT,
    file_name          TEXT,
    file_type          TEXT,
    original_filename  TEXT,
    document_type      TEXT,
    encryption_enabled BOOLEAN DEFAULT TRUE,

    -- storage
    image_base64       TEXT,
    thumbnail_base64   TEXT,
    thumbnail_url      TEXT,
    image_url          TEXT,

    capture_timestamp  TEXT,
    device_id          TEXT,

    created_at         TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at         TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vault_images_user_id
    ON public.vault_images(user_id);
CREATE INDEX IF NOT EXISTS idx_vault_images_asset_id
    ON public.vault_images(asset_id);
CREATE INDEX IF NOT EXISTS idx_vault_images_user_asset
    ON public.vault_images(user_id, asset_id);
CREATE INDEX IF NOT EXISTS idx_vault_images_created_at
    ON public.vault_images(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vault_images_document_type
    ON public.vault_images(document_type);

ALTER TABLE public.vault_images ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vault_select_all" ON public.vault_images;
DROP POLICY IF EXISTS "vault_insert_all" ON public.vault_images;
DROP POLICY IF EXISTS "vault_update_all" ON public.vault_images;
DROP POLICY IF EXISTS "vault_delete_all" ON public.vault_images;

CREATE POLICY "vault_select_all" ON public.vault_images FOR SELECT USING (true);
CREATE POLICY "vault_insert_all" ON public.vault_images FOR INSERT WITH CHECK (true);
CREATE POLICY "vault_update_all" ON public.vault_images FOR UPDATE USING (true);
CREATE POLICY "vault_delete_all" ON public.vault_images FOR DELETE USING (true);

GRANT ALL ON public.vault_images TO anon;
GRANT ALL ON public.vault_images TO authenticated;
GRANT ALL ON public.vault_images TO service_role;


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. encrypted_images  (PINIT watermark / verification records)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.encrypted_images (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    watermark_id  VARCHAR(50) UNIQUE NOT NULL,
    pinit_user_id VARCHAR(50) NOT NULL,
    image_hash    VARCHAR(128) NOT NULL,
    signature     VARCHAR(50) DEFAULT 'PINIT_SECURE_WM',
    asset_id      VARCHAR(100),
    metadata      JSONB,
    status        VARCHAR(20) DEFAULT 'active',
    trust_level   INTEGER DEFAULT 100,
    encrypted_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_encrypted_watermark
    ON public.encrypted_images(watermark_id);
CREATE INDEX IF NOT EXISTS idx_encrypted_user
    ON public.encrypted_images(pinit_user_id);
CREATE INDEX IF NOT EXISTS idx_encrypted_hash
    ON public.encrypted_images(image_hash);
CREATE INDEX IF NOT EXISTS idx_encrypted_verification
    ON public.encrypted_images(watermark_id, signature, status);

ALTER TABLE public.encrypted_images ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "enc_select_all" ON public.encrypted_images;
DROP POLICY IF EXISTS "enc_insert_all" ON public.encrypted_images;
DROP POLICY IF EXISTS "enc_update_all" ON public.encrypted_images;

CREATE POLICY "enc_select_all" ON public.encrypted_images FOR SELECT USING (true);
CREATE POLICY "enc_insert_all" ON public.encrypted_images FOR INSERT WITH CHECK (true);
CREATE POLICY "enc_update_all" ON public.encrypted_images FOR UPDATE USING (true);

GRANT ALL ON public.encrypted_images TO anon;
GRANT ALL ON public.encrypted_images TO authenticated;
GRANT ALL ON public.encrypted_images TO service_role;


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. updated_at auto-trigger
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS vault_images_updated_at     ON public.vault_images;
DROP TRIGGER IF EXISTS encrypted_images_updated_at ON public.encrypted_images;
DROP TRIGGER IF EXISTS biometric_users_updated_at  ON public.biometric_users;

CREATE TRIGGER vault_images_updated_at
    BEFORE UPDATE ON public.vault_images
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER encrypted_images_updated_at
    BEFORE UPDATE ON public.encrypted_images
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER biometric_users_updated_at
    BEFORE UPDATE ON public.biometric_users
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ─────────────────────────────────────────────────────────────────────────────
-- Done — verify: should list audit_log, biometric_users, encrypted_images, vault_images
-- ─────────────────────────────────────────────────────────────────────────────
SELECT table_name
FROM   information_schema.tables
WHERE  table_schema = 'public'
ORDER  BY table_name;
