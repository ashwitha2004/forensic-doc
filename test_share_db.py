from backend.db.database import get_admin_db
from datetime import datetime

db = get_admin_db()

# Query the share directly
share_id = 'share_1776416577589_b52fd6b1'
response = db.table('share_configs').select('*').eq('share_id', share_id).execute()

if response.data:
    share = response.data[0]
    print('✅ Share found in database!')
    print('')
    print('Field Values:')
    print(f'  is_active: {share.get("is_active")} (type: {type(share.get("is_active")).__name__})')
    print(f'  expiry_date: {share.get("expiry_date")}')
    print(f'  created_at: {share.get("created_at")}')
    print(f'  user_id: {share.get("user_id")}')
    print(f'  download_limit: {share.get("download_limit")}')
    print('')
    
    # Check what's happening with is_active
    is_active = share.get("is_active")
    if is_active is None:
        print('⚠️ is_active is None (might be NULL in database)')
    elif is_active is False:
        print('⚠️ is_active is False')
    elif is_active is True:
        print('✅ is_active is True')
    else:
        print(f'❓ is_active is {is_active} (unexpected type)')
        
else:
    print('❌ Share NOT found in database!')
