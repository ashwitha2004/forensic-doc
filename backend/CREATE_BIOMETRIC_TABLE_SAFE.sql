-- ============================================================================
-- SAFE BIOMETRIC_USERS TABLE CREATION (Idempotent - can run multiple times)
-- ============================================================================

-- 1. Drop existing table if needed (OPTIONAL - uncomment only if rebuilding)
-- DROP TABLE IF EXISTS biometric_users CASCADE;

-- 2. Create table (will not error if already exists)
CREATE TABLE IF NOT EXISTS biometric_users (
    id BIGSERIAL PRIMARY KEY,
    user_id TEXT NOT NULL UNIQUE,
    device_token TEXT NOT NULL,
    webauthn_credential JSONB,
    face_embedding FLOAT8[],
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 3. Create indexes (will not error if already exist)
CREATE INDEX IF NOT EXISTS idx_biometric_users_user_id ON biometric_users(user_id);
CREATE INDEX IF NOT EXISTS idx_biometric_users_device_token ON biometric_users(device_token);

-- 4. Drop existing RLS policies (safe because we check IF EXISTS)
DROP POLICY IF EXISTS "Users can see their own records" ON biometric_users CASCADE;
DROP POLICY IF EXISTS "Authenticated users can insert" ON biometric_users CASCADE;

-- 5. Enable Row Level Security
ALTER TABLE biometric_users ENABLE ROW LEVEL SECURITY;

-- 6. Create new RLS policies
CREATE POLICY "Users can see their own records" ON biometric_users
    FOR SELECT USING (true);

CREATE POLICY "Authenticated users can insert" ON biometric_users
    FOR INSERT WITH CHECK (true);

-- 7. Grant permissions
GRANT ALL ON biometric_users TO authenticated;
GRANT ALL ON biometric_users TO service_role;

-- 8. Verify table structure
SELECT 
    table_name,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'biometric_users'
ORDER BY ordinal_position;

-- 9. Verify indexes
SELECT 
    indexname,
    tablename
FROM pg_indexes
WHERE tablename = 'biometric_users';

-- 10. Verify RLS policies
SELECT 
    policyname,
    cmd,
    qual
FROM pg_policies
WHERE tablename = 'biometric_users';
