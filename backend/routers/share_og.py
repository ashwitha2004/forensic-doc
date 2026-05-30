"""
share_og.py
===========
Open Graph preview layer + human-readable share URLs.

Endpoints (no changes to any existing route):
  GET /share/og/{token}      — OG HTML page, redirects to /shared-view/{token}
  GET /share/og-image/{token}— 1200×630 PNG card (clean dark design)
  GET /r/{slug}              — human-readable URL → resolves to /share/og/{token}

Nothing in this file touches encryption, masking, approval, tracking,
share tokens, forensics, or the OCR pipeline.

SQL to run ONCE in Supabase SQL Editor:
  ALTER TABLE resume_share_links ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE;
"""

import io
import os
import re
import random
import string
from typing import Optional

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import HTMLResponse, Response, RedirectResponse
from pydantic import BaseModel

from db.database import get_admin_db
from routers.resume_share import _fetch_and_decrypt, _extract_text

# ── In-memory slug maps (session-scoped fallback when DB column not yet added) ──
# slug  → token  (for /r/{slug} lookup)
# token → slug   (to return immediately after share creation)
_slug_to_token: dict = {}
_token_to_slug: dict = {}

router = APIRouter()

# ─── Name helpers ──────────────────────────────────────────────────────────────

_ROLE_WORDS = {
    "full", "stack", "developer", "engineer", "designer", "manager",
    "analyst", "intern", "lead", "senior", "junior", "frontend",
    "backend", "data", "ai", "ml", "software", "web", "mobile",
    "cloud", "devops", "architect", "consultant", "specialist",
    "resume", "cv", "portfolio", "profile",
}

def _name_from_filename(filename: str) -> str:
    stem  = re.sub(r"\.[^.]+$", "", filename)
    parts = re.split(r"[_\-\s]+", stem)
    name_parts = []
    for p in parts:
        if not p:
            continue
        if p.lower() in _ROLE_WORDS:
            break
        if len(name_parts) >= 3:
            break
        name_parts.append(p.strip().capitalize())
    return " ".join(name_parts) if name_parts else "Candidate"

def _looks_like_name(text: str) -> bool:
    """True if text looks like a person's name (2-4 words, no digits, not a role word)."""
    parts = text.strip().split()
    if not (2 <= len(parts) <= 4):
        return False
    for p in parts:
        if any(c.isdigit() for c in p):
            return False
        if p.lower() in _ROLE_WORDS:
            return False
        if p.lower() in {"updated", "new", "final", "revised", "latest", "draft",
                         "copy", "version", "old", "temp", "test", "sample"}:
            return False
    return True


def _name_from_resume_text(db, asset: dict) -> Optional[str]:
    """
    Decrypt the resume and read the first non-empty line — almost always
    the candidate's name on a real resume. Reuses existing helper functions.
    """
    try:
        fname = asset.get("file_name") or ""
        raw   = _fetch_and_decrypt(db, asset, fname)
        text  = _extract_text(raw, fname)
        for line in text.splitlines():
            line = line.strip()
            if line and _looks_like_name(line):
                # Capitalise each word cleanly
                return " ".join(w.capitalize() for w in line.split())
    except Exception:
        pass
    return None


def _get_candidate_name(db, asset_id: str) -> str:
    """
    Priority:
      1. First line of resume text (most accurate)
      2. owner_name field if it looks like a real name
      3. Filename heuristic
      4. "Candidate" fallback
    """
    try:
        res = (
            db.table("vault_images")
            .select("*")
            .eq("asset_id", asset_id)
            .limit(1)
            .execute()
        )
        if not res.data:
            return "Candidate"

        asset = res.data[0]

        # 1. Try extracting from actual resume text
        name_from_text = _name_from_resume_text(db, asset)
        if name_from_text:
            return name_from_text

        # 2. owner_name if it looks like a real person's name
        owner = (asset.get("owner_name") or "").strip()
        bad   = (
            not owner or
            owner.lower() in ("none", "unknown", "") or
            re.match(r"^USR[-_]", owner, re.IGNORECASE) or
            re.match(r"^[0-9a-f]{8}-", owner, re.IGNORECASE) or
            len(owner) > 60 or "@" in owner or
            not _looks_like_name(owner)
        )
        if not bad:
            return owner

        # 3. Filename heuristic
        fname = asset.get("file_name") or ""
        if fname:
            n = _name_from_filename(fname)
            if _looks_like_name(n):
                return n
    except Exception:
        pass
    return "Candidate"

# ─── Slug helpers ───────────────────────────────────────────────────────────────

def _name_to_slug(name: str) -> str:
    """'Kavvam Ashwitha' → 'kavvam-ashwitha'"""
    clean = re.sub(r"[^a-zA-Z0-9\s]", "", name).strip().lower()
    parts = clean.split()
    return "-".join(parts) if parts else "resume"

def _unique_slug_mem(base_slug: str) -> str:
    """Collision check against in-memory map only (no DB needed)."""
    slug    = base_slug
    counter = 2
    for _ in range(20):
        if slug not in _slug_to_token:
            return slug
        slug = f"{base_slug}-{counter}"
        counter += 1
    return slug

def _unique_slug(db, base_slug: str) -> str:
    """
    Return base_slug if available, otherwise ashwitha-kavvam-2, -3, etc.
    Predictable numbering so users can guess related links.
    """
    slug = base_slug
    counter = 2
    for _ in range(20):
        try:
            res = (
                db.table("resume_share_links")
                .select("slug")
                .eq("slug", slug)
                .limit(1)
                .execute()
            )
            if not res.data:
                return slug
        except Exception:
            return slug  # slug column not yet created — return as-is
        slug = f"{base_slug}-{counter}"
        counter += 1
    return slug

def _get_or_create_slug(db, token: str, asset_id: str) -> str:
    """
    Return existing slug or generate a new one.
    Priority: in-memory cache → DB column → generate new.
    Always returns a slug string (never None).
    """
    # 1. Fast path: already in memory
    if token in _token_to_slug:
        return _token_to_slug[token]

    # 2. Try reading from DB (requires slug column to exist)
    try:
        res = (
            db.table("resume_share_links")
            .select("slug")
            .eq("share_token", token)
            .limit(1)
            .execute()
        )
        if res.data and res.data[0].get("slug"):
            slug = res.data[0]["slug"]
            _token_to_slug[token] = slug
            _slug_to_token[slug]  = token
            return slug
    except Exception:
        pass

    # 3. Generate new slug from candidate name
    name      = _get_candidate_name(db, asset_id)
    base_slug = _name_to_slug(name)
    slug      = _unique_slug_mem(base_slug)

    # 4. Store in memory (always works)
    _token_to_slug[token] = slug
    _slug_to_token[slug]  = token

    # 5. Try persisting to DB (works after SQL migration is run)
    try:
        db.table("resume_share_links") \
          .update({"slug": slug}) \
          .eq("share_token", token) \
          .execute()
    except Exception:
        pass  # column not yet added — in-memory fallback is enough

    return slug

# ─── OG card (PNG) ─────────────────────────────────────────────────────────────

def _generate_og_image(candidate_name: str) -> bytes:
    """
    1200×630 PNG.  Clean dark card — name + Verified Resume + PINIT branding.
    No technical badges, no AES graphics, no decorative rings.
    """
    from PIL import Image, ImageDraw, ImageFont  # type: ignore

    W, H = 1200, 630

    # Colours
    BG_TOP   = (7,  13,  30)
    BG_BOT   = (11, 22,  50)
    CYAN     = (6,  182, 212)
    WHITE    = (255, 255, 255)
    GRAY     = (148, 163, 184)
    GREEN    = (34,  197,  94)
    GREEN_BG = (5,   46,  22)

    # ── Gradient background ──────────────────────────────────────────────────
    img  = Image.new("RGB", (W, H), BG_TOP)
    draw = ImageDraw.Draw(img)
    for y in range(H):
        t = y / H
        r = int(BG_TOP[0] + (BG_BOT[0] - BG_TOP[0]) * t)
        g = int(BG_TOP[1] + (BG_BOT[1] - BG_TOP[1]) * t)
        b = int(BG_TOP[2] + (BG_BOT[2] - BG_TOP[2]) * t)
        draw.line([(0, y), (W, y)], fill=(r, g, b))

    # Left accent stripe
    draw.rectangle([0, 0, 5, H], fill=CYAN)

    # ── Font loader ──────────────────────────────────────────────────────────
    def _font(size: int, bold: bool = False):
        paths = [
            "C:/Windows/Fonts/arialbd.ttf"  if bold else "C:/Windows/Fonts/arial.ttf",
            "C:/Windows/Fonts/calibrib.ttf" if bold else "C:/Windows/Fonts/calibri.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold
                else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
            "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf" if bold
                else "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
        ]
        for p in paths:
            if os.path.exists(p):
                try:
                    return ImageFont.truetype(p, size)
                except Exception:
                    pass
        return ImageFont.load_default()

    f_brand    = _font(22, bold=True)   # PINIT VAULT
    f_verified = _font(20, bold=True)   # VERIFIED RESUME badge
    f_name     = _font(88, bold=True)   # candidate name
    f_subtitle = _font(34)              # "Verified Resume"
    f_tagline  = _font(26)              # "Verified by PINIT Vault"

    # ── PINIT VAULT top-left ─────────────────────────────────────────────────
    # Small cyan dot + wordmark
    draw.ellipse([28, 28, 54, 54], fill=CYAN)
    draw.ellipse([34, 34, 48, 48], fill=BG_TOP)
    draw.text((64, 32), "PINIT VAULT", font=f_brand, fill=WHITE)

    # ── Green verified badge (top-right) ─────────────────────────────────────
    bw, bh = 270, 44
    bx = W - bw - 30
    by = 25
    draw.rounded_rectangle([bx, by, bx + bw, by + bh],
                            radius=22, fill=GREEN_BG, outline=GREEN, width=1)
    draw.text((bx + 16, by + 11), "✓  VERIFIED RESUME", font=f_verified, fill=GREEN)

    # ── Horizontal divider below header ──────────────────────────────────────
    draw.line([(28, 80), (W - 28, 80)], fill=(25, 40, 75), width=1)

    # ── Candidate name (large, centered vertically in remaining space) ────────
    name_display = candidate_name
    if len(candidate_name) > 18:
        name_display = candidate_name[:16].strip() + "…"

    # Get bounding box for name to center it
    bbox = draw.textbbox((0, 0), name_display, font=f_name)
    name_w = bbox[2] - bbox[0]
    name_x = (W - name_w) // 2
    name_y = 130
    draw.text((name_x, name_y), name_display, font=f_name, fill=WHITE)

    # ── "Verified Resume" subtitle ────────────────────────────────────────────
    sub_text = "Verified Resume"
    bbox2    = draw.textbbox((0, 0), sub_text, font=f_subtitle)
    sub_x    = (W - (bbox2[2] - bbox2[0])) // 2
    draw.text((sub_x, name_y + 110), sub_text, font=f_subtitle, fill=GRAY)

    # ── "Verified by PINIT Vault" ─────────────────────────────────────────────
    tag_text = "Verified by PINIT Vault"
    bbox3    = draw.textbbox((0, 0), tag_text, font=f_tagline)
    tag_x    = (W - (bbox3[2] - bbox3[0])) // 2
    draw.text((tag_x, name_y + 160), tag_text, font=f_tagline, fill=CYAN)

    # ── Footer bar ────────────────────────────────────────────────────────────
    draw.rectangle([0, H - 50, W, H], fill=(5, 10, 28))
    draw.line([(0, H - 50), (W, H - 50)], fill=(20, 35, 65), width=1)
    draw.text((28, H - 34), "pinit.vault", font=_font(18, bold=True), fill=CYAN)
    draw.text((W - 200, H - 34), "Secure  •  Tracked", font=_font(16), fill=(60, 80, 110))

    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()

# ─── Routes ────────────────────────────────────────────────────────────────────

class RegisterSlugRequest(BaseModel):
    share_token: str
    asset_id   : str

@router.post("/share/og/register-slug")
async def register_slug(body: RegisterSlugRequest):
    """
    Called immediately after share link creation.
    Always returns a slug — uses in-memory cache if DB column not yet added.
    Returns: { slug, slug_url_path }
    """
    try:
        db   = get_admin_db()
        slug = _get_or_create_slug(db, body.share_token, body.asset_id)
        import logging
        logging.getLogger("share_og").info(
            f"[SLUG] token={body.share_token[:8]}… → slug={slug}"
        )
        return {"slug": slug, "slug_url_path": f"/r/{slug}"}
    except Exception as e:
        import logging
        logging.getLogger("share_og").error(f"[SLUG] register failed: {e}")
        raise


@router.get("/share/og/{token}", response_class=HTMLResponse)
async def og_preview(token: str, request: Request) -> HTMLResponse:
    """OG wrapper — bots read meta tags, browsers redirect to /shared-view/{token}."""
    db = get_admin_db()

    res = (
        db.table("resume_share_links")
        .select("asset_id, is_active")
        .eq("share_token", token)
        .limit(1)
        .execute()
    )
    if not res.data or not res.data[0].get("is_active"):
        raise HTTPException(status_code=404, detail="Share link not found")

    asset_id = res.data[0]["asset_id"]
    name     = _get_candidate_name(db, asset_id)

    # Lazily create/retrieve the human-readable slug
    _get_or_create_slug(db, token, asset_id)

    # Build absolute URLs from the actual request host (works for ngrok too)
    proto    = request.headers.get("x-forwarded-proto", "http")
    host     = (request.headers.get("x-forwarded-host") or
                request.headers.get("host") or "localhost:8080")
    base_url = f"{proto}://{host}"
    image_url = f"{base_url}/share/og-image/{token}"

    title       = f"{name} — Verified Resume"
    description = f"{name} | Verified Resume · Verified by PINIT Vault"

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{title}</title>

  <!-- Open Graph -->
  <meta property="og:type"         content="website" />
  <meta property="og:url"          content="{base_url}/shared-view/{token}" />
  <meta property="og:title"        content="{title}" />
  <meta property="og:description"  content="{description}" />
  <meta property="og:image"        content="{image_url}" />
  <meta property="og:image:width"  content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:site_name"    content="PINIT Vault" />

  <!-- Twitter / X -->
  <meta name="twitter:card"        content="summary_large_image" />
  <meta name="twitter:title"       content="{title}" />
  <meta name="twitter:description" content="{description}" />
  <meta name="twitter:image"       content="{image_url}" />

  <!-- Instant redirect (relative path — works on any host/port/ngrok) -->
  <meta http-equiv="refresh" content="0;url=/shared-view/{token}" />
  <style>
    body {{
      margin:0; background:#070d1e; display:flex; align-items:center;
      justify-content:center; min-height:100vh;
      font-family:system-ui,sans-serif; color:#94a3b8;
    }}
    a {{ color:#06b6d4; text-decoration:none; }}
  </style>
</head>
<body>
  <p>Opening resume… <a href="/shared-view/{token}">click here</a></p>
  <script>window.location.replace("/shared-view/{token}");</script>
</body>
</html>"""

    return HTMLResponse(content=html, headers={"Cache-Control": "public, max-age=300"})


@router.get("/share/og-image/{token}")
async def og_image(token: str) -> Response:
    """Returns the 1200×630 PNG card."""
    db = get_admin_db()
    res = (
        db.table("resume_share_links")
        .select("asset_id, is_active")
        .eq("share_token", token)
        .limit(1)
        .execute()
    )
    if not res.data or not res.data[0].get("is_active"):
        raise HTTPException(status_code=404, detail="Share link not found")

    name = _get_candidate_name(db, res.data[0]["asset_id"])
    return Response(
        content=_generate_og_image(name),
        media_type="image/png",
        headers={"Cache-Control": "public, max-age=3600"},
    )


@router.get("/r/{slug}")
async def slug_redirect(slug: str) -> RedirectResponse:
    """
    Human-readable URL → resolves to /share/og/{token}.
    Checks in-memory cache first (works immediately, no DB column needed),
    then falls back to DB lookup.
    """
    # 1. Check in-memory cache first (always works)
    if slug in _slug_to_token:
        token = _slug_to_token[slug]
        return RedirectResponse(url=f"/share/og/{token}", status_code=302)

    # 2. Check DB (works after SQL migration)
    db = get_admin_db()
    try:
        res = (
            db.table("resume_share_links")
            .select("share_token, is_active")
            .eq("slug", slug)
            .limit(1)
            .execute()
        )
        if res.data and res.data[0].get("is_active"):
            token = res.data[0]["share_token"]
            # Warm the in-memory cache
            _slug_to_token[slug]  = token
            _token_to_slug[token] = slug
            return RedirectResponse(url=f"/share/og/{token}", status_code=302)
    except Exception:
        pass
    raise HTTPException(status_code=404, detail="Link not found")
