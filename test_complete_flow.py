#!/usr/bin/env python3
import requests
import json

# Test the complete registration and login flow
def test_complete_flow():
    print("=== TESTING COMPLETE REGISTRATION & LOGIN FLOW ===")
    
    backend_url = "https://biovault-backend-d13a.onrender.com"
    
    # Step 1: Test Registration (should store fingerprint and face)
    print("\n--- STEP 1: REGISTRATION ---")
    test_user_id = f"flow_test_{int(time.time())}"
    
    registration_payload = {
        "userId": test_user_id,
        "deviceToken": "test-device-token",
        "webauthn": {
            "id": f"fingerprint_{test_user_id}",
            "type": "public-key",
            "biometricType": "fingerprint",
            "transports": ["internal"],
            "algorithmId": -7,
            "enrolledAt": int(time.time() * 1000),
            "verified": True
        },
        "faceEmbedding": [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]
    }
    
    try:
        print(f"Registering user: {test_user_id}")
        print("Sending fingerprint data...")
        print("Sending face embedding data...")
        
        reg_response = requests.post(
            f"{backend_url}/auth/biometric-register",
            json=registration_payload,
            headers={"Content-Type": "application/json"},
            timeout=30
        )
        
        if reg_response.status_code == 200:
            reg_data = reg_response.json()
            print("REGISTRATION SUCCESS")
            print("Fingerprint: STORED")
            print("Face Embedding: STORED")
            print(f"Response: {reg_data.get('message', 'Success')}")
        else:
            print(f"REGISTRATION FAILED: {reg_response.text}")
            return
            
    except Exception as e:
        print(f"Registration Error: {e}")
        return
    
    # Step 2: Test Login Fingerprint Verification
    print("\n--- STEP 2: LOGIN - FINGERPRINT VERIFICATION ---")
    
    try:
        print(f"Verifying fingerprint for user: {test_user_id}")
        
        login_payload = {
            "userId": test_user_id,
            "credential": f"fingerprint_{test_user_id}"
        }
        
        verify_response = requests.post(
            f"{backend_url}/auth/verify-fingerprint",
            json=login_payload,
            headers={"Content-Type": "application/json"},
            timeout=30
        )
        
        if verify_response.status_code == 200:
            verify_data = verify_response.json()
            if verify_data.get('verified') or verify_data.get('match'):
                print("FINGERPRINT VERIFICATION SUCCESS")
                print("Fingerprint found in database")
                print("Fingerprint matches stored record")
            else:
                print("FINGERPRINT VERIFICATION FAILED")
                print("Fingerprint not found or doesn't match")
        else:
            print(f"Fingerprint verification failed: {verify_response.text}")
            
    except Exception as e:
        print(f"Fingerprint verification error: {e}")
    
    # Step 3: Test Login Face Verification
    print("\n--- STEP 3: LOGIN - FACE VERIFICATION ---")
    
    try:
        print(f"Verifying face for user: {test_user_id}")
        
        face_payload = {
            "userId": test_user_id,
            "faceEmbedding": [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]
        }
        
        face_response = requests.post(
            f"{backend_url}/auth/verify-face",
            json=face_payload,
            headers={"Content-Type": "application/json"},
            timeout=30
        )
        
        if face_response.status_code == 200:
            face_data = face_response.json()
            if face_data.get('ok') and face_data.get('match'):
                print("FACE VERIFICATION SUCCESS")
                print("Face embedding found in database")
                print("Face matches stored record")
            else:
                print("FACE VERIFICATION FAILED")
                print("Face not found or doesn't match")
        else:
            print(f"Face verification failed: {face_response.text}")
            
    except Exception as e:
        print(f"Face verification error: {e}")
    
    print("\n=== FLOW TEST COMPLETE ===")

if __name__ == "__main__":
    import time
    test_complete_flow()
