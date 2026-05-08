#!/usr/bin/env python3
"""
🔍 Check Biometric Data in Supabase
Verify that face embeddings and user data are being stored correctly
"""

import sys
import json
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
    sys.exit(1)

print("🔗 Connecting to Supabase...")
try:
    from supabase import create_client
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    print("✅ Connected!\n")
except Exception as e:
    print(f"❌ Connection failed: {e}")
    sys.exit(1)

# ═════════════════════════════════════════════════════════════════════════════

print("=" * 80)
print("📊 BIOMETRIC_USERS TABLE - COMPLETE AUDIT")
print("=" * 80)

try:
    result = supabase.table("biometric_users").select("*").execute()
    
    if not result.data:
        print("\n⚠️  NO REGISTERED USERS FOUND\n")
        print("Expected: After registration, at least 1 user should appear here")
        print("Action: Run the app, complete registration, then re-run this script\n")
    else:
        print(f"\n✅ Found {len(result.data)} registered user(s)\n")
        
        for i, user in enumerate(result.data, 1):
            print(f"\n{'─' * 80}")
            print(f"USER #{i}: {user.get('user_id')}")
            print(f"{'─' * 80}")
            
            # User ID
            print(f"  📱 User ID:           {user.get('user_id')}")
            print(f"  🔑 Device Token:      {user.get('device_token')}")
            print(f"  ⚙️  Active:            {user.get('is_active')}")
            print(f"  🕐 Registered:        {user.get('created_at')}")
            
            # Face Embedding Check
            face_embedding = user.get('face_embedding')
            if face_embedding:
                if isinstance(face_embedding, list):
                    dims = len(face_embedding)
                    face_sum = sum(abs(x) for x in face_embedding)
                    first_5 = [round(x, 4) for x in face_embedding[:5]]
                    
                    print(f"\n  ✅ FACE EMBEDDING STORED:")
                    print(f"     └─ Dimensions: {dims} (expected: 128)")
                    print(f"     └─ Sum: {face_sum:.4f}")
                    print(f"     └─ First 5 values: {first_5}")
                    
                    if dims == 128:
                        print(f"     ✅ CORRECT DIMENSIONS")
                    else:
                        print(f"     ⚠️  WRONG DIMENSIONS (expected 128, got {dims})")
                else:
                    print(f"\n  ⚠️  Face embedding type: {type(face_embedding).__name__}")
            else:
                print(f"\n  ❌ NO FACE EMBEDDING STORED")
                print(f"     └─ User registered but no face data captured!")
            
            # WebAuthn Check
            webauthn = user.get('webauthn_credential')
            if webauthn:
                print(f"\n  ✅ WEBAUTHN CREDENTIAL STORED:")
                if isinstance(webauthn, dict):
                    print(f"     └─ Keys: {list(webauthn.keys())}")
                    if 'id' in webauthn:
                        print(f"     └─ Credential ID: {webauthn['id'][:20]}...")
                else:
                    print(f"     └─ Type: {type(webauthn).__name__}")
            else:
                print(f"\n  ⚠️  NO WEBAUTHN CREDENTIAL")
        
        print(f"\n\n{'─' * 80}")
        print("📈 SUMMARY")
        print(f"{'─' * 80}")
        
        total_with_face = sum(1 for u in result.data if u.get('face_embedding'))
        total_with_webauthn = sum(1 for u in result.data if u.get('webauthn_credential'))
        
        print(f"Total users:             {len(result.data)}")
        print(f"With face embeddings:    {total_with_face} ✅" if total_with_face > 0 else f"With face embeddings:    {total_with_face} ❌")
        print(f"With WebAuthn:           {total_with_webauthn} ✅" if total_with_webauthn > 0 else f"With WebAuthn:           {total_with_webauthn} ❌")
        
        if total_with_face == len(result.data):
            print(f"\n✅ ALL USERS HAVE FACE EMBEDDINGS - SYSTEM WORKING!")
        elif total_with_face > 0:
            print(f"\n⚠️  PARTIAL: {total_with_face}/{len(result.data)} users have face embeddings")
        else:
            print(f"\n❌ NO USERS HAVE FACE EMBEDDINGS - CHECK REGISTRATION FLOW")
        
        print()
        
except Exception as e:
    print(f"❌ Error querying biometric_users table: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

# ═════════════════════════════════════════════════════════════════════════════

print("\n" + "=" * 80)
print("🧪 VERIFICATION TEST")
print("=" * 80)

if result.data and len(result.data) > 0:
    test_user = result.data[0]
    user_id = test_user.get('user_id')
    face_embedding = test_user.get('face_embedding')
    
    print(f"\nTesting with user: {user_id}")
    
    # Test 1: Embedding dimensions
    if face_embedding and len(face_embedding) == 128:
        print("✅ TEST 1: Face embedding has correct dimensions (128)")
    else:
        dims = len(face_embedding) if face_embedding else 0
        print(f"❌ TEST 1: Face embedding dimensions incorrect ({dims}/128)")
    
    # Test 2: Embedding values are valid
    if face_embedding:
        all_valid = all(isinstance(x, (int, float)) and -1 <= x <= 1 for x in face_embedding)
        if all_valid:
            print("✅ TEST 2: All embedding values are valid numbers (-1 to 1)")
        else:
            print("⚠️  TEST 2: Some embedding values might be invalid")
    
    # Test 3: Device token exists
    if test_user.get('device_token'):
        print("✅ TEST 3: Device token is stored")
    else:
        print("❌ TEST 3: Device token is missing")
    
    # Test 4: User is active
    if test_user.get('is_active'):
        print("✅ TEST 4: User account is active")
    else:
        print("⚠️  TEST 4: User account is marked inactive")
    
    print("\n✅ DATABASE VERIFICATION COMPLETE\n")
else:
    print("\n⚠️  No users to test - please run the app and register a user first\n")

# ═════════════════════════════════════════════════════════════════════════════

print("=" * 80)
print("💡 NEXT STEPS")
print("=" * 80)
print("""
If data is showing correctly:
  ✅ Face embeddings are being captured (/face_embedding column)
  ✅ Backend is receiving registration requests (/biometric-register)
  ✅ Data is being stored in Supabase (✅ WORKING)

To test the full flow:
  1. Restart the app
  2. Login with the registered userId
  3. Scan face - should match stored embedding
  4. Check backend logs for similarity score
  5. Dashboard should load if match >= 70%

To check login verification:
  1. Open browser devtools (F12)
  2. Go to Network tab
  3. Try to login
  4. Look for POST /auth/verify-face request
  5. Check response: should show {verified: true, similarity: 0.XX}

Questions? Check TESTING_GUIDE.md for detailed troubleshooting
""")
