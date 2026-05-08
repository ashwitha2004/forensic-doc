-- ============================================================================
-- FIXED SUPABASE SETUP - Copy & paste directly into Supabase SQL Editor
-- https://app.supabase.com/project/YOUR-PROJECT/sql/new
-- ============================================================================

-- ============================================================================
-- TABLE 1: VAULT_IMAGES (Encrypted images storage)
-- ============================================================================

DROP TABLE IF EXISTS public.vault_images CASCADE;

CREATE TABLE public.vault_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    asset_id TEXT NOT NULL UNIQUE,
    certificate_id TEXT,
    owner_name TEXT,
    owner_email TEXT,
    file_hash TEXT,
    visual_fingerprint TEXT,
    blockchain_anchor TEXT,
    resolution TEXT,
    file_size TEXT,
    file_name TEXT,
    thumbnail_url TEXT,
    capture_timestamp TEXT,
    device_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for faster queries
CREATE INDEX idx_vault_images_user_id ON public.vault_images(user_id);
CREATE INDEX idx_vault_images_asset_id ON public.vault_images(asset_id);

-- Enable RLS
ALTER TABLE public.vault_images ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "users_can_view_own_images" 
    ON public.vault_images 
    FOR SELECT 
    USING (true);

CREATE POLICY "users_can_insert_own_images" 
    ON public.vault_images 
    FOR INSERT 
    WITH CHECK (true);

CREATE POLICY "users_can_delete_own_images" 
    ON public.vault_images 
    FOR DELETE 
    USING (true);

-- Grant permissions
GRANT ALL ON public.vault_images TO anon;
GRANT ALL ON public.vault_images TO authenticated;

-- ============================================================================
-- TABLE 2: BIOMETRIC_USERS (User authentication & biometric data)
-- ============================================================================

DROP TABLE IF EXISTS public.biometric_users CASCADE;

CREATE TABLE public.biometric_users (
    id BIGSERIAL PRIMARY KEY,
    user_id TEXT NOT NULL UNIQUE,
    device_token TEXT NOT NULL,
    webauthn_credential JSONB,
    face_embedding DOUBLE PRECISION[],
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create indexes
CREATE INDEX idx_biometric_users_user_id ON public.biometric_users(user_id);
CREATE INDEX idx_biometric_users_device_token ON public.biometric_users(device_token);

-- Enable RLS
ALTER TABLE public.biometric_users ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "users_can_see_own_records" 
    ON public.biometric_users 
    FOR SELECT 
    USING (true);

CREATE POLICY "authenticated_can_insert" 
    ON public.biometric_users 
    FOR INSERT 
    WITH CHECK (true);

-- Grant permissions
GRANT ALL ON public.biometric_users TO authenticated;
GRANT ALL ON public.biometric_users TO service_role;

-- ============================================================================
-- VERIFICATION
-- ============================================================================

SELECT 'vault_images table created!' as status;
SELECT 'biometric_users table created!' as status;

-- List all tables
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('vault_images', 'biometric_users');
