"""
Resume Activity / Security Monitoring
======================================
Receives batched viewer events from the frontend tracking hook and
stores them in resume_activity_logs.  Also maintains a richer per-session
record in viewer_sessions for the advanced analytics panel.

Completely isolated from existing sharing / masking / approval logic.

Routes
------
POST /resume/activity/log                  — batch insert events (public, token-gated)
POST /resume/activity/session              — upsert viewer session row (start / geo_update / end)
GET  /resume/activity/timeline/{asset_id}  — owner fetches full security timeline
GET  /resume/activity/sessions/{asset_id}  — owner fetches rich per-session analytics
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from db.database import get_admin_db

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Resume Activity"])

_MAX_EVENTS_PER_BATCH = 50   # cap to prevent abuse


# ─── Pydantic models ──────────────────────────────────────────────────────────

class EventItem(BaseModel):
    event_type   : str
    event_details: Dict[str, Any] = {}
    timestamp    : Optional[str]  = None


class BatchLogRequest(BaseModel):
    share_token : str
    session_id  : str
    viewer_email: Optional[str]       = None
    events      : List[EventItem]


# ── Session upsert models ─────────────────────────────────────────────────────

class SessionUpsertRequest(BaseModel):
    """
    Sent by the frontend hook on three occasions:
      action="start"      — first event on page load (device info)
      action="geo_update" — after geolocation permission resolved
      action="end"        — beforeunload / hook cleanup (duration + counters)
    Fields not relevant to a particular action are simply ignored.
    """
    action      : str               # "start" | "geo_update" | "end"
    share_token : str
    session_id  : str
    viewer_email: Optional[str]     = None

    # Device fingerprint (action=start)
    user_agent  : Optional[str]     = None
    browser     : Optional[str]     = None
    os          : Optional[str]     = None
    device_type : Optional[str]     = None
    screen_size : Optional[str]     = None
    is_first_visit: Optional[bool]  = None

    # Geolocation (action=geo_update)
    geo_status  : Optional[str]     = None   # "granted"|"denied"|"unavailable"
    latitude    : Optional[float]   = None
    longitude   : Optional[float]   = None
    geo_accuracy: Optional[float]   = None

    # Duration + security counters (action=end)
    total_duration_ms : Optional[int] = None
    active_duration_ms: Optional[int] = None
    copy_count        : Optional[int] = None
    print_attempts    : Optional[int] = None
    screenshot_signals: Optional[int] = None
    is_suspicious     : Optional[bool]= None


# ─── Routes ───────────────────────────────────────────────────────────────────

@router.post("/resume/activity/log")
async def log_activity(body: BatchLogRequest, request: Request):
    """
    Batch insert activity events sent by the viewer-side tracking hook.
    No auth required — public route, gated by share_token existence check.
    Uses service-role key so RLS is bypassed on insert.
    """
    if not body.events:
        return {"ok": True, "logged": 0}

    db = get_admin_db()

    # Validate share token to prevent logging spam on fake tokens
    tok_res = (
        db.table("resume_share_links")
        .select("id")
        .eq("share_token", body.share_token)
        .limit(1)
        .execute()
    )
    if not tok_res.data:
        # Silently ignore (don't expose whether token exists via 404)
        return {"ok": True, "logged": 0}

    viewer_ip = (
        request.headers.get("x-forwarded-for", "").split(",")[0].strip()
        or (request.client.host if request.client else "unknown")
    )

    now_iso = datetime.now(timezone.utc).isoformat()

    rows: list[dict] = []
    for ev in body.events[: _MAX_EVENTS_PER_BATCH]:
        rows.append({
            "share_token"  : body.share_token,
            "session_id"   : body.session_id[:128],
            "viewer_email" : (body.viewer_email or "").strip().lower() or None,
            "viewer_ip"    : viewer_ip,
            "event_type"   : ev.event_type[:100],
            "event_details": ev.event_details,
            "created_at"   : ev.timestamp or now_iso,
        })

    try:
        db.table("resume_activity_logs").insert(rows).execute()
        logger.info(
            "[ACTIVITY] Logged %d events — token=%s… session=%s…",
            len(rows), body.share_token[:8], body.session_id[:8],
        )
    except Exception as exc:
        logger.error("[ACTIVITY] Batch insert failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"Logging failed: {exc}")

    return {"ok": True, "logged": len(rows)}


@router.get("/resume/activity/timeline/{asset_id}")
async def get_activity_timeline(asset_id: str, user_id: str):
    """
    Owner fetches the full security event timeline for an asset.
    Returns events grouped with summary counts.
    Query param: ?user_id=<owner_user_id>
    """
    if not user_id:
        raise HTTPException(status_code=400, detail="user_id required")

    db = get_admin_db()

    # Collect all share tokens owned by this user for this asset
    links_res = (
        db.table("resume_share_links")
        .select("share_token")
        .eq("asset_id", asset_id)
        .eq("owner_user_id", user_id)
        .execute()
    )
    tokens = [lnk["share_token"] for lnk in (links_res.data or [])]
    if not tokens:
        return {"ok": True, "asset_id": asset_id, "total": 0,
                "event_counts": {}, "sessions": [], "events": []}

    all_events: list[dict] = []
    for tok in tokens:
        res = (
            db.table("resume_activity_logs")
            .select(
                "session_id, viewer_email, viewer_ip, "
                "event_type, event_details, created_at"
            )
            .eq("share_token", tok)
            .order("created_at", desc=True)
            .limit(500)
            .execute()
        )
        for ev in res.data or []:
            ev["share_token"] = tok
            all_events.append(ev)

    # Sort newest-first across all tokens
    all_events.sort(key=lambda x: x.get("created_at", ""), reverse=True)

    # Build per-event-type counts
    event_counts: dict[str, int] = {}
    for ev in all_events:
        et = ev["event_type"]
        event_counts[et] = event_counts.get(et, 0) + 1

    # Build unique sessions summary
    sessions_seen: dict[str, dict] = {}
    for ev in all_events:
        sid = ev["session_id"]
        if sid not in sessions_seen:
            sessions_seen[sid] = {
                "session_id"  : sid,
                "viewer_email": ev.get("viewer_email"),
                "viewer_ip"   : ev.get("viewer_ip"),
                "first_seen"  : ev.get("created_at"),
                "last_seen"   : ev.get("created_at"),
                "event_count" : 0,
            }
        else:
            # Track earliest time (list is newest-first so last item = earliest)
            sessions_seen[sid]["first_seen"] = ev.get("created_at")
        sessions_seen[sid]["event_count"] += 1

    # Classify suspicious sessions (had at least one high-severity event)
    _HIGH = {"screenshot_signal", "devtools_signal", "devtools_attempt",
             "view_source_attempt"}
    _MED  = {"copy_attempt", "print_attempt", "save_attempt", "right_click"}

    suspicious_sessions: set[str] = set()
    for ev in all_events:
        if ev["event_type"] in _HIGH:
            suspicious_sessions.add(ev["session_id"])

    for s in sessions_seen.values():
        s["is_suspicious"] = s["session_id"] in suspicious_sessions

    return {
        "ok"          : True,
        "asset_id"    : asset_id,
        "total"       : len(all_events),
        "event_counts": event_counts,
        "sessions"    : list(sessions_seen.values()),
        "events"      : all_events[:300],
    }


# ─── Session upsert ───────────────────────────────────────────────────────────

@router.post("/resume/activity/session")
async def upsert_session(body: SessionUpsertRequest, request: Request):
    """
    Create or update a viewer_sessions row.

    Uses Supabase upsert on `session_id` (UNIQUE constraint) so repeated
    calls from the same browser session safely merge — never duplicate rows.

    No auth required — public route gated by share_token existence check.
    """
    db = get_admin_db()

    # Validate token (silently ignore unknown tokens to prevent enumeration)
    tok_res = (
        db.table("resume_share_links")
        .select("id")
        .eq("share_token", body.share_token)
        .limit(1)
        .execute()
    )
    if not tok_res.data:
        return {"ok": True, "action": body.action}

    viewer_ip = (
        request.headers.get("x-forwarded-for", "").split(",")[0].strip()
        or (request.client.host if request.client else "unknown")
    )

    now_iso = datetime.now(timezone.utc).isoformat()

    # Build the upsert payload — only include non-None fields so partial
    # updates (e.g. geo_update) don't accidentally wipe existing columns.
    row: dict = {
        "share_token": body.share_token,
        "session_id" : body.session_id[:128],
        "viewer_ip"  : viewer_ip,
        "last_seen"  : now_iso,
    }

    if body.viewer_email:
        row["viewer_email"] = body.viewer_email.strip().lower()

    if body.action == "start":
        row["first_seen"] = now_iso
        if body.user_agent   is not None: row["user_agent"]    = body.user_agent[:512]
        if body.browser      is not None: row["browser"]       = body.browser[:100]
        if body.os           is not None: row["os"]            = body.os[:100]
        if body.device_type  is not None: row["device_type"]   = body.device_type[:30]
        if body.screen_size  is not None: row["screen_size"]   = body.screen_size[:20]
        if body.is_first_visit is not None: row["is_first_visit"] = body.is_first_visit
        row["geo_status"] = "pending"

    elif body.action == "geo_update":
        if body.geo_status   is not None: row["geo_status"]    = body.geo_status[:30]
        if body.latitude     is not None: row["latitude"]      = body.latitude
        if body.longitude    is not None: row["longitude"]     = body.longitude
        if body.geo_accuracy is not None: row["geo_accuracy"]  = body.geo_accuracy

    elif body.action == "end":
        if body.total_duration_ms  is not None: row["total_duration_ms"]  = body.total_duration_ms
        if body.active_duration_ms is not None: row["active_duration_ms"] = body.active_duration_ms
        if body.copy_count         is not None: row["copy_count"]         = body.copy_count
        if body.print_attempts     is not None: row["print_attempts"]     = body.print_attempts
        if body.screenshot_signals is not None: row["screenshot_signals"] = body.screenshot_signals
        if body.is_suspicious      is not None: row["is_suspicious"]      = body.is_suspicious

    try:
        db.table("viewer_sessions").upsert(row, on_conflict="session_id").execute()
        logger.info(
            "[SESSION] %s — token=%s… session=%s…",
            body.action, body.share_token[:8], body.session_id[:8],
        )
    except Exception as exc:
        logger.error("[SESSION] Upsert failed (%s): %s", body.action, exc)
        # Non-fatal — never block the viewer
        return {"ok": False, "error": str(exc)}

    return {"ok": True, "action": body.action}


@router.get("/resume/activity/sessions/{asset_id}")
async def get_sessions(asset_id: str, user_id: str):
    """
    Owner fetches rich per-session analytics for an asset.
    Returns all viewer_sessions rows for every share token owned by this user.
    Query param: ?user_id=<owner_user_id>
    """
    if not user_id:
        raise HTTPException(status_code=400, detail="user_id required")

    db = get_admin_db()

    # Verify ownership — collect all tokens for this asset
    links_res = (
        db.table("resume_share_links")
        .select("share_token")
        .eq("asset_id", asset_id)
        .eq("owner_user_id", user_id)
        .execute()
    )
    tokens = [lnk["share_token"] for lnk in (links_res.data or [])]
    if not tokens:
        return {"ok": True, "asset_id": asset_id, "sessions": []}

    all_sessions: list[dict] = []
    for tok in tokens:
        try:
            res = (
                db.table("viewer_sessions")
                .select(
                    "session_id, viewer_email, viewer_ip, browser, os, device_type, "
                    "screen_size, is_first_visit, geo_status, latitude, longitude, "
                    "geo_accuracy, first_seen, last_seen, total_duration_ms, "
                    "active_duration_ms, copy_count, print_attempts, "
                    "screenshot_signals, is_suspicious, share_token"
                )
                .eq("share_token", tok)
                .order("first_seen", desc=True)
                .limit(200)
                .execute()
            )
            all_sessions.extend(res.data or [])
        except Exception as exc:
            # Table may not exist yet (SQL not yet run in Supabase) — return empty
            logger.warning("[SESSION] viewer_sessions query failed (table may not exist): %s", exc)
            break

    # Newest-first across tokens
    all_sessions.sort(key=lambda x: x.get("first_seen", ""), reverse=True)

    return {
        "ok"      : True,
        "asset_id": asset_id,
        "total"   : len(all_sessions),
        "sessions": all_sessions,
    }
