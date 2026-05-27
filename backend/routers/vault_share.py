"""
Secure Resume / Document Sharing
==================================
Phase 2 — secure streaming viewer (no raw Supabase URLs exposed)
Phase 3 — email / phone masking in viewer layer
Phase 4 — view-activity logging

Routes
------
POST /vault/share/{asset_id}              — generate share token (owner only)
GET  /vault/shared-view/{token}           — stream decrypted file
GET  /vault/shared-view/{token}/info      — masked metadata for viewer UI
GET  /vault/shared-view/{token}/activity  — view log for owner
"""

from __future__ import annotations

import logging
import os
import re
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse

from db.database import get_admin_db
from utils.aes_cipher import decrypt_bytes, is_encrypted

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Vault Share"])

_STORAGE_BUCKET = "vault-encrypted"
_STORAGE_PREFIX  = f"supabase-storage:{_STORAGE_BUCKET}/"
_SHARE_TTL_DAYS  = 30   # tokens expire after 30 days

# Content-type map (mirrors vault.py)
_MIME_MAP: Dict[str, str] = {
    ".jpg":  "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png":  "image/png",
    ".webp": "image/webp",
    ".gif":  "image/gif",
    ".bmp":  "image/bmp",
    ".tiff": "image/tiff",
    ".tif":  "image/tiff",
    ".pdf":  "application/pdf",
    ".doc":  "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".txt":  "text/plain",
}


# ─────────────────────────────────────────────────────────────────────────────
# Shared helpers
# ─────────────────────────────────────────────────────────────────────────────

def _fetch_and_decrypt(db, asset: dict, file_name: str) -> bytes:
    """
    Retrieve and decrypt an asset from Supabase Storage or DB fallback.
    Identical logic to vault.py — kept in sync intentionally.
    """
    import base64 as _b64

    image_url_ptr = asset.get("image_url", "") or ""
    raw_bytes: bytes | None = None

    if image_url_ptr.startswith(_STORAGE_PREFIX):
        storage_path = image_url_ptr[len(_STORAGE_PREFIX):]
        logger.info("[VAULT] Fetching encrypted blob — path: %s", storage_path)
        try:
            raw_bytes = db.storage.from_(_STORAGE_BUCKET).download(storage_path)
            logger.info("[VAULT] Storage fetch OK — %d B", len(raw_bytes))
        except Exception as exc:
            logger.error("[VAULT] Storage fetch failed: %s", exc)
            raise HTTPException(status_code=500, detail=f"Storage fetch failed: {exc}")

    if raw_bytes is None:
        b64_data = asset.get("thumbnail_base64") or asset.get("image_base64")
        if not b64_data:
            raise HTTPException(status_code=500, detail="No file data found in vault record.")
        if b64_data.startswith("data:"):
            b64_data = b64_data.split(",", 1)[1]
        try:
            raw_bytes = _b64.b64decode(b64_data)
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Failed to decode stored data: {exc}")

    if is_encrypted(raw_bytes):
        try:
            file_bytes = decrypt_bytes(raw_bytes)
            logger.info("[VAULT] Decryption success — %d B → %d B", len(raw_bytes), len(file_bytes))
            return file_bytes
        except Exception as exc:
            logger.error("[VAULT] Decryption failed: %s", exc)
            raise HTTPException(status_code=500, detail=f"Decryption failed: {exc}")

    logger.info("[VAULT] Legacy plaintext record — %s", file_name)
    return raw_bytes


def _mime_from_filename(filename: str, fallback: str = "application/octet-stream") -> str:
    ext = os.path.splitext(filename.lower())[1]
    return _MIME_MAP.get(ext, fallback)


# ─────────────────────────────────────────────────────────────────────────────
# Phase 3 — contact info masking
# ─────────────────────────────────────────────────────────────────────────────

_EMAIL_RE = re.compile(
    r"[a-zA-Z0-9._%+\-]{2,}@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}"
)
_PHONE_RE = re.compile(
    r"(?<!\d)"
    r"(?:\+91[\s\-]?)?"
    r"(?:\(?\d{2,4}\)?[\s\-]?)?"
    r"\d{3,5}[\s\-]?\d{4,6}"
    r"(?!\d)"
)


def _mask_email(email: str) -> str:
    local, domain = email.rsplit("@", 1)
    visible = local[:3] if len(local) >= 3 else local[:1]
    return f"{visible}{'*' * max(3, len(local) - 3)}@{domain}"


def _mask_phone(phone: str) -> str:
    digits = re.sub(r"\D", "", phone)
    if len(digits) >= 4:
        return f"{'*' * (len(digits) - 4)}{digits[-4:]}"
    return "****"


def _mask_text(text: str) -> tuple[str, list[dict]]:
    """
    Replace emails and phone numbers with masked versions.
    Returns (masked_text, list_of_findings).
    """
    findings: list[dict] = []
    result = text

    for m in _EMAIL_RE.finditer(text):
        masked = _mask_email(m.group())
        findings.append({"type": "email", "original": m.group(), "masked": masked})
        result = result.replace(m.group(), masked, 1)

    for m in _PHONE_RE.finditer(text):
        raw_phone = m.group().strip()
        if len(re.sub(r"\D", "", raw_phone)) < 7:
            continue   # too short — likely a date/number, skip
        masked = _mask_phone(raw_phone)
        findings.append({"type": "phone", "original": raw_phone, "masked": masked})
        result = result.replace(raw_phone, masked, 1)

    return result, findings


def _extract_pdf_text(pdf_bytes: bytes) -> str:
    """Extract text from PDF bytes using pdfplumber (best-effort)."""
    try:
        import io
        import pdfplumber
        parts: list[str] = []
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            for page in pdf.pages:
                txt = page.extract_text() or ""
                if txt:
                    parts.append(txt)
        return "\n\n".join(parts)
    except Exception as exc:
        logger.warning("[VAULT] PDF text extraction failed: %s", exc)
        return ""


# ─────────────────────────────────────────────────────────────────────────────
# Phase 4 — view-activity logging
# ─────────────────────────────────────────────────────────────────────────────

def _log_view_activity(
    db,
    *,
    document_id: str,
    owner_user_id: str,
    viewer_ip: str,
    user_agent: str,
    share_token: str,
    access_type: str = "shared_view",
) -> None:
    """Insert a row into document_view_activity (best-effort — never raises)."""
    try:
        db.table("document_view_activity").insert({
            "document_id"   : document_id,
            "owner_user_id" : owner_user_id,
            "viewer_ip"     : viewer_ip,
            "browser_device": user_agent[:500],
            "viewed_at"     : datetime.now(timezone.utc).isoformat(),
            "access_type"   : access_type,
            "share_token"   : share_token,
        }).execute()
        logger.info("[VAULT] View activity logged — doc=%s ip=%s", document_id, viewer_ip)
    except Exception as exc:
        logger.warning("[VAULT] Activity log failed (non-fatal): %s", exc)


# ─────────────────────────────────────────────────────────────────────────────
# Routes
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/vault/share/{asset_id}")
async def generate_share_token(
    asset_id: str,
    request: Request,
    user_id: str = None,
):
    """
    Generate a secure share token for an asset (owner only).
    Query param: ?user_id=<owner_user_id>
    """
    if not user_id:
        raise HTTPException(status_code=400, detail="user_id required")

    db = get_admin_db()

    # Verify ownership
    res = db.table("vault_images").select("id, file_name, file_type, user_id") \
        .eq("asset_id", asset_id).eq("user_id", user_id).execute()

    if not res.data:
        raise HTTPException(status_code=404, detail="Asset not found or not yours")

    asset_row = res.data[0]

    # Generate cryptographically secure token
    token = secrets.token_urlsafe(32)
    expires_at = (datetime.now(timezone.utc) + timedelta(days=_SHARE_TTL_DAYS)).isoformat()

    try:
        db.table("document_share_tokens").insert({
            "share_token"  : token,
            "asset_id"     : asset_id,
            "user_id"      : user_id,
            "expires_at"   : expires_at,
            "is_active"    : True,
            "created_at"   : datetime.now(timezone.utc).isoformat(),
        }).execute()
    except Exception as exc:
        logger.error("[VAULT] Share token insert failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"Failed to create share token: {exc}")

    logger.info("[VAULT] Share token created — asset=%s user=%s", asset_id, user_id)

    return {
        "ok"         : True,
        "share_token": token,
        "asset_id"   : asset_id,
        "file_name"  : asset_row.get("file_name"),
        "expires_at" : expires_at,
        "viewer_url" : f"/shared-view/{token}",
    }


@router.get("/vault/shared-view/{token}")
async def secure_view(token: str, request: Request):
    """
    Stream the decrypted document through the backend.
    No auth required — anyone with the token can view.
    Never exposes raw Supabase URLs or .enc files.
    """
    db = get_admin_db()

    # ── Resolve token ─────────────────────────────────────────────────────────
    tok_res = db.table("document_share_tokens").select("*") \
        .eq("share_token", token).eq("is_active", True).execute()

    if not tok_res.data:
        raise HTTPException(status_code=404, detail="Share link not found or expired")

    tok  = tok_res.data[0]
    # Check expiry
    if tok.get("expires_at"):
        try:
            exp = datetime.fromisoformat(tok["expires_at"].replace("Z", "+00:00"))
            if datetime.now(timezone.utc) > exp:
                raise HTTPException(status_code=410, detail="Share link has expired")
        except HTTPException:
            raise
        except Exception:
            pass   # invalid date format — allow through

    asset_id     = tok["asset_id"]
    owner_user_id = tok["user_id"]

    # ── Fetch asset record ────────────────────────────────────────────────────
    asset_res = db.table("vault_images").select("*") \
        .eq("asset_id", asset_id).execute()

    if not asset_res.data:
        raise HTTPException(status_code=404, detail="Document not found")

    asset     = asset_res.data[0]
    file_name = asset.get("file_name") or asset.get("original_filename") or "document"
    file_type = asset.get("file_type", "application/octet-stream")

    logger.info("[VAULT] Fetching encrypted blob for shared view — asset=%s token=%s",
                asset_id, token[:8] + "...")

    # ── Fetch + decrypt ───────────────────────────────────────────────────────
    file_bytes   = _fetch_and_decrypt(db, asset, file_name)
    content_type = _mime_from_filename(file_name, file_type)

    logger.info("[VAULT] MIME type detected: %s for %s", content_type, file_name)
    logger.info("[VAULT] Streaming decrypted file: %s (%d bytes)", file_name, len(file_bytes))

    # ── Phase 4: Log view activity ────────────────────────────────────────────
    viewer_ip = (
        request.headers.get("x-forwarded-for", "").split(",")[0].strip()
        or (request.client.host if request.client else "unknown")
    )
    user_agent = request.headers.get("user-agent", "")

    _log_view_activity(
        db,
        document_id   = asset.get("id", asset_id),
        owner_user_id = owner_user_id,
        viewer_ip     = viewer_ip,
        user_agent    = user_agent,
        share_token   = token,
        access_type   = "shared_view",
    )

    # Serve inline so browser opens it (not download prompt)
    return StreamingResponse(
        iter([file_bytes]),
        media_type=content_type,
        headers={
            "Content-Disposition"       : f'inline; filename="{file_name}"',
            "X-Content-Type-Options"    : "nosniff",
            "Cache-Control"             : "no-store",
            # Prevent hotlinking / direct embedding outside our app
            "X-Frame-Options"           : "SAMEORIGIN",
        },
    )


@router.get("/vault/shared-view/{token}/info")
async def secure_view_info(token: str, request: Request):
    """
    Return masked metadata for the viewer UI (Phase 3).
    Extracts text from the PDF, masks email / phone.
    Never returns the raw file.
    """
    db = get_admin_db()

    tok_res = db.table("document_share_tokens").select("*") \
        .eq("share_token", token).eq("is_active", True).execute()

    if not tok_res.data:
        raise HTTPException(status_code=404, detail="Share link not found")

    tok      = tok_res.data[0]
    asset_id = tok["asset_id"]

    asset_res = db.table("vault_images").select("*") \
        .eq("asset_id", asset_id).execute()

    if not asset_res.data:
        raise HTTPException(status_code=404, detail="Document not found")

    asset     = asset_res.data[0]
    file_name = asset.get("file_name") or "document"
    file_type = asset.get("file_type", "")

    # Only extract+mask text for PDFs and text files
    masked_text: Optional[str]  = None
    findings:    List[dict]     = []
    is_pdf = file_name.lower().endswith(".pdf") or "pdf" in file_type

    if is_pdf:
        try:
            file_bytes       = _fetch_and_decrypt(db, asset, file_name)
            raw_text         = _extract_pdf_text(file_bytes)
            masked_text, findings = _mask_text(raw_text)
        except Exception as exc:
            logger.warning("[VAULT] Info extraction failed: %s", exc)

    return {
        "ok"          : True,
        "file_name"   : file_name,
        "file_type"   : file_type,
        "is_pdf"      : is_pdf,
        "masked_text" : masked_text,
        "findings"    : findings,
        "viewer_url"  : f"/vault/shared-view/{token}",
        "asset_id"    : asset_id,
    }


@router.get("/vault/shared-view/{token}/activity")
async def view_activity(token: str, user_id: str = None):
    """Return view-activity log for the owner of a share token."""
    if not user_id:
        raise HTTPException(status_code=400, detail="user_id required")

    db = get_admin_db()

    tok_res = db.table("document_share_tokens").select("*") \
        .eq("share_token", token).eq("user_id", user_id).execute()

    if not tok_res.data:
        raise HTTPException(status_code=404, detail="Share token not found or not yours")

    tok = tok_res.data[0]

    logs = db.table("document_view_activity").select(
        "viewer_ip, browser_device, viewed_at, access_type"
    ).eq("share_token", token).order("viewed_at", desc=True).limit(100).execute()

    return {
        "ok"        : True,
        "asset_id"  : tok["asset_id"],
        "share_token": token,
        "total_views": len(logs.data),
        "activity"  : logs.data,
    }


@router.delete("/vault/share/{token}")
async def revoke_share_token(token: str, user_id: str = None):
    """Revoke (deactivate) a share token."""
    if not user_id:
        raise HTTPException(status_code=400, detail="user_id required")

    db = get_admin_db()
    db.table("document_share_tokens").update({"is_active": False}) \
        .eq("share_token", token).eq("user_id", user_id).execute()

    return {"ok": True, "message": "Share link revoked"}
