from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

app = FastAPI(
    title="PINIT API - Simple Test Server",
    description="Test server for frontend-backend connection",
    version="1.0.0"
)

# CORS — allow React frontend to call this backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:8082",
        "http://localhost:5173",
        "http://127.0.0.1:8082",
        "http://127.0.0.1:5173",
        "http://localhost:8083",
        "http://localhost:3000",
        "http://127.0.0.1:8083",
        "http://127.0.0.1:3000"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    return {"message": "PINIT Backend API is running", "status": "ok"}

@app.post("/auth/biometric-register")
async def biometric_register(payload: dict):
    print(f"📥 Registration request received: {payload}")
    return {"ok": True, "tempCode": "123456", "message": "Registration successful"}

@app.post("/auth/verify-fingerprint")
async def verify_fingerprint(payload: dict):
    print(f"📥 Fingerprint verification request: {payload}")
    return {"verified": True, "userId": payload.get("userId"), "message": "Fingerprint verified"}

@app.post("/auth/verify-face")
async def verify_face(payload: dict):
    print(f"📥 Face verification request: {payload}")
    return {
        "verified": True, 
        "userId": payload.get("userId"), 
        "similarity": 0.95,
        "message": "Face verified",
        "token": "test-token-123",
        "refreshToken": "test-refresh-123"
    }

@app.post("/api/user/check")
async def check_user(payload: dict):
    print(f"📥 User check request: {payload}")
    return {"ok": True, "fingerprintRegistered": True, "faceRegistered": True}

if __name__ == "__main__":
    print("🚀 Starting simple PINIT backend server on http://127.0.0.1:8000")
    uvicorn.run(app, host="0.0.0.0", port=8000)
