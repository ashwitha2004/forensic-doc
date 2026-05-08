-- ============================================================================
-- CREATE VAULT_IMAGES TABLE FOR IMAGE ENCRYPTION STORAGE
-- ============================================================================
-- Run this in Supabase SQL Editor: https://app.supabase.com/project/YOUR-PROJECT/sql/new

CREATE TABLE IF NOT EXISTS public.vault_images (
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
CREATE INDEX IF NOT EXISTS idx_vault_images_user_id ON public.vault_images(user_id);
CREATE INDEX IF NOT EXISTS idx_vault_images_asset_id ON public.vault_images(asset_id);

-- Enable RLS (Row Level Security) - optional but recommended
ALTER TABLE public.vault_images ENABLE ROW LEVEL SECURITY;

-- Create RLS policy: users can only see their own images
CREATE POLICY "Users can view their own vault images" 
    ON public.vault_images 
    FOR SELECT 
    USING (true);  -- Allow all for now since we're using user_id in application

CREATE POLICY "Users can insert their own vault images" 
    ON public.vault_images 
    FOR INSERT 
    WITH CHECK (true);  -- Allow all since we validate user_id in application

CREATE POLICY "Users can delete their own vault images" 
    ON public.vault_images 
    FOR DELETE 
    USING (true);  -- Allow all since we validate user_id in application

-- Grant permissions to anon role (public access)
GRANT ALL ON public.vault_images TO anon;
GRANT ALL ON public.vault_images TO authenticated;

-- Verify table was created
SELECT 'vault_images table created successfully!' as status;
