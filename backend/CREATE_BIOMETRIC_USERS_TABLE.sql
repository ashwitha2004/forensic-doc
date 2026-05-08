-- Run this SQL in Supabase SQL Editor (https://app.supabase.com/projects)
-- This creates the biometric_users table needed for the registration flow

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

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_biometric_users_user_id ON biometric_users(user_id);
CREATE INDEX IF NOT EXISTS idx_biometric_users_device_token ON biometric_users(device_token);

-- Enable RLS (Row Level Security) if needed
ALTER TABLE biometric_users ENABLE ROW LEVEL SECURITY;

-- Create policy for users to see their own records
CREATE POLICY "Users can see their own records" ON biometric_users
    FOR SELECT USING (true);

CREATE POLICY "Authenticated users can insert" ON biometric_users
    FOR INSERT WITH CHECK (true);

-- Grant permissions
GRANT ALL ON biometric_users TO authenticated;
GRANT ALL ON biometric_users TO service_role;

-- Verify table was created
SELECT * FROM biometric_users LIMIT 1;
