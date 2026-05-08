#!/usr/bin/env python3
"""Test biometric_users table access with multiple naming attempts"""
import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

db = create_client(SUPABASE_URL, SUPABASE_KEY)

print("🔍 Testing table access with different names...\n")

table_names = [
    "biometric_users",
    "biometric_users_v2",
    "public.biometric_users",
    "public.biometric_users_v2"
]

for table_name in table_names:
    try:
        result = db.table(table_name).select("*").execute()
        print(f"✅ SUCCESS with table name: {table_name}")
        print(f"   Rows: {len(result.data)}")
        print()
        break
    except Exception as e:
        error_msg = str(e)
        if "PGRST205" in error_msg:
            print(f"❌ {table_name}: Cache issue (PGRST205)")
        elif "not exists" in error_msg.lower():
            print(f"❌ {table_name}: Table not found")
        else:
            print(f"❌ {table_name}: {error_msg[:50]}...")
        print()
