from fastapi import APIRouter, HTTPException, Request, UploadFile, File
from db.database import get_admin_db
from models.schemas import (
    EncryptionRecordCreate, 
    EncryptionRecordResponse,
    VerificationRequest, 
    VerificationResponse,
    WatermarkExtraction
)
from utils.auth_helpers import log_action
from detector.unified_verifier import verify_image
from detector.camera_detector import detect_camera_origin
import uuid
import hashlib
import json
import base64
import tempfile
import os
from datetime import datetime
from typing import Optional, Dict, Any

router = APIRouter(tags=["PINIT Verification"])


def generate_watermark_id() -> str:
    """Generate unique watermark ID in WM-XXXXX format"""
    unique_id = str(uuid.uuid4()).replace('-', '')[:8]
    return f"WM-{unique_id.upper()}"


def generate_image_hash(image_base64: str) -> str:
    """Generate SHA256 hash of image data"""
    # Clean base64 if it's a data URL
    if image_base64.startswith("data:"):
        image_base64 = image_base64.split(",")[1]
    
    return hashlib.sha256(image_base64.encode()).hexdigest()


def extract_watermark_from_image(image_base64: str) -> WatermarkExtraction:
    """
    Extract watermark data from image metadata and hidden layers
    This is a simplified implementation - in production, use steganography
    """
    print(f"[VERIFY] Extracting watermark from image...")
    
    try:
        # For now, simulate watermark extraction from metadata
        # In production, this would use actual steganography algorithms
        
        # Simulate finding watermark in EXIF/metadata
        extracted_data = {
            "watermark_id": None,
            "pinit_user_id": None, 
            "signature": None
        }
        
        # Try to extract from base64 metadata (simplified)
        if "WM-" in image_base64[:1000]:  # Check first 1000 chars for watermark
            # This is a placeholder for actual extraction logic
            extracted_data["watermark_id"] = "WM-DEMO123"
            extracted_data["pinit_user_id"] = "USR-DEMO456"
            extracted_data["signature"] = "PINIT_SECURE_WM"
            confidence = 0.95
        else:
            confidence = 0.0
        
        print(f"[VERIFY] Extraction result: {extracted_data}")
        print(f"[VERIFY] Extraction confidence: {confidence}")
        
        return WatermarkExtraction(
            watermark_id=extracted_data["watermark_id"],
            pinit_user_id=extracted_data["pinit_user_id"],
            signature=extracted_data["signature"],
            extraction_confidence=confidence,
            metadata={"extraction_method": "metadata_scan"}
        )
        
    except Exception as e:
        print(f"[VERIFY] Watermark extraction failed: {str(e)}")
        return WatermarkExtraction(
            extraction_confidence=0.0,
            metadata={"error": str(e)}
        )


def calculate_trust_score(
    watermark_extracted: bool,
    db_record_found: bool,
    signature_valid: bool,
    hash_match: Optional[bool] = None
) -> int:
    """Calculate trust score based on verification factors"""
    score = 0
    
    if watermark_extracted:
        score += 30
    
    if db_record_found:
        score += 40
    
    if signature_valid:
        score += 25
    
    if hash_match is not None:
        if hash_match:
            score += 5
        else:
            score -= 10
    
    return max(0, min(100, score))


@router.post("/encrypt")
async def create_encryption_record(
    data: EncryptionRecordCreate,
    request: Request
):
    """
    Create encryption record when user encrypts an image
    This should be called during the encryption process
    """
    db = get_admin_db()
    
    print(f"[ENCRYPT] Creating encryption record...")
    print(f"[ENCRYPT] User ID: {data.pinit_user_id}")
    print(f"[ENCRYPT] Watermark ID: {data.watermark_id}")
    print(f"[ENCRYPT] Image Hash: {data.image_hash[:16]}...")
    
    try:
        # Check if watermark_id already exists
        existing = db.table("encrypted_images").select("id") \
            .eq("watermark_id", data.watermark_id).execute()
        
        if existing.data:
            print(f"[ENCRYPT] Watermark ID already exists: {data.watermark_id}")
            raise HTTPException(status_code=400, detail="Watermark ID already exists")
        
        # Insert encryption record
        record_data = {
            "watermark_id": data.watermark_id,
            "pinit_user_id": data.pinit_user_id,
            "image_hash": data.image_hash,
            "signature": data.signature,
            "asset_id": data.asset_id,
            "metadata": data.metadata or {},
            "status": "active",
            "trust_level": 100
        }
        
        result = db.table("encrypted_images").insert(record_data).execute()
        
        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to create encryption record")
        
        record = result.data[0]
        
        print(f"[ENCRYPT] ✅ Encryption record created successfully")
        print(f"[ENCRYPT] Record ID: {record['id']}")
        print(f"[ENCRYPT] Metadata embedded: {bool(data.metadata)}")
        print(f"[ENCRYPT] DB record saved: True")
        
        # Log the encryption action
        log_action(
            user_id=data.pinit_user_id,
            action="pinit_encrypt",
            details={
                "watermark_id": data.watermark_id,
                "asset_id": data.asset_id,
                "image_hash": data.image_hash[:16] + "..."
            },
            ip=str(request.client.host)
        )
        
        return {
            "success": True,
            "watermark_id": data.watermark_id,
            "record_id": record["id"],
            "message": "Encryption record created successfully"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"[ENCRYPT] ❌ Failed to create encryption record: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Encryption failed: {str(e)}")


@router.post("/verify")
async def verify_image(
    request_data: VerificationRequest,
    request: Request
):
    """
    Verify image authenticity using PINIT trust-chain system
    """
    db = get_admin_db()
    
    print(f"[VERIFY] Starting image verification...")
    print(f"[VERIFY] Image size: {len(request_data.image_base64)} chars")
    
    debug_info = {
        "timestamp": datetime.now().isoformat(),
        "steps": []
    }
    
    try:
        # Step 1: Generate hash of uploaded image
        uploaded_hash = generate_image_hash(request_data.image_base64)
        debug_info["steps"].append(f"Generated hash: {uploaded_hash[:16]}...")
        print(f"[VERIFY] Generated image hash: {uploaded_hash[:16]}...")
        
        # Step 2: Extract watermark from image
        watermark_data = extract_watermark_from_image(request_data.image_base64)
        debug_info["steps"].append(f"Watermark extraction confidence: {watermark_data.extraction_confidence}")
        
        watermark_detected = watermark_data.extraction_confidence > 0.5
        debug_info["steps"].append(f"Watermark detected: {watermark_detected}")
        
        if watermark_detected:
            debug_info["steps"].append(f"Extracted watermark_id: {watermark_data.watermark_id}")
            debug_info["steps"].append(f"Extracted user_id: {watermark_data.pinit_user_id}")
            debug_info["steps"].append(f"Extracted signature: {watermark_data.signature}")
        
        print(f"[VERIFY] Watermark detected: {watermark_detected}")
        
        # Step 3: Database lookup
        db_record = None
        db_record_found = False
        
        if watermark_detected and watermark_data.watermark_id:
            print(f"[VERIFY] Looking up watermark in database: {watermark_data.watermark_id}")
            
            result = db.table("encrypted_images").select("*") \
                .eq("watermark_id", watermark_data.watermark_id) \
                .eq("signature", "PINIT_SECURE_WM") \
                .eq("status", "active").execute()
            
            if result.data:
                db_record = result.data[0]
                db_record_found = True
                debug_info["steps"].append(f"DB record found: {db_record['id']}")
                print(f"[VERIFY] ✅ DB record found: {db_record['id']}")
            else:
                debug_info["steps"].append("DB record not found")
                print(f"[VERIFY] ❌ DB record not found")
        else:
            debug_info["steps"].append("No watermark to lookup")
        
        # Step 4: Signature validation
        signature_valid = False
        if watermark_detected and watermark_data.signature:
            signature_valid = watermark_data.signature == "PINIT_SECURE_WM"
            debug_info["steps"].append(f"Signature valid: {signature_valid}")
            print(f"[VERIFY] Signature validation: {signature_valid}")
        
        # Step 5: Hash verification (optional)
        hash_match = None
        if request_data.check_hash and db_record:
            hash_match = uploaded_hash == db_record["image_hash"]
            debug_info["steps"].append(f"Hash match: {hash_match}")
            print(f"[VERIFY] Hash comparison: {hash_match}")
        
        # Step 6: Determine final verification status
        pinit_encrypted = db_record_found and signature_valid
        
        if pinit_encrypted and db_record:
            verification_status = "AUTHENTIC"
            verified_user = db_record["pinit_user_id"]
            watermark_id = db_record["watermark_id"]
            trust_score = calculate_trust_score(
                watermark_detected=watermark_detected,
                db_record_found=db_record_found,
                signature_valid=signature_valid,
                hash_match=hash_match
            )
        else:
            verification_status = "SUSPICIOUS" if watermark_detected else "NOT_DETECTED"
            verified_user = None
            watermark_id = watermark_data.watermark_id if watermark_detected else None
            trust_score = calculate_trust_score(
                watermark_detected=watermark_detected,
                db_record_found=db_record_found,
                signature_valid=signature_valid,
                hash_match=hash_match
            )
        
        debug_info["steps"].append(f"Final status: {verification_status}")
        debug_info["steps"].append(f"Trust score: {trust_score}")
        
        print(f"[VERIFY] 🏁 Final verification result:")
        print(f"[VERIFY]   - PINIT Encrypted: {pinit_encrypted}")
        print(f"[VERIFY]   - Status: {verification_status}")
        print(f"[VERIFY]   - Verified User: {verified_user}")
        print(f"[VERIFY]   - Trust Score: {trust_score}")
        
        # Log verification attempt
        log_action(
            user_id="anonymous",  # Verification doesn't require login
            action="pinit_verify",
            details={
                "verification_status": verification_status,
                "trust_score": trust_score,
                "watermark_detected": watermark_detected,
                "db_record_found": db_record_found
            },
            ip=str(request.client.host)
        )
        
        return VerificationResponse(
            watermark_detected=watermark_detected,
            pinit_encrypted=pinit_encrypted,
            verified_user=verified_user,
            watermark_id=watermark_id,
            verification_status=verification_status,
            trust_score=trust_score,
            ai_probability=None,  # Could add AI analysis later
            compression_detected=False,  # Could add compression detection later
            extracted_watermark_id=watermark_data.watermark_id,
            extracted_user_id=watermark_data.pinit_user_id,
            extracted_signature=watermark_data.signature,
            hash_match=hash_match,
            db_record_found=db_record_found,
            debug_info=debug_info
        )
        
    except Exception as e:
        print(f"[VERIFY] ❌ Verification failed: {str(e)}")
        debug_info["steps"].append(f"Error: {str(e)}")
        
        return VerificationResponse(
            watermark_detected=False,
            pinit_encrypted=False,
            verification_status="ERROR",
            trust_score=0,
            db_record_found=False,
            debug_info=debug_info
        )


@router.get("/encryption-history/{pinit_user_id}")
async def get_encryption_history(pinit_user_id: str):
    """Get encryption history for a specific user"""
    db = get_admin_db()
    
    try:
        result = db.table("encrypted_images").select("*") \
            .eq("pinit_user_id", pinit_user_id) \
            .order("encrypted_at", desc=True) \
            .execute()
        
        return {
            "success": True,
            "total": len(result.data),
            "records": result.data
        }
        
    except Exception as e:
        print(f"[ENCRYPT] Failed to get encryption history: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get history: {str(e)}")


@router.get("/verify-watermark/{watermark_id}")
async def verify_watermark_by_id(watermark_id: str):
    """Quick verification by watermark ID"""
    db = get_admin_db()
    
    try:
        result = db.table("encrypted_images").select("*") \
            .eq("watermark_id", watermark_id) \
            .eq("status", "active").execute()
        
        if not result.data:
            return {
                "valid": False,
                "message": "Watermark not found or inactive"
            }
        
        record = result.data[0]
        
        return {
            "valid": True,
            "watermark_id": record["watermark_id"],
            "pinit_user_id": record["pinit_user_id"],
            "encrypted_at": record["encrypted_at"],
            "trust_level": record["trust_level"]
        }
        
    except Exception as e:
        print(f"[VERIFY] Failed to verify watermark: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Verification failed: {str(e)}")


@router.post("/verify-unified")
async def verify_image_unified(file: UploadFile = File(...)):
    """
    Unified image verification - detects PinIT encryption and camera origin
    Returns simplified verification result
    """
    print(f"[VERIFY_UNIFIED] Starting unified verification for file: {file.filename}")
    
    # File validation
    if not file.filename:
        return {"error": "No file selected"}
    
    allowed = ['jpg', 'jpeg', 'png']
    file_ext = file.filename.lower().split('.')[-1] if '.' in file.filename else ''
    
    if file_ext not in allowed:
        return {"error": f"Invalid file type. Allowed: {', '.join(allowed)}"}
    
    try:
        # Create temporary file
        with tempfile.NamedTemporaryFile(delete=False, suffix=f".{file_ext}") as temp_file:
            # Read uploaded file content
            content = await file.read()
            temp_file.write(content)
            temp_file_path = temp_file.name
        
        try:
            # Run unified verification
            result = verify_image(temp_file_path)
            
            print(f"[VERIFY_UNIFIED] ✅ Verification completed:")
            print(f"[VERIFY_UNIFIED]   - PinIT Encrypted: {result['pinit_encrypted']}")
            print(f"[VERIFY_UNIFIED]   - Camera Captured: {result['camera_captured']}")
            print(f"[VERIFY_UNIFIED]   - Image Source: {result['image_source']}")
            print(f"[VERIFY_UNIFIED]   - Security Status: {result['security_status']}")
            print(f"[VERIFY_UNIFIED]   - Confidence: {result['confidence']}")
            
            return result
            
        finally:
            # Clean up temporary file
            try:
                os.unlink(temp_file_path)
            except:
                pass  # Ignore cleanup errors
            
    except HTTPException:
        raise
    except Exception as e:
        print(f"[VERIFY_UNIFIED] ❌ Verification failed: {str(e)}")
        # Return a proper error response instead of raising HTTPException
        return {
            "pinit_encrypted": False,
            "camera_captured": False,
            "image_source": "Processing Error",
            "security_status": "Error",
            "confidence": 0,
            "error": str(e)
        }
