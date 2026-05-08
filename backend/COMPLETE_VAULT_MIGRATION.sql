-- ============================================================================
-- COMPLETE VAULT_IMAGES TABLE MIGRATION
-- ============================================================================
-- Run this in Supabase SQL Editor

-- 1. Add all missing columns to vault_images table
ALTER TABLE IF EXISTS public.vault_images
ADD COLUMN IF NOT EXISTS image_base64 TEXT DEFAULT NULL;

ALTER TABLE IF EXISTS public.vault_images
ADD COLUMN IF NOT EXISTS thumbnail_base64 TEXT DEFAULT NULL;

ALTER TABLE IF EXISTS public.vault_images
ADD COLUMN IF NOT EXISTS image_url TEXT DEFAULT NULL;

-- 2. Verify columns exist
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'vault_images';

-- 3. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_vault_images_user_asset 
ON public.vault_images(user_id, asset_id);

CREATE INDEX IF NOT EXISTS idx_vault_images_created_at 
ON public.vault_images(created_at DESC);

-- 4. Verify table structure
-- SELECT * FROM information_schema.columns WHERE table_name = 'vault_images';
