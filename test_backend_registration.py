#!/usr/bin/env python3
import requests
import json

# Test the backend biometric registration endpoint
def test_biometric_registration():
    url = "https://biovault-backend-d13a.onrender.com/auth/biometric-register"
    
    payload = {
        "userId": "test123",
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
        "faceEmbedding": [0.1, 0.2, 0.3, 0.4, 0.5]
    }
    
    headers = {
        "Content-Type": "application/json"
    }
    
    try:
        print(f"Testing endpoint: {url}")
        print(f"Payload: {json.dumps(payload, indent=2)}")
        
        response = requests.post(url, json=payload, headers=headers, timeout=30)
        
        print(f"Status Code: {response.status_code}")
        print(f"Response Headers: {dict(response.headers)}")
        print(f"Response Body: {response.text}")
        
        if response.status_code == 200:
            print("SUCCESS: Registration endpoint is working!")
            return True
        else:
            print(f"ERROR: Registration failed with status {response.status_code}")
            return False
            
    except Exception as e:
        print(f"ERROR: Exception occurred: {e}")
        return False

if __name__ == "__main__":
    test_biometric_registration()
