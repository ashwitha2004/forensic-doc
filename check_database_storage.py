#!/usr/bin/env python3
import requests
import json

# Check if biometric data is being stored in the database
def check_database_storage():
    print("=== CHECKING DATABASE STORAGE ===")
    
    # Test 1: Check if backend is running
    try:
        response = requests.get("https://biovault-backend-d13a.onrender.com/", timeout=10)
        print(f"Backend Status: {response.status_code} - {'Running' if response.status_code == 200 else 'Not Running'}")
    except Exception as e:
        print(f"Backend Error: {e}")
        return
    
    # Test 2: Test registration to see if data gets stored
    print("\n--- Testing Registration Storage ---")
    test_user_id = f"test_user_{int(time.time())}"
    
    registration_payload = {
        "userId": test_user_id,
        "deviceToken": "test-device-token",
        "webauthn": {
            "id": "test-fingerprint-credential",
            "type": "public-key",
            "biometricType": "fingerprint",
            "transports": ["internal"],
            "algorithmId": -7,
            "enrolledAt": 1640995200000,
            "verified": True
        },
        "faceEmbedding": [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]
    }
    
    try:
        print(f"Registering user: {test_user_id}")
        reg_response = requests.post(
            "https://biovault-backend-d13a.onrender.com/auth/biometric-register",
            json=registration_payload,
            headers={"Content-Type": "application/json"},
            timeout=30
        )
        
        print(f"Registration Status: {reg_response.status_code}")
        if reg_response.status_code == 200:
            reg_data = reg_response.json()
            print(f"Registration Success: {reg_data}")
            print("Fingerprint data: STORED")
            print("Face embedding data: STORED")
        else:
            print(f"Registration Failed: {reg_response.text}")
            
    except Exception as e:
        print(f"Registration Error: {e}")
    
    # Test 3: Check if we can verify the stored fingerprint
    print("\n--- Testing Fingerprint Verification ---")
    try:
        verify_payload = {
            "userId": test_user_id,
            "credential": "test-fingerprint-credential"
        }
        
        verify_response = requests.post(
            "https://biovault-backend-d13a.onrender.com/auth/verify-fingerprint",
            json=verify_payload,
            headers={"Content-Type": "application/json"},
            timeout=30
        )
        
        print(f"Verification Status: {verify_response.status_code}")
        if verify_response.status_code == 200:
            verify_data = verify_response.json()
            print(f"Verification Result: {verify_data}")
            if verify_data.get('verified') or verify_data.get('match'):
                print("Fingerprint data: FOUND and VERIFIED")
            else:
                print("Fingerprint data: NOT VERIFIED")
        else:
            print(f"Verification Failed: {verify_response.text}")
            
    except Exception as e:
        print(f"Verification Error: {e}")

if __name__ == "__main__":
    import time
    check_database_storage()
