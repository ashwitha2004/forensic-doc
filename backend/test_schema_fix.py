import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")  
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

db = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

print("🔍 Testing biometric_users with schema declaration...")
print()

try:
    # Try with explicit schema 
    result = db.table("public.biometric_users").select("*").execute()
    print("✅ SUCCESS! Table is accessible!")
    print(f"Rows: {len(result.data)}")
    
except Exception as e:
    print(f"❌ Failed: {str(e)}")
    print()
    print("💡 Solution: Recreate table without RLS")
    print("Run this in Supabase SQL Editor:")
    print()
    print("=" * 60)
    with open("CREATE_TABLE_SIMPLE.sql", "r") as f:
        print(f.read())
    print("=" * 60)
