"""
MINIMAL TEST VERSION - Test if basic FastAPI can start
This isolates the issue to imports/startup logic
"""
from fastapi import FastAPI

print("🚀 MINIMAL FASTAPI TEST")
print("=" * 40)

app = FastAPI(
    title="PINIT API - Minimal Test",
    description="Minimal test version",
    version="1.0.0"
)

@app.get("/")
def root():
    return {
        "app": "PINIT API",
        "status": "minimal-test-working",
        "message": "Basic FastAPI is working"
    }

@app.get("/health")
def health():
    return {"status": "ok"}

print("✅ Minimal FastAPI app created successfully")
print("✅ Basic routes defined")
print("🎉 MINIMAL APP READY")

if __name__ == "__main__":
    print("\n🚀 Starting minimal uvicorn...")
    import uvicorn
    uvicorn.run("main_minimal:app", host="0.0.0.0", port=8000, reload=True)
