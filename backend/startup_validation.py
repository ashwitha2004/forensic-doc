"""
Startup validation script for Render deployment
Validates all dependencies and environment before starting the app
"""
import sys
import os
from pathlib import Path

def validate_startup():
    """Validate all dependencies and environment before app startup"""
    print("=== RENDER STARTUP VALIDATION ===")
    
    # Check Python version
    python_version = sys.version_info
    print(f"Python version: {python_version.major}.{python_version.minor}.{python_version.micro}")
    
    if python_version < (3, 9):
        print("❌ ERROR: Python 3.9+ required")
        return False
    
    # Test critical imports
    print("Testing critical imports...")
    
    try:
        import fastapi
        print(f"✅ fastapi {fastapi.__version__}")
    except ImportError as e:
        print(f"❌ fastapi import failed: {e}")
        return False
    
    try:
        import pydantic
        print(f"✅ pydantic {pydantic.__version__}")
    except ImportError as e:
        print(f"❌ pydantic import failed: {e}")
        return False
    
    try:
        from pydantic import EmailStr
        print("✅ EmailStr validation available")
    except ImportError as e:
        print(f"❌ EmailStr import failed: {e}")
        return False
    
    try:
        import email_validator
        print(f"✅ email_validator {email_validator.__version__}")
    except ImportError as e:
        print(f"❌ email_validator import failed: {e}")
        return False
    
    try:
        import sqlalchemy
        print(f"✅ sqlalchemy {sqlalchemy.__version__}")
    except ImportError as e:
        print(f"❌ sqlalchemy import failed: {e}")
        return False
    
    try:
        import psycopg2
        print(f"✅ psycopg2 {psycopg2.__version__}")
    except ImportError as e:
        print(f"❌ psycopg2 import failed: {e}")
        return False
    
    try:
        import bcrypt
        print(f"✅ bcrypt {bcrypt.__version__}")
    except ImportError as e:
        print(f"❌ bcrypt import failed: {e}")
        return False
    
    try:
        from jose import jwt
        print("✅ python-jose JWT available")
    except ImportError as e:
        print(f"❌ python-jose import failed: {e}")
        return False
    
    try:
        import uvicorn
        print(f"✅ uvicorn {uvicorn.__version__}")
    except ImportError as e:
        print(f"❌ uvicorn import failed: {e}")
        return False
    
    # Check environment variables
    print("Checking environment variables...")
    
    required_env_vars = [
        'SUPABASE_URL',
        'SUPABASE_SERVICE_KEY',
        'JWT_SECRET'
    ]
    
    missing_env_vars = []
    for var in required_env_vars:
        if not os.getenv(var):
            missing_env_vars.append(var)
    
    if missing_env_vars:
        print(f"❌ Missing environment variables: {missing_env_vars}")
        print("These must be set in Render dashboard")
        return False
    else:
        print("✅ All required environment variables set")
    
    # Test app import
    print("Testing app import...")
    try:
        from main import app
        print("✅ FastAPI app imported successfully")
        print(f"App title: {app.title}")
    except ImportError as e:
        print(f"❌ App import failed: {e}")
        return False
    except Exception as e:
        print(f"❌ App startup error: {e}")
        return False
    
    print("=== VALIDATION SUCCESSFUL ===")
    return True

if __name__ == "__main__":
    if validate_startup():
        print("🚀 Ready to start application")
        sys.exit(0)
    else:
        print("💥 Startup validation failed")
        sys.exit(1)
