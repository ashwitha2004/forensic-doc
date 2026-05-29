"""
share_og.py
===========
Open Graph preview layer for PINIT share links.

GET /share/og/{token}
  → Returns an HTML page with OG meta tags + immediate JS redirect to
    /shared-view/{token} (the real viewer — tracking untouched).
  → Social crawlers (WhatsApp, LinkedIn, Telegram) see the OG tags.
  → Real users are redirected to the viewer in < 100 ms.

GET /share/og-image/{token}
  → Returns a 1200×630 PNG card generated with Pillow.
  → Candidate name extracted from vault_images.owner_name or filename.

Nothing in this file touches encryption, masking, approval, tracking,
share tokens, forensics, or the OCR pipeline.
"""

import io
import os
import re
import textwrap
from typing import Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import HTMLResponse, Response

from db import get_admin_db

router = APIRouter()

# ─── Name extraction helpers ───────────────────────────────────────────────────

# Role-keyword stop-words — stop taking words when we hit these
_ROLE_WORDS = {
    "full", "stack", "developer", "engineer", "designer", "manager",
    "analyst", "intern", "lead", "senior", "junior", "frontend",
    "backend", "data", "ai", "ml", "software", "web", "mobile",
    "cloud", "devops", "architect", "consultant", "specialist",
    "resume", "cv", "portfolio", "profile",
}


def _name_from_filename(filename: str) -> str:
    """
    'Kavvam_Ashwitha_full_stack_.pdf'  →  'Kavvam Ashwitha'
    'John_Doe_Resume.pdf'              →  'John Doe'
    """
    stem = re.sub(r"\.[^.]+$", "", filename)          # strip extension
    parts = re.split(r"[_\-\s]+", stem)               # split on _ - space
    name_parts = []
    for p in parts:
        if not p:
            continue
        if p.lower() in _ROLE_WORDS:
            break
        if len(name_parts) >= 3:                      # max 3 name words
            break
        name_parts.append(p.strip().capitalize())
    return " ".join(name_parts) if name_parts else "Candidate"


def _get_candidate_name(db, asset_id: str) -> str:
    """
    Priority: owner_name field → filename heuristic → 'Candidate'
    """
    try:
        res = (
            db.table("vault_images")
            .select("owner_name, file_name")
            .eq("asset_id", asset_id)
            .limit(1)
            .execute()
        )
        if res.data:
            row = res.data[0]
            owner = (row.get("owner_name") or "").strip()
            if owner and owner.lower() not in ("none", "unknown", ""):
                return owner
            fname = row.get("file_name") or ""
            if fname:
                return _name_from_filename(fname)
    except Exception:
        pass
    return "Candidate"


# ─── OG image generator ────────────────────────────────────────────────────────

def _generate_og_image(candidate_name: str) -> bytes:
    """
    Returns a 1200×630 PNG branded card using Pillow.
    Falls back gracefully if Pillow is somehow unavailable.
    """
    from PIL import Image, ImageDraw, ImageFont  # type: ignore

    W, H = 1200, 630
    BG        = (10,  20,  40)     # #0a1428 deep navy
    ACCENT    = (6,  182, 212)     # #06b6d4 cyan
    WHITE     = (255, 255, 255)
    GRAY      = (148, 163, 184)    # slate-400
    CARD_BG   = (15,  30,  60)     # slightly lighter panel
    GREEN     = (34, 197,  94)     # #22c55e

    img  = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(img)

    # ── Background gradient band ──────────────────────────────────────────────
    for y in range(H):
        alpha = y / H
        r = int(BG[0] + (CARD_BG[0] - BG[0]) * alpha)
        g = int(BG[1] + (CARD_BG[1] - BG[1]) * alpha)
        b = int(BG[2] + (CARD_BG[2] - BG[2]) * alpha)
        draw.line([(0, y), (W, y)], fill=(r, g, b))

    # ── Cyan accent bar (left edge) ───────────────────────────────────────────
    draw.rectangle([0, 0, 8, H], fill=ACCENT)

    # ── Top: PINIT Vault brand ────────────────────────────────────────────────
    draw.rectangle([40, 40, W - 40, 110], fill=(20, 40, 80), outline=ACCENT, width=1)

    # Load fonts — try system fonts, fall back to default
    def _font(size: int, bold: bool = False):
        candidates = [
            "C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold
                else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
            "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf" if bold
                else "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
        ]
        for path in candidates:
            if os.path.exists(path):
                try:
                    from PIL import ImageFont
                    return ImageFont.truetype(path, size)
                except Exception:
                    pass
        from PIL import ImageFont
        return ImageFont.load_default()

    font_brand   = _font(28, bold=True)
    font_sub     = _font(20)
    font_name    = _font(72, bold=True)
    font_tagline = _font(32)
    font_badge   = _font(22)

    # Brand text
    draw.text((60, 62), "🛡  PINIT Vault", font=font_brand, fill=WHITE)
    draw.text((W - 280, 68), "Secure Document Platform", font=font_sub, fill=GRAY)

    # ── Verified badge ────────────────────────────────────────────────────────
    draw.rectangle([40, 145, 300, 195], fill=(6, 60, 40), outline=GREEN, width=1)
    draw.text((58, 155), "✓  CV VERIFIED BY PINIT", font=font_badge, fill=GREEN)

    # ── Candidate name ────────────────────────────────────────────────────────
    # Wrap long names
    wrapped = textwrap.fill(candidate_name, width=20)
    draw.text((40, 215), wrapped, font=font_name, fill=WHITE)

    # ── Tagline ───────────────────────────────────────────────────────────────
    draw.text((40, 420), "Tap to view verified resume", font=font_tagline, fill=ACCENT)

    # ── Bottom bar ────────────────────────────────────────────────────────────
    draw.rectangle([0, H - 70, W, H], fill=(6, 182, 212, 30))
    draw.rectangle([0, H - 70, W, H], fill=(10, 40, 80))
    draw.text((40,  H - 48), "AES-256-GCM Encrypted  •  Tracked  •  Masked",
              font=font_badge, fill=GRAY)
    draw.text((W - 300, H - 48), "pinit.vault", font=font_badge, fill=ACCENT)

    # ── Decorative circles ────────────────────────────────────────────────────
    draw.ellipse([W - 220, H - 280, W + 80, H + 20],
                 outline=(6, 182, 212), width=2)
    draw.ellipse([W - 160, 40, W + 40, 240],
                 outline=(6, 182, 212, 60), width=1)

    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


# ─── Routes ────────────────────────────────────────────────────────────────────

@router.get("/share/og/{token}", response_class=HTMLResponse)
async def og_preview(token: str) -> HTMLResponse:
    """
    Open Graph wrapper page.
    Bots read the meta tags; browsers are redirected to /shared-view/{token}.
    """
    db = get_admin_db()

    # Resolve token → asset_id (same lookup as resume_share._resolve_token)
    res = (
        db.table("resume_share_links")
        .select("asset_id, owner_user_id, is_active")
        .eq("share_token", token)
        .limit(1)
        .execute()
    )
    if not res.data or not res.data[0].get("is_active"):
        raise HTTPException(status_code=404, detail="Share link not found")

    asset_id = res.data[0]["asset_id"]
    name     = _get_candidate_name(db, asset_id)

    # Derive public base URL from env or fallback
    base_url    = os.environ.get("PUBLIC_BASE_URL", "http://localhost:8080")
    viewer_url  = f"{base_url}/shared-view/{token}"
    image_url   = f"{base_url}/share/og-image/{token}"
    backend_url = os.environ.get("VITE_BACKEND_URL",
                  os.environ.get("BACKEND_URL", "http://localhost:8000"))
    # Image served from backend (FastAPI), not the frontend
    image_url   = f"{backend_url}/share/og-image/{token}"

    title       = f"{name} — Verified Resume"
    description = (
        f"View {name}'s CV verified and secured by PINIT Vault. "
        "Contact details are masked — tap to request access."
    )

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{title}</title>

  <!-- Open Graph (WhatsApp, LinkedIn, Telegram, iMessage) -->
  <meta property="og:type"        content="website" />
  <meta property="og:url"         content="{viewer_url}" />
  <meta property="og:title"       content="{title}" />
  <meta property="og:description" content="{description}" />
  <meta property="og:image"       content="{image_url}" />
  <meta property="og:image:width"  content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:site_name"   content="PINIT Vault" />

  <!-- Twitter Card -->
  <meta name="twitter:card"        content="summary_large_image" />
  <meta name="twitter:title"       content="{title}" />
  <meta name="twitter:description" content="{description}" />
  <meta name="twitter:image"       content="{image_url}" />

  <!-- Instant redirect for real browsers -->
  <meta http-equiv="refresh" content="0;url={viewer_url}" />
  <style>
    body {{
      margin: 0;
      background: #0f172a;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      font-family: system-ui, sans-serif;
      color: #94a3b8;
    }}
    a {{ color: #06b6d4; text-decoration: none; font-size: 1rem; }}
  </style>
</head>
<body>
  <p>Redirecting… <a href="{viewer_url}">Click here if not redirected</a></p>
  <script>window.location.replace("{viewer_url}");</script>
</body>
</html>"""

    return HTMLResponse(content=html, headers={
        "Cache-Control": "public, max-age=300",   # bots can cache 5 min
    })


@router.get("/share/og-image/{token}")
async def og_image(token: str) -> Response:
    """
    Returns a 1200×630 branded PNG card for use as og:image.
    """
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

    png_bytes = _generate_og_image(name)
    return Response(
        content=png_bytes,
        media_type="image/png",
        headers={"Cache-Control": "public, max-age=3600"},
    )
