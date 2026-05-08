import requests

share_id = 'share_1776416697513_ae181027'
url = f'https://biovault-backend-d13a.onrender.com/share/public/{share_id}'

response = requests.get(url)
print('Status:', response.status_code)
print('')
print('Raw Response Text (first 2000 chars):')
print(response.text[:2000])
print('')
if '"cloudinary_url"' in response.text:
    print('✅ cloudinary_url IS in response')
else:
    print('❌ cloudinary_url NOT in response')
