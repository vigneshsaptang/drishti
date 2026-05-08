"""
Sliding-window rate limiting via MongoDB counters.
"""
from datetime import datetime, timedelta, timezone
from bson import ObjectId


def _current_window(window_seconds: int = 3600) -> datetime:
    now = datetime.now(timezone.utc)
    return now.replace(minute=0, second=0, microsecond=0)


def check_rate_limit(db, user_id: str, counter_type: str, max_count: int) -> bool:
    if max_count < 0:
        return True
    if max_count == 0:
        return False

    window = _current_window()
    coll = db["rate_limit_counters"]

    expires_at = window + timedelta(hours=2)

    result = coll.find_one_and_update(
        {
            "user_id": user_id,
            "counter_type": counter_type,
            "window_start": window,
        },
        {
            "$inc": {"count": 1},
            "$setOnInsert": {"expires_at": expires_at},
        },
        upsert=True,
        return_document=True,
    )

    if result and result.get("count", 0) > max_count:
        coll.update_one({"_id": result["_id"]}, {"$inc": {"count": -1}})
        return False

    return True


def get_rate_limit_status(db, user_id: str, counter_type: str) -> dict:
    window = _current_window()
    doc = db["rate_limit_counters"].find_one({
        "user_id": user_id,
        "counter_type": counter_type,
        "window_start": window,
    })
    return {
        "counter_type": counter_type,
        "current_count": doc.get("count", 0) if doc else 0,
        "window_start": window.isoformat(),
    }
