#!/usr/bin/env python3
"""
Check what biometric and face authentication data is stored in Supabase
"""
import sys
from pathlib import Path
from dotenv import load_dotenv
import os

# Load environment variables
env_path = Path(__file__).parent / ".env"
load_dotenv(env_path)

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("❌ ERROR: SUPABASE_URL and SUPABASE_SERVICE_KEY not set in .env")
    print("Set these variables to connect to the database")
    sys.exit(1)

print("🔍 Connecting to Supabase...")
print(f"📍 URL: {SUPABASE_URL}")

try:
    from supabase import create_client
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    print("✅ Connected to Supabase\n")
except Exception as e:
    print(f"❌ Connection failed: {e}")
    sys.exit(1)

# ─────────────────────────────────────────────────────────────────────────────

print("=" * 80)
print("📊 CHECKING BIOMETRIC_USERS TABLE")
print("=" * 80)

try:
    result = supabase.table("biometric_users").select("*").execute()
    
    if not result.data:
        print("\n⚠️  NO REGISTERED USERS FOUND\n")
        print("The biometric_users table is empty or doesn't exist yet.")
    else:
        print(f"\n✅ Found {len(result.data)} registered user(s)\n")
        
        for i, user in enumerate(result.data, 1):
            print(f"\n{'─' * 80}")
            print(f"User #{i}")
            print(f"{'─' * 80}")
            print(f"  ID:                 {user.get('id')}")
            print(f"  User ID:            {user.get('user_id')}")
            print(f"  Device Token:       {user.get('device_token')}")
            print(f"  Is Active:          {user.get('is_active')}")
            print(f"  Created At:         {user.get('created_at')}")
            print(f"  Updated At:         {user.get('updated_at')}")
            
            # Check WebAuthn
            webauthn = user.get('webauthn_credential')
            if webauthn:
                print(f"  ✅ WebAuthn Stored: YES")
                if isinstance(webauthn, dict):
                    print(f"     └─ Type: {webauthn.get('type', 'unknown')}")
            else:
                print(f"  ❌ WebAuthn Stored: NO")
            
            # Check Face Embedding
            face_embedding = user.get('face_embedding')
            if face_embedding:
                if isinstance(face_embedding, list):
                    print(f"  ✅ Face Embedding:  YES")
                    print(f"     └─ Dimensions: {len(face_embedding)}")
                    print(f"     └─ First 5 values: {face_embedding[:5]}")
                else:
                    print(f"  ✅ Face Embedding:  YES (type: {type(face_embedding).__name__})")
            else:
                print(f"  ❌ Face Embedding:  NO")
        
        print(f"\n{'─' * 80}\n")
        
except Exception as e:
    print(f"❌ Error querying biometric_users table: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

# ─────────────────────────────────────────────────────────────────────────────

print("=" * 80)
print("📊 CHECKING USERS TABLE")
print("=" * 80)

try:
    result = supabase.table("users").select("id, username, email, role").execute()
    
    if not result.data:
        print("\n⚠️  NO USERS FOUND IN MAIN USERS TABLE\n")
    else:
        print(f"\n✅ Found {len(result.data)} user(s) in users table\n")
        
        for i, user in enumerate(result.data, 1):
            print(f"  User #{i}: {user.get('username')} ({user.get('email')})")
        
        print()
        
except Exception as e:
    print(f"⚠️  Could not query users table: {e}\n")

# ─────────────────────────────────────────────────────────────────────────────

print("=" * 80)
print("📊 DATABASE SCHEMA CHECK")
print("=" * 80)

print("\n🔍 Checking if biometric_users table exists...")

try:
    # Try to get table info
    result = supabase.table("biometric_users").select("*", count="exact").execute()
    print("✅ biometric_users table EXISTS")
    print(f"   Total rows: {result.count}")
except Exception as e:
    print(f"❌ biometric_users table ERROR: {e}")

print("\nSummary:")
print("  - If 0 rows: No users have registered yet")
print("  - If > 0 rows: Users are registered with biometric data")
print("  - Check 'WebAuthn Stored' and 'Face Embedding' indicators")
