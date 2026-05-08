-- Create user_profiles table for storing profile data
CREATE TABLE IF NOT EXISTS user_profiles (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL UNIQUE,
    profile_data JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_profiles_user_id ON user_profiles(user_id);

-- Enable RLS
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Create RLS policy for users to view only their own profile
CREATE POLICY user_own_profile ON user_profiles
    FOR SELECT
    USING (user_id = auth.uid());

-- Create RLS policy for users to update only their own profile
CREATE POLICY user_update_own_profile ON user_profiles
    FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- Create RLS policy for users to insert only their own profile
CREATE POLICY user_insert_own_profile ON user_profiles
    FOR INSERT
    WITH CHECK (user_id = auth.uid());

-- Create RLS policy for users to delete only their own profile
CREATE POLICY user_delete_own_profile ON user_profiles
    FOR DELETE
    USING (user_id = auth.uid());
