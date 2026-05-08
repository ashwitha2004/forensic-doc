import requests
import json

print("🔗 Testing Share Link...\n")

# Test the public API endpoint
share_id = 'share_1776416697513_ae181027'
api_url = f'https://biovault-backend-d13a.onrender.com/share/public/{share_id}'
page_url = f'https://biovault-backend-d13a.onrender.com/share/{share_id}'

print(f"API Endpoint: {api_url}")
api_response = requests.get(api_url)
print(f"Status: {api_response.status_code}")

if api_response.status_code == 200:
    data = api_response.json()
    print("✅ API responds with:")
    print(f"   - Share ID: {data.get('share_id')}")
    print(f"   - Cloudinary URL: {data.get('cloudinary_url')}")
    print(f"   - Image File: {data.get('image_data', {}).get('file_name')}")
    print("")

print(f"\n🔗 Share Page: {page_url}")
print("Visit this URL in a browser to see the image displayed!\n")

# Quick check if page loads
page_response = requests.get(page_url, timeout=5)
print(f"Page Status: {page_response.status_code}")
print(f"Page Size: {len(page_response.text)} bytes")

if len(page_response.text) > 5000:
    print("✅ Frontend is deployed and serving!")
else:
    print("⏳ Frontend may still be deploying...")
