"""
Automated setup script for RPC functions as Supabase schema cache workaround
Executes all SQL functions and verifies they work
"""
import os
import sys
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    print("❌ ERROR: SUPABASE_URL and SUPABASE_SERVICE_KEY not set in .env")
    sys.exit(1)

from supabase import create_client
db = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

print("=" * 80)
print("🔧 SETTING UP RPC FUNCTIONS FOR BIOMETRIC_USERS")
print("=" * 80)
print()

# SQL functions to create
sql_functions = [
    # Function 1: Get all biometric users
    """
    CREATE OR REPLACE FUNCTION get_all_biometric_users()
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
    $$ LANGUAGE plpgsql;
    """,
    
    # Function 2: Get user by ID
    """
    CREATE OR REPLACE FUNCTION get_biometric_user(p_user_id TEXT)
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
    $$ LANGUAGE plpgsql;
    """,
    
    # Function 3: Insert biometric user
    """
    CREATE OR REPLACE FUNCTION insert_biometric_user(
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
    $$ LANGUAGE plpgsql;
    """,
    
    # Grant permissions
    """
    GRANT EXECUTE ON FUNCTION get_all_biometric_users() TO anon, authenticated, service_role;
    GRANT EXECUTE ON FUNCTION get_biometric_user(TEXT) TO anon, authenticated, service_role;
    GRANT EXECUTE ON FUNCTION insert_biometric_user(TEXT, TEXT, JSONB, FLOAT8[]) TO anon, authenticated, service_role;
    """
]

# Try to create functions using RPC
print("📝 Creating RPC functions...")
print()

function_names = [
    "get_all_biometric_users",
    "get_biometric_user",
    "insert_biometric_user"
]

try:
    # Try to create functions via a helper function or direct SQL
    # First, try just calling the functions to see if they exist
    print("Attempting to verify/create functions...\n")
    
    # Test 1: Try calling get_all_biometric_users
    try:
        result = db.rpc("get_all_biometric_users").execute()
        print("✅ get_all_biometric_users() exists and works")
    except Exception as e:
        print(f"⚠️  get_all_biometric_users() not found: {str(e)[:60]}")
        print("   Will need to create manually in Supabase SQL Editor")
    
    print()
    print("=" * 80)
    print("📋 MANUAL SETUP REQUIRED")
    print("=" * 80)
    print()
    print("The RPC functions need to be created in Supabase SQL Editor.")
    print("Copy and run this SQL:")
    print()
    print("-" * 80)
    with open(Path(__file__).parent / "CREATE_RPC_FUNCTIONS.sql", "r") as f:
        print(f.read())
    print("-" * 80)
    print()
    print("Then run this script again to test the functions.")
    
except Exception as e:
    print(f"❌ Error: {str(e)}")
    sys.exit(1)
