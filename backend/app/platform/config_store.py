"""
Platform config singleton — reads/caches the platform_config document from MongoDB.
"""
import threading
import time
import logging
from datetime import datetime, timezone

from app.platform.auth import (
    DEFAULT_PASSWORD_POLICY,
    DEFAULT_SESSION_POLICY,
    DEFAULT_LOCKOUT_POLICY,
)

log = logging.getLogger("platform_config")

_cache: dict | None = None
_cache_ts: float = 0
_CACHE_TTL = 60
_lock = threading.Lock()

DEFAULT_CONFIG = {
    "_id": "global",
    "setup_complete": False,
    "password_policy": DEFAULT_PASSWORD_POLICY,
    "session_policy": DEFAULT_SESSION_POLICY,
    "lockout_policy": DEFAULT_LOCKOUT_POLICY,
    "updated_at": None,
    "updated_by": None,
}


def init_config(db):
    """Ensure platform_config singleton exists. Called at startup."""
    existing = db["platform_config"].find_one({"_id": "global"})
    if existing is None:
        doc = {**DEFAULT_CONFIG, "updated_at": datetime.now(timezone.utc)}
        db["platform_config"].insert_one(doc)
        log.info("Created default platform_config")
        _set_cache(doc)
    else:
        _set_cache(existing)


def _set_cache(doc: dict):
    global _cache, _cache_ts
    _cache = doc
    _cache_ts = time.time()


def get_config(db) -> dict:
    global _cache, _cache_ts
    if _cache and (time.time() - _cache_ts) < _CACHE_TTL:
        return _cache
    with _lock:
        if _cache and (time.time() - _cache_ts) < _CACHE_TTL:
            return _cache
        doc = db["platform_config"].find_one({"_id": "global"})
        if doc:
            _set_cache(doc)
            return doc
        return DEFAULT_CONFIG


def update_config(db, updates: dict, actor_id=None) -> dict:
    now = datetime.now(timezone.utc)
    current = get_config(db)

    set_fields = {"updated_at": now, "updated_by": actor_id}
    for key in ("password_policy", "session_policy", "lockout_policy"):
        if key in updates and updates[key]:
            merged = {**current.get(key, {}), **updates[key]}
            set_fields[key] = merged

    db["platform_config"].update_one(
        {"_id": "global"},
        {"$set": set_fields},
    )
    doc = db["platform_config"].find_one({"_id": "global"})
    _set_cache(doc)
    return doc


def mark_setup_complete(db):
    db["platform_config"].update_one(
        {"_id": "global"},
        {"$set": {"setup_complete": True, "updated_at": datetime.now(timezone.utc)}},
    )
    invalidate_cache()


def is_setup_complete(db) -> bool:
    return get_config(db).get("setup_complete", False)


def invalidate_cache():
    global _cache_ts
    _cache_ts = 0
