"""
Workaround for Supabase schema cache issues (PGRST205).
Uses SQL RPC functions instead of direct table access.
"""
import os
import json
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

db = create_client(SUPABASE_URL, SUPABASE_KEY)

print("🔍 Testing RPC functions as workaround...\n")

try:
    # Test 1: Get all biometric users
    print("Test 1: Calling get_all_biometric_users()...")
    result = db.rpc("get_all_biometric_users").execute()
    print(f"✅ SUCCESS! Result: {len(result.data)} users")
    print()
    
    # Test 2: Insert a test user
    print("Test 2: Calling insert_biometric_user()...")
    result = db.rpc("insert_biometric_user", {
        "p_user_id": "test_user_123",
        "p_device_token": "device_token_xyz",
        "p_webauthn_credential": {"test": "data"},
        "p_face_embedding": [0.1, 0.2, 0.3]
    }).execute()
    print(f"✅ SUCCESS! Result: {result.data}")
    print()
    
    # Test 3: Get specific user
    print("Test 3: Calling get_biometric_user()...")
    result = db.rpc("get_biometric_user", {
        "p_user_id": "test_user_123"
    }).execute()
    print(f"✅ SUCCESS! Found user: {result.data}")
    print()
    
    print("🎉 RPC functions work! Using these instead of table queries.")
    
except Exception as e:
    print(f"❌ Error: {str(e)}")
    print()
    print("Make sure you ran CREATE_RPC_FUNCTIONS.sql in Supabase SQL Editor")
