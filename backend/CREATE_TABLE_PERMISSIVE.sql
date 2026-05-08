-- Drop everything first
DROP POLICY IF EXISTS "Users can see their own records" ON biometric_users;
DROP POLICY IF EXISTS "Authenticated users can insert" ON biometric_users;
DROP POLICY IF EXISTS "Enable read for all users" ON biometric_users;
DROP POLICY IF EXISTS "Enable insert for all users" ON biometric_users;
DROP POLICY IF EXISTS "Enable update for all users" ON biometric_users;
DROP TABLE IF EXISTS biometric_users;

-- Create the table
CREATE TABLE biometric_users (
    id BIGSERIAL PRIMARY KEY,
    user_id TEXT NOT NULL UNIQUE,
    device_token TEXT NOT NULL,
    webauthn_credential JSONB,
    face_embedding FLOAT8[],
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create indexes
CREATE INDEX idx_biometric_users_user_id ON biometric_users(user_id);
CREATE INDEX idx_biometric_users_device_token ON biometric_users(device_token);

-- Enable RLS
ALTER TABLE biometric_users ENABLE ROW LEVEL SECURITY;

-- Create PERMISSIVE policies that allow all access
CREATE POLICY "Allow all reads" ON biometric_users
    FOR SELECT
    USING (true);

CREATE POLICY "Allow all inserts" ON biometric_users
    FOR INSERT
    WITH CHECK (true);

CREATE POLICY "Allow all updates" ON biometric_users
    FOR UPDATE
    USING (true)
    WITH CHECK (true);

-- Grant public access
GRANT ALL ON biometric_users TO anon;
GRANT ALL ON biometric_users TO authenticated;
GRANT ALL ON biometric_users TO service_role;

-- Verify
SELECT * FROM biometric_users LIMIT 1;
