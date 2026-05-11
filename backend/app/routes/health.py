"""
Deep health check endpoint — probes all Mongo engines and returns structured
infrastructure status.  Admin-only.

Cached for 30 seconds to avoid hammering Mongo on rapid admin refreshes.
"""
import time
import threading
import logging
import concurrent.futures
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from app.config import settings
from app.db import get_credmon, get_darkmon, get_fti, get_audit, get_platform_db

router = APIRouter(tags=["health"])
log = logging.getLogger("health")

# ── Module-level cache (same pattern as stats.py) ──────────────────────────
_cache: dict | None = None
_cache_ts: float = 0
_TTL = 30  # seconds
_lock = threading.Lock()


# ── Individual health checks ───────────────────────────────────────────────

def _check_credmon() -> dict:
    try:
        client = get_credmon()
        t0 = time.time()
        client.admin.command("ping")
        latency_ms = round((time.time() - t0) * 1000)
        canary = client["Master_extracts"]["emails"].estimated_document_count()
        return {"status": "ok", "latency_ms": latency_ms, "canary_count": canary}
    except Exception as e:
        log.warning("credmon health check failed: %s", e)
        return {"status": "error", "error": str(e)}


def _check_darkmon() -> dict:
    try:
        client = get_darkmon()
        t0 = time.time()
        client.admin.command("ping")
        latency_ms = round((time.time() - t0) * 1000)
        canary = client["forums_market"]["thread_post"].estimated_document_count()
        return {"status": "ok", "latency_ms": latency_ms, "canary_count": canary}
    except Exception as e:
        log.warning("darkmon health check failed: %s", e)
        return {"status": "error", "error": str(e)}


def _check_fti() -> dict:
    try:
        client = get_fti()
        t0 = time.time()
        client.admin.command("ping")
        latency_ms = round((time.time() - t0) * 1000)
        canary = client["KAMAL"]["CrimeData"].estimated_document_count()
        return {"status": "ok", "latency_ms": latency_ms, "canary_count": canary}
    except Exception as e:
        log.warning("fti health check failed: %s", e)
        return {"status": "error", "error": str(e)}


def _check_platform() -> dict:
    try:
        db = get_platform_db()
        t0 = time.time()
        user_count = db["users"].estimated_document_count()
        latency_ms = round((time.time() - t0) * 1000)
        return {"status": "ok", "latency_ms": latency_ms, "user_count": user_count}
    except Exception as e:
        log.warning("platform health check failed: %s", e)
        return {"status": "error", "error": str(e)}


def _check_audit() -> dict:
    if not settings.mongo_uri_audit:
        return {"status": "not_configured"}
    try:
        client = get_audit()
        if client is None:
            return {"status": "not_configured"}
        t0 = time.time()
        client.admin.command("ping")
        latency_ms = round((time.time() - t0) * 1000)
        db = client[settings.audit_db_name]
        cutoff = datetime.now(timezone.utc) - timedelta(hours=1)
        events_last_hour = db["audit_events"].count_documents(
            {"timestamp": {"$gte": cutoff}},
            maxTimeMS=5000,
        )
        return {
            "status": "ok",
            "latency_ms": latency_ms,
            "events_last_hour": events_last_hour,
        }
    except Exception as e:
        log.warning("audit health check failed: %s", e)
        return {"status": "error", "error": str(e)}


def _check_client_errors() -> dict:
    """Count client errors from the audit_events collection."""
    if not settings.mongo_uri_audit:
        return {"count_last_hour": 0, "count_last_24h": 0}
    try:
        client = get_audit()
        if client is None:
            return {"count_last_hour": 0, "count_last_24h": 0}
        db = client[settings.audit_db_name]
        now = datetime.now(timezone.utc)
        hour_ago = now - timedelta(hours=1)
        day_ago = now - timedelta(hours=24)
        base_filter = {"category": "client_error"}
        count_1h = db["audit_events"].count_documents(
            {**base_filter, "timestamp": {"$gte": hour_ago}},
            maxTimeMS=5000,
        )
        count_24h = db["audit_events"].count_documents(
            {**base_filter, "timestamp": {"$gte": day_ago}},
            maxTimeMS=5000,
        )
        return {"count_last_hour": count_1h, "count_last_24h": count_24h}
    except Exception as e:
        log.warning("client_errors health check failed: %s", e)
        return {"count_last_hour": 0, "count_last_24h": 0}


# ── Build the full health report ───────────────────────────────────────────

def _build_health() -> dict:
    results = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as ex:
        futures = {
            ex.submit(_check_credmon): "credmon",
            ex.submit(_check_darkmon): "darkmon",
            ex.submit(_check_fti): "fti",
            ex.submit(_check_platform): "platform",
            ex.submit(_check_audit): "audit",
            ex.submit(_check_client_errors): "client_errors",
        }
        for fut in concurrent.futures.as_completed(futures):
            name = futures[fut]
            try:
                results[name] = fut.result()
            except Exception as e:
                results[name] = {"status": "error", "error": str(e)}

    overall = "healthy"
    for name, check in results.items():
        if name == "audit" and check.get("status") == "not_configured":
            continue  # audit is optional
        if name == "client_errors":
            continue  # informational, not a health indicator
        if check.get("status") == "error":
            overall = "degraded"
            break

    return {
        "status": overall,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "engines": results,
    }


# ── Route ──────────────────────────────────────────────────────────────────

@router.get("/health/deep")
async def deep_health(request: Request):
    """Admin-only deep infrastructure health check."""
    user = getattr(request.state, "user", None) or {}
    if user.get("role") not in ("admin", "superadmin"):
        return JSONResponse({"detail": "Admin only"}, status_code=403)

    global _cache, _cache_ts

    now = time.time()
    if _cache and (now - _cache_ts) < _TTL:
        return {**_cache, "_cached": True, "_age_s": round(now - _cache_ts)}

    with _lock:
        # Double-check after acquiring lock
        now = time.time()
        if _cache and (now - _cache_ts) < _TTL:
            return {**_cache, "_cached": True, "_age_s": round(now - _cache_ts)}

        _cache = _build_health()
        _cache_ts = time.time()
        return {**_cache, "_cached": False, "_age_s": 0}
