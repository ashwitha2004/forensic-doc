-- ============================================================================
-- TABLE: SHARED_LINKS (For cross-device image sharing)
-- ============================================================================
-- Run this in your Supabase SQL Editor: https://app.supabase.com/project/YOUR-PROJECT/sql/new

DROP TABLE IF EXISTS public.shared_links CASCADE;

CREATE TABLE public.shared_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    share_id TEXT NOT NULL UNIQUE,
    image_data TEXT NOT NULL, -- Base64 encoded image
    file_name TEXT NOT NULL,
    shared_by TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    downloads_used INTEGER DEFAULT 0,
    download_limit INTEGER,
    password_protected BOOLEAN DEFAULT false,
    share_password TEXT,
    include_certificate BOOLEAN DEFAULT false,
    expiry_date TIMESTAMP WITH TIME ZONE
);

-- Create indexes for faster queries
CREATE INDEX idx_shared_links_share_id ON public.shared_links(share_id);
CREATE INDEX idx_shared_links_shared_by ON public.shared_links(shared_by);
CREATE INDEX idx_shared_links_expiry_date ON public.shared_links(expiry_date);

-- Enable RLS
ALTER TABLE public.shared_links ENABLE ROW LEVEL SECURITY;

-- Create policies (allow public read for share access)
CREATE POLICY "anyone_can_view_shared_links" 
    ON public.shared_links 
    FOR SELECT 
    USING (true);

CREATE POLICY "anyone_can_create_shared_links" 
    ON public.shared_links 
    FOR INSERT 
    WITH CHECK (true);

CREATE POLICY "anyone_can_update_shared_links" 
    ON public.shared_links 
    FOR UPDATE 
    USING (true);

-- Grant permissions
GRANT ALL ON public.shared_links TO anon;
GRANT ALL ON public.shared_links TO authenticated;

-- Verification
SELECT 'shared_links table created!' as status;

-- List the table
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name = 'shared_links';
