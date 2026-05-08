"""
Session CRUD, concurrent limit enforcement, and cleanup.
"""
from datetime import datetime, timedelta, timezone

from bson import ObjectId

from app.platform.auth import (
    generate_refresh_token,
    hash_token,
    create_access_token,
    derive_device_label,
)


def create_session(
    db,
    user: dict,
    ip_address: str,
    user_agent: str,
    session_policy: dict,
) -> dict:
    """Create a new session, enforcing concurrent session limits. Returns tokens + session."""
    user_id = user["_id"]
    username = user["username"]
    role = user["role"]
    max_concurrent = session_policy.get("max_concurrent_sessions", 5)
    refresh_ttl_days = session_policy.get("refresh_token_ttl_days", 7)

    if max_concurrent > 0:
        active_count = db["sessions"].count_documents({
            "user_id": user_id,
            "revoked": False,
            "expires_at": {"$gt": datetime.now(timezone.utc)},
        })
        if active_count >= max_concurrent:
            oldest = db["sessions"].find_one(
                {"user_id": user_id, "revoked": False, "expires_at": {"$gt": datetime.now(timezone.utc)}},
                sort=[("created_at", 1)],
            )
            if oldest:
                db["sessions"].update_one(
                    {"_id": oldest["_id"]},
                    {"$set": {"revoked": True, "revoked_at": datetime.now(timezone.utc)}},
                )

    refresh_token = generate_refresh_token()
    access_token, jti = create_access_token(str(user_id), username, role)
    now = datetime.now(timezone.utc)

    session_doc = {
        "user_id": user_id,
        "refresh_token_hash": hash_token(refresh_token),
        "access_token_jti": jti,
        "created_at": now,
        "expires_at": now + timedelta(days=refresh_ttl_days),
        "last_refreshed_at": now,
        "revoked": False,
        "revoked_at": None,
        "ip_address": ip_address,
        "user_agent": user_agent,
        "device_label": derive_device_label(user_agent),
    }
    result = db["sessions"].insert_one(session_doc)
    session_doc["_id"] = result.inserted_id

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "jti": jti,
        "session_id": str(result.inserted_id),
        "session_doc": session_doc,
    }


def refresh_session(db, refresh_token: str, user: dict, session_policy: dict) -> dict | None:
    """Rotate refresh token, issue new access token. Returns None on failure."""
    rt_hash = hash_token(refresh_token)
    refresh_ttl_days = session_policy.get("refresh_token_ttl_days", 7)
    now = datetime.now(timezone.utc)

    session = db["sessions"].find_one({
        "refresh_token_hash": rt_hash,
        "revoked": False,
        "expires_at": {"$gt": now},
    })
    if session is None:
        stale = db["sessions"].find_one({"refresh_token_hash": rt_hash})
        if stale and stale.get("revoked"):
            return None
        maybe_replayed = db["sessions"].find_one({
            "user_id": user["_id"],
            "revoked": False,
        })
        if maybe_replayed:
            db["sessions"].update_many(
                {"user_id": user["_id"]},
                {"$set": {"revoked": True, "revoked_at": now}},
            )
        return None

    if session["user_id"] != user["_id"]:
        return None

    new_refresh = generate_refresh_token()
    new_access, new_jti = create_access_token(str(user["_id"]), user["username"], user["role"])

    db["sessions"].update_one(
        {"_id": session["_id"]},
        {"$set": {
            "refresh_token_hash": hash_token(new_refresh),
            "access_token_jti": new_jti,
            "last_refreshed_at": now,
            "expires_at": now + timedelta(days=refresh_ttl_days),
        }},
    )

    return {
        "access_token": new_access,
        "refresh_token": new_refresh,
        "jti": new_jti,
        "session_id": str(session["_id"]),
    }


def revoke_session(db, session_id: str, user_id: ObjectId | None = None) -> bool:
    filt: dict = {"_id": ObjectId(session_id), "revoked": False}
    if user_id:
        filt["user_id"] = user_id
    result = db["sessions"].update_one(
        filt,
        {"$set": {"revoked": True, "revoked_at": datetime.now(timezone.utc)}},
    )
    return result.modified_count > 0


def revoke_all_sessions(db, user_id: ObjectId, exclude_jti: str | None = None) -> int:
    now = datetime.now(timezone.utc)
    filt: dict = {"user_id": user_id, "revoked": False}
    if exclude_jti:
        filt["access_token_jti"] = {"$ne": exclude_jti}
    result = db["sessions"].update_many(
        filt,
        {"$set": {"revoked": True, "revoked_at": now}},
    )
    return result.modified_count


def list_user_sessions(db, user_id: ObjectId, current_jti: str | None = None) -> list[dict]:
    now = datetime.now(timezone.utc)
    sessions = list(db["sessions"].find({
        "user_id": user_id,
        "revoked": False,
        "expires_at": {"$gt": now},
    }).sort("created_at", -1))

    result = []
    for s in sessions:
        result.append({
            "id": str(s["_id"]),
            "created_at": s["created_at"],
            "last_refreshed_at": s["last_refreshed_at"],
            "expires_at": s["expires_at"],
            "ip_address": s.get("ip_address", ""),
            "device_label": s.get("device_label"),
            "is_current": s.get("access_token_jti") == current_jti if current_jti else False,
        })
    return result


def validate_jti(db, jti: str) -> dict | None:
    """Check if a JTI belongs to an active session. Returns the session doc or None."""
    now = datetime.now(timezone.utc)
    return db["sessions"].find_one({
        "access_token_jti": jti,
        "revoked": False,
        "expires_at": {"$gt": now},
    })
