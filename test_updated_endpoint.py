import requests
import json

share_id = 'share_1776416697513_ae181027'
url = f'https://biovault-backend-d13a.onrender.com/share/public/{share_id}'

response = requests.get(url)
print('Status:', response.status_code)

if response.status_code == 200:
    data = response.json()
    print('✅ Share is accessible!')
    print('')
    print('Share Details:')
    print(f'  Share ID: {data.get("share_id")}')
    print(f'  Created: {data.get("created_at")}')
    
    print('')
    print('Image Data:')
    if 'image_data' in data and data['image_data']:
        img_data = data['image_data']
        print(f'  ✅ Vault Image Record: {type(img_data).__name__}')
        if isinstance(img_data, dict):
            print(f'     asset_id: {img_data.get("asset_id")}')
            print(f'     file_name: {img_data.get("file_name")}')
            print(f'     file_size: {img_data.get("file_size")}')
    else:
        print('  ❌ No image_data')
    
    print('')
    print('Cloudinary URL:')
    if data.get('cloudinary_url'):
        print(f'  ✅ {data["cloudinary_url"]}')
    else:
        print('  ❌ No cloudinary_url')
else:
    print('❌ Error accessing share')
    print(response.json())
