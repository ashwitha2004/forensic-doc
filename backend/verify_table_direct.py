import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()

# Get connection string from Supabase
SUPABASE_URL = os.getenv("SUPABASE_URL", "https://frepswjymysxwtbwlqla.supabase.co")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

# Extract database connection details from environment
db_host = os.getenv("DATABASE_HOST", "frepswjymysxwtbwlqla.postgres.supabase.co")
db_name = os.getenv("DATABASE_NAME", "postgres")
db_user = os.getenv("DATABASE_USER", "postgres")
db_password = os.getenv("DATABASE_PASSWORD")

print("🔍 Connecting directly to PostgreSQL database...")
print(f"📍 Host: {db_host}")
print(f"📍 Database: {db_name}")
print()

try:
    conn = psycopg2.connect(
        host=db_host,
        database=db_name,
        user=db_user,
        password=db_password,
        port=5432,
        sslmode='require'
    )
    
    cursor = conn.cursor()
    
    # Check if table exists
    cursor.execute("""
        SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_name = 'biometric_users'
        );
    """)
    
    table_exists = cursor.fetchone()[0]
    
    if table_exists:
        print("✅ biometric_users TABLE EXISTS!")
        print()
        
        # Get table schema
        cursor.execute("""
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns
            WHERE table_name = 'biometric_users'
            ORDER BY ordinal_position;
        """)
        
        print("📋 Table Schema:")
        print("─" * 60)
        for col_name, data_type, is_nullable in cursor.fetchall():
            nullable = "NULL" if is_nullable == "YES" else "NOT NULL"
            print(f"  {col_name:<25} {data_type:<20} {nullable}")
        print("─" * 60)
        print()
        
        # Count rows
        cursor.execute("SELECT COUNT(*) FROM biometric_users;")
        row_count = cursor.fetchone()[0]
        print(f"📊 Rows in table: {row_count}")
        print()
        
        # Check RLS status
        cursor.execute("""
            SELECT relrowsecurity 
            FROM pg_class 
            WHERE relname = 'biometric_users';
        """)
        rls_enabled = cursor.fetchone()[0]
        print(f"🔐 RLS Enabled: {'YES' if rls_enabled else 'NO'}")
        print()
        
        # List policies
        cursor.execute("""
            SELECT policyname, cmd 
            FROM pg_policies 
            WHERE tablename = 'biometric_users';
        """)
        
        policies = cursor.fetchall()
        if policies:
            print("📋 RLS Policies:")
            for policy_name, cmd in policies:
                print(f"  - {policy_name} ({cmd})")
        print()
        
        print("✅ TABLE IS READY FOR USE!")
        print()
        print("Next steps:")
        print("  1. Go to your mobile app")
        print("  2. Test the registration flow")
        print("  3. Run this script again to see if data was stored")
        
    else:
        print("❌ biometric_users TABLE DOES NOT EXIST")
        print()
        print("⚠️  The table wasn't created properly.")
        print("Try running CREATE_TABLE_ONLY.sql again in Supabase SQL Editor")
    
    cursor.close()
    conn.close()

except Exception as e:
    print(f"❌ Error connecting to database:")
    print(f"   {str(e)}")
    print()
    print("Make sure your .env file has:")
    print("  - DATABASE_HOST")
    print("  - DATABASE_NAME")
    print("  - DATABASE_USER")
    print("  - DATABASE_PASSWORD")
