-- ============================================================================
-- SUPABASE SETUP - Safe Queries (Skip Existing Tables)
-- ============================================================================
-- Table already exists? No problem! Run these queries instead.
-- ============================================================================

-- OPTION A: Skip table creation (table already exists)
-- ============================================================================
-- Just run the rest of the setup:

-- Create indexes for VAULT_IMAGES (safe even if they exist)
CREATE INDEX IF NOT EXISTS idx_vault_images_user_id ON public.vault_images(user_id);
CREATE INDEX IF NOT EXISTS idx_vault_images_asset_id ON public.vault_images(asset_id);

-- Create indexes for BIOMETRIC_USERS
CREATE INDEX IF NOT EXISTS idx_biometric_users_user_id ON public.biometric_users(user_id);
CREATE INDEX IF NOT EXISTS idx_biometric_users_device_token ON public.biometric_users(device_token);

-- Enable RLS (safe - won't error if already enabled)
ALTER TABLE public.vault_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.biometric_users ENABLE ROW LEVEL SECURITY;

-- Create RLS Policies (safe - use IF NOT EXISTS approach via DROP POLICY IF EXISTS)
DROP POLICY IF EXISTS "vault_select" ON public.vault_images;
CREATE POLICY "vault_select" ON public.vault_images FOR SELECT USING (true);

DROP POLICY IF EXISTS "vault_insert" ON public.vault_images;
CREATE POLICY "vault_insert" ON public.vault_images FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "vault_delete" ON public.vault_images;
CREATE POLICY "vault_delete" ON public.vault_images FOR DELETE USING (true);

DROP POLICY IF EXISTS "bio_select" ON public.biometric_users;
CREATE POLICY "bio_select" ON public.biometric_users FOR SELECT USING (true);

DROP POLICY IF EXISTS "bio_insert" ON public.biometric_users;
CREATE POLICY "bio_insert" ON public.biometric_users FOR INSERT WITH CHECK (true);

-- Grant Permissions
GRANT ALL ON public.vault_images TO anon;
GRANT ALL ON public.vault_images TO authenticated;
GRANT ALL ON public.biometric_users TO authenticated;
GRANT ALL ON public.biometric_users TO service_role;

-- ============================================================================
-- VERIFY - Check both tables exist and have data
-- ============================================================================

SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('vault_images', 'biometric_users')
ORDER BY table_name;

-- Check vault_images structure
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'vault_images'
ORDER BY column_name;

-- Check biometric_users structure
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'biometric_users'
ORDER BY column_name;

-- ============================================================================
-- OPTION B: Delete & Recreate (if you want fresh tables)
-- ============================================================================
-- ONLY RUN THIS IF YOU WANT TO DELETE ALL DATA!

-- DROP TABLE IF EXISTS public.biometric_users CASCADE;
-- DROP TABLE IF EXISTS public.vault_images CASCADE;

-- Then run the full CREATE TABLE queries from QUERIES_TO_RUN.sql

-- ============================================================================
-- DONE! Tables should now be ready
-- ============================================================================
