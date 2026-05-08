import requests
import json

share_id = 'share_1776416697513_ae181027'
url = f'https://biovault-backend-d13a.onrender.com/share/public/{share_id}'

response = requests.get(url)
print('Status:', response.status_code)

if response.status_code == 200:
    data = response.json()
    print('✅ Share is accessible!')
    print(f'  Share ID: {data.get("share_id")}')
    print(f'  Created: {data.get("created_at")}')
    
    if 'image_data' in data and data['image_data']:
        img_data = data['image_data']
        print(f'  ✅ Image Data: {len(img_data):,} bytes')
        print(f'     Preview: {str(img_data)[:100]}...')
    else:
        print('  ❌ No image data returned')
        print(f'  Response keys: {list(data.keys())}')
else:
    print('❌ Error accessing share')
    print(response.json())
