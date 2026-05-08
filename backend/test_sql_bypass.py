"""
Workaround for Supabase PostgREST cache issues
Uses raw SQL via Supabase client to bypass REST API introspection
"""
import os
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

# Initialize Supabase
supabase_url = os.getenv("SUPABASE_URL")
supabase_key = os.getenv("SUPABASE_SERVICE_KEY")  # Use service key for raw SQL
client: Client = create_client(supabase_url, supabase_key)

print("🔍 Testing biometric_users table via SQL...")
print()

try:
    # Execute raw SQL to check table
    result = client.postgrest.session.execute(
        "SELECT * FROM biometric_users LIMIT 1;"
    )
    
    print("✅ SQL Query Successful!")
    print(f"Result: {result}")
    
except Exception as e:
    print(f"❌ Error: {str(e)}")
    print()
    print("Try this in Supabase SQL Editor:")
    print("ALTER TABLE biometric_users DISABLE ROW LEVEL SECURITY;")
