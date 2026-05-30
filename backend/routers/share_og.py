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

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import HTMLResponse, Response

from db.database import get_admin_db

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
    Priority: owner_name (if it looks like a real name) → filename heuristic → 'Candidate'
    Skips owner_name if it looks like a user ID (USR-xxxxx, uuid, etc.)
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
            # Skip if it looks like a user ID, UUID, or system value
            is_user_id = (
                not owner or
                owner.lower() in ("none", "unknown", "") or
                re.match(r'^USR[-_]', owner, re.IGNORECASE) or
                re.match(r'^[0-9a-f]{8}-[0-9a-f]{4}-', owner, re.IGNORECASE) or
                len(owner) > 60 or
                "@" in owner
            )
            if not is_user_id:
                return owner
            # Fall through to filename heuristic
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
    Professional dark design with PINIT branding.
    """
    from PIL import Image, ImageDraw, ImageFont  # type: ignore

    W, H = 1200, 630

    # ── Colour palette ────────────────────────────────────────────────────────
    BG_TOP    = (8,   15,  35)    # near-black navy
    BG_BOT    = (12,  25,  55)    # slightly lighter navy
    ACCENT    = (6,  182, 212)    # cyan  #06b6d4
    ACCENT_DK = (4,  120, 150)    # darker cyan for borders
    WHITE     = (255, 255, 255)
    GRAY_LT   = (203, 213, 225)   # slate-300
    GRAY      = (100, 116, 139)   # slate-500
    GREEN     = (34,  197,  94)   # #22c55e
    GREEN_DK  = (6,   78,  39)    # dark green bg
    FOOTER_BG = (5,   12,  30)    # near-black footer

    img  = Image.new("RGB", (W, H), BG_TOP)
    draw = ImageDraw.Draw(img)

    # ── Gradient background (top → bottom) ───────────────────────────────────
    for y in range(H):
        t = y / H
        r = int(BG_TOP[0] + (BG_BOT[0] - BG_TOP[0]) * t)
        g = int(BG_TOP[1] + (BG_BOT[1] - BG_TOP[1]) * t)
        b = int(BG_TOP[2] + (BG_BOT[2] - BG_TOP[2]) * t)
        draw.line([(0, y), (W, y)], fill=(r, g, b))

    # ── Left accent stripe ────────────────────────────────────────────────────
    draw.rectangle([0, 0, 6, H], fill=ACCENT)

    # ── Subtle grid dots (decorative) ────────────────────────────────────────
    for gx in range(50, W, 60):
        for gy in range(50, H, 60):
            draw.ellipse([gx-1, gy-1, gx+1, gy+1], fill=(30, 50, 80))

    # ── Load fonts ────────────────────────────────────────────────────────────
    def _font(size: int, bold: bool = False):
        candidates = [
            "C:/Windows/Fonts/arialbd.ttf"   if bold else "C:/Windows/Fonts/arial.ttf",
            "C:/Windows/Fonts/calibrib.ttf"  if bold else "C:/Windows/Fonts/calibri.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold
                else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
            "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf" if bold
                else "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
        ]
        for p in candidates:
            if os.path.exists(p):
                try:
                    return ImageFont.truetype(p, size)
                except Exception:
                    pass
        return ImageFont.load_default()

    f_brand  = _font(26, bold=True)   # "PINIT VAULT"
    f_sub    = _font(18)              # "Secure Document Platform"
    f_badge  = _font(19, bold=True)   # "CV VERIFIED BY PINIT"
    f_name   = _font(70, bold=True)   # Candidate name
    f_role   = _font(28)              # "Verified Resume"
    f_cta    = _font(30, bold=True)   # "Tap to View Resume"
    f_footer = _font(18)              # footer badges

    # ── Header bar ────────────────────────────────────────────────────────────
    draw.rectangle([0, 0, W, 88], fill=(6, 14, 38))
    draw.line([(0, 88), (W, 88)], fill=ACCENT_DK, width=1)

    # Brand dot + name
    draw.ellipse([28, 28, 60, 60], fill=ACCENT)
    draw.ellipse([35, 35, 53, 53], fill=(6, 14, 38))   # inner hole
    draw.text((72, 30), "PINIT VAULT", font=f_brand, fill=WHITE)
    draw.text((72, 58), "Secure Document Platform", font=f_sub, fill=GRAY)

    # ── Verified badge ────────────────────────────────────────────────────────
    bx, by = 28, 118
    bw, bh = 310, 46
    draw.rounded_rectangle([bx, by, bx + bw, by + bh],
                            radius=8, fill=GREEN_DK, outline=GREEN, width=1)
    draw.text((bx + 14, by + 12), "CV VERIFIED BY PINIT", font=f_badge, fill=GREEN)

    # ── Candidate name ────────────────────────────────────────────────────────
    # Truncate to fit — keep on one line if possible
    name_display = candidate_name
    if len(candidate_name) > 22:
        name_display = candidate_name[:20].strip() + "…"
    draw.text((28, 186), name_display, font=f_name, fill=WHITE)

    # ── Verified Resume subtitle ──────────────────────────────────────────────
    draw.text((28, 276), "Verified Resume", font=f_role, fill=GRAY_LT)

    # ── Divider ───────────────────────────────────────────────────────────────
    draw.line([(28, 324), (480, 324)], fill=ACCENT_DK, width=1)

    # ── CTA ───────────────────────────────────────────────────────────────────
    draw.text((28, 342), "Tap to View Resume  →", font=f_cta, fill=ACCENT)

    # ── Security badges row ───────────────────────────────────────────────────
    badges = [
        ("  ENCRYPTED", (5, 45, 70),   (6, 182, 212)),
        ("  TRACKED",   (40, 20, 10),  (251, 146, 60)),
        ("  MASKED",    (40, 10, 40),  (167, 139, 250)),
    ]
    bx2 = 28
    for label, bg, fg in badges:
        tw = len(label) * 11 + 20
        draw.rounded_rectangle([bx2, 406, bx2 + tw, 446],
                                radius=6, fill=bg, outline=fg, width=1)
        draw.text((bx2 + 10, 416), label.strip(), font=f_footer, fill=fg)
        bx2 += tw + 12

    # ── Right-side decorative ring ────────────────────────────────────────────
    cx, cy = 980, 315
    for r, alpha in [(200, 15), (155, 25), (110, 40)]:
        col = (int(6 + alpha), int(182 - alpha * 2), int(212 - alpha * 2))
        draw.ellipse([cx - r, cy - r, cx + r, cy + r],
                     outline=col, width=2)
    # Shield shape (simplified — two overlapping rects + triangle)
    draw.rectangle([940, 250, 1020, 340], fill=(6, 25, 55), outline=ACCENT, width=2)
    draw.polygon([(940, 340), (980, 390), (1020, 340)],
                 fill=(6, 25, 55), outline=ACCENT)
    draw.text((956, 288), "AES", font=_font(22, bold=True), fill=ACCENT)
    draw.text((950, 313), "256", font=_font(18), fill=GRAY)

    # ── Footer bar ────────────────────────────────────────────────────────────
    draw.rectangle([0, H - 56, W, H], fill=FOOTER_BG)
    draw.line([(0, H - 56), (W, H - 56)], fill=ACCENT_DK, width=1)
    draw.text((28,  H - 38), "pinit.vault  •  AES-256-GCM Protected  •  Contact Masked",
              font=f_footer, fill=GRAY)

    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


# ─── Routes ────────────────────────────────────────────────────────────────────

@router.get("/share/og/{token}", response_class=HTMLResponse)
async def og_preview(token: str, request: "Request") -> HTMLResponse:
    """
    Open Graph wrapper page.
    Bots read the meta tags; browsers are redirected to /shared-view/{token}.
    URLs are built from the actual request host so ngrok/public URLs work automatically.
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

    # Build URLs dynamically from the actual incoming request host.
    # This makes the card work with ngrok, local, and any public domain
    # without needing any env variable changes.
    fwd_proto = request.headers.get("x-forwarded-proto", "http")
    fwd_host  = (
        request.headers.get("x-forwarded-host") or
        request.headers.get("host") or
        "localhost:8080"
    )
    base_url   = f"{fwd_proto}://{fwd_host}"
    viewer_url = f"{base_url}/shared-view/{token}"
    image_url  = f"{base_url}/share/og-image/{token}"

    title       = f"{name} — Verified Resume"
    description = (
        f"{name} | Verified Resume · CV Verified by PINIT · "
        "Tap to View Resume"
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
