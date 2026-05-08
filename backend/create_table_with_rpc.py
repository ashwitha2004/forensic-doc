#!/usr/bin/env python3
"""
Create the biometric_users table in Supabase using raw SQL
Run: python create_table_with_rpc.py
"""
from pathlib import Path
from dotenv import load_dotenv
import os
import sys

# Load environment
env_path = Path(__file__).parent / ".env"
load_dotenv(env_path)

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("❌ ERROR: SUPABASE_URL and SUPABASE_SERVICE_KEY not set")
    sys.exit(1)

try:
    from supabase import create_client
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    print("✅ Connected to Supabase\n")
except Exception as e:
    print(f"❌ Connection failed: {e}")
    sys.exit(1)

print("=" * 80)
print("🔄 Creating biometric_users table...")
print("=" * 80 + "\n")

# SQL to create the table
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
    # Use the postgrest client to execute raw SQL
    from postgrest import SyncPostgrestClient
    
    # Try using the raw SQL endpoint
    headers = {
        "apikey": SUPABASE_KEY,
        "Content-Type": "application/json",
    }
    
    import requests
    
    # Supabase allows raw SQL execution via a special endpoint
    url = f"{SUPABASE_URL}/rest/v1/rpc/exec_sql"
    
    payload = {"sql": sql}
    
    response = requests.post(url, json=payload, headers=headers)
    
    if response.status_code in [200, 201]:
        print("✅ Table created successfully!")
        print("\n" + "=" * 80)
        print("📊 Table Structure:")
        print("=" * 80)
        print("""
Columns:
  - id (BIGSERIAL): Primary key
  - user_id (TEXT UNIQUE): User identifier
  - device_token (TEXT): Device token
  - webauthn_credential (JSONB): WebAuthn credential data
  - face_embedding (FLOAT8[]): Face embedding vector (512 dimensions)
  - is_active (BOOLEAN): Account status
  - created_at (TIMESTAMP): Creation timestamp
  - updated_at (TIMESTAMP): Last update timestamp

Indexes:
  - idx_biometric_users_user_id (on user_id)
  - idx_biometric_users_device_token (on device_token)
        """)
    else:
        print(f"⚠️  Response status: {response.status_code}")
        print(f"Request to: {url}")
        
        # If exec_sql doesn't exist, try creating via direct table operations
        print("\n🔄 Trying alternative method (direct table creation)...")
        
        # Try to create by inserting then deleting
        try:
            # First check if table exists by trying to select
            result = supabase.table("biometric_users").select("count(*)", count="exact").execute()
            print("✅ Table already exists!")
        except Exception as e:
            if "Could not find the table" in str(e):
                print("❌ Table doesn't exist and cannot be created via REST API")
                print("\nℹ️  To create the table, use Supabase Dashboard SQL Editor:")
                print("   1. Go to: https://app.supabase.com/project/YOUR_PROJECT/sql/new")
                print("   2. Copy and paste the SQL from CREATE_BIOMETRIC_USERS_TABLE.sql")
                print("   3. Click 'Run'")
            else:
                print(f"Error: {e}")

except Exception as e:
    print(f"❌ Error: {e}")
    import traceback
    traceback.print_exc()
    
    print("\n" + "=" * 80)
    print("ℹ️  MANUAL SETUP REQUIRED")
    print("=" * 80)
    print("\nPlease create the table manually in Supabase:")
    print("\n1. Go to Supabase Dashboard → SQL Editor")
    print("2. Click 'New Query'")
    print("3. Paste this SQL:\n")
    print(sql)
    print("\n4. Click 'Run'")
