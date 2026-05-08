#!/usr/bin/env python3
"""
Create the biometric_users table in Supabase
Run: python create_biometric_users_table.py
"""

from db.database import get_admin_db
from datetime import datetime

def create_biometric_users_table():
    """Create biometric_users table using raw SQL"""
    db = get_admin_db()
    
    sql = """
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
    
    CREATE INDEX IF NOT EXISTS idx_biometric_users_user_id ON biometric_users(user_id);
    CREATE INDEX IF NOT EXISTS idx_biometric_users_device_token ON biometric_users(device_token);
    """
    
    try:
        result = db.query(sql)
        print("✅ biometric_users table created successfully!")
        return True
    except Exception as e:
        print(f"❌ Error creating table: {e}")
        return False

if __name__ == "__main__":
    create_biometric_users_table()
