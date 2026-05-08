from pydantic import BaseModel, EmailStr
from typing import Optional, List, Any


# ─── Auth Schemas ─────────────────────────────────────────────────────────────

class UserRegister(BaseModel):
    username: str
    email: EmailStr
    password: Optional[str] = None


class BiometricRegister(BaseModel):
    """Registration with biometric data (fingerprint + face)"""
    userId: str
    deviceToken: str
    webauthn: Optional[dict] = None
    faceEmbedding: Optional[List[float]] = None


class VerifyFingerprintRequest(BaseModel):
    """Verify fingerprint against registered credentials"""
    userId: str
    credential: Optional[str] = None


class VerifyFaceRequest(BaseModel):
    """Verify face embedding against stored embeddings"""
    faceEmbedding: List[float]
    userId: Optional[str] = None


class OTPVerify(BaseModel):
    email: EmailStr
    code: str


class OTPResend(BaseModel):
    email: EmailStr


class UserResponse(BaseModel):
    id: str
    username: str
    email: str
    role: str
    is_active: bool
    created_at: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


# ─── WebAuthn Schemas ─────────────────────────────────────────────────────────

class WebAuthnRegisterStart(BaseModel):
    email: EmailStr


class WebAuthnRegisterFinish(BaseModel):
    email: EmailStr
    credential: dict
    device_name: Optional[str] = "My Device"


class WebAuthnLoginStart(BaseModel):
    email: EmailStr


class WebAuthnLoginFinish(BaseModel):
    email: EmailStr
    credential: dict


# ─── Vault Schemas ────────────────────────────────────────────────────────────

class VaultImageCreate(BaseModel):
    asset_id:           str
    certificate_id:     Optional[str]   = None
    owner_name:         Optional[str]   = None
    owner_email:        Optional[str]   = None
    file_hash:          Optional[str]   = None
    visual_fingerprint: Optional[str]   = None
    blockchain_anchor:  Optional[str]   = None
    resolution:         Optional[str]   = None
    file_size:          Optional[str]   = None   # string e.g. "2.5 MB"
    file_name:          Optional[str]   = None
    thumbnail_base64:   Optional[str]   = None
    image_base64:       Optional[str]   = None   # Full encrypted image as base64
    capture_timestamp:  Optional[str]   = None
    device_id:          Optional[str]   = None
    user_id: str 


class VaultImageResponse(BaseModel):
    id:                 str
    asset_id:           str
    certificate_id:     Optional[str]
    owner_name:         Optional[str]
    owner_email:        Optional[str]
    file_hash:          Optional[str]
    visual_fingerprint: Optional[str]
    blockchain_anchor:  Optional[str]
    resolution:         Optional[str]
    file_size:          Optional[str]
    file_name:          Optional[str]
    thumbnail_url:      Optional[str]
    image_url:          Optional[str]       # Full image URL
    image_base64:       Optional[str]       # Full image as base64
    capture_timestamp:  Optional[str]
    created_at:         str


# ─── Comparison Schemas ───────────────────────────────────────────────────────

class ComparisonReportCreate(BaseModel):
    asset_id:               str
    is_tampered:            Optional[bool]  = False
    confidence:             Optional[int]   = 0     # always int
    visual_verdict:         Optional[str]   = None
    editing_tool:           Optional[str]   = None
    changes:                Optional[List[Any]] = []
    pixel_analysis:         Optional[dict]  = {}
    original_capture_time:  Optional[str]   = None
    modified_file_time:     Optional[str]   = None
    uploaded_resolution:    Optional[str]   = None
    uploaded_size:          Optional[str]   = None
    phash_sim:              Optional[int]   = None


class ComparisonReportResponse(BaseModel):
    id:                 str
    asset_id:           Optional[str]
    compared_by:        Optional[str]
    is_tampered:        bool
    confidence:         int
    visual_verdict:     Optional[str]
    editing_tool:       Optional[str]
    changes:            Optional[List[Any]]
    pixel_analysis:     Optional[dict]
    uploaded_resolution:Optional[str]
    uploaded_size:      Optional[str]
    phash_sim:          Optional[int]
    public_token:       Optional[str]
    created_at:         str


# ─── Admin Schemas ────────────────────────────────────────────────────────────

class SuspendUser(BaseModel):
    reason: Optional[str] = None


class AuditLogResponse(BaseModel):
    id:         str
    user_id:    Optional[str]
    action:     str
    details:    Optional[dict]
    ip_address: Optional[str]
    created_at: str


# ─── PINIT Encryption Schemas ───────────────────────────────────────────────────────

class EncryptionRecordCreate(BaseModel):
    """Schema for creating encryption records"""
    watermark_id: str
    pinit_user_id: str
    image_hash: str
    signature: str = "PINIT_SECURE_WM"
    asset_id: Optional[str] = None
    metadata: Optional[dict] = {}


class EncryptionRecordResponse(BaseModel):
    """Schema for encryption record responses"""
    id: str
    watermark_id: str
    pinit_user_id: str
    image_hash: str
    signature: str
    encrypted_at: str
    status: str
    trust_level: int
    asset_id: Optional[str]
    metadata: Optional[dict]
    created_at: str
    updated_at: str


class VerificationRequest(BaseModel):
    """Schema for image verification requests"""
    image_base64: str
    extract_watermark: bool = True
    check_hash: bool = True


class VerificationResponse(BaseModel):
    """Schema for verification responses"""
    watermark_detected: bool
    pinit_encrypted: bool
    verified_user: Optional[str] = None
    watermark_id: Optional[str] = None
    verification_status: str  # AUTHENTIC, SUSPICIOUS, NOT_DETECTED
    trust_score: int
    ai_probability: Optional[int] = None
    compression_detected: bool
    extracted_watermark_id: Optional[str] = None
    extracted_user_id: Optional[str] = None
    extracted_signature: Optional[str] = None
    hash_match: Optional[bool] = None
    db_record_found: bool
    debug_info: Optional[dict] = None


class WatermarkExtraction(BaseModel):
    """Schema for extracted watermark data"""
    watermark_id: Optional[str] = None
    pinit_user_id: Optional[str] = None
    signature: Optional[str] = None
    extraction_confidence: float
    metadata: Optional[dict] = None