-- =====================================================
-- PINIT ENCRYPTED IMAGES TABLE SETUP
-- =====================================================
-- Run this SQL in your Supabase SQL Editor to create the table

-- Create encrypted_images table
CREATE TABLE IF NOT EXISTS encrypted_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    watermark_id VARCHAR(50) UNIQUE NOT NULL,
    pinit_user_id VARCHAR(50) NOT NULL,
    image_hash VARCHAR(128) NOT NULL,
    signature VARCHAR(50) DEFAULT 'PINIT_SECURE_WM',
    encrypted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    status VARCHAR(20) DEFAULT 'active',
    trust_level INTEGER DEFAULT 100,
    asset_id VARCHAR(100),
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_encrypted_images_watermark_id ON encrypted_images(watermark_id);
CREATE INDEX IF NOT EXISTS idx_encrypted_images_pinit_user_id ON encrypted_images(pinit_user_id);
CREATE INDEX IF NOT EXISTS idx_encrypted_images_image_hash ON encrypted_images(image_hash);
CREATE INDEX IF NOT EXISTS idx_encrypted_images_verification ON encrypted_images(watermark_id, signature, status);

-- Create trigger function for updated_at
CREATE OR REPLACE FUNCTION update_encrypted_images_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger
DROP TRIGGER IF EXISTS encrypted_images_updated_at ON encrypted_images;
CREATE TRIGGER encrypted_images_updated_at
    BEFORE UPDATE ON encrypted_images
    FOR EACH ROW
    EXECUTE FUNCTION update_encrypted_images_updated_at();
