from supabase import create_client
from dotenv import load_dotenv
import os

load_dotenv()

url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_KEY")

supabase = create_client(url, key)

# Try reading users table
result = supabase.table("users").select("*").execute()
print("Connection successful!")
print(f"Users in DB: {len(result.data)}")