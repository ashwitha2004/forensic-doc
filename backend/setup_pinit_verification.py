#!/usr/bin/env python3
"""
Setup script for PINIT verification system
Creates the encrypted_images table and tests the system
"""

import os
import sys
from pathlib import Path

# Add backend directory to path
backend_dir = Path(__file__).parent
sys.path.insert(0, str(backend_dir))

from db.database import get_admin_db

def setup_encrypted_images_table():
    """Create the encrypted_images table"""
    print("🔧 Setting up encrypted_images table...")
    
    try:
        db = get_admin_db()
        
        # Read and execute the SQL file
        sql_file = backend_dir / "CREATE_ENCRYPTED_IMAGES_TABLE.sql"
        with open(sql_file, 'r') as f:
            sql_content = f.read()
        
        # Execute SQL (split by semicolons for multiple statements)
        statements = [stmt.strip() for stmt in sql_content.split(';') if stmt.strip()]
        
        for statement in statements:
            if statement:
                try:
                    result = db.rpc('exec_sql', {'sql': statement}).execute()
                    print(f"✅ Executed: {statement[:50]}...")
                except Exception as e:
                    # Some statements might not be executable via RPC
                    print(f"⚠️  Could not execute via RPC: {statement[:50]}...")
                    print(f"    Error: {str(e)}")
        
        print("✅ Encrypted images table setup completed")
        return True
        
    except Exception as e:
        print(f"❌ Failed to setup encrypted_images table: {str(e)}")
        return False

def test_pinit_verification():
    """Test the PINIT verification system"""
    print("\n🧪 Testing PINIT verification system...")
    
    try:
        db = get_admin_db()
        
        # Test 1: Create a sample encryption record
        print("\n📝 Test 1: Creating sample encryption record...")
        
        sample_record = {
            "watermark_id": "WM-TEST123",
            "pinit_user_id": "USR-TEST456", 
            "image_hash": "test_hash_1234567890abcdef",
            "signature": "PINIT_SECURE_WM",
            "asset_id": "test_asset_789",
            "metadata": {"test": True, "method": "manual"},
            "status": "active",
            "trust_level": 100
        }
        
        result = db.table("encrypted_images").insert(sample_record).execute()
        
        if result.data:
            record = result.data[0]
            print(f"✅ Sample record created: {record['id']}")
            print(f"   - Watermark ID: {record['watermark_id']}")
            print(f"   - User ID: {record['pinit_user_id']}")
        else:
            print("❌ Failed to create sample record")
            return False
        
        # Test 2: Query the record
        print("\n🔍 Test 2: Querying encryption record...")
        
        query_result = db.table("encrypted_images").select("*") \
            .eq("watermark_id", "WM-TEST123") \
            .eq("signature", "PINIT_SECURE_WM") \
            .eq("status", "active").execute()
        
        if query_result.data:
            found_record = query_result.data[0]
            print(f"✅ Record found: {found_record['id']}")
            print(f"   - Trust Level: {found_record['trust_level']}")
        else:
            print("❌ Record not found")
            return False
        
        # Test 3: Clean up test data
        print("\n🧹 Test 3: Cleaning up test data...")
        
        db.table("encrypted_images").delete() \
            .eq("watermark_id", "WM-TEST123").execute()
        
        print("✅ Test data cleaned up")
        
        print("\n🎉 All tests passed! PINIT verification system is working.")
        return True
        
    except Exception as e:
        print(f"❌ Test failed: {str(e)}")
        import traceback
        traceback.print_exc()
        return False

def main():
    """Main setup function"""
    print("=" * 60)
    print("PINIT VERIFICATION SYSTEM SETUP")
    print("=" * 60)
    
    # Setup database table
    if not setup_encrypted_images_table():
        print("\n❌ Setup failed. Please check the error above.")
        return False
    
    # Test the system
    if not test_pinit_verification():
        print("\n❌ Tests failed. Please check the error above.")
        return False
    
    print("\n✅ PINIT verification system setup completed successfully!")
    print("\nNext steps:")
    print("1. Restart your FastAPI server")
    print("2. Test the encryption flow from frontend")
    print("3. Test image verification with uploaded images")
    print("4. Check logs for [ENCRYPT] and [VERIFY] debug messages")
    
    return True

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
