"""
System status service — engine health checks and admin status messages.
"""
import time
import logging
from datetime import datetime
from bson import ObjectId

from app.config import settings
from app.db import get_credmon, get_darkmon, get_fti, get_platform_db

logger = logging.getLogger("auracle.status")

_status_cache = {"data": None, "ts": 0}
_CACHE_TTL = 60


def _check_engine(get_client, name: str) -> dict:
    try:
        client = get_client()
        start = time.monotonic()
        client.admin.command("ping")
        latency = int((time.monotonic() - start) * 1000)
        if latency < 1000:
            status = "operational"
        elif latency < 5000:
            status = "degraded"
        else:
            status = "down"
        return {
            "status": status,
            "latency_ms": latency,
            "last_checked": datetime.utcnow().isoformat() + "Z",
        }
    except Exception as e:
        logger.warning("Engine %s health check failed: %s", name, e)
        return {
            "status": "down",
            "latency_ms": None,
            "last_checked": datetime.utcnow().isoformat() + "Z",
            "note": str(e)[:200],
        }


ENGINE_MAP = {
    "credmon": ("Breach Intelligence", get_credmon),
    "darkmon": ("Dark Web Intelligence", get_darkmon),
    "fti": ("Threat Intelligence", get_fti),
}


def get_system_status() -> dict:
    now = time.monotonic()
    if _status_cache["data"] and (now - _status_cache["ts"]) < _CACHE_TTL:
        cached = _status_cache["data"]
        cached["messages"] = _get_active_messages()
        return cached

    engines = {}
    for key, (label, getter) in ENGINE_MAP.items():
        engines[key] = _check_engine(getter, key)
        engines[key]["label"] = label

    statuses = [e["status"] for e in engines.values()]
    if "down" in statuses:
        overall = "down"
    elif "degraded" in statuses:
        overall = "degraded"
    else:
        overall = "operational"

    result = {"engines": engines, "overall_status": overall, "messages": _get_active_messages()}
    _status_cache["data"] = result
    _status_cache["ts"] = now
    return result


def _get_active_messages() -> list[dict]:
    db = get_platform_db()
    now = datetime.utcnow()
    return list(
        db.status_messages.find({
            "active": True,
            "$or": [{"expires_at": None}, {"expires_at": {"$gt": now}}],
        }).sort("created_at", -1)
    )


def create_status_message(message: str, severity: str, author_id: str, author_name: str, expires_at: datetime | None = None) -> dict:
    db = get_platform_db()
    now = datetime.utcnow()
    doc = {
        "message": message,
        "severity": severity,
        "active": True,
        "author_id": ObjectId(author_id),
        "author_name": author_name,
        "created_at": now,
        "updated_at": now,
        "expires_at": expires_at,
    }
    db.status_messages.insert_one(doc)
    return doc


def update_status_message(message_id: str, updates: dict) -> dict | None:
    db = get_platform_db()
    allowed = {"message", "severity", "active", "expires_at"}
    filtered = {k: v for k, v in updates.items() if k in allowed}
    if not filtered:
        return None
    filtered["updated_at"] = datetime.utcnow()
    db.status_messages.update_one({"_id": ObjectId(message_id)}, {"$set": filtered})
    return db.status_messages.find_one({"_id": ObjectId(message_id)})


def list_all_messages() -> dict:
    db = get_platform_db()
    messages = list(db.status_messages.find().sort("created_at", -1))
    return {"messages": messages, "total": len(messages)}
