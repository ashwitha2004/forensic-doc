-- ============================================================================
-- ADD FULL ENCRYPTED IMAGE STORAGE TO VAULT_IMAGES TABLE
-- ============================================================================
-- Run this in Supabase SQL Editor to add support for storing full encrypted images

-- Add image_base64 column to store full encrypted image data
ALTER TABLE IF EXISTS public.vault_images
ADD COLUMN IF NOT EXISTS image_base64 TEXT;

-- Add image_url column as alternative to thumbnail_url
ALTER TABLE IF EXISTS public.vault_images  
ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Create index for asset_id lookups (if not exists)
CREATE INDEX IF NOT EXISTS idx_vault_images_asset_id 
ON public.vault_images(asset_id);

-- Update RLS Policy if needed (optional)
-- Your existing RLS policies should already allow access to these new columns
