#!/usr/bin/env python3
"""
Simple table creation using Supabase SQL editor approach
"""

import os
import sys
from pathlib import Path

# Add backend directory to path
backend_dir = Path(__file__).parent
sys.path.insert(0, str(backend_dir))

from db.database import get_admin_db

def test_and_create_table():
    """Test if table exists and create if needed"""
    print("🔧 Testing encrypted_images table...")
    
    try:
        db = get_admin_db()
        
        # Try to access the table
        try:
            result = db.table("encrypted_images").select("id").limit(1).execute()
            print("✅ Table already exists")
            return True
        except Exception as e:
            print(f"📝 Table doesn't exist: {str(e)}")
            print("\n🔧 Please create the table manually using the SQL below:")
            print("=" * 60)
            
            sql_content = """
-- Create encrypted_images table
CREATE TABLE IF NOT EXISTS encrypted_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    watermark_id VARCHAR(50) UNIQUE NOT NULL,
    pinit_user_id VARCHAR(50) NOT NULL,
    image_hash VARCHAR(128) NOT NULL,
    signature VARCHAR(50) DEFAULT 'PINIT_SECURE_WM',
    encrypted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    status VARCHAR(20) DEFAULT 'active',
    trust_level INTEGER DEFAULT 100,
    asset_id VARCHAR(100),
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_encrypted_images_watermark_id ON encrypted_images(watermark_id);
CREATE INDEX IF NOT EXISTS idx_encrypted_images_pinit_user_id ON encrypted_images(pinit_user_id);
CREATE INDEX IF NOT EXISTS idx_encrypted_images_image_hash ON encrypted_images(image_hash);
CREATE INDEX IF NOT EXISTS idx_encrypted_images_verification ON encrypted_images(watermark_id, signature, status);

-- Create trigger function for updated_at
CREATE OR REPLACE FUNCTION update_encrypted_images_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger
DROP TRIGGER IF EXISTS encrypted_images_updated_at ON encrypted_images;
CREATE TRIGGER encrypted_images_updated_at
    BEFORE UPDATE ON encrypted_images
    FOR EACH ROW
    EXECUTE FUNCTION update_encrypted_images_updated_at();
"""
            
            print(sql_content)
            print("=" * 60)
            print("\n📋 Instructions:")
            print("1. Go to your Supabase dashboard")
            print("2. Navigate to SQL Editor")
            print("3. Copy and paste the SQL above")
            print("4. Run the SQL to create the table")
            print("5. After creating the table, run this script again to test")
            
            return False
            
    except Exception as e:
        print(f"❌ Error: {str(e)}")
        return False

def test_table_operations():
    """Test basic table operations"""
    print("\n🧪 Testing table operations...")
    
    try:
        db = get_admin_db()
        
        # Test insert
        test_record = {
            "watermark_id": "WM-TEST123",
            "pinit_user_id": "USR-TEST456",
            "image_hash": "test_hash_1234567890abcdef",
            "signature": "PINIT_SECURE_WM",
            "asset_id": "test_asset_789",
            "metadata": {"test": True, "method": "manual"},
            "status": "active",
            "trust_level": 100
        }
        
        print("📝 Inserting test record...")
        result = db.table("encrypted_images").insert(test_record).execute()
        
        if result.data:
            record = result.data[0]
            print(f"✅ Record created: {record['id']}")
            print(f"   - Watermark ID: {record['watermark_id']}")
            print(f"   - User ID: {record['pinit_user_id']}")
            
            # Test query
            print("🔍 Querying record...")
            query_result = db.table("encrypted_images").select("*") \
                .eq("watermark_id", "WM-TEST123").execute()
            
            if query_result.data:
                found_record = query_result.data[0]
                print(f"✅ Record found: {found_record['trust_level']}")
                
                # Clean up
                print("🧹 Cleaning up test data...")
                db.table("encrypted_images").delete() \
                    .eq("watermark_id", "WM-TEST123").execute()
                
                print("✅ Test completed successfully!")
                return True
            else:
                print("❌ Query failed")
                return False
        else:
            print("❌ Insert failed")
            return False
            
    except Exception as e:
        print(f"❌ Test failed: {str(e)}")
        import traceback
        traceback.print_exc()
        return False

def main():
    """Main function"""
    print("=" * 60)
    print("ENCRYPTED IMAGES TABLE SETUP")
    print("=" * 60)
    
    # Test if table exists
    if not test_and_create_table():
        print("\n❌ Please create the table manually first")
        return False
    
    # Test operations
    if not test_table_operations():
        print("\n❌ Table operations test failed")
        return False
    
    print("\n✅ All tests passed! PINIT verification system is ready.")
    print("\nNext steps:")
    print("1. Restart your FastAPI server")
    print("2. Test encryption from frontend")
    print("3. Test verification with uploaded images")
    
    return True

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
