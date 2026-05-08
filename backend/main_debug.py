"""
DEBUG VERSION - Step-by-step startup debugging
This version isolates exact startup failure point
"""
import os
import sys

print("🚀 STARTUP DEBUGGING")
print("=" * 50)

# STEP 1: Basic Python environment
print("STEP 1: Python environment check")
print(f"Python version: {sys.version}")
print(f"Current working directory: {os.getcwd()}")

# STEP 2: Environment variables validation
print("\nSTEP 2: Environment variables validation")
required_vars = [
    "SUPABASE_URL",
    "SUPABASE_SERVICE_KEY", 
    "JWT_SECRET",
    "RP_ID",
    "RP_NAME"
]

missing_vars = []
for var in required_vars:
    value = os.getenv(var)
    if value:
        print(f"✅ {var}: SET")
    else:
        print(f"❌ {var}: MISSING")
        missing_vars.append(var)

if missing_vars:
    print(f"\n🔴 CRITICAL: Missing environment variables: {missing_vars}")
    print("Application cannot start without these variables")
    sys.exit(1)

# STEP 3: Basic imports
print("\nSTEP 3: Basic imports")
try:
    from fastapi import FastAPI
    print("✅ FastAPI imported")
except Exception as e:
    print(f"❌ FastAPI import failed: {e}")
    sys.exit(1)

try:
    from fastapi.middleware.cors import CORSMiddleware
    print("✅ CORSMiddleware imported")
except Exception as e:
    print(f"❌ CORSMiddleware import failed: {e}")
    sys.exit(1)

try:
    from fastapi.responses import RedirectResponse, FileResponse
    print("✅ FastAPI responses imported")
except Exception as e:
    print(f"❌ FastAPI responses import failed: {e}")
    sys.exit(1)

try:
    from fastapi.staticfiles import StaticFiles
    print("✅ StaticFiles imported")
except Exception as e:
    print(f"❌ StaticFiles import failed: {e}")
    sys.exit(1)

try:
    from dotenv import load_dotenv
    print("✅ dotenv imported")
except Exception as e:
    print(f"❌ dotenv import failed: {e}")
    sys.exit(1)

try:
    from pathlib import Path
    print("✅ pathlib imported")
except Exception as e:
    print(f"❌ pathlib import failed: {e}")
    sys.exit(1)

# STEP 4: Environment loading
print("\nSTEP 4: Environment loading")
try:
    env_path = Path(__file__).parent / ".env"
    print(f"Environment path: {env_path}")
    load_dotenv(env_path)
    print("✅ Environment loaded")
except Exception as e:
    print(f"❌ Environment loading failed: {e}")
    sys.exit(1)

# STEP 5: Router imports (MOST LIKELY FAILURE POINT)
print("\nSTEP 5: Router imports")
try:
    from routers import auth, vault, pinit_verification
    print("✅ All routers imported successfully")
    print(f"  - auth router: {auth}")
    print(f"  - vault router: {vault}")
    print(f"  - pinit_verification router: {pinit_verification}")
except ImportError as e:
    print(f"❌ Router import failed: {e}")
    print("This is likely the crash point!")
    sys.exit(1)
except Exception as e:
    print(f"❌ Router import error: {e}")
    print("This is likely the crash point!")
    sys.exit(1)

# STEP 6: Database imports
print("\nSTEP 6: Database imports")
try:
    from db.database import get_admin_db
    print("✅ Database module imported")
except ImportError as e:
    print(f"❌ Database import failed: {e}")
    print("This is likely the crash point!")
    sys.exit(1)
except Exception as e:
    print(f"❌ Database import error: {e}")
    print("This is likely the crash point!")
    sys.exit(1)

# STEP 7: Supabase test
print("\nSTEP 7: Supabase connection test")
try:
    from supabase import create_client
    supabase_url = os.getenv("SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_SERVICE_KEY")
    if supabase_url and supabase_key:
        client = create_client(supabase_url, supabase_key)
        print("✅ Supabase client created successfully")
    else:
        print("❌ Supabase credentials missing")
        sys.exit(1)
except ImportError as e:
    print(f"❌ Supabase import failed: {e}")
    print("This is likely the crash point!")
    sys.exit(1)
except Exception as e:
    print(f"❌ Supabase connection error: {e}")
    print("This is likely the crash point!")
    sys.exit(1)

# STEP 8: FastAPI app creation
print("\nSTEP 8: FastAPI app creation")
try:
    app = FastAPI(
        title       = "PINIT API",
        description = "Image Forensics & Verification Platform",
        version     = "1.0.0"
    )
    print("✅ FastAPI app created successfully")
except Exception as e:
    print(f"❌ FastAPI app creation failed: {e}")
    print("This is likely the crash point!")
    sys.exit(1)

# STEP 9: CORS middleware
print("\nSTEP 9: CORS middleware")
try:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            # Production Vercel (will be updated with actual domain)
            "https://pinit-vault-frontend.vercel.app",
            "https://*.vercel.app",
            # Mobile apps
            "capacitor://",
            "file://",
            # Fallback for development
            "*"
        ],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"]
    )
    print("✅ CORS middleware added")
except Exception as e:
    print(f"❌ CORS middleware failed: {e}")
    print("This is likely the crash point!")
    sys.exit(1)

# STEP 10: Router registration
print("\nSTEP 10: Router registration")
try:
    app.include_router(auth.router, prefix="/auth")
    print("✅ Auth router registered")
except Exception as e:
    print(f"❌ Auth router registration failed: {e}")
    print("This is likely the crash point!")
    sys.exit(1)

try:
    app.include_router(vault.router, prefix="/vault")
    print("✅ Vault router registered")
except Exception as e:
    print(f"❌ Vault router registration failed: {e}")
    print("This is likely the crash point!")
    sys.exit(1)

try:
    app.include_router(pinit_verification.router, prefix="/pinit")
    print("✅ PINIT verification router registered")
except Exception as e:
    print(f"❌ PINIT verification router registration failed: {e}")
    print("This is likely the crash point!")
    sys.exit(1)

# STEP 11: Basic routes
print("\nSTEP 11: Basic routes")
try:
    @app.get("/")
    def root():
        return {
            "app": "PINIT API",
            "status": "running",
            "debug": True
        }

    @app.get("/health")
    def health():
        return {"status": "ok"}
    
    print("✅ Basic routes created")
except Exception as e:
    print(f"❌ Basic routes creation failed: {e}")
    print("This is likely the crash point!")
    sys.exit(1)

# STEP 12: Complete
print("\n" + "=" * 50)
print("🎉 STARTUP COMPLETE - No crashes detected!")
print("✅ Application ready to start")
print("=" * 50)

if __name__ == "__main__":
    print("\n🚀 Starting uvicorn...")
    try:
        import uvicorn
        uvicorn.run("main_debug:app", host="0.0.0.0", port=8000, reload=True)
    except Exception as e:
        print(f"❌ Uvicorn startup failed: {e}")
        sys.exit(1)
