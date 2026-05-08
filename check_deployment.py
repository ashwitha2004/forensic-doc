import requests
import time

print("🔄 Checking for deployment...")
for i in range(5):
    try:
        response = requests.get('https://biovault-backend-d13a.onrender.com/share/public/share_1776416697513_ae181027')
        if 'cloudinary_url' in response.text:
            print(f"✅ Deployed! (Attempt {i+1})")
            break
        else:
            print(f"⏳ Still deploying... (Attempt {i+1})")
    except:
        print(f"❌ Connection error (Attempt {i+1})")
    
    if i < 4:
        time.sleep(10)
        print("   waiting...")
