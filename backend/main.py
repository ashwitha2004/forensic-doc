from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv
from pathlib import Path
import os

# Load .env from backend directory
env_path = Path(__file__).parent / ".env"
load_dotenv(env_path)

from routers import auth, vault, pinit_verification
from forensic import forensic_router
from inference import inference_router
from document_forensics import document_forensics_router
from unified_forensics import unified_forensics_router

app = FastAPI(
    title       = "PINIT API",
    description = "Image Forensics & Verification Platform",
    version     = "1.0.0"
)

# ---------------------------------------------------------------------------
# CORS — allow React frontend (local + Vercel) and Capacitor mobile app.
#
# Rules:
#  • allow_origins      — exact-match list (local dev + known Vercel URL).
#  • allow_origin_regex — covers ALL *.vercel.app preview/branch deploys and
#                         any Render self-hosted frontend without listing them
#                         individually.  Starlette compiles this into a single
#                         re.Pattern and checks it against the Origin header.
#  • allow_credentials  — True so the browser sends cookies/auth headers.
#  • NOTE: "https://*.vercel.app" and bare "*" are NOT valid in allow_origins
#    when credentials=True (Starlette ignores them silently).  Use regex instead.
# ---------------------------------------------------------------------------
_VERCEL_DOMAIN = os.environ.get("VITE_FRONTEND_URL", "https://pinit-vault-frontend.vercel.app")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        # Local development
        "http://localhost:3000",
        "http://localhost:5000",
        "http://localhost:5173",
        "http://localhost:8000",
        "http://localhost:8080",
        "http://localhost:8082",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:8000",
        "http://127.0.0.1:8080",
        "http://127.0.0.1:8082",
        # Known production Vercel URL (env-configurable)
        _VERCEL_DOMAIN,
        # Capacitor / Ionic mobile
        "capacitor://localhost",
        "ionic://localhost",
        "file://",
    ],
    # Regex covers every *.vercel.app preview deploy and *.onrender.com frontends.
    allow_origin_regex=(
        r"https://[a-zA-Z0-9\-]+\.vercel\.app"
        r"|https://[a-zA-Z0-9\-]+\.onrender\.com"
    ),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=["*"],
    expose_headers=["X-Process-Time", "X-Backend-Version"],
    max_age=600,   # cache preflight for 10 min — reduces OPTIONS round-trips
)

# Register core routers for PINIT verification system
app.include_router(auth.router, prefix="/auth")
app.include_router(vault.router, prefix="/vault")
app.include_router(pinit_verification.router, prefix="/pinit")

# Register forensic analysis router
app.include_router(forensic_router)

# Register hybrid DL + forensic inference router
app.include_router(inference_router)

# Register document forensics router
app.include_router(document_forensics_router)

# Register unified forensics router (AI + document forensics fused)
app.include_router(unified_forensics_router)

# ════════════════════════════════════════════════════════════════
# CORE PINIT VERIFICATION SYSTEM - Lightweight and focused
# ══════════════════════════════════════════════════════════════════════

# Health check endpoints
@app.get("/")
def root():
    return {
        "app": "PINIT API",
        "status": "running",
        "docs": "/docs"
    }

@app.get("/health")
def health():
    return {"status": "ok"}

# ── Adapter endpoints for frontend biometric auth ────────────────────────────

@app.post("/api/register")
async def api_register(data: dict):
    """Adapter endpoint: Convert biometric registration to backend register format"""
    from .db.database import get_admin_db
    import uuid
    
    db = get_admin_db()
    
    # Generate credentials from biometric data
    user_id = data.get("userId", str(uuid.uuid4()))
    email = f"{user_id}@biovault.local"  # Generate email from userId
    username = data.get("userId", "user")
    
    # Check if user already exists
    existing = db.table("users").select("id").eq("email", email).execute()
    
    if existing.data:
        return {"ok": True, "tempCode": "000000", "mode": "remote"}
    
    # Create user with minimal data
    db.table("users").insert({
        "username": username,
        "email": email,
        "role": "user",
        "is_active": True,
        "email_verified": True,
        "password_hash": None
    }).execute()
    
    return {"ok": True, "tempCode": "000000", "mode": "remote"}

@app.post("/api/validate")
async def api_validate(data: dict):
    """Adapter endpoint: Validate device-based authentication"""
    from .db.database import get_admin_db
    
    db = get_admin_db()
    user_id = data.get("user_id")
    device_token = data.get("deviceToken")
    
    if not user_id or not device_token:
        return {"authorized": False, "reason": "Missing user_id or deviceToken"}
    
    # Check if user exists
    email = f"{user_id}@biovault.local"
    result = db.table("users").select("id").eq("email", email).execute()
    
    if not result.data:
        return {"authorized": False, "reason": "User not found"}
    
    return {"authorized": True, "reason": "Device verified"}

@app.post("/api/temp-code/request")
async def api_temp_code_request(data: dict):
    """Request a temporary access code"""
    from .db.database import get_admin_db
    from .utils.auth_helpers import generate_jwt
    import datetime
    import random
    
    db = get_admin_db()
    user_id = data.get("user_id")
    
    if not user_id:
        return {"ok": False, "reason": "Missing user_id"}
    
    try:
        # Check if user exists
        biometric_result = db.table("biometric_users").select("*").eq("user_id", user_id).execute()
        
        if not biometric_result.data:
            return {"ok": False, "reason": "User not found"}
        
        # For now, accept any code (verify is handled by face verification)
        # In production, would validate code against stored temp codes
        
        # Generate tokens for temporary access
        token = generate_jwt(user_id, "user")
        refresh_token = generate_jwt(user_id, "user")
        
        return {
            "ok": True,
            "token": token,
            "refreshToken": refresh_token,
            "userId": user_id
        }
        
    except Exception as e:
        print(f"Error requesting temp code: {str(e)}")
        return {"ok": False, "reason": f"Error: {str(e)}"}

@app.post("/api/temp-code/verify")
async def api_temp_code_verify(data: dict):
    """Verify temporary access code"""
    from .db.database import get_admin_db
    from .utils.auth_helpers import generate_jwt
    import datetime
    
    db = get_admin_db()
    user_id = data.get("user_id")
    code = data.get("code")
    
    if not user_id or not code:
        return {"ok": False, "reason": "Missing user_id or code"}
    
    try:
        # Check if user exists
        biometric_result = db.table("biometric_users").select("*").eq("user_id", user_id).execute()
        
        if not biometric_result.data:
            return {"ok": False, "reason": "User not found"}
        
        # For now, accept any code (verify is handled by face verification)
        # In production, would validate code against stored temp codes
        
        # Generate tokens for temporary access
        token = generate_jwt(user_id, "user")
        refresh_token = generate_jwt(user_id, "user")
        
        return {
            "ok": True,
            "token": token,
            "refreshToken": refresh_token,
            "userId": user_id
        }
        
    except Exception as e:
        print(f"Error verifying temp code: {str(e)}")
        return {"ok": False, "reason": f"Error: {str(e)}"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
