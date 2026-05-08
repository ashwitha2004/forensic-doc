-- ============================================================================
-- CREATE SHARE_CONFIGS TABLE FOR SECURE PUBLIC IMAGE SHARING
-- ============================================================================

-- Drop table if exists (for fresh setup)
DROP TABLE IF EXISTS share_configs CASCADE;

-- Create share_configs table
CREATE TABLE share_configs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    share_id        TEXT NOT NULL UNIQUE,           -- Unique share identifier
    user_id         TEXT NOT NULL,                  -- Owner of the share
    vault_image_id  UUID,                           -- Link to vault_images (optional)
    share_link      TEXT NOT NULL UNIQUE,           -- Full public URL
    expiry_date     TIMESTAMP,                      -- When share expires
    expiry_time     TEXT,                           -- Expiry time (HH:MM format)
    download_limit  INTEGER,                        -- Max downloads allowed
    downloads_used  INTEGER DEFAULT 0,              -- Current download count
    password        TEXT,                           -- Optional password protection
    include_cert    BOOLEAN DEFAULT FALSE,          -- Include certificate
    created_at      TIMESTAMP DEFAULT NOW(),        -- Creation timestamp
    created_by      TEXT,                           -- User email/ID who created
    is_active       BOOLEAN DEFAULT TRUE,           -- Active/disabled status
    accessed_at     TIMESTAMP,                      -- Last access time
    access_count    INTEGER DEFAULT 0               -- Total access count
);

-- Create indexes for faster queries
CREATE INDEX idx_share_id ON share_configs(share_id);
CREATE INDEX idx_user_id ON share_configs(user_id);
CREATE INDEX idx_vault_image_id ON share_configs(vault_image_id);
CREATE INDEX idx_is_active ON share_configs(is_active);
CREATE INDEX idx_created_at ON share_configs(created_at);

-- Enable RLS (Row-Level Security)
ALTER TABLE share_configs ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================================================

-- Policy 1: Users can view their own shares
CREATE POLICY "users_can_view_own_shares"
ON share_configs
FOR SELECT
USING (auth.uid()::text = user_id OR is_active = TRUE);

-- Policy 2: Users can create shares
CREATE POLICY "users_can_create_shares"
ON share_configs
FOR INSERT
WITH CHECK (auth.uid()::text = user_id);

-- Policy 3: Users can update their own shares
CREATE POLICY "users_can_update_own_shares"
ON share_configs
FOR UPDATE
USING (auth.uid()::text = user_id)
WITH CHECK (auth.uid()::text = user_id);

-- Policy 4: Users can delete their own shares
CREATE POLICY "users_can_delete_own_shares"
ON share_configs
FOR DELETE
USING (auth.uid()::text = user_id);

-- ============================================================================
-- TRIGGERS & FUNCTIONS
-- ============================================================================

-- Function to check and update expiry status
CREATE OR REPLACE FUNCTION check_share_expiry()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.expiry_date IS NOT NULL THEN
        IF NOW() > NEW.expiry_date THEN
            NEW.is_active := FALSE;
        END IF;
    END IF;
    
    -- Check download limit
    IF NEW.download_limit IS NOT NULL THEN
        IF NEW.downloads_used >= NEW.download_limit THEN
            NEW.is_active := FALSE;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to check expiry before select/update
CREATE TRIGGER share_expiry_check
BEFORE INSERT OR UPDATE ON share_configs
FOR EACH ROW
EXECUTE FUNCTION check_share_expiry();

-- ============================================================================
-- COMMENT ON TABLE AND COLUMNS
-- ============================================================================

COMMENT ON TABLE share_configs IS 'Stores public share links for encrypted images';
COMMENT ON COLUMN share_configs.share_id IS 'Unique identifier for share (share_[timestamp]_[random])';
COMMENT ON COLUMN share_configs.share_link IS 'Full public URL (e.g., https://app.com/share/share_1234_abc)';
COMMENT ON COLUMN share_configs.expiry_date IS 'Date when share expires and becomes inaccessible';
COMMENT ON COLUMN share_configs.download_limit IS 'Maximum number of downloads before share is disabled';
COMMENT ON COLUMN share_configs.is_active IS 'Whether share is currently accessible';

-- ============================================================================
-- SAMPLE INSERT (for testing)
-- ============================================================================

-- INSERT INTO share_configs (
--     share_id, user_id, share_link, is_active, created_by
-- ) VALUES (
--     'share_1713270300000_abc123',
--     'USR-1234567',
--     'https://pinit-vault.onrender.com/share/share_1713270300000_abc123',
--     TRUE,
--     'user@biovault.io'
-- );
