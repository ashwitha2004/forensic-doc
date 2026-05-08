-- =====================================================
-- PINIT ENCRYPTED IMAGES TABLE
-- =====================================================
-- This table stores encryption records for PINIT verification
-- Each encrypted image gets a unique watermark_id and user linkage

CREATE TABLE IF NOT EXISTS encrypted_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    watermark_id VARCHAR(50) UNIQUE NOT NULL,  -- WM-12345 format
    pinit_user_id VARCHAR(50) NOT NULL,       -- USR-862811 format
    image_hash VARCHAR(128) NOT NULL,        -- SHA256 hash of original image
    signature VARCHAR(50) DEFAULT 'PINIT_SECURE_WM',  -- Fixed signature
    encrypted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    status VARCHAR(20) DEFAULT 'active',      -- active, revoked, expired
    trust_level INTEGER DEFAULT 100,          -- 0-100 trust score
    asset_id VARCHAR(100),                    -- Link to vault_images table
    metadata JSONB,                           -- Additional encryption metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================

-- Index for watermark_id lookups (primary verification path)
CREATE INDEX IF NOT EXISTS idx_encrypted_images_watermark_id 
ON encrypted_images(watermark_id);

-- Index for user-based queries
CREATE INDEX IF NOT EXISTS idx_encrypted_images_pinit_user_id 
ON encrypted_images(pinit_user_id);

-- Index for hash verification
CREATE INDEX IF NOT EXISTS idx_encrypted_images_image_hash 
ON encrypted_images(image_hash);

-- Composite index for verification queries
CREATE INDEX IF NOT EXISTS idx_encrypted_images_verification 
ON encrypted_images(watermark_id, signature, status);

-- =====================================================
-- RLS (ROW LEVEL SECURITY) POLICIES
-- =====================================================

-- Enable RLS
ALTER TABLE encrypted_images ENABLE ROW LEVEL SECURITY;

-- Allow users to see their own encryption records
CREATE POLICY "Users can view own encrypted images" ON encrypted_images
    FOR SELECT USING (pinit_user_id = current_setting('app.current_user_id', true));

-- Allow users to insert their own encryption records
CREATE POLICY "Users can insert own encrypted images" ON encrypted_images
    FOR INSERT WITH CHECK (pinit_user_id = current_setting('app.current_user_id', true));

-- Allow service role to manage all records (for verification)
CREATE POLICY "Service role full access" ON encrypted_images
    FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- =====================================================
-- TRIGGERS FOR UPDATED_AT
-- =====================================================

CREATE OR REPLACE FUNCTION update_encrypted_images_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER encrypted_images_updated_at
    BEFORE UPDATE ON encrypted_images
    FOR EACH ROW
    EXECUTE FUNCTION update_encrypted_images_updated_at();

-- =====================================================
-- SAMPLE QUERIES FOR REFERENCE
-- =====================================================

-- Insert encryption record during encryption:
-- INSERT INTO encrypted_images (watermark_id, pinit_user_id, image_hash, asset_id, metadata)
-- VALUES ('WM-12345', 'USR-862811', 'abc123...', 'asset_456', '{"device": "mobile", "location": "US"}');

-- Verify image during verification:
-- SELECT * FROM encrypted_images 
-- WHERE watermark_id = 'WM-12345' 
-- AND signature = 'PINIT_SECURE_WM' 
-- AND status = 'active';

-- Get user's encryption history:
-- SELECT * FROM encrypted_images 
-- WHERE pinit_user_id = 'USR-862811' 
-- ORDER BY encrypted_at DESC;

-- Check hash similarity:
-- SELECT * FROM encrypted_images 
-- WHERE image_hash = 'uploaded_hash' 
-- OR similarity(image_hash, 'uploaded_hash') > 0.95;
