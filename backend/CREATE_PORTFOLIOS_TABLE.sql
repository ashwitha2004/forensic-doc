-- Create portfolios table for storing user portfolios
CREATE TABLE IF NOT EXISTS portfolios (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('academic', 'placement', 'masters', 'personal', 'professional')),
    sections JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    views INTEGER DEFAULT 0,
    unique_viewers INTEGER DEFAULT 0,
    share_token TEXT,
    share_expiry TIMESTAMP WITH TIME ZONE
);

-- Create index for faster user-specific queries
CREATE INDEX IF NOT EXISTS idx_portfolios_user_id ON portfolios(user_id);
CREATE INDEX IF NOT EXISTS idx_portfolios_type ON portfolios(type);

-- Enable RLS (Row Level Security)
ALTER TABLE portfolios ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own portfolios
CREATE POLICY "Users can view own portfolios"
    ON portfolios FOR SELECT
    USING (user_id = current_setting('app.current_user_id', true));

-- Policy: Users can insert their own portfolios
CREATE POLICY "Users can insert own portfolios"
    ON portfolios FOR INSERT
    WITH CHECK (user_id = current_setting('app.current_user_id', true));

-- Policy: Users can update their own portfolios
CREATE POLICY "Users can update own portfolios"
    ON portfolios FOR UPDATE
    USING (user_id = current_setting('app.current_user_id', true));

-- Policy: Users can delete their own portfolios
CREATE POLICY "Users can delete own portfolios"
    ON portfolios FOR DELETE
    USING (user_id = current_setting('app.current_user_id', true));

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to automatically update updated_at
CREATE TRIGGER update_portfolios_updated_at
    BEFORE UPDATE ON portfolios
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
