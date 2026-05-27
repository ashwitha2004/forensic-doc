"""
Secure Resume Sharing System
============================
Phase 1 – Share Link Generation
Phase 2 – Secure File Streaming (decrypt-in-memory, no raw S3 URLs)
Phase 3 – Contact Masking + Access-Request Workflow
Phase 4 – View Activity Logging + Owner Dashboard

DB tables required (run RESUME_SHARING_TABLES.sql first):
  - resume_share_links
  - resume_view_logs
  - resume_access_requests

Routes
------
POST /resume/share/create               — generate share link (owner)
GET  /resume/share/{token}              — masked preview JSON
GET  /resume/share/{token}/file         — stream decrypted file
POST /resume/share/request-access       — viewer requests contact reveal
POST /resume/share/respond-request      — owner approves / rejects request
GET  /resume/share/activity/{asset_id}  — owner dashboard data
GET  /resume/share/{token}/check-access — viewer polls approval status
DELETE /resume/share/{token}            — owner revokes link
"""

from __future__ import annotations

import io
import logging
import os
import re
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from db.database import get_admin_db
from utils.aes_cipher import decrypt_bytes, is_encrypted

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Resume Share"])

_STORAGE_BUCKET = "vault-encrypted"
_STORAGE_PREFIX  = f"supabase-storage:{_STORAGE_BUCKET}/"
_SHARE_TTL_DAYS  = 30

_MIME_MAP: Dict[str, str] = {
    ".pdf":  "application/pdf",
    ".doc":  "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".txt":  "text/plain",
    ".jpg":  "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png":  "image/png",
    ".webp": "image/webp",
}


# ─────────────────────────────────────────────────────────────────────────────
# Pydantic request bodies
# ─────────────────────────────────────────────────────────────────────────────

class CreateShareRequest(BaseModel):
    asset_id: str
    user_id: str

class AccessRequest(BaseModel):
    token: str
    requester_name: str
    requester_email: str
    requester_company: Optional[str] = None
    message: Optional[str] = None

class RespondRequest(BaseModel):
    request_id: str
    user_id: str          # must be the owner
    action: str           # "approve" | "reject"


# ─────────────────────────────────────────────────────────────────────────────
# Shared helpers (fetch + decrypt from Supabase Storage or DB fallback)
# ─────────────────────────────────────────────────────────────────────────────

def _fetch_and_decrypt(db, asset: dict, file_name: str) -> bytes:
    """Retrieve and AES-decrypt asset bytes (Storage-first, DB fallback)."""
    import base64 as _b64

    image_url_ptr = asset.get("image_url", "") or ""
    raw_bytes: Optional[bytes] = None

    if image_url_ptr.startswith(_STORAGE_PREFIX):
        storage_path = image_url_ptr[len(_STORAGE_PREFIX):]
        logger.info("[RESUME] Fetching blob from Storage — %s", storage_path)
        try:
            raw_bytes = db.storage.from_(_STORAGE_BUCKET).download(storage_path)
            logger.info("[RESUME] Storage fetch OK — %d B", len(raw_bytes))
        except Exception as exc:
            logger.error("[RESUME] Storage fetch failed: %s", exc)
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
            plain = decrypt_bytes(raw_bytes)
            logger.info("[RESUME] Decryption OK — %d B → %d B", len(raw_bytes), len(plain))
            return plain
        except Exception as exc:
            logger.error("[RESUME] Decryption failed: %s", exc)
            raise HTTPException(status_code=500, detail=f"Decryption failed: {exc}")

    logger.info("[RESUME] Legacy plaintext record — %s", file_name)
    return raw_bytes


def _mime_from_filename(filename: str, fallback: str = "application/octet-stream") -> str:
    ext = os.path.splitext(filename.lower())[1]
    return _MIME_MAP.get(ext, fallback)


# ─────────────────────────────────────────────────────────────────────────────
# Phase 3 — Contact masking
# ─────────────────────────────────────────────────────────────────────────────

_EMAIL_RE = re.compile(r"[a-zA-Z0-9._%+\-]{2,}@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}")
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
    return f"{'*' * (len(digits) - 4)}{digits[-4:]}" if len(digits) >= 4 else "****"


def _mask_text(text: str) -> tuple[str, list[dict]]:
    """Apply masking and collect findings list."""
    findings: list[dict] = []
    result = text

    for m in _EMAIL_RE.finditer(text):
        masked = _mask_email(m.group())
        findings.append({"type": "email", "original": m.group(), "masked": masked})
        result = result.replace(m.group(), masked, 1)

    for m in _PHONE_RE.finditer(text):
        raw = m.group().strip()
        if len(re.sub(r"\D", "", raw)) < 7:
            continue
        masked = _mask_phone(raw)
        findings.append({"type": "phone", "original": raw, "masked": masked})
        result = result.replace(raw, masked, 1)

    return result, findings


def _extract_text(file_bytes: bytes, filename: str) -> str:
    """Best-effort text extraction: pdfplumber for PDFs, plain decode for TXT."""
    fname_lower = filename.lower()

    if fname_lower.endswith(".pdf"):
        try:
            import pdfplumber
            parts: list[str] = []
            with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
                for page in pdf.pages:
                    txt = page.extract_text() or ""
                    if txt.strip():
                        parts.append(txt)
            return "\n\n".join(parts)
        except Exception as exc:
            logger.warning("[RESUME] PDF text extraction failed: %s", exc)
            return ""

    if fname_lower.endswith(".txt"):
        try:
            return file_bytes.decode("utf-8", errors="replace")
        except Exception:
            return ""

    return ""


# ─────────────────────────────────────────────────────────────────────────────
# Phase 4 — View logging
# ─────────────────────────────────────────────────────────────────────────────

def _log_view(db, *, share_token: str, viewer_ip: str, browser_info: str) -> None:
    """Insert a view record into resume_view_logs (best-effort)."""
    try:
        db.table("resume_view_logs").insert({
            "share_token"    : share_token,
            "viewer_ip"      : viewer_ip,
            "browser_info"   : browser_info[:500],
            "viewed_at"      : datetime.now(timezone.utc).isoformat(),
            "download_attempt": False,
        }).execute()
        logger.info("[RESUME] View logged — token=%s ip=%s", share_token[:8] + "...", viewer_ip)
    except Exception as exc:
        logger.warning("[RESUME] View log failed (non-fatal): %s", exc)


# ─────────────────────────────────────────────────────────────────────────────
# Helper: resolve + validate a share token
# ─────────────────────────────────────────────────────────────────────────────

def _resolve_token(db, token: str) -> dict:
    """Fetch resume_share_links row; raise 404/410 on invalid/expired."""
    res = (
        db.table("resume_share_links")
        .select("*")
        .eq("share_token", token)
        .eq("is_active", True)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Share link not found or has been revoked")

    link = res.data[0]

    if link.get("expires_at"):
        try:
            exp = datetime.fromisoformat(link["expires_at"].replace("Z", "+00:00"))
            if datetime.now(timezone.utc) > exp:
                raise HTTPException(status_code=410, detail="Share link has expired")
        except HTTPException:
            raise
        except Exception:
            pass

    return link


# ─────────────────────────────────────────────────────────────────────────────
# Routes — fixed-path routes MUST come before /{token} catch-all
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/resume/share/create")
async def create_share_link(body: CreateShareRequest):
    """
    Generate a secure share link for a vaulted document.
    Requires the calling user to own the asset.
    """
    db = get_admin_db()

    # Verify ownership
    asset_res = (
        db.table("vault_images")
        .select("id, file_name, file_type, user_id")
        .eq("asset_id", body.asset_id)
        .eq("user_id", body.user_id)
        .execute()
    )
    if not asset_res.data:
        raise HTTPException(status_code=404, detail="Asset not found or you are not the owner")

    asset     = asset_res.data[0]
    token     = secrets.token_urlsafe(32)
    expires_at = (datetime.now(timezone.utc) + timedelta(days=_SHARE_TTL_DAYS)).isoformat()

    try:
        db.table("resume_share_links").insert({
            "owner_user_id": body.user_id,
            "asset_id"     : body.asset_id,
            "share_token"  : token,
            "is_active"    : True,
            "created_at"   : datetime.now(timezone.utc).isoformat(),
            "expires_at"   : expires_at,
        }).execute()
    except Exception as exc:
        logger.error("[RESUME] Share link insert failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"Failed to create share link: {exc}")

    logger.info("[RESUME] Share link created — asset=%s user=%s", body.asset_id, body.user_id)

    return {
        "ok"         : True,
        "share_token": token,
        "asset_id"   : body.asset_id,
        "file_name"  : asset.get("file_name"),
        "expires_at" : expires_at,
        "viewer_url" : f"/shared-view/{token}",
        "share_url"  : f"/shared-view/{token}",
    }


@router.post("/resume/share/request-access")
async def request_access(body: AccessRequest):
    """
    Viewer submits a request to see unmasked contact info.
    Owner will see this in their dashboard and can approve/reject.
    """
    db = get_admin_db()

    # Validate token
    _resolve_token(db, body.token)

    # Normalise email to lowercase for consistent matching
    normalised_email = body.requester_email.strip().lower()

    # Check for duplicate pending request from same email
    dup = (
        db.table("resume_access_requests")
        .select("id, status")
        .eq("share_token", body.token)
        .eq("requester_email", normalised_email)
        .execute()
    )
    if dup.data:
        existing = dup.data[0]
        return {
            "ok"        : True,
            "request_id": existing["id"],
            "status"    : existing["status"],
            "message"   : "You already have a request for this document",
        }

    try:
        res = db.table("resume_access_requests").insert({
            "share_token"      : body.token,
            "requester_name"   : body.requester_name,
            "requester_email"  : normalised_email,
            "requester_company": body.requester_company or "",
            "message"          : body.message or "",
            "status"           : "pending",
            "requested_at"     : datetime.now(timezone.utc).isoformat(),
        }).execute()
    except Exception as exc:
        logger.error("[RESUME] Access request insert failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"Failed to submit request: {exc}")

    request_id = res.data[0]["id"] if res.data else "unknown"
    logger.info("[RESUME] Access request submitted — token=%s email=%s",
                body.token[:8] + "...", body.requester_email)

    return {
        "ok"        : True,
        "request_id": request_id,
        "status"    : "pending",
        "message"   : "Your request has been submitted. The document owner will review it.",
    }


@router.post("/resume/share/respond-request")
async def respond_to_request(body: RespondRequest):
    """
    Owner approves or rejects an access request.
    action: 'approve' | 'reject'
    Uses two-step lookup (no FK join) for reliability.
    """
    if body.action not in ("approve", "reject"):
        raise HTTPException(status_code=400, detail="action must be 'approve' or 'reject'")

    db = get_admin_db()

    # Step 1 — fetch the access request row
    req_res = (
        db.table("resume_access_requests")
        .select("id, share_token, status")
        .eq("id", body.request_id)
        .execute()
    )
    if not req_res.data:
        raise HTTPException(status_code=404, detail="Request not found")

    row         = req_res.data[0]
    share_token = row["share_token"]

    # Step 2 — verify the caller owns the share link
    link_res = (
        db.table("resume_share_links")
        .select("owner_user_id")
        .eq("share_token", share_token)
        .execute()
    )
    if not link_res.data:
        raise HTTPException(status_code=404, detail="Share link not found")

    if link_res.data[0]["owner_user_id"] != body.user_id:
        raise HTTPException(status_code=403, detail="You are not the owner of this share link")

    # Step 3 — update status
    new_status  = "approved" if body.action == "approve" else "rejected"
    update_data: dict = {"status": new_status}
    if body.action == "approve":
        update_data["approved_at"] = datetime.now(timezone.utc).isoformat()

    db.table("resume_access_requests").update(update_data).eq("id", body.request_id).execute()

    logger.info("[RESUME] Request %s → %s by owner=%s", body.request_id[:8], new_status, body.user_id)

    return {
        "ok"        : True,
        "request_id": body.request_id,
        "status"    : new_status,
        "share_token": share_token,
    }


@router.get("/resume/share/activity/{asset_id}")
async def get_activity(asset_id: str, user_id: str):
    """
    Owner dashboard: all view logs + access requests for an asset.
    Query param: ?user_id=<owner_user_id>
    """
    if not user_id:
        raise HTTPException(status_code=400, detail="user_id required")

    db = get_admin_db()

    # Get all share links for this asset owned by this user
    links_res = (
        db.table("resume_share_links")
        .select("share_token, is_active, created_at, expires_at")
        .eq("asset_id", asset_id)
        .eq("owner_user_id", user_id)
        .execute()
    )

    tokens = [lnk["share_token"] for lnk in (links_res.data or [])]

    all_views: list[dict]    = []
    all_requests: list[dict] = []

    for tok in tokens:
        # View logs
        views_res = (
            db.table("resume_view_logs")
            .select("viewer_ip, browser_info, viewed_at, download_attempt")
            .eq("share_token", tok)
            .order("viewed_at", desc=True)
            .limit(200)
            .execute()
        )
        for v in (views_res.data or []):
            v["share_token"] = tok
            all_views.append(v)

        # Access requests
        reqs_res = (
            db.table("resume_access_requests")
            .select("id, requester_name, requester_email, requester_company, message, status, requested_at, approved_at")
            .eq("share_token", tok)
            .order("requested_at", desc=True)
            .execute()
        )
        for r in (reqs_res.data or []):
            r["share_token"] = tok
            all_requests.append(r)

    # Sort combined views by time desc
    all_views.sort(key=lambda x: x.get("viewed_at", ""), reverse=True)

    return {
        "ok"           : True,
        "asset_id"     : asset_id,
        "total_views"  : len(all_views),
        "total_requests": len(all_requests),
        "pending_requests": sum(1 for r in all_requests if r["status"] == "pending"),
        "share_links"  : links_res.data or [],
        "views"        : all_views[:100],
        "requests"     : all_requests,
    }


# ── Token-parameterised routes (must come AFTER fixed-path routes) ────────────

@router.get("/resume/share/{token}/check-access")
async def check_access(
    token: str,
    requester_email: Optional[str] = None,
    email: Optional[str] = None,   # alias accepted from frontend
):
    """
    Viewer polls approval status for THEIR specific email only.
    Approval is per-viewer-email — never unlocks globally.

    Query params (either accepted):
      ?requester_email=<email>
      ?email=<email>
    """
    viewer_email = requester_email or email
    if not viewer_email:
        raise HTTPException(status_code=400, detail="requester_email is required")

    viewer_email = viewer_email.strip().lower()

    db   = get_admin_db()
    link = _resolve_token(db, token)

    # Per-email lookup — NEVER checks globally
    req_res = (
        db.table("resume_access_requests")
        .select("id, status, approved_at")
        .eq("share_token", token)
        .eq("requester_email", viewer_email)
        .order("requested_at", desc=True)
        .limit(1)
        .execute()
    )

    if not req_res.data:
        return {"ok": True, "approved": False, "status": "not_requested", "findings": []}

    req = req_res.data[0]

    if req["status"] != "approved":
        return {"ok": True, "approved": False, "status": req["status"], "findings": []}

    # ── Approved: extract + return ORIGINAL (unmasked) contact info ───────────
    asset_id  = link["asset_id"]
    asset_res = db.table("vault_images").select("*").eq("asset_id", asset_id).execute()
    if not asset_res.data:
        return {"ok": True, "approved": True, "status": "approved", "findings": []}

    asset     = asset_res.data[0]
    file_name = asset.get("file_name") or "document"

    unmasked: list[dict] = []
    try:
        file_bytes        = _fetch_and_decrypt(db, asset, file_name)
        raw_text          = _extract_text(file_bytes, file_name)
        _masked, findings = _mask_text(raw_text)
        unmasked = [{"type": f["type"], "value": f["original"]} for f in findings]
    except Exception as exc:
        logger.warning("[RESUME] check-access extraction failed: %s", exc)

    logger.info("[RESUME] check-access approved — token=%s email=%s findings=%d",
                token[:8] + "...", viewer_email, len(unmasked))

    return {
        "ok"         : True,
        "approved"   : True,
        "status"     : "approved",
        "approved_at": req.get("approved_at"),
        "findings"   : unmasked,
    }


@router.get("/resume/share/{token}/file")
async def stream_file(token: str, request: Request):
    """
    Stream the decrypted document through the backend.
    No raw Supabase URLs exposed. Logs the view.
    """
    db   = get_admin_db()
    link = _resolve_token(db, token)

    asset_id  = link["asset_id"]
    owner_id  = link["owner_user_id"]

    asset_res = db.table("vault_images").select("*").eq("asset_id", asset_id).execute()
    if not asset_res.data:
        raise HTTPException(status_code=404, detail="Document not found")

    asset     = asset_res.data[0]
    file_name = asset.get("file_name") or asset.get("original_filename") or "document"
    file_type = asset.get("file_type", "application/octet-stream")

    file_bytes   = _fetch_and_decrypt(db, asset, file_name)
    content_type = _mime_from_filename(file_name, file_type)

    # Phase 4 — log view
    viewer_ip = (
        request.headers.get("x-forwarded-for", "").split(",")[0].strip()
        or (request.client.host if request.client else "unknown")
    )
    browser_info = request.headers.get("user-agent", "")
    _log_view(db, share_token=token, viewer_ip=viewer_ip, browser_info=browser_info)

    logger.info("[RESUME] Streaming — %s (%d B) MIME=%s", file_name, len(file_bytes), content_type)

    return StreamingResponse(
        iter([file_bytes]),
        media_type=content_type,
        headers={
            "Content-Disposition"   : f'inline; filename="{file_name}"',
            "X-Content-Type-Options": "nosniff",
            "Cache-Control"         : "no-store",
            "X-Frame-Options"       : "SAMEORIGIN",
        },
    )


@router.get("/resume/share/{token}")
async def get_share_preview(token: str, request: Request):
    """
    Masked preview JSON for the viewer UI.
    Extracts text from PDF, masks emails + phones.
    Logs the view.
    """
    db   = get_admin_db()
    link = _resolve_token(db, token)

    asset_id  = link["asset_id"]
    owner_id  = link["owner_user_id"]

    asset_res = db.table("vault_images").select("*").eq("asset_id", asset_id).execute()
    if not asset_res.data:
        raise HTTPException(status_code=404, detail="Document not found")

    asset     = asset_res.data[0]
    file_name = asset.get("file_name") or "document"
    file_type = asset.get("file_type", "")

    masked_text: Optional[str] = None
    findings: list[dict]       = []
    is_pdf = file_name.lower().endswith(".pdf") or "pdf" in file_type

    # Extract + mask text for PDFs and TXT files
    if is_pdf or file_name.lower().endswith(".txt"):
        try:
            file_bytes       = _fetch_and_decrypt(db, asset, file_name)
            raw_text         = _extract_text(file_bytes, file_name)
            masked_text, findings = _mask_text(raw_text)
        except Exception as exc:
            logger.warning("[RESUME] Text extraction failed: %s", exc)

    # Phase 4 — log view
    viewer_ip    = (
        request.headers.get("x-forwarded-for", "").split(",")[0].strip()
        or (request.client.host if request.client else "unknown")
    )
    browser_info = request.headers.get("user-agent", "")
    _log_view(db, share_token=token, viewer_ip=viewer_ip, browser_info=browser_info)

    # Count pending access requests so viewer UI can show "request sent" state
    pending_res = (
        db.table("resume_access_requests")
        .select("id")
        .eq("share_token", token)
        .eq("status", "pending")
        .execute()
    )

    return {
        "ok"                  : True,
        "file_name"           : file_name,
        "file_type"           : file_type,
        "is_pdf"              : is_pdf,
        "masked_text"         : masked_text,
        "findings"            : findings,
        "file_url"            : f"/resume/share/{token}/file",
        "asset_id"            : asset_id,
        "pending_request_count": len(pending_res.data or []),
    }


@router.delete("/resume/share/{token}")
async def revoke_share_link(token: str, user_id: str):
    """Owner revokes a share link."""
    if not user_id:
        raise HTTPException(status_code=400, detail="user_id required")

    db = get_admin_db()
    db.table("resume_share_links").update({"is_active": False}) \
        .eq("share_token", token).eq("owner_user_id", user_id).execute()

    logger.info("[RESUME] Share link revoked — token=%s user=%s", token[:8] + "...", user_id)

    return {"ok": True, "message": "Share link revoked"}
