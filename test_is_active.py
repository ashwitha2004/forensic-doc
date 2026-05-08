from backend.db.database import get_admin_db

db = get_admin_db()
share_id = 'share_1776416697513_ae181027'
response = db.table('share_configs').select('*').eq('share_id', share_id).execute()

if response.data:
    share = response.data[0]
    if share.get('is_active'):
        print(f'✅ is_active: True')
    else:
        print(f'❌ is_active: {share.get("is_active")}')
else:
    print('❌ Share not found')
