#!/usr/bin/env python3
"""
Direct table creation for encrypted_images table
"""

import os
import sys
from pathlib import Path

# Add backend directory to path
backend_dir = Path(__file__).parent
sys.path.insert(0, str(backend_dir))

from db.database import get_admin_db

def create_table_directly():
    """Create encrypted_images table using direct SQL"""
    print("🔧 Creating encrypted_images table directly...")
    
    try:
        db = get_admin_db()
        
        # Check if table already exists
        try:
            result = db.table("encrypted_images").select("id").limit(1).execute()
            print("✅ Table already exists")
            return True
        except:
            print("📝 Table doesn't exist, creating...")
        
        # Use raw SQL to create table
        import psycopg2
        from dotenv import load_dotenv
        
        # Load environment
        load_dotenv(Path(__file__).parent / ".env")
        
        # Get database URL
        db_url = os.getenv("DATABASE_URL")
        if not db_url:
            print("❌ DATABASE_URL not found in environment")
            return False
        
        # Connect to database directly
        conn = psycopg2.connect(db_url)
        cursor = conn.cursor()
        
        # Create table SQL
        create_table_sql = """
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
        """
        
        cursor.execute(create_table_sql)
        
        # Create indexes
        indexes = [
            "CREATE INDEX IF NOT EXISTS idx_encrypted_images_watermark_id ON encrypted_images(watermark_id);",
            "CREATE INDEX IF NOT EXISTS idx_encrypted_images_pinit_user_id ON encrypted_images(pinit_user_id);",
            "CREATE INDEX IF NOT EXISTS idx_encrypted_images_image_hash ON encrypted_images(image_hash);",
            "CREATE INDEX IF NOT EXISTS idx_encrypted_images_verification ON encrypted_images(watermark_id, signature, status);"
        ]
        
        for index_sql in indexes:
            cursor.execute(index_sql)
        
        # Create trigger function for updated_at
        trigger_function_sql = """
        CREATE OR REPLACE FUNCTION update_encrypted_images_updated_at()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.updated_at = NOW();
            RETURN NEW;
        END;
        $$ language 'plpgsql';
        """
        
        cursor.execute(trigger_function_sql)
        
        # Create trigger
        trigger_sql = """
        DROP TRIGGER IF EXISTS encrypted_images_updated_at ON encrypted_images;
        CREATE TRIGGER encrypted_images_updated_at
            BEFORE UPDATE ON encrypted_images
            FOR EACH ROW
            EXECUTE FUNCTION update_encrypted_images_updated_at();
        """
        
        cursor.execute(trigger_sql)
        
        conn.commit()
        cursor.close()
        conn.close()
        
        print("✅ Table created successfully")
        return True
        
    except Exception as e:
        print(f"❌ Failed to create table: {str(e)}")
        import traceback
        traceback.print_exc()
        return False

def test_table():
    """Test the table by inserting and querying data"""
    print("\n🧪 Testing encrypted_images table...")
    
    try:
        db = get_admin_db()
        
        # Test insert
        test_data = {
            "watermark_id": "WM-TEST001",
            "pinit_user_id": "USR-TEST001",
            "image_hash": "test_hash_1234567890abcdef",
            "signature": "PINIT_SECURE_WM",
            "asset_id": "test_asset_001",
            "metadata": {"test": True},
            "status": "active",
            "trust_level": 100
        }
        
        result = db.table("encrypted_images").insert(test_data).execute()
        
        if result.data:
            record = result.data[0]
            print(f"✅ Test record created: {record['id']}")
            
            # Test query
            query_result = db.table("encrypted_images").select("*") \
                .eq("watermark_id", "WM-TEST001").execute()
            
            if query_result.data:
                print(f"✅ Query successful: {len(query_result.data)} records found")
                
                # Clean up
                db.table("encrypted_images").delete() \
                    .eq("watermark_id", "WM-TEST001").execute()
                
                print("✅ Test data cleaned up")
                return True
            else:
                print("❌ Query failed")
                return False
        else:
            print("❌ Insert failed")
            return False
            
    except Exception as e:
        print(f"❌ Test failed: {str(e)}")
        return False

def main():
    """Main function"""
    print("=" * 60)
    print("ENCRYPTED IMAGES TABLE CREATION")
    print("=" * 60)
    
    if not create_table_directly():
        print("\n❌ Table creation failed")
        return False
    
    if not test_table():
        print("\n❌ Table test failed")
        return False
    
    print("\n✅ Table creation and test completed successfully!")
    print("\nThe encrypted_images table is ready for PINIT verification.")
    return True

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
