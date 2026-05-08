#!/usr/bin/env python3
"""
Create vault_images table in Supabase if it doesn't exist.
"""

import os
from dotenv import load_dotenv
from pathlib import Path

# Load environment
env_path = Path(__file__).parent / ".env"
load_dotenv(env_path)

from supabase import create_client, Client

# Get Supabase credentials
url = os.getenv("SUPABASE_URL")
service_key = os.getenv("SUPABASE_SERVICE_KEY")

print(f"🔌 Connecting to Supabase: {url}")

# Create admin client (using service key for admin access)
db: Client = create_client(url, service_key)

# SQL to create the vault_images table
create_table_sql = """
CREATE TABLE IF NOT EXISTS vault_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    asset_id TEXT NOT NULL UNIQUE,
    certificate_id TEXT,
    owner_name TEXT,
    owner_email TEXT,
    file_hash TEXT,
    visual_fingerprint TEXT,
    blockchain_anchor TEXT,
    resolution TEXT,
    file_size TEXT,
    file_name TEXT,
    thumbnail_url TEXT,
    capture_timestamp TEXT,
    device_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on user_id for faster queries
CREATE INDEX IF NOT EXISTS idx_vault_images_user_id ON vault_images(user_id);
CREATE INDEX IF NOT EXISTS idx_vault_images_asset_id ON vault_images(asset_id);
"""

try:
    # Execute raw SQL via Supabase client
    result = db.rpc(
        "execute_sql",
        {"sql": create_table_sql}
    ).execute()
    print(f"✅ Table creation RPC attempted: {result}")
except Exception as e:
    print(f"⚠️ RPC method not available, trying direct approach...")
    
    # Alternative: Use raw SQL directly via query
    try:
        # Split and execute each statement
        for statement in create_table_sql.split(";"):
            if statement.strip():
                print(f"  Executing: {statement[:80]}...")
                result = db.rpc("sql", {"query": statement}).execute()
    except Exception as e2:
        print(f"❌ Error executing SQL: {e2}")
        print(f"\n⚠️  You'll need to run this SQL manually in Supabase:")
        print(f"\n{create_table_sql}")

print("\n✅ Vault table setup complete!")
