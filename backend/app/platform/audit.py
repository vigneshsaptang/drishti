"""
Audit logging service — append-only security event log.
"""
import logging
import threading
import time
from datetime import datetime, timezone
from typing import Any

from bson import ObjectId

log = logging.getLogger("audit")

_buffer: list[dict] = []
_buffer_lock = threading.Lock()
_FLUSH_INTERVAL = 2.0
_FLUSH_SIZE = 50
_db_ref = None
_flush_thread: threading.Thread | None = None


def init_audit(platform_db):
    global _db_ref, _flush_thread
    _db_ref = platform_db
    if _flush_thread is None:
        _flush_thread = threading.Thread(target=_flush_loop, daemon=True)
        _flush_thread.start()


def log_event(
    action: str,
    *,
    actor_id: ObjectId | str | None = None,
    actor_username: str = "",
    target_type: str = "system",
    target_id: ObjectId | str | None = None,
    detail: dict[str, Any] | None = None,
    ip_address: str = "",
    user_agent: str = "",
):
    entry = {
        "timestamp": datetime.now(timezone.utc),
        "actor_id": ObjectId(actor_id) if isinstance(actor_id, str) and len(actor_id) == 24 else actor_id,
        "actor_username": actor_username,
        "action": action,
        "target_type": target_type,
        "target_id": ObjectId(target_id) if isinstance(target_id, str) and len(target_id) == 24 else target_id,
        "detail": detail,
        "ip_address": ip_address,
        "user_agent": user_agent,
    }
    with _buffer_lock:
        _buffer.append(entry)
        if len(_buffer) >= _FLUSH_SIZE:
            _do_flush()


def _do_flush():
    global _buffer
    if not _buffer or _db_ref is None:
        return
    batch = _buffer[:]
    _buffer = []
    try:
        _db_ref["audit_log"].insert_many(batch, ordered=False)
    except Exception as e:
        log.warning("audit flush failed: %s", e)
        with _buffer_lock:
            _buffer = batch + _buffer


def _flush_loop():
    while True:
        time.sleep(_FLUSH_INTERVAL)
        with _buffer_lock:
            _do_flush()


def flush_now():
    with _buffer_lock:
        _do_flush()


def query_audit_log(
    db,
    *,
    action: str | None = None,
    actor_id: str | None = None,
    target_id: str | None = None,
    from_date: datetime | None = None,
    to_date: datetime | None = None,
    page: int = 1,
    per_page: int = 50,
) -> tuple[list[dict], int]:
    filt: dict = {}
    if action:
        filt["action"] = action
    if actor_id:
        filt["actor_id"] = ObjectId(actor_id)
    if target_id:
        filt["target_id"] = ObjectId(target_id)
    if from_date or to_date:
        ts_filt: dict = {}
        if from_date:
            ts_filt["$gte"] = from_date
        if to_date:
            ts_filt["$lte"] = to_date
        filt["timestamp"] = ts_filt

    total = db["audit_log"].count_documents(filt)
    skip = (page - 1) * per_page
    entries = []
    for doc in db["audit_log"].find(filt).sort("timestamp", -1).skip(skip).limit(per_page):
        doc["_id"] = str(doc["_id"])
        if "actor_id" in doc and doc["actor_id"] is not None:
            doc["actor_id"] = str(doc["actor_id"])
        if "target_id" in doc and doc["target_id"] is not None:
            doc["target_id"] = str(doc["target_id"])
        entries.append(doc)
    return entries, total
