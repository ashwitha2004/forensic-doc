#!/usr/bin/env python3
"""
Automatically create RPC functions in Supabase to work around schema cache issues
This script connects directly and executes the SQL to set up all functions
"""
import subprocess
import sys
import os
from pathlib import Path
from dotenv import load_dotenv

# Load environment
env_path = Path(__file__).parent / ".env"
load_dotenv(env_path)

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    print("❌ ERROR: Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env")
    sys.exit(1)

print("=" * 80)
print("🔧 CREATING RPC FUNCTIONS FOR BIOMETRIC_USERS")
print("=" * 80)
print()

# Read the SQL file
sql_file = Path(__file__).parent / "SETUP_RPC_IN_SUPABASE.sql"
if not sql_file.exists():
    print(f"❌ ERROR: {sql_file} not found")
    sys.exit(1)

with open(sql_file, 'r') as f:
    sql_content = f.read()

print("📝 Attempting to create RPC functions...")
print()

# Try method 1: Use supabase CLI if available
try:
    print("Method 1: Trying Supabase CLI...")
    # This is a reference - may not work if CLI not installed
    result = subprocess.run(
        ["supabase", "db", "push"],
        capture_output=True,
        text=True,
        timeout=30
    )
    if result.returncode == 0:
        print("✅ Functions created via Supabase CLI!")
        sys.exit(0)
except:
    pass

# Method 2: Try via Python/psycopg2
print("Method 2: Trying direct PostgreSQL connection...")
try:
    import psycopg2
    
    # Parse Supabase URL to get connection details
    # Format: https://xxxxx.supabase.co
    project_id = SUPABASE_URL.split("://")[1].split(".supabase.co")[0]
    
    # Try to connect
    conn = psycopg2.connect(
        host=f"{project_id}.postgres.supabase.co",
        database="postgres",
        user="postgres",
        password=os.getenv("DATABASE_PASSWORD", ""),
        port=5432,
        sslmode='require'
    )
    
    cursor = conn.cursor()
    
    # Split SQL by semicolons and execute each statement
    statements = [s.strip() for s in sql_content.split(';') if s.strip()]
    
    for i, stmt in enumerate(statements, 1):
        print(f"  Executing statement {i}...")
        cursor.execute(stmt)
    
    conn.commit()
    cursor.close()
    conn.close()
    
    print("✅ All RPC functions created successfully!")
    print()
    print("🎉 You can now test the registration flow!")
    
except ImportError:
    print("⚠️  psycopg2 not installed")
except Exception as e:
    print(f"❌ Error: {str(e)}")

print()
print("=" * 80)
print("📋 NEXT STEPS")
print("=" * 80)
print()
print("If automatic creation failed, do this manually:")
print()
print("1. Go to: https://app.supabase.com/project/frepswjymysxwtbwlqla/sql/new")
print("2. Copy the SQL from: SETUP_RPC_IN_SUPABASE.sql")
print("3. Paste it into the SQL Editor")
print("4. Click RUN (Ctrl+⌘)")
print()
print("Then test with: python test_rpc_functions.py")
print()
