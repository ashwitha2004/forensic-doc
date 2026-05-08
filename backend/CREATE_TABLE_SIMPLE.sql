-- Nuclear option: Start completely fresh
DROP TABLE IF EXISTS biometric_users CASCADE;

-- Create simple table with NO RLS
CREATE TABLE biometric_users (
    id BIGSERIAL PRIMARY KEY,
    user_id TEXT NOT NULL UNIQUE,
    device_token TEXT NOT NULL,
    webauthn_credential JSONB DEFAULT NULL,
    face_embedding FLOAT8[] DEFAULT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create indexes
CREATE INDEX idx_biometric_users_user_id ON biometric_users(user_id);
CREATE INDEX idx_biometric_users_device_token ON biometric_users(device_token);

-- NO RLS - just grant public access
GRANT SELECT, INSERT, UPDATE, DELETE ON biometric_users TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON biometric_users TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON biometric_users TO service_role;

-- Verify
SELECT * FROM biometric_users LIMIT 1;
