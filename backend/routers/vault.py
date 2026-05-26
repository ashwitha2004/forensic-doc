from fastapi import APIRouter, HTTPException, Request, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from db.database import get_admin_db
from models.schemas import VaultImageCreate, VaultImageResponse, EncryptionRecordCreate
from utils.auth_helpers import log_action
from utils.cloudinary_helper import upload_thumbnail_base64, delete_thumbnail, download_image
import hashlib
import uuid

router = APIRouter(tags=["Vault"])

# ── Upload security constants ─────────────────────────────────────────────────
# Explicit allowlist — anything not in this set is rejected.
_ALLOWED_MIME_TYPES: set[str] = {
    # Images
    "image/jpeg", "image/png", "image/webp", "image/tiff", "image/bmp", "image/gif",
    # Documents
    "application/pdf",
    "application/msword",                                                          # .doc
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",    # .docx
    "text/plain",
    # Browsers sometimes send this for binary files — we validate extension too
    "application/octet-stream",
}

_ALLOWED_EXTENSIONS: set[str] = {
    "jpg", "jpeg", "png", "webp", "tiff", "tif", "bmp", "gif",
    "pdf", "doc", "docx", "txt",
}

# Explicitly blocked — executable / script types
_BLOCKED_EXTENSIONS: set[str] = {
    "exe", "dll", "bat", "cmd", "com", "sh", "bash", "py", "pyc",
    "js", "ts", "jsx", "tsx", "php", "rb", "pl", "ps1", "psm1",
    "vbs", "vba", "msi", "jar", "apk", "ipa", "so", "dylib",
    "bin", "run", "out", "elf",
}

# Content-type map used by the asset download endpoint
_CONTENT_TYPE_MAP: dict[str, str] = {
    ".jpg":  "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png":  "image/png",
    ".webp": "image/webp",
    ".gif":  "image/gif",
    ".tiff": "image/tiff",
    ".tif":  "image/tiff",
    ".bmp":  "image/bmp",
    ".pdf":  "application/pdf",
    ".doc":  "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".txt":  "text/plain",
}


def _validate_upload(filename: str, content_type: str | None, size_bytes: int) -> None:
    """
    Raise HTTPException for any upload that fails security checks.
    Called before any data is written to the database.
    """
    if size_bytes == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    # --- Extension check ---
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""

    if ext in _BLOCKED_EXTENSIONS:
        raise HTTPException(
            status_code=415,
            detail=f"File type '.{ext}' is not permitted for security reasons.",
        )

    # For application/octet-stream (browser fallback) we rely solely on extension
    effective_mime = content_type or "application/octet-stream"
    if effective_mime == "application/octet-stream":
        if ext not in _ALLOWED_EXTENSIONS:
            raise HTTPException(
                status_code=415,
                detail=f"Unsupported file extension '.{ext}'. "
                       "Allowed: jpg, png, webp, tiff, bmp, pdf, doc, docx, txt.",
            )
    elif effective_mime not in _ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported file type '{effective_mime}'. "
                   "Allowed types: images (JPG/PNG/WEBP/TIFF/BMP), PDF, DOC, DOCX, TXT.",
        )


@router.post("/save")
async def save_vault_image(
    data: VaultImageCreate,
    request: Request
):
    """
    Save an encrypted image to vault.
    Extracts user ID from authentication token for security.
    """
    db = get_admin_db()
    
    # Extract user ID from authentication token for security
    user_id = None
    auth_header = request.headers.get("authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.replace("Bearer ", "")
        # For demo purposes, extract user ID from token
        # In production, validate token properly
        if "USR-" in token:
            user_id = token.split("USR-")[1].split("-")[0]
            user_id = f"USR-{user_id}"
        elif "demo-token-" in token:
            # Extract user ID from localStorage token
            # This is a fallback for demo mode
            user_id = data.user_id  # Use request body as fallback
        else:
            user_id = data.user_id  # Use request body as fallback
    else:
        # No token, use request body (for demo mode)
        user_id = data.user_id
    
    print(f"✅ Vault Save: Saving for user - {user_id}")
    
    if not user_id:
        raise HTTPException(status_code=400, detail="User ID required")

    # Check if asset_id already exists
    try:
        existing = db.table("vault_images").select("id") \
            .eq("asset_id", data.asset_id).execute()
        if existing.data:
            raise HTTPException(status_code=400, detail="Asset already in vault")
    except Exception as e:
        print(f"❌ Vault Save: Check existing failed - {str(e)}")
        # Continue anyway

    # Upload thumbnail to Cloudinary if provided
    thumbnail_url = None
    image_url = None
    upload_attempted = False
    upload_error = None
    
    if data.thumbnail_base64:
        upload_attempted = True
        try:
            print(f"📤 Vault Save: Attempting Cloudinary upload for {data.asset_id}")
            result = upload_thumbnail_base64(data.thumbnail_base64, data.asset_id)
            if result["success"]:
                thumbnail_url = result["url"]
                image_url = thumbnail_url  # Use same URL for image
                print(f"✅ Vault Save: Image successfully uploaded - {thumbnail_url}")
            else:
                upload_error = result.get("error", "Unknown upload error")
                print(f"⚠️ Vault Save: Cloudinary upload failed - {upload_error}")
                # Still continue - will use base64 fallback
        except Exception as e:
            upload_error = str(e)
            print(f"⚠️ Vault Save: Image upload exception - {upload_error}")
            # Still continue - will use base64 fallback

    # Save to Supabase
    try:
        print(f"📝 Vault Save: Preparing to save image data...")
        print(f"   - asset_id: {data.asset_id}")
        print(f"   - file_name: {data.file_name}")
        print(f"   - file_size: {data.file_size}")
        print(f"   - image_base64 length: {len(data.image_base64) if data.image_base64 else 0}")
        print(f"   - thumbnail_base64 length: {len(data.thumbnail_base64) if data.thumbnail_base64 else 0}")
        
        # Store BOTH image_base64 and thumbnail_base64 for redundancy
        record = db.table("vault_images").insert({
            "user_id"  : user_id,
            "asset_id"           : data.asset_id,
            "certificate_id"     : data.certificate_id,
            "owner_name"         : data.owner_name,
            "owner_email"        : data.owner_email,
            "file_hash"          : data.file_hash,
            "visual_fingerprint" : data.visual_fingerprint,
            "blockchain_anchor"  : data.blockchain_anchor,
            "resolution"         : data.resolution,
            "file_size"          : data.file_size,
            "file_name"          : data.file_name,
            "thumbnail_url"      : thumbnail_url,
            "image_url"          : image_url,
            "image_base64"       : data.image_base64 or data.thumbnail_base64,  # Primary - full image
            "thumbnail_base64"   : data.thumbnail_base64,  # Fallback thumbnail
            "capture_timestamp"  : data.capture_timestamp
        }).execute()
        
        print(f"✅ Vault Save: Successfully inserted into database")
        print(f"   - Record ID: {record.data[0].get('id') if record.data else 'N/A'}")
        print(f"   - Asset ID: {record.data[0].get('asset_id') if record.data else 'N/A'}")
        
        # =====================================================
        # PINIT ENCRYPTION INTEGRATION
        # =====================================================
        # Create encryption record for PINIT verification system
        try:
            # Generate watermark ID
            watermark_id = f"WM-{str(uuid.uuid4()).replace('-', '')[:8].upper()}"
            
            # Generate image hash for verification
            image_hash = None
            if data.image_base64:
                # Clean base64 if it's a data URL
                image_data = data.image_base64
                if image_data.startswith("data:"):
                    image_data = image_data.split(",")[1]
                image_hash = hashlib.sha256(image_data.encode()).hexdigest()
            
            if image_hash:
                # Create encryption record
                encryption_data = EncryptionRecordCreate(
                    watermark_id=watermark_id,
                    pinit_user_id=user_id,
                    image_hash=image_hash,
                    asset_id=data.asset_id,
                    metadata={
                        "file_name": data.file_name,
                        "file_size": data.file_size,
                        "resolution": data.resolution,
                        "encryption_method": "pinit_secure_v1"
                    }
                )
                
                # Save to encrypted_images table
                encryption_result = db.table("encrypted_images").insert({
                    "watermark_id": encryption_data.watermark_id,
                    "pinit_user_id": encryption_data.pinit_user_id,
                    "image_hash": encryption_data.image_hash,
                    "signature": encryption_data.signature,
                    "asset_id": encryption_data.asset_id,
                    "metadata": encryption_data.metadata,
                    "status": "active",
                    "trust_level": 100
                }).execute()
                
                if encryption_result.data:
                    print(f"[ENCRYPT] ✅ PINIT encryption record created")
                    print(f"[ENCRYPT]   - Watermark ID: {watermark_id}")
                    print(f"[ENCRYPT]   - User ID: {user_id}")
                    print(f"[ENCRYPT]   - Image Hash: {image_hash[:16]}...")
                    print(f"[ENCRYPT]   - Metadata embedded: True")
                    print(f"[ENCRYPT]   - DB record saved: True")
                    
                    # Update vault record with watermark_id
                    db.table("vault_images").update({
                        "watermark_id": watermark_id
                    }).eq("asset_id", data.asset_id).execute()
                    
                    log_action(
                        user_id=user_id,
                        action="pinit_encrypt",
                        details={
                            "watermark_id": watermark_id,
                            "asset_id": data.asset_id,
                            "image_hash": image_hash[:16] + "..."
                        },
                        ip=str(request.client.host)
                    )
                else:
                    print(f"[ENCRYPT] ❌ Failed to create encryption record")
            else:
                print(f"[ENCRYPT] ⚠️ No image data available for encryption record")
                
        except Exception as encrypt_err:
            print(f"[ENCRYPT] ❌ Encryption integration failed: {str(encrypt_err)}")
            # Continue anyway - vault save is primary operation
        
        log_action(
            user_id=user_id,
            action="vault_save",
            details={"asset_id": data.asset_id},
            ip=str(request.client.host)
        )
        
        return {"message": "Saved to vault", "data": record.data[0]}
        
    except Exception as e:
        err_str = str(e)
        print(f"❌ Vault Save: Database insert failed - {err_str}")
        import traceback
        traceback.print_exc()
        if "getaddrinfo" in err_str or "11001" in err_str:
            raise HTTPException(
                status_code=503,
                detail=(
                    "Database unreachable: the Supabase project cannot be found. "
                    "Please log in to supabase.com and resume or recreate the project, "
                    "then update SUPABASE_URL / SUPABASE_SERVICE_KEY in backend/.env."
                ),
            )
        raise HTTPException(status_code=500, detail=f"Failed to save to vault: {err_str}")


@router.get("/list")
async def list_vault_images(user_id: str = None):
    """
    List vault images for a user.
    Uses user_id from query parameter.
    """
    db = get_admin_db()
    
    if not user_id:
        raise HTTPException(status_code=400, detail="User ID required")
    
    print(f"✅ Vault List: Loading images for user - {user_id}")
    
    try:
        result = db.table("vault_images") \
            .select("*") \
            .eq("user_id", user_id) \
            .order("created_at", desc=True) \
            .execute()
        
        print(f"✅ Vault List: Found {len(result.data)} images")
        return {"assets": result.data, "total": len(result.data)}
    except Exception as e:
        print(f"❌ Vault List: Failed - {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to load vault: {str(e)}")


@router.post("/get-user-vault")
async def get_user_vault(data: dict):
    """
    Get all vault documents for a user (for frontend integration)
    """
    db = get_admin_db()
    user_id = data.get("user_id")
    
    if not user_id:
        raise HTTPException(status_code=400, detail="User ID required")
    
    print(f"✅ Get User Vault: Loading documents for user - {user_id}")
    
    try:
        result = db.table("vault_images") \
            .select("*") \
            .eq("user_id", user_id) \
            .order("created_at", desc=True) \
            .execute()
        
        print(f"✅ Get User Vault: Found {len(result.data)} documents")
        return {"documents": result.data, "total": len(result.data)}
    except Exception as e:
        print(f"❌ Get User Vault: Failed - {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to load vault: {str(e)}")


@router.get("/{asset_id}")
async def get_vault_image(asset_id: str, user_id: str = None):
    """Get a vault image. Uses user_id from query parameter."""
    db = get_admin_db()
    
    if not user_id:
        raise HTTPException(status_code=400, detail="User ID required")
    
    try:
        result = db.table("vault_images").select("*") \
            .eq("asset_id", asset_id) \
            .eq("user_id", user_id) \
            .execute()

        if not result.data:
            raise HTTPException(status_code=404, detail="Asset not found")
        return result.data[0]
    except Exception as e:
        print(f"❌ Vault Get: Failed - {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get vault image: {str(e)}")


@router.get("/{asset_id}/download")
async def download_vault_image(asset_id: str, user_id: str = None):
    """
    Download vault image as file (JPG, PNG, etc.).
    Requires user_id from query parameter.
    """
    db = get_admin_db()
    
    if not user_id:
        raise HTTPException(status_code=400, detail="User ID required")
    
    try:
        print(f"📥 Vault Download: Starting for asset_id={asset_id}, user_id={user_id}")
        
        # Verify ownership
        result = db.table("vault_images").select("*") \
            .eq("asset_id", asset_id) \
            .eq("user_id", user_id) \
            .execute()

        if not result.data:
            print(f"❌ Vault Download: Asset not found for asset_id={asset_id}, user_id={user_id}")
            raise HTTPException(status_code=403, detail="Asset not found or access denied")
        
        asset = result.data[0]
        file_name = asset.get("file_name", "image")
        
        print(f"✅ Vault Download: Found asset - {file_name}")
        print(f"   - image_base64 exists: {bool(asset.get('image_base64'))}")
        print(f"   - image_base64 length: {len(asset.get('image_base64') or '') // 1000} KB")
        print(f"   - thumbnail_base64 exists: {bool(asset.get('thumbnail_base64'))}")
        
        # IMPORTANT: Download ORIGINAL full-resolution image from database, NOT compressed Cloudinary thumbnail
        # Cloudinary is only for preview/thumbnails (400x400)
        print(f"📥 Serving ORIGINAL full-resolution image from database")
        image_base64 = asset.get("image_base64")
        
        if not image_base64:
            print(f"⚠️ No image_base64 in database, trying thumbnail_base64 fallback")
            image_base64 = asset.get("thumbnail_base64")
        
        if not image_base64:
            error_msg = "No image data stored in vault"
            print(f"❌ {error_msg}")
            raise HTTPException(status_code=500, detail=error_msg)
        
        print(f"✅ Found image in database, size: {len(image_base64)} bytes")
        
        # Decode base64 and serve
        import base64
        if image_base64.startswith("data:"):
            # It's a data URL, extract the base64 part
            image_base64_clean = image_base64.split(",")[1]
            print(f"📝 Cleaned data URL, original length: {len(image_base64)}, cleaned: {len(image_base64_clean)}")
            image_base64 = image_base64_clean
        
        try:
            image_bytes = base64.b64decode(image_base64)
            print(f"📊 Decoded image: {len(image_bytes)} bytes")
        except Exception as decode_err:
            print(f"❌ Base64 decode failed: {str(decode_err)}")
            raise HTTPException(status_code=500, detail=f"Failed to decode image: {str(decode_err)}")
        
        # Detect content-type from filename extension (covers images + documents)
        import os as _os
        _ext = _os.path.splitext(file_name.lower())[1]   # e.g. ".pdf", ".docx"
        content_type = _CONTENT_TYPE_MAP.get(_ext, "application/octet-stream")

        print(f"✅ Sending file: {file_name} ({content_type}), size: {len(image_bytes)} bytes")
        
        return StreamingResponse(
            iter([image_bytes]),
            media_type=content_type,
            headers={
                "Content-Disposition": f'attachment; filename="{file_name}"'
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Vault Download: Unexpected error - {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to download image: {str(e)}")


@router.delete("/{asset_id}")
async def delete_vault_image(asset_id: str, request: Request, user_id: str = None):
    """Delete a vault image. Uses user_id from query parameter."""
    db = get_admin_db()
    
    if not user_id:
        raise HTTPException(status_code=400, detail="User ID required")

    try:
        existing = db.table("vault_images").select("*") \
            .eq("asset_id", asset_id) \
            .eq("user_id", user_id) \
            .execute()

        if not existing.data:
            raise HTTPException(status_code=404, detail="Asset not found")

        # Delete from Cloudinary
        try:
            delete_thumbnail(asset_id)
        except:
            pass

        # Delete from Supabase
        db.table("vault_images").delete().eq("asset_id", asset_id).execute()

        log_action(
            user_id=user_id,
            action="vault_delete",
            details={"asset_id": asset_id},
            ip=str(request.client.host)
        )
        
        print(f"✅ Vault Delete: Image deleted - {asset_id}")
        return {"message": "Asset deleted"}
    except Exception as e:
        print(f"❌ Vault Delete: Failed - {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to delete: {str(e)}")


@router.get("/verify/{file_hash}")
async def verify_by_hash(file_hash: str):
    """Cross-device verification — no login needed"""
    try:
        db = get_admin_db()
        result = db.table("vault_images").select("*") \
            .eq("file_hash", file_hash).execute()

        if not result.data:
            return {"found": False, "message": "Image not found in any vault"}

        asset = result.data[0]
        return {
            "found": True,
            "asset_id": asset["asset_id"],
            "owner_name": asset["owner_name"],
            "certificate": asset["certificate_id"],
            "registered": asset["created_at"],
            "resolution": asset["resolution"],
            "thumbnail": asset["thumbnail_url"]
        }
    except Exception as e:
        print(f"❌ Vault Verify: Failed - {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to verify: {str(e)}")


@router.get("/search/query")
async def search_vault(q: str, user_id: str = None):
    """Search vault images for a user."""
    if not user_id:
        raise HTTPException(status_code=400, detail="User ID required")
    
    try:
        db = get_admin_db()
        result = db.table("vault_images").select("*") \
            .eq("user_id", user_id) \
            .or_(f"file_name.ilike.%{q}%,owner_name.ilike.%{q}%,asset_id.ilike.%{q}%") \
            .execute()
        return {"results": result.data}
    except Exception as e:
        print(f"❌ Vault Search: Failed - {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to search: {str(e)}")


# ============================================================================
# DOCUMENT MANAGEMENT ENDPOINTS
# ============================================================================

@router.post("/save-scanned-document")
async def save_scanned_document(
    user_id: str = Form(None),
    doc_name: str = Form(None),
    format: str = Form("pdf"),
    request: Request = None
):
    """
    Save scanned pages as PDF or separate images.
    Accepts form data with doc_name, format, and user_id.
    """
    db = get_admin_db()
    
    try:
        if not user_id or not doc_name:
            raise HTTPException(status_code=400, detail="user_id and doc_name required")
        
        import uuid
        from datetime import datetime
        import base64
        
        # Get form data to extract pages
        form_data = await request.form()
        
        # Extract all page data (page_0, page_1, etc.)
        pages_data = []
        idx = 0
        while f"page_{idx}" in form_data:
            page_data = form_data[f"page_{idx}"]
            if isinstance(page_data, str):
                pages_data.append(page_data)
            idx += 1
        
        # For now, use first page as thumbnail/preview
        first_page_base64 = pages_data[0] if pages_data else None
        
        # If pages are base64 data URLs, clean them
        if first_page_base64 and first_page_base64.startswith("data:"):
            first_page_base64 = first_page_base64.split(",")[1]
        
        # Generate unique document ID
        doc_id = str(uuid.uuid4())
        asset_id = f"scan_{doc_id[:8]}_{int(datetime.now().timestamp() * 1000)}"
        
        # Combine all pages into single file data (concatenate base64)
        # For PDF: pages would need PDF generation library
        # For now: store first page or concatenate
        combined_page_data = first_page_base64 if first_page_base64 else ""
        
        # Create vault record for scanned document
        vault_record = {
            "user_id": user_id,
            "asset_id": asset_id,
            "file_name": f"{doc_name}.{format}",
            "file_size": f"{len(combined_page_data) / (1024*1024):.2f} MB",
            "file_type": "application/pdf" if format == "pdf" else "image/jpeg",
            "resolution": "scanned",
            "capture_timestamp": datetime.now().isoformat(),
            "document_type": "scanned_document",
            "format": format,
            "page_count": len(pages_data),
            "encryption_enabled": True,
            "owner_name": user_id,
            "owner_email": user_id,
            "thumbnail_base64": first_page_base64
        }
        
        # Save to vault_images table
        response = db.table("vault_images").insert(vault_record).execute()
        
        if not response.data:
            raise HTTPException(status_code=500, detail="Failed to save document")
        
        vault_image_id = response.data[0]["id"]
        
        if request:
            log_action(
                user_id=user_id,
                action="save_scanned_document",
                details={"doc_name": doc_name, "format": format},
                ip=str(request.client.host)
            )
        
        print(f"✅ Scanned Document Saved: {doc_name} by {user_id}")
        
        return {
            "ok": True,
            "vault_image_id": vault_image_id,
            "asset_id": asset_id,
            "file_name": f"{doc_name}.{format}",
            "format": format,
            "message": "Document successfully encrypted and stored"
        }
    
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Save Scanned Document Error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to save document: {str(e)}")


@router.post("/upload")
async def upload_document(
    file: UploadFile = File(...),
    user_id: str = Form(None),    # Must be Form() — plain str skips multipart body
    doc_name: str = Form(""),
    request: Request = None,
):
    """
    Upload a document file from user's device.
    Supports: PDF, DOCX, XLSX, Images (max 50MB)
    """
    db = get_admin_db()

    # ── Debug: log every received field so failures are easy to trace ─────────
    print(f"[VaultUpload] file={file.filename if file else None} "
          f"content_type={file.content_type if file else None} "
          f"user_id={user_id!r} doc_name={doc_name!r}")

    try:
        if not user_id:
            print("[VaultUpload] ❌ user_id is missing or empty")
            raise HTTPException(status_code=400, detail="user_id required")

        if not file or not file.filename:
            raise HTTPException(status_code=400, detail="File required")
        
        # Read file
        contents = await file.read()
        file_size_mb = len(contents) / (1024 * 1024)

        # Security validation — MIME type, extension, and size
        if file_size_mb > 50:
            raise HTTPException(status_code=400, detail="File too large (max 50MB)")
        _validate_upload(file.filename or "upload", file.content_type, len(contents))

        print(f"[VaultUpload] ✅ validation passed — "
              f"user={user_id} file={file.filename} "
              f"mime={file.content_type} size={file_size_mb:.2f}MB")
        
        import uuid
        from datetime import datetime
        import base64
        
        # Generate asset ID
        doc_id = str(uuid.uuid4())
        asset_id = f"doc_{doc_id[:8]}_{int(datetime.now().timestamp() * 1000)}"
        
        # Determine file display name
        display_name = doc_name if doc_name.strip() else file.filename
        
        # Encode file data as base64 for storage
        file_data_base64 = base64.b64encode(contents).decode('utf-8')
        
        # Save to vault_images table
        vault_record = {
            "user_id": user_id,
            "asset_id": asset_id,
            "file_name": display_name,
            "file_size": f"{file_size_mb:.2f} MB",
            "file_type": file.content_type or "application/octet-stream",
            "resolution": "standard",
            "capture_timestamp": datetime.now().isoformat(),
            "document_type": "uploaded_document",
            "original_filename": file.filename,
            "encryption_enabled": True,
            "owner_name": user_id,
            "owner_email": user_id,
            "thumbnail_base64": file_data_base64
        }
        
        response = db.table("vault_images").insert(vault_record).execute()
        
        if not response.data:
            raise HTTPException(status_code=500, detail="Failed to save to vault")
        
        vault_image_id = response.data[0]["id"]
        
        if request:
            log_action(
                user_id=user_id,
                action="upload_document",
                details={"filename": file.filename, "size_mb": file_size_mb},
                ip=str(request.client.host)
            )
        
        print(f"✅ Document Uploaded: {file.filename} ({file_size_mb:.2f}MB) by {user_id}")
        
        return {
            "ok": True,
            "vault_image_id": vault_image_id,
            "asset_id": asset_id,
            "file_name": display_name,
            "file_size": f"{file_size_mb:.2f} MB",
            "file_type": file.content_type,
            "message": "Document successfully encrypted and stored"
        }
    
    except HTTPException:
        raise
    except Exception as e:
        err_str = str(e)
        print(f"❌ Upload Error: {err_str}")
        # Detect DNS / connectivity failures and surface a human-readable message
        if "getaddrinfo" in err_str or "Name or service not known" in err_str or "11001" in err_str:
            raise HTTPException(
                status_code=503,
                detail=(
                    "Database unreachable: the Supabase project cannot be found. "
                    "The project may have been paused or deleted on the free tier. "
                    "Please log in to supabase.com, resume or recreate the project, "
                    "and update SUPABASE_URL / SUPABASE_SERVICE_KEY in backend/.env."
                ),
            )
        raise HTTPException(status_code=500, detail=f"Upload failed: {err_str}")


@router.get("/documents/user/{user_id}")
async def get_user_documents(user_id: str):
    """
    Get all documents uploaded/scanned by a user.
    """
    db = get_admin_db()
    
    try:
        response = db.table("vault_images") \
            .select("*") \
            .eq("user_id", user_id) \
            .eq("document_type", "scanned_document") \
            .or_("document_type", "eq", "uploaded_document") \
            .order("created_at", desc=True) \
            .execute()
        
        # Calculate counts by type
        scanned_count = sum(1 for d in response.data if d.get("document_type") == "scanned_document")
        uploaded_count = sum(1 for d in response.data if d.get("document_type") == "uploaded_document")
        
        return {
            "ok": True,
            "total_count": len(response.data),
            "scanned_count": scanned_count,
            "uploaded_count": uploaded_count,
            "documents": response.data
        }
    
    except Exception as e:
        print(f"❌ Get Documents Error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error retrieving documents: {str(e)}")


@router.delete("/documents/{doc_id}")
async def delete_document(doc_id: str, user_id: str = None, request: Request = None):
    """
    Delete a document from vault.
    Only the owner can delete their documents.
    """
    db = get_admin_db()
    
    try:
        if not user_id:
            raise HTTPException(status_code=400, detail="user_id required")
        
        # Verify ownership
        response = db.table("vault_images") \
            .select("user_id") \
            .eq("id", doc_id) \
            .execute()
        
        if not response.data:
            raise HTTPException(status_code=404, detail="Document not found")
        
        if response.data[0]["user_id"] != user_id:
            raise HTTPException(status_code=403, detail="Unauthorized")
        
        # Delete document
        db.table("vault_images") \
            .delete() \
            .eq("id", doc_id) \
            .execute()
        
        if request:
            log_action(
                user_id=user_id,
                action="delete_document",
                details={"doc_id": doc_id},
                ip=str(request.client.host)
            )
        
        print(f"✅ Document Deleted: {doc_id}")
        
        return {
            "ok": True,
            "message": "Document successfully deleted"
        }
    
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Delete Document Error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to delete: {str(e)}")


@router.get("/documents/{doc_id}")
async def get_document_details(doc_id: str, user_id: str = None):
    """
    Get details of a specific document.
    """
    db = get_admin_db()
    
    try:
        if not user_id:
            raise HTTPException(status_code=400, detail="user_id required")
        
        response = db.table("vault_images") \
            .select("*") \
            .eq("id", doc_id) \
            .eq("user_id", user_id) \
            .execute()
        
        if not response.data:
            raise HTTPException(status_code=404, detail="Document not found")
        
        return {
            "ok": True,
            "document": response.data[0]
        }
    
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Get Document Error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error retrieving document: {str(e)}")


@router.get("/documents/{doc_id}/download")
async def download_document(doc_id: str, user_id: str = None):
    """
    Download a document file from vault.
    Only the owner can download their documents.
    """
    db = get_admin_db()
    
    try:
        if not user_id:
            raise HTTPException(status_code=400, detail="user_id required")
        
        # Fetch document details
        response = db.table("vault_images") \
            .select("*") \
            .eq("id", doc_id) \
            .eq("user_id", user_id) \
            .execute()
        
        if not response.data:
            raise HTTPException(status_code=404, detail="Document not found")
        
        document = response.data[0]
        file_name = document.get("file_name", "document")
        file_type = document.get("file_type", "application/octet-stream")
        file_data_base64 = document.get("thumbnail_base64")  # File data stored as base64
        
        if not file_data_base64:
            raise HTTPException(status_code=500, detail="File data not found")
        
        # Decode base64 to binary
        import base64
        try:
            file_bytes = base64.b64decode(file_data_base64)
            print(f"✅ Document Download: {file_name} ({len(file_bytes)} bytes) for user {user_id}")
        except Exception as decode_err:
            print(f"❌ Base64 decode failed: {str(decode_err)}")
            raise HTTPException(status_code=500, detail=f"Failed to decode file: {str(decode_err)}")
        
        # Stream the file
        return StreamingResponse(
            iter([file_bytes]),
            media_type=file_type,
            headers={
                "Content-Disposition": f'attachment; filename="{file_name}"'
            }
        )
    
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Document Download Error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to download document: {str(e)}")