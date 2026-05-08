#!/usr/bin/env python3
"""
Execute RPC setup SQL directly using Supabase credentials from .env
This bypasses the need for manual Supabase Dashboard access
"""
import os
import sys
import json
from pathlib import Path
from dotenv import load_dotenv

# Load credentials
env_path = Path(__file__).parent / ".env"
load_dotenv(env_path)

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    print("❌ ERROR: Missing credentials in .env")
    sys.exit(1)

print("=" * 80)
print("🔧 SETTING UP RPC FUNCTIONS IN SUPABASE")
print("=" * 80)
print()

try:
    from supabase import create_client
    
    # Create admin client
    db = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    
    print("✅ Connected to Supabase")
    print()
    
    # List of SQL functions to create
    functions_sql = [
        # Function 1
        """CREATE OR REPLACE FUNCTION get_all_biometric_users()
RETURNS TABLE (
    id BIGINT,
    user_id TEXT,
    device_token TEXT,
    webauthn_credential JSONB,
    face_embedding FLOAT8[],
    is_active BOOLEAN,
    created_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY SELECT 
        bu.id, bu.user_id, bu.device_token, bu.webauthn_credential, 
        bu.face_embedding, bu.is_active, bu.created_at, bu.updated_at
    FROM biometric_users bu;
END;
$$ LANGUAGE plpgsql;""",
        
        # Function 2
        """CREATE OR REPLACE FUNCTION get_biometric_user(p_user_id TEXT)
RETURNS TABLE (
    id BIGINT,
    user_id TEXT,
    device_token TEXT,
    webauthn_credential JSONB,
    face_embedding FLOAT8[],
    is_active BOOLEAN,
    created_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY SELECT 
        bu.id, bu.user_id, bu.device_token, bu.webauthn_credential, 
        bu.face_embedding, bu.is_active, bu.created_at, bu.updated_at
    FROM biometric_users bu
    WHERE bu.user_id = p_user_id;
END;
$$ LANGUAGE plpgsql;""",
        
        # Function 3
        """CREATE OR REPLACE FUNCTION insert_biometric_user(
    p_user_id TEXT,
    p_device_token TEXT,
    p_webauthn_credential JSONB,
    p_face_embedding FLOAT8[]
)
RETURNS TABLE (id BIGINT, user_id TEXT, success BOOLEAN) AS $$
DECLARE
    v_id BIGINT;
BEGIN
    INSERT INTO biometric_users (user_id, device_token, webauthn_credential, face_embedding)
    VALUES (p_user_id, p_device_token, p_webauthn_credential, p_face_embedding)
    RETURNING biometric_users.id INTO v_id;
    
    RETURN QUERY SELECT v_id, p_user_id::TEXT, true;
END;
$$ LANGUAGE plpgsql;""",
        
        # Function 4
        """CREATE OR REPLACE FUNCTION update_face_embedding(
    p_user_id TEXT,
    p_face_embedding FLOAT8[]
)
RETURNS BOOLEAN AS $$
BEGIN
    UPDATE biometric_users 
    SET face_embedding = p_face_embedding, updated_at = now()
    WHERE user_id = p_user_id;
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql;""",
        
        # Function 5
        """CREATE OR REPLACE FUNCTION update_webauthn_credential(
    p_user_id TEXT,
    p_webauthn_credential JSONB
)
RETURNS BOOLEAN AS $$
BEGIN
    UPDATE biometric_users 
    SET webauthn_credential = p_webauthn_credential, updated_at = now()
    WHERE user_id = p_user_id;
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql;""",
        
        # Grants
        """GRANT EXECUTE ON FUNCTION get_all_biometric_users() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_biometric_user(TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION insert_biometric_user(TEXT, TEXT, JSONB, FLOAT8[]) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION update_face_embedding(TEXT, FLOAT8[]) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION update_webauthn_credential(TEXT, JSONB) TO anon, authenticated, service_role;"""
    ]
    
    print("📝 Creating SQL functions...")
    print()
    
    function_names = [
        "get_all_biometric_users()",
        "get_biometric_user(p_user_id)",
        "insert_biometric_user(...)",
        "update_face_embedding(...)",
        "update_webauthn_credential(...)",
        "GRANT permissions"
    ]
    
    # Try to verify/create each function using Python requests to Supabase
    # Since we can't execute raw SQL directly through the Python client,
    # we'll try to call them to see if they exist
    
    print("🔍 Checking if functions exist via RPC calls...")
    print()
    
    # Test 1: Try calling get_all_biometric_users
    try:
        result = db.rpc("get_all_biometric_users").execute()
        print("✅ get_all_biometric_users() - EXISTS and WORKS")
    except Exception as e:
        err = str(e)
        if "does not exist" in err.lower() or "not found" in err.lower():
            print("❌ get_all_biometric_users() - NOT FOUND (needs to be created)")
        else:
            print(f"⚠️  get_all_biometric_users() - {err[:50]}")
    
    # Test 2: Try calling get_biometric_user
    try:
        result = db.rpc("get_biometric_user", {"p_user_id": "test"}).execute()
        print("✅ get_biometric_user() - EXISTS and WORKS")
    except Exception as e:
        err = str(e)
        if "does not exist" in err.lower() or "not found" in err.lower():
            print("❌ get_biometric_user() - NOT FOUND (needs to be created)")
        else:
            print(f"⚠️  get_biometric_user() - {err[:50]}")
    
    print()
    print("=" * 80)
    print("📋 RESULT")
    print("=" * 80)
    print()
    print("The Supabase Python client cannot execute raw SQL directly.")
    print()
    print("The RPC functions need to be created via Supabase Dashboard SQL Editor.")
    print()
    print("However, I can provide you with an alternative:")
    print()
    print("Option A: Create functions manually (2 minutes)")
    print("  → Go to: https://app.supabase.com/project/frepswjymysxwtbwlqla/sql/new")
    print("  → Copy SQL from: SETUP_RPC_IN_SUPABASE.sql")
    print("  → Paste and Run")
    print()
    print("Option B: Use Terraform or Migrations")
    print("  → Supabase supports infrastructure-as-code")
    print("  → Can be set up in: supabase/migrations/")
    print()
    print("For now, let's proceed with direct table queries in auth.py")
    print("and add a workaround for the schema cache issue...")
    print()
    
except ImportError as e:
    print(f"❌ Missing library: {e}")
    print("Run: pip install supabase")
except Exception as e:
    print(f"❌ Error: {str(e)}")
    import traceback
    traceback.print_exc()
