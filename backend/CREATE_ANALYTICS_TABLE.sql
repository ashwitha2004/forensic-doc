-- Create Analytics Table for Admin Dashboard
-- This table will track all user activities for analytics purposes

CREATE TABLE IF NOT EXISTS analytics (
    id SERIAL PRIMARY KEY,
    event_type VARCHAR(50) NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    metadata JSONB,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_analytics_event_type ON analytics(event_type);
CREATE INDEX IF NOT EXISTS idx_analytics_user_id ON analytics(user_id);
CREATE INDEX IF NOT EXISTS idx_analytics_timestamp ON analytics(timestamp);
CREATE INDEX IF NOT EXISTS idx_analytics_created_at ON analytics(created_at);

-- Create a composite index for common queries
CREATE INDEX IF NOT EXISTS idx_analytics_user_timestamp ON analytics(user_id, timestamp DESC);

-- Add comments for documentation
COMMENT ON TABLE analytics IS 'Analytics table to track user activities and system events';
COMMENT ON COLUMN analytics.event_type IS 'Type of event: upload, verification, encryption, login, register';
COMMENT ON COLUMN analytics.user_id IS 'ID of the user who performed the action';
COMMENT ON COLUMN analytics.metadata IS 'Additional event data in JSON format (detection results, file info, etc.)';
COMMENT ON COLUMN analytics.timestamp IS 'When the event occurred';
COMMENT ON COLUMN analytics.created_at IS 'When the record was created';

-- Grant permissions (adjust based on your database setup)
-- GRANT SELECT, INSERT, UPDATE ON analytics TO your_app_user;
-- GRANT USAGE, SELECT ON SEQUENCE analytics_id_seq TO your_app_user;
