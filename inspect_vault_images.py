from backend.db.database import get_admin_db

db = get_admin_db()

# Query one vault image to see its structure
response = db.table('vault_images').select('*').limit(1).execute()

if response.data:
    img = response.data[0]
    print('Vault Image Record Fields:')
    for key, value in img.items():
        value_type = type(value).__name__
        if isinstance(value, (str, int, float, bool, type(None))):
            print(f'  {key}: {value_type}')
        else:
            print(f'  {key}: {value_type}')
else:
    print('No vault images found')
