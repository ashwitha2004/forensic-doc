from fastapi import APIRouter, HTTPException, Request, Depends
from datetime import datetime, timedelta
from passlib.context import CryptContext
from db.database import get_admin_db
from models.schemas import (
    UserRegister, BiometricRegister, OTPVerify, OTPResend,
    WebAuthnRegisterStart, WebAuthnRegisterFinish,
    WebAuthnLoginStart, WebAuthnLoginFinish,
    VerifyFingerprintRequest, VerifyFaceRequest
)
from utils.auth_helpers import (
    generate_jwt, generate_otp,
    get_current_user, log_action
)
from utils.email_helper import send_otp_email, send_new_device_email
import os
import json
import numpy as np

router = APIRouter(tags=["Authentication"])

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

RP_ID   = os.getenv("RP_ID",   "localhost")
RP_NAME = os.getenv("RP_NAME", "PINIT")


# ── Register ──────────────────────────────────────────────────────────────────

@router.post("/register")
async def register(data: UserRegister, request: Request):
    db = get_admin_db()

    # Check email exists
    existing = db.table("users").select("id").eq("email", data.email).execute()
    if existing.data:
        raise HTTPException(status_code=400, detail="Email already registered")

    # Check username exists
    existing_user = db.table("users").select("id").eq("username", data.username).execute()
    if existing_user.data:
        raise HTTPException(status_code=400, detail="Username already taken")

    # Create user
    new_user = db.table("users").insert({
        "username"      : data.username,
        "email"         : data.email,
        "role"          : "user",
        "is_active"     : True,
        "email_verified": False,
        "password_hash" : pwd_context.hash(data.password) if data.password else None
    }).execute()

    user = new_user.data[0]

    # Generate OTP
    otp_code   = generate_otp()
    expires_at = datetime.utcnow() + timedelta(minutes=10)

    db.table("otp_codes").insert({
        "email"     : data.email,
        "code"      : otp_code,
        "expires_at": expires_at.isoformat(),
        "used"      : False
    }).execute()

    send_otp_email(data.email, otp_code, data.username)
    log_action(user["id"], "register", {"email": data.email}, str(request.client.host))

    return {
        "message": "Registration successful. Check your email for OTP.",
        "email"  : data.email
    }


# ── Biometric Register (Mobile App) ───────────────────────────────────────────

@router.post("/biometric-register")
async def biometric_register(data: BiometricRegister, request: Request):
    """Register user with biometric data (fingerprint + face)"""
    print(f"🔐 Biometric Register Request: {data}")
    db = get_admin_db()
    
    # Validate userId is not empty
    if not data.userId or not data.userId.strip():
        print("❌ Missing userId")
        raise HTTPException(status_code=400, detail="Missing userId")
    
    # Validate deviceToken is not empty
    if not data.deviceToken or not data.deviceToken.strip():
        print("❌ Missing deviceToken")
        raise HTTPException(status_code=400, detail="Missing deviceToken")
    
    # Validate webauthn data (optional for simplified PINIT flow)
    if not data.webauthn:
        print("⚠️ No webauthn data - using simplified PINIT registration")
        # Continue without webauthn for simplified flow
    
    # Validate face embedding (optional for simplified PINIT flow)
    if not data.faceEmbedding or len(data.faceEmbedding) == 0:
        print("⚠️ No face embedding - using simplified PINIT registration")
        # Continue without face embedding for simplified flow
    
    print(f"✅ All validations passed for userId: {data.userId}")
    
    # Check if userId already registered
    try:
        existing = db.table("biometric_users").select("id").eq("user_id", data.userId).execute()
        if existing.data:
            raise HTTPException(status_code=400, detail="User ID already registered")
    except HTTPException:
        raise  # Re-raise HTTP exceptions
    except Exception as e:
        # Table might not exist yet, that's OK
        print(f"Info: biometric_users table check: {str(e)}")
    
    # Create biometric user record
    try:
        print(f"📝 Biometric Register: userId={data.userId}, deviceToken={data.deviceToken}")
        print(f"📊 Face embedding length: {len(data.faceEmbedding) if data.faceEmbedding else 0}")
        
        if data.faceEmbedding:
            embedding_sum = sum(abs(x) for x in data.faceEmbedding)
            print(f"✅ Face embedding sum: {embedding_sum:.4f}")
        
        user_record = db.table("biometric_users").insert({
            "user_id": data.userId,
            "device_token": data.deviceToken,
            "webauthn_credential": data.webauthn,
            "face_embedding": data.faceEmbedding,
            "is_active": True,
            "created_at": datetime.utcnow().isoformat(),
        }).execute()
        
        print(f"✅ Biometric user created: {user_record.data}")
        
        if not user_record.data:
            raise HTTPException(status_code=500, detail="Failed to create user record")
        
        # Generate temp code for recovery/temp access
        temp_code = str(int(datetime.utcnow().timestamp())) + str(hash(data.userId))[-6:]
        
        # Generate JWT tokens for immediate login after registration
        access_token = generate_jwt(data.userId, "user")
        refresh_token = generate_jwt(data.userId, "user", expires_in_minutes=10080)  # 7 days
        
        log_action(data.userId, "biometric_register", {"device": data.deviceToken}, str(request.client.host))
        
        return {
            "ok": True,
            "userId": data.userId,
            "tempCode": temp_code,
            "token": access_token,
            "refreshToken": refresh_token,
            "message": "Biometric registration successful",
            "mode": "remote"
        }
    
    except HTTPException as he:
        raise he
    except Exception as e:
        print(f"Biometric registration error: {str(e)}")
        error_str = str(e).lower()
        if 'duplicate key' in error_str or 'already exists' in error_str:
            raise HTTPException(status_code=400, detail="User ID already registered")
        raise HTTPException(status_code=500, detail=f"Registration failed: {str(e)}")


# ── Password Login ────────────────────────────────────────────────────────────

@router.post("/login")
async def login(data: dict, request: Request):
    db    = get_admin_db()
    email = data.get("email", "").lower().strip()
    pwd   = data.get("password", "")

    user_result = db.table("users").select("*").eq("email", email).execute()
    if not user_result.data:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    user = user_result.data[0]

    if not user.get("is_active"):
        raise HTTPException(status_code=403, detail="Account suspended")

    stored_pwd = user.get("password_hash", "")
    if not stored_pwd or not pwd_context.verify(pwd, stored_pwd):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = generate_jwt(user["id"], user["role"])
    log_action(user["id"], "login_password", {}, str(request.client.host))

    return {
        "access_token": token,
        "token_type"  : "bearer",
        "user"        : {
            "id"      : user["id"],
            "username": user["username"],
            "email"   : user["email"],
            "role"    : user["role"]
        }
    }


# ── Admin Login ───────────────────────────────────────────────────────────────

@router.post("/admin-login")
async def admin_login(data: dict, request: Request):
    db       = get_admin_db()
    username = data.get("username", "")
    pwd      = data.get("password", "")

    user_result = db.table("users").select("*") \
        .eq("username", username).eq("role", "admin").execute()

    if not user_result.data:
        raise HTTPException(status_code=401, detail="Invalid admin credentials")

    user       = user_result.data[0]
    stored_pwd = user.get("password_hash", "")

    if not stored_pwd or not pwd_context.verify(pwd, stored_pwd):
        raise HTTPException(status_code=401, detail="Invalid admin credentials")

    token = generate_jwt(user["id"], user["role"])
    log_action(user["id"], "admin_login", {}, str(request.client.host))

    return {
        "access_token": token,
        "token_type"  : "bearer",
        "user"        : {
            "id"      : user["id"],
            "username": user["username"],
            "email"   : user["email"],
            "role"    : user["role"]
        }
    }


# ── Verify OTP ────────────────────────────────────────────────────────────────

@router.post("/verify-otp")
async def verify_otp(data: OTPVerify, request: Request):
    db = get_admin_db()

    result = db.table("otp_codes") \
        .select("*") \
        .eq("email", data.email) \
        .eq("code", data.code) \
        .eq("used", False) \
        .execute()

    if not result.data:
        raise HTTPException(status_code=400, detail="Invalid OTP code")

    otp        = result.data[0]
    expires_at = datetime.fromisoformat(otp["expires_at"].replace("Z", "+00:00"))

    if datetime.utcnow().replace(tzinfo=expires_at.tzinfo) > expires_at:
        raise HTTPException(status_code=400, detail="OTP expired. Request a new one.")

    db.table("otp_codes").update({"used": True}).eq("id", otp["id"]).execute()
    db.table("users").update({"email_verified": True}).eq("email", data.email).execute()

    user_result = db.table("users").select("*").eq("email", data.email).execute()
    user        = user_result.data[0]

    log_action(user["id"], "verify_otp", {"email": data.email}, str(request.client.host))

    return {
        "message" : "Email verified successfully",
        "verified": True,
        "user_id" : user["id"]
    }


# ── Resend OTP ────────────────────────────────────────────────────────────────

@router.post("/resend-otp")
async def resend_otp(data: OTPResend):
    db = get_admin_db()

    user_result = db.table("users").select("*").eq("email", data.email).execute()
    if not user_result.data:
        raise HTTPException(status_code=404, detail="Email not found")

    user       = user_result.data[0]
    otp_code   = generate_otp()
    expires_at = datetime.utcnow() + timedelta(minutes=10)

    db.table("otp_codes").insert({
        "email"     : data.email,
        "code"      : otp_code,
        "expires_at": expires_at.isoformat(),
        "used"      : False
    }).execute()

    send_otp_email(data.email, otp_code, user["username"])
    return {"message": "New OTP sent to your email"}


# ── Get Current User ──────────────────────────────────────────────────────────

@router.get("/me")
async def get_me(current_user=Depends(get_current_user)):
    return current_user


# ── WebAuthn Register Start ───────────────────────────────────────────────────

@router.post("/webauthn/register-start")
async def webauthn_register_start(data: WebAuthnRegisterStart):
    db = get_admin_db()

    user_result = db.table("users").select("*").eq("email", data.email).execute()
    if not user_result.data:
        raise HTTPException(status_code=404, detail="User not found")

    user = user_result.data[0]

    if not user.get("email_verified"):
        raise HTTPException(status_code=400, detail="Please verify your email first")

    try:
        from webauthn import generate_registration_options
        from webauthn.helpers.structs import (
            AuthenticatorSelectionCriteria,
            UserVerificationRequirement,
            ResidentKeyRequirement
        )
        from webauthn.helpers.cose import COSEAlgorithmIdentifier
        import base64

        options = generate_registration_options(
            rp_id                   = RP_ID,
            rp_name                 = RP_NAME,
            user_id                 = user["id"].encode(),
            user_name               = user["email"],
            user_display_name       = user["username"],
            authenticator_selection = AuthenticatorSelectionCriteria(
                user_verification = UserVerificationRequirement.REQUIRED,
                resident_key      = ResidentKeyRequirement.PREFERRED
            ),
            supported_pub_key_algs  = [
                COSEAlgorithmIdentifier.ECDSA_SHA_256,
                COSEAlgorithmIdentifier.RSASSA_PKCS1_v1_5_SHA_256
            ]
        )

        challenge_b64 = base64.b64encode(options.challenge).decode()
        db.table("otp_codes").insert({
            "email"     : data.email,
            "code"      : f"WA_CHALLENGE_{challenge_b64}",
            "expires_at": (datetime.utcnow() + timedelta(minutes=5)).isoformat(),
            "used"      : False
        }).execute()

        from webauthn import options_to_json
        return json.loads(options_to_json(options))

    except ImportError:
        raise HTTPException(status_code=500, detail="WebAuthn not installed. Run: pip install pywebauthn")


# ── WebAuthn Register Finish ──────────────────────────────────────────────────

@router.post("/webauthn/register-finish")
async def webauthn_register_finish(data: WebAuthnRegisterFinish, request: Request):
    db = get_admin_db()

    user_result = db.table("users").select("*").eq("email", data.email).execute()
    if not user_result.data:
        raise HTTPException(status_code=404, detail="User not found")

    user = user_result.data[0]

    try:
        from webauthn import verify_registration_response
        from webauthn.helpers.structs import RegistrationCredential
        import base64

        challenge_result = db.table("otp_codes") \
            .select("*") \
            .eq("email", data.email) \
            .eq("used", False) \
            .like("code", "WA_CHALLENGE_%") \
            .order("created_at", desc=True) \
            .limit(1) \
            .execute()

        if not challenge_result.data:
            raise HTTPException(status_code=400, detail="Challenge not found or expired")

        challenge_row = challenge_result.data[0]
        challenge_b64 = challenge_row["code"].replace("WA_CHALLENGE_", "")
        challenge     = base64.b64decode(challenge_b64)

        db.table("otp_codes").update({"used": True}).eq("id", challenge_row["id"]).execute()

        verification = verify_registration_response(
            credential         = RegistrationCredential.parse_raw(json.dumps(data.credential)),
            expected_challenge = challenge,
            expected_rp_id     = RP_ID,
            expected_origin    = os.getenv("APP_URL", "http://localhost:3000")
        )

        db.table("biometric_credentials").insert({
            "user_id"      : user["id"],
            "credential_id": base64.urlsafe_b64encode(verification.credential_id).decode(),
            "public_key"   : base64.b64encode(verification.credential_public_key).decode(),
            "device_name"  : data.device_name,
            "sign_count"   : verification.sign_count
        }).execute()

        send_new_device_email(user["email"], user["username"], data.device_name)
        log_action(user["id"], "biometric_register", {"device": data.device_name}, str(request.client.host))

        return {"message": "Biometric registered successfully"}

    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Registration failed: {str(e)}")


# ── WebAuthn Login Start ──────────────────────────────────────────────────────

@router.post("/webauthn/login-start")
async def webauthn_login_start(data: WebAuthnLoginStart):
    db = get_admin_db()

    user_result = db.table("users").select("*").eq("email", data.email).execute()
    if not user_result.data:
        raise HTTPException(status_code=404, detail="User not found")

    user = user_result.data[0]

    if not user.get("is_active"):
        raise HTTPException(status_code=403, detail="Account suspended")


# ── Verify Fingerprint ────────────────────────────────────────────────────────

@router.post("/verify-fingerprint")
async def verify_fingerprint(data: VerifyFingerprintRequest, request: Request):
    """
    Verify fingerprint (WebAuthn credential) against registered user
    Returns: {verified: bool, userId: str, message: str}
    """
    db = get_admin_db()
    
    if not data.userId or not data.credential:
        return {
            "verified": False,
            "userId": None,
            "message": "Missing userId or credential",
            "reason": "Missing userId or credential"
        }
    
    # Check if userId exists in biometric_users table
    try:
        user_result = db.table("biometric_users").select("*").eq("user_id", data.userId).execute()
        
        if not user_result.data:
            print(f"❌ User {data.userId} not found in database")
            return {
                "verified": False,
                "userId": None,
                "message": "Fingerprint not found in database",
                "reason": "User not registered"
            }
        
        user_record = user_result.data[0]
        stored_webauthn = user_record.get("webauthn_credential")
        
        # Extract credential ID from either string or object format
        if isinstance(stored_webauthn, dict):
            stored_credential_id = stored_webauthn.get("id")
        elif isinstance(stored_webauthn, str):
            stored_credential_id = stored_webauthn
        else:
            stored_credential_id = None
        
        incoming_credential_id = data.credential if isinstance(data.credential, str) else (data.credential.get("id") if isinstance(data.credential, dict) else None)
        
        print(f"🔍 Fingerprint verification for {data.userId}:")
        print(f"  Stored credential type: {type(stored_webauthn)}")
        print(f"  Stored credential ID: {stored_credential_id[:30] if stored_credential_id else 'None'}...")
        print(f"  Incoming credential: {incoming_credential_id[:30] if incoming_credential_id else 'None'}...")
        
        # Compare credential IDs
        credentials_match = stored_credential_id == incoming_credential_id
        
        if credentials_match:
            print(f"✅ Fingerprint verified for {data.userId}: credentials match")
            log_action(data.userId, "verify_fingerprint_success", {}, str(request.client.host))
            return {
                "verified": True,
                "userId": data.userId,
                "message": "Fingerprint verified successfully",
                "ok": True,
                "match": True
            }
        else:
            print(f"❌ Fingerprint verification failed for {data.userId}: credentials don't match")
            return {
                "verified": False,
                "userId": data.userId,
                "message": "Fingerprint does not match registered credential",
                "reason": "Credential mismatch",
                "ok": False,
                "match": False
            }
    
    except Exception as e:
        print(f"Fingerprint verification error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Verification failed: {str(e)}")


# ── Verify Face ───────────────────────────────────────────────────────────────

@router.post("/verify-face")
async def verify_face(data: VerifyFaceRequest, request: Request):
    """
    Verify face embedding against stored embeddings.
    If userId provided: verify against that user's face (logged-in verification)
    If userId not provided: check against ALL users' faces (temporary access verification)
    
    Returns: {verified: bool, userId: str, message: str, similarity: float}
    """
    db = get_admin_db()
    
    if not data.faceEmbedding or len(data.faceEmbedding) == 0:
        raise HTTPException(status_code=400, detail="Missing face embedding")
    
    try:
        current_embedding = np.array(data.faceEmbedding, dtype=np.float32)
        
        # ⭐ MATCHING THRESHOLDS ⭐
        # Logged-in user: 55% match required (MUST be same face)
        # Temporary access: 55% match required (MUST be same person, different device)
        LOGGED_IN_THRESHOLD = 0.55   # 55% for login - same face, same device (more lenient)
        TEMP_ACCESS_THRESHOLD = 0.55  # 55% for cross-device - same person, different device
        
        if data.userId:
            # Logged-in user: verify against their specific face
            user_result = db.table("biometric_users").select("*").eq("user_id", data.userId).execute()
            
            if not user_result.data:
                return {
                    "verified": False,
                    "ok": False,
                    "match": False,
                    "userId": data.userId,
                    "message": "User not found",
                    "reason": "User not found in database",
                    "similarity": 0.0,
                    "score": 0.0
                }
            
            user_record = user_result.data[0]
            stored_embedding = user_record.get("face_embedding")
            
            if not stored_embedding:
                return {
                    "verified": False,
                    "ok": False,
                    "match": False,
                    "userId": data.userId,
                    "message": "No face embedding found for this user",
                    "reason": "Face not registered",
                    "similarity": 0.0,
                    "score": 0.0
                }
            
            # Calculate cosine similarity
            stored_array = np.array(stored_embedding, dtype=np.float32)
            similarity = np.dot(current_embedding, stored_array) / (
                np.linalg.norm(current_embedding) * np.linalg.norm(stored_array) + 1e-8
            )
            similarity_score = float(similarity)
            
            # DEBUG LOGGING
            print(f"🔍 Face comparison for userId={data.userId}:")
            print(f"  Stored embedding length: {len(stored_embedding)}")
            print(f"  Current embedding length: {len(data.faceEmbedding)}")
            print(f"  Stored norm: {np.linalg.norm(stored_array):.6f}")
            print(f"  Current norm: {np.linalg.norm(current_embedding):.6f}")
            print(f"  Dot product: {np.dot(current_embedding, stored_array):.6f}")
            print(f"  ✅ Cosine similarity: {similarity_score:.6f} ({(similarity_score*100):.2f}%)")
            print(f"  Threshold: {LOGGED_IN_THRESHOLD:.2f} ({(LOGGED_IN_THRESHOLD*100):.0f}%)")
            
            print(f"🔍 Face verification for userId={data.userId}: similarity={similarity_score:.4f}, threshold={LOGGED_IN_THRESHOLD}")
            
            if similarity_score >= LOGGED_IN_THRESHOLD:
                print(f"✅✅✅ FACE MATCH SUCCESS: {similarity_score:.6f} ({(similarity_score*100):.2f}%) >= {LOGGED_IN_THRESHOLD:.2f} ({(LOGGED_IN_THRESHOLD*100):.0f}%)")
                
                try:
                    log_action(data.userId, "verify_face_success", {"similarity": similarity_score}, str(request.client.host))
                except Exception as log_err:
                    print(f"⚠️ Log action failed: {log_err}")
                
                try:
                    # Generate JWT tokens for dashboard access
                    access_token = generate_jwt(data.userId, "user")
                    refresh_token = generate_jwt(data.userId, "user", expires_in_minutes=10080)  # 7 days
                    
                    print(f"🔐 Tokens generated for userId={data.userId}")
                    print(f"✅ Access token: {access_token[:30]}...")
                    print(f"✅ Refresh token: {refresh_token[:30]}...")
                    
                    response_data = {
                        "verified": True,
                        "ok": True,
                        "match": True,
                        "userId": data.userId,
                        "message": "Face verified successfully",
                        "similarity": similarity_score,
                        "score": similarity_score,
                        "token": access_token,
                        "refreshToken": refresh_token
                    }
                    print(f"📦 Returning response:", response_data)
                    return response_data
                except Exception as token_err:
                    print(f"❌ Error generating tokens: {token_err}")
                    raise HTTPException(status_code=500, detail=f"Token generation failed: {str(token_err)}")
            else:
                print(f"❌❌❌ FACE MATCH FAILED: {similarity_score:.6f} ({(similarity_score*100):.2f}%) < {LOGGED_IN_THRESHOLD:.2f} ({(LOGGED_IN_THRESHOLD*100):.0f}%)")
                log_action(data.userId, "verify_face_failed", {"similarity": similarity_score, "threshold": LOGGED_IN_THRESHOLD}, str(request.client.host))
                return {
                    "verified": False,
                    "ok": False,
                    "match": False,
                    "userId": data.userId,
                    "message": f"Face not matched (similarity: {similarity_score:.2f}, required: {LOGGED_IN_THRESHOLD:.2f})",
                    "reason": f"Face similarity too low: {(similarity_score*100):.1f}%",
                    "similarity": similarity_score,
                    "score": similarity_score
                }
        
        else:
            # Temporary access: search all users for matching face
            print(f"🔍 TempAccess: Searching all users for face match...")
            all_users = db.table("biometric_users").select("*").execute()
            
            print(f"📊 TempAccess: Found {len(all_users.data) if all_users.data else 0} registered users")
            
            if not all_users.data:
                print("❌ TempAccess: No registered users in database!")
                return {
                    "verified": False,
                    "userId": None,
                    "message": "No registered users found",
                    "similarity": 0.0
                }
            
            best_match = None
            best_similarity = 0.0
            
            for user_record in all_users.data:
                stored_embedding = user_record.get("face_embedding")
                user_id = user_record.get("user_id")
                
                if not stored_embedding:
                    print(f"⚠️ TempAccess: User {user_id} has no face embedding")
                    continue
                
                stored_array = np.array(stored_embedding, dtype=np.float32)
                similarity = np.dot(current_embedding, stored_array) / (
                    np.linalg.norm(current_embedding) * np.linalg.norm(stored_array) + 1e-8
                )
                similarity_score = float(similarity)
                
                print(f"📈 TempAccess: User {user_id} - Similarity: {similarity_score:.4f}")
                
                if similarity_score > best_similarity:
                    best_similarity = similarity_score
                    best_match = user_record
            
            print(f"🎯 TempAccess: Best match - Similarity: {best_similarity:.4f}, Threshold: {TEMP_ACCESS_THRESHOLD:.2f}")
            
            if best_match and best_similarity >= TEMP_ACCESS_THRESHOLD:  # 85% threshold for temp access too
                matched_user_id = best_match["user_id"]
                print(f"✅ TempAccess: SUCCESS - User {matched_user_id} matched at {best_similarity:.4f}")
                log_action(matched_user_id, "verify_face_temp_access_success", {"similarity": best_similarity}, str(request.client.host))
                
                # Generate tokens for temporary access
                access_token = generate_jwt(matched_user_id, "user")
                refresh_token = generate_jwt(matched_user_id, "user", expires_in_minutes=10080)
                
                return {
                    "verified": True,
                    "userId": matched_user_id,
                    "message": "Face verified for temporary access",
                    "similarity": best_similarity,
                    "token": access_token,
                    "refreshToken": refresh_token
                }
            else:
                print(f"❌ TempAccess: FAILED - Best similarity {best_similarity:.4f} < threshold {TEMP_ACCESS_THRESHOLD:.2f}")
                log_action(None, "verify_face_temp_access_failed", {"best_similarity": best_similarity, "threshold": TEMP_ACCESS_THRESHOLD}, str(request.client.host))
                return {
                    "verified": False,
                    "userId": None,
                    "message": f"Face not matched with any user (best match: {best_similarity:.4f}, required: {TEMP_ACCESS_THRESHOLD:.2f}). Only registered faces can access the system.",
                    "similarity": best_similarity
                }
    
    except Exception as e:
        print(f"Face verification error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Face verification failed: {str(e)}")

    creds_result = db.table("biometric_credentials") \
        .select("*").eq("user_id", user["id"]).execute()

    if not creds_result.data:
        raise HTTPException(status_code=400, detail="No biometric registered. Please register first.")

    try:
        from webauthn import generate_authentication_options
        from webauthn.helpers.structs import UserVerificationRequirement, PublicKeyCredentialDescriptor
        import base64

        allow_credentials = [
            PublicKeyCredentialDescriptor(
                id = base64.urlsafe_b64decode(cred["credential_id"] + "==")
            )
            for cred in creds_result.data
        ]

        options = generate_authentication_options(
            rp_id             = RP_ID,
            allow_credentials = allow_credentials,
            user_verification = UserVerificationRequirement.REQUIRED
        )

        challenge_b64 = base64.b64encode(options.challenge).decode()
        db.table("otp_codes").insert({
            "email"     : data.email,
            "code"      : f"WA_AUTH_{challenge_b64}",
            "expires_at": (datetime.utcnow() + timedelta(minutes=5)).isoformat(),
            "used"      : False
        }).execute()

        from webauthn import options_to_json
        return json.loads(options_to_json(options))

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── WebAuthn Login Finish ─────────────────────────────────────────────────────

@router.post("/webauthn/login-finish")
async def webauthn_login_finish(data: WebAuthnLoginFinish, request: Request):
    db = get_admin_db()

    user_result = db.table("users").select("*").eq("email", data.email).execute()
    if not user_result.data:
        raise HTTPException(status_code=404, detail="User not found")

    user = user_result.data[0]

    try:
        from webauthn import verify_authentication_response
        from webauthn.helpers.structs import AuthenticationCredential
        import base64

        challenge_result = db.table("otp_codes") \
            .select("*") \
            .eq("email", data.email) \
            .eq("used", False) \
            .like("code", "WA_AUTH_%") \
            .order("created_at", desc=True) \
            .limit(1) \
            .execute()

        if not challenge_result.data:
            raise HTTPException(status_code=400, detail="Challenge expired")

        challenge_row = challenge_result.data[0]
        challenge     = base64.b64decode(challenge_row["code"].replace("WA_AUTH_", ""))
        db.table("otp_codes").update({"used": True}).eq("id", challenge_row["id"]).execute()

        cred_id_raw = data.credential.get("id", "")
        all_creds   = db.table("biometric_credentials").select("*").eq("user_id", user["id"]).execute()

        matched_cred = None
        for cred in all_creds.data:
            if cred["credential_id"].rstrip("=") == cred_id_raw.rstrip("="):
                matched_cred = cred
                break

        if not matched_cred:
            raise HTTPException(status_code=400, detail="Credential not found")

        verification = verify_authentication_response(
            credential                    = AuthenticationCredential.parse_raw(json.dumps(data.credential)),
            expected_challenge            = challenge,
            expected_rp_id               = RP_ID,
            expected_origin              = os.getenv("APP_URL", "http://localhost:3000"),
            credential_public_key        = base64.b64decode(matched_cred["public_key"]),
            credential_current_sign_count = matched_cred["sign_count"]
        )

        db.table("biometric_credentials").update({
            "sign_count": verification.new_sign_count
        }).eq("id", matched_cred["id"]).execute()

        token = generate_jwt(user["id"], user["role"])
        log_action(user["id"], "login_biometric", {"device": matched_cred.get("device_name")}, str(request.client.host))

        return {
            "access_token": token,
            "token_type"  : "bearer",
            "user"        : {
                "id"      : user["id"],
                "username": user["username"],
                "email"   : user["email"],
                "role"    : user["role"]
            }
        }

    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Login failed: {str(e)}")