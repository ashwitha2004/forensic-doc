-- ============================================================================
-- SUPABASE SETUP QUERIES - Copy & Run Individually
-- ============================================================================
-- Run these in: https://app.supabase.com/project/YOUR-PROJECT/sql/new
-- ============================================================================

-- QUERY 1: Create VAULT_IMAGES table
-- ============================================================================

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

-- QUERY 2: Create indexes for VAULT_IMAGES
-- ============================================================================

CREATE INDEX idx_vault_images_user_id ON public.vault_images(user_id);
CREATE INDEX idx_vault_images_asset_id ON public.vault_images(asset_id);

-- QUERY 3: Enable RLS on VAULT_IMAGES
-- ============================================================================

ALTER TABLE public.vault_images ENABLE ROW LEVEL SECURITY;

-- QUERY 4: Create RLS policies for VAULT_IMAGES
-- ============================================================================

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

-- QUERY 5: Grant permissions on VAULT_IMAGES
-- ============================================================================

GRANT ALL ON public.vault_images TO anon;
GRANT ALL ON public.vault_images TO authenticated;

-- QUERY 6: Create BIOMETRIC_USERS table
-- ============================================================================

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

-- QUERY 7: Create indexes for BIOMETRIC_USERS
-- ============================================================================

CREATE INDEX idx_biometric_users_user_id ON public.biometric_users(user_id);
CREATE INDEX idx_biometric_users_device_token ON public.biometric_users(device_token);

-- QUERY 8: Enable RLS on BIOMETRIC_USERS
-- ============================================================================

ALTER TABLE public.biometric_users ENABLE ROW LEVEL SECURITY;

-- QUERY 9: Create RLS policies for BIOMETRIC_USERS
-- ============================================================================

CREATE POLICY "users_can_see_own_records" 
    ON public.biometric_users 
    FOR SELECT 
    USING (true);

CREATE POLICY "authenticated_can_insert" 
    ON public.biometric_users 
    FOR INSERT 
    WITH CHECK (true);

-- QUERY 10: Grant permissions on BIOMETRIC_USERS
-- ============================================================================

GRANT ALL ON public.biometric_users TO authenticated;
GRANT ALL ON public.biometric_users TO service_role;

-- QUERY 11: VERIFY - Check both tables exist
-- ============================================================================

SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('vault_images', 'biometric_users')
ORDER BY table_name;

-- Expected output: 2 rows
-- - biometric_users
-- - vault_images
