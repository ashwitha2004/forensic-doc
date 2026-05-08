#!/usr/bin/env python3
import requests
import json

# Test if the backend has fingerprint verification endpoint
def test_fingerprint_verification_endpoint():
    url = "https://biovault-backend-d13a.onrender.com/auth/verify-fingerprint"
    
    payload = {
        "userId": "test123",
        "credential": "test-fingerprint-credential"
    }
    
    headers = {
        "Content-Type": "application/json"
    }
    
    try:
        print(f"Testing fingerprint verification endpoint: {url}")
        print(f"Payload: {json.dumps(payload, indent=2)}")
        
        response = requests.post(url, json=payload, headers=headers, timeout=30)
        
        print(f"Status Code: {response.status_code}")
        print(f"Response Headers: {dict(response.headers)}")
        print(f"Response Body: {response.text}")
        
        if response.status_code == 200:
            print("SUCCESS: Fingerprint verification endpoint is working!")
            return True
        elif response.status_code == 404:
            print("ERROR: Fingerprint verification endpoint not found - need to implement it")
            return False
        else:
            print(f"ERROR: Verification failed with status {response.status_code}")
            return False
            
    except Exception as e:
        print(f"ERROR: Exception occurred: {e}")
        return False

# Also test the main API endpoints
def test_available_endpoints():
    base_url = "https://biovault-backend-d13a.onrender.com"
    
    endpoints = [
        "/",
        "/docs",
        "/openapi.json",
        "/auth/biometric-register",
        "/auth/verify-face",
        "/auth/verify-fingerprint"
    ]
    
    print("\n=== Testing Available Endpoints ===")
    for endpoint in endpoints:
        try:
            if endpoint == "/auth/biometric-register" or endpoint == "/auth/verify-face" or endpoint == "/auth/verify-fingerprint":
                # POST endpoints
                response = requests.post(base_url + endpoint, json={}, timeout=10)
            else:
                # GET endpoints
                response = requests.get(base_url + endpoint, timeout=10)
            
            print(f"{endpoint}: {response.status_code}")
        except Exception as e:
            print(f"{endpoint}: ERROR - {e}")

if __name__ == "__main__":
    test_fingerprint_verification_endpoint()
    test_available_endpoints()
