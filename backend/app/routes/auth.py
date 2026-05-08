from datetime import datetime, timedelta, timezone

from bson import ObjectId
from fastapi import APIRouter, HTTPException, Request

from app.db import get_platform_db
from app.platform.auth import (
    hash_password,
    verify_password_timing_safe,
    check_needs_rehash,
    hash_token,
    generate_refresh_token,
    generate_api_key,
    generate_temp_password,
    create_access_token,
    decode_access_token,
    validate_password_policy,
    check_lockout,
    should_lock,
    derive_device_label,
)
from app.platform.sessions import (
    create_session,
    refresh_session,
    revoke_session,
    revoke_all_sessions,
    list_user_sessions,
    validate_jti,
)
from app.platform.config_store import get_config, is_setup_complete, mark_setup_complete
from app.platform.audit import log_event
from app.audit import audit as audit_service
from app.platform.models import (
    LoginRequest,
    RefreshRequest,
    LogoutRequest,
    SetupRequest,
    ChangePasswordRequest,
    TempPasswordChangeRequest,
    UpdateProfileRequest,
    CreateApiKeyRequest,
    RevokeAllSessionsRequest,
)
from app.platform.rbac import resolve_effective_permissions, resolve_effective_limits
from app.captcha import generate_captcha, verify_captcha
from app.brute_force import brute_force

router = APIRouter(tags=["auth"])

APP_NAME = "Auracle by Saptang Labs"


def _get_current_user(request: Request) -> dict:
    return getattr(request.state, "user", None)


def _get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else ""


def _user_response(user: dict, include_permissions: bool = False) -> dict:
    resp = {
        "id": str(user["_id"]),
        "username": user["username"],
        "email": user.get("email", ""),
        "display_name": user.get("display_name", ""),
        "role": user.get("role", "analyst"),
        "status": user.get("status", "active"),
        "last_login_at": user.get("last_login_at"),
        "created_at": user.get("created_at"),
        "password_changed_at": user.get("password_changed_at"),
        "password_expires_at": user.get("password_expires_at"),
        "force_password_change": user.get("force_password_change", False),
    }
    if include_permissions:
        uid = str(user["_id"])
        resp["permissions"] = sorted(resolve_effective_permissions(uid))
        resp["limits"] = resolve_effective_limits(uid)
    return resp


# --------------------------------------------------------------------------- #
# 1. GET /auth/status
# --------------------------------------------------------------------------- #
@router.get("/auth/status")
def auth_status():
    db = get_platform_db()
    return {
        "app_name": APP_NAME,
        "auth_required": True,
        "setup_complete": is_setup_complete(db),
    }


# --------------------------------------------------------------------------- #
# 2. GET /auth/setup/status
# --------------------------------------------------------------------------- #
@router.get("/auth/setup/status")
def setup_status():
    db = get_platform_db()
    return {
        "setup_complete": is_setup_complete(db),
        "app_name": APP_NAME,
    }


# --------------------------------------------------------------------------- #
# 3. POST /auth/setup
# --------------------------------------------------------------------------- #
@router.post("/auth/setup")
def setup(body: SetupRequest, request: Request):
    db = get_platform_db()
    if is_setup_complete(db):
        raise HTTPException(status_code=400, detail="Setup already completed")

    config = get_config(db)
    policy = config.get("password_policy", {})
    violations = validate_password_policy(body.password, body.username, policy)
    if violations:
        raise HTTPException(status_code=422, detail="; ".join(violations))

    if db["users"].find_one({"username": body.username}):
        raise HTTPException(status_code=409, detail="Username already taken")

    now = datetime.now(timezone.utc)
    max_age = policy.get("max_age_days", 90)
    user_doc = {
        "username": body.username,
        "email": body.email,
        "display_name": body.display_name,
        "password_hash": hash_password(body.password),
        "role": "admin",
        "status": "active",
        "avatar_url": None,
        "password_changed_at": now,
        "password_expires_at": now + timedelta(days=max_age) if max_age else None,
        "force_password_change": False,
        "password_history": [],
        "failed_login_attempts": 0,
        "locked_until": None,
        "last_failed_login_at": None,
        "created_at": now,
        "created_by": None,
        "updated_at": now,
        "last_login_at": now,
        "temp_password_hash": None,
        "temp_password_expires_at": None,
    }
    result = db["users"].insert_one(user_doc)
    user_doc["_id"] = result.inserted_id

    session_policy = config.get("session_policy", {})
    ip = _get_client_ip(request)
    ua = request.headers.get("user-agent", "")
    tokens = create_session(db, user_doc, ip, ua, session_policy)

    mark_setup_complete(db)

    log_event(
        "setup_complete",
        actor_id=user_doc["_id"],
        actor_username=user_doc["username"],
        target_type="system",
        ip_address=ip,
        user_agent=ua,
    )

    return {
        "access_token": tokens["access_token"],
        "refresh_token": tokens["refresh_token"],
        "token_type": "bearer",
        "user": _user_response(user_doc, include_permissions=True),
    }


# --------------------------------------------------------------------------- #
# 3b. GET /auth/captcha
# --------------------------------------------------------------------------- #
@router.get("/auth/captcha")
def get_captcha():
    return generate_captcha()


# --------------------------------------------------------------------------- #
# 4. POST /auth/login
# --------------------------------------------------------------------------- #
@router.post("/auth/login")
def login(body: LoginRequest, request: Request):
    db = get_platform_db()
    config = get_config(db)
    lockout_policy = config.get("lockout_policy", {})
    session_policy = config.get("session_policy", {})
    ip = _get_client_ip(request)
    ua = request.headers.get("user-agent", "")

    if brute_force.is_ip_blocked(ip):
        raise HTTPException(status_code=403, detail="Access temporarily restricted")

    ok, err = verify_captcha(body.captcha_token, body.captcha_answer)
    if not ok:
        raise HTTPException(status_code=400, detail=err)

    user = db["users"].find_one({"username": body.username.strip().lower()})

    stored_hash = user["password_hash"] if user else None
    valid = verify_password_timing_safe(stored_hash, body.password)

    if not user:
        log_event(
            "login_failed",
            actor_username=body.username,
            target_type="auth",
            detail={"reason": "unknown_user"},
            ip_address=ip,
            user_agent=ua,
        )
        audit_service.log_auth(
            action="login_failure",
            client_ip=ip, user_agent=ua,
            detail={"username_attempted": body.username, "reason": "unknown_user"},
        )
        brute_force.record_ip_failure(ip)
        raise HTTPException(status_code=401, detail="Invalid username or password")

    is_locked, remaining = check_lockout(user, lockout_policy)
    if is_locked:
        log_event(
            "login_locked_out",
            actor_id=user["_id"],
            actor_username=user["username"],
            target_type="auth",
            detail={"remaining_minutes": remaining},
            ip_address=ip,
            user_agent=ua,
        )
        raise HTTPException(
            status_code=423,
            detail=f"Account locked. Try again in {remaining} minutes.",
        )

    if user.get("status") == "disabled":
        raise HTTPException(status_code=403, detail="Account is disabled")

    if not valid:
        new_attempts = user.get("failed_login_attempts", 0) + 1
        update: dict = {
            "failed_login_attempts": new_attempts,
            "last_failed_login_at": datetime.now(timezone.utc),
        }
        user["failed_login_attempts"] = new_attempts
        if should_lock(user, lockout_policy):
            lock_mins = lockout_policy.get("lockout_duration_minutes", 30)
            update["locked_until"] = datetime.now(timezone.utc) + timedelta(minutes=lock_mins)
            log_event(
                "login_locked_out",
                actor_id=user["_id"],
                actor_username=user["username"],
                target_type="auth",
                detail={"attempts": new_attempts},
                ip_address=ip,
                user_agent=ua,
            )
        else:
            log_event(
                "login_failed",
                actor_id=user["_id"],
                actor_username=user["username"],
                target_type="auth",
                detail={"attempts": new_attempts},
                ip_address=ip,
                user_agent=ua,
            )
        db["users"].update_one({"_id": user["_id"]}, {"$set": update})
        audit_service.log_auth(
            action="login_failure",
            client_ip=ip, user_agent=ua,
            detail={
                "username_attempted": user["username"],
                "user_id": str(user["_id"]),
                "attempts": new_attempts,
                "reason": "invalid_password",
            },
        )
        brute_force.record_ip_failure(ip)
        raise HTTPException(status_code=401, detail="Invalid username or password")

    if check_needs_rehash(user["password_hash"]):
        db["users"].update_one(
            {"_id": user["_id"]},
            {"$set": {"password_hash": hash_password(body.password)}},
        )

    now = datetime.now(timezone.utc)
    db["users"].update_one(
        {"_id": user["_id"]},
        {"$set": {
            "failed_login_attempts": 0,
            "locked_until": None,
            "last_login_at": now,
        }},
    )

    tokens = create_session(db, user, ip, ua, session_policy)

    log_event(
        "login_success",
        actor_id=user["_id"],
        actor_username=user["username"],
        target_type="auth",
        detail={"session_id": tokens["session_id"]},
        ip_address=ip,
        user_agent=ua,
    )

    audit_service.log_auth(
        action="login_success",
        client_ip=ip,
        user_agent=ua,
        detail={
            "user_id": str(user["_id"]),
            "username": user["username"],
            "session_id": tokens["session_id"],
        },
    )
    audit_service.create_session_record(
        session_id=tokens.get("jti", tokens["session_id"]),
        user_id=str(user["_id"]),
        username=user["username"],
        expires_at=datetime.now(timezone.utc) + timedelta(hours=24),
        client_ip=ip,
        user_agent=ua,
    )

    resp = {
        "access_token": tokens["access_token"],
        "refresh_token": tokens["refresh_token"],
        "token_type": "bearer",
        "user": _user_response(user, include_permissions=True),
    }
    if user.get("force_password_change"):
        resp["force_password_change"] = True
    return resp


# --------------------------------------------------------------------------- #
# 5. POST /auth/refresh
# --------------------------------------------------------------------------- #
@router.post("/auth/refresh")
def refresh(body: RefreshRequest, request: Request):
    db = get_platform_db()
    config = get_config(db)
    session_policy = config.get("session_policy", {})

    rt_hash = hash_token(body.refresh_token)
    session = db["sessions"].find_one({"refresh_token_hash": rt_hash})
    if not session:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    user = db["users"].find_one({"_id": session["user_id"]})
    if not user or user.get("status") == "disabled":
        raise HTTPException(status_code=401, detail="Account not found or disabled")

    result = refresh_session(db, body.refresh_token, user, session_policy)
    if result is None:
        raise HTTPException(status_code=401, detail="Session expired or revoked")

    return {
        "access_token": result["access_token"],
        "refresh_token": result["refresh_token"],
        "token_type": "bearer",
    }


# --------------------------------------------------------------------------- #
# 6. POST /auth/logout
# --------------------------------------------------------------------------- #
@router.post("/auth/logout")
def logout(body: LogoutRequest, request: Request):
    db = get_platform_db()
    ip = _get_client_ip(request)
    ua = request.headers.get("user-agent", "")

    if body.refresh_token:
        rt_hash = hash_token(body.refresh_token)
        session = db["sessions"].find_one({"refresh_token_hash": rt_hash})
        if session and not session.get("revoked"):
            revoke_session(db, str(session["_id"]))
            user = db["users"].find_one({"_id": session["user_id"]})
            log_event(
                "logout",
                actor_id=session["user_id"],
                actor_username=user["username"] if user else "",
                target_type="session",
                target_id=session["_id"],
                ip_address=ip,
                user_agent=ua,
            )

    return {"detail": "Logged out"}


# --------------------------------------------------------------------------- #
# 7. GET /auth/me
# --------------------------------------------------------------------------- #
@router.get("/auth/me")
def get_me(request: Request):
    cur = _get_current_user(request)
    if not cur:
        raise HTTPException(status_code=401, detail="Not authenticated")

    db = get_platform_db()
    user = db["users"].find_one({"_id": ObjectId(cur["id"])})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    return _user_response(user, include_permissions=True)


# --------------------------------------------------------------------------- #
# 8. PATCH /auth/me
# --------------------------------------------------------------------------- #
@router.patch("/auth/me")
def update_me(body: UpdateProfileRequest, request: Request):
    cur = _get_current_user(request)
    if not cur:
        raise HTTPException(status_code=401, detail="Not authenticated")

    db = get_platform_db()
    user_id = ObjectId(cur["id"])
    updates: dict = {"updated_at": datetime.now(timezone.utc)}

    if body.display_name is not None:
        updates["display_name"] = body.display_name.strip()
    if body.email is not None:
        existing = db["users"].find_one({"email": body.email, "_id": {"$ne": user_id}})
        if existing:
            raise HTTPException(status_code=409, detail="Email already in use")
        updates["email"] = body.email

    if len(updates) == 1:
        raise HTTPException(status_code=400, detail="No fields to update")

    db["users"].update_one({"_id": user_id}, {"$set": updates})

    ip = _get_client_ip(request)
    ua = request.headers.get("user-agent", "")
    log_event(
        "profile_updated",
        actor_id=user_id,
        actor_username=cur.get("username", ""),
        target_type="user",
        target_id=user_id,
        detail={k: v for k, v in updates.items() if k != "updated_at"},
        ip_address=ip,
        user_agent=ua,
    )

    user = db["users"].find_one({"_id": user_id})
    return _user_response(user)


# --------------------------------------------------------------------------- #
# 9. POST /auth/change-password
# --------------------------------------------------------------------------- #
@router.post("/auth/change-password")
def change_password(body: ChangePasswordRequest, request: Request):
    cur = _get_current_user(request)
    if not cur:
        raise HTTPException(status_code=401, detail="Not authenticated")

    db = get_platform_db()
    user = db["users"].find_one({"_id": ObjectId(cur["id"])})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    if not verify_password_timing_safe(user["password_hash"], body.current_password):
        raise HTTPException(status_code=401, detail="Current password is incorrect")

    config = get_config(db)
    policy = config.get("password_policy", {})
    history = user.get("password_history", [])
    violations = validate_password_policy(
        body.new_password, user["username"], policy, password_history=history,
    )
    if violations:
        raise HTTPException(status_code=422, detail="; ".join(violations))

    now = datetime.now(timezone.utc)
    max_age = policy.get("max_age_days", 90)
    new_history = [user["password_hash"]] + history[:4]

    db["users"].update_one(
        {"_id": user["_id"]},
        {"$set": {
            "password_hash": hash_password(body.new_password),
            "password_changed_at": now,
            "password_expires_at": now + timedelta(days=max_age) if max_age else None,
            "force_password_change": False,
            "password_history": new_history,
            "updated_at": now,
        }},
    )

    jti = cur.get("jti")
    revoked = revoke_all_sessions(db, user["_id"], exclude_jti=jti)

    ip = _get_client_ip(request)
    ua = request.headers.get("user-agent", "")
    log_event(
        "password_changed",
        actor_id=user["_id"],
        actor_username=user["username"],
        target_type="user",
        target_id=user["_id"],
        detail={"other_sessions_revoked": revoked},
        ip_address=ip,
        user_agent=ua,
    )

    return {"detail": "Password changed successfully"}


# --------------------------------------------------------------------------- #
# 10. POST /auth/change-password/temp
# --------------------------------------------------------------------------- #
@router.post("/auth/change-password/temp")
def change_temp_password(body: TempPasswordChangeRequest, request: Request):
    db = get_platform_db()
    user = db["users"].find_one({"username": body.username.strip().lower()})
    if not user:
        verify_password_timing_safe(None, body.temp_password)
        raise HTTPException(status_code=401, detail="Invalid credentials")

    temp_hash = user.get("temp_password_hash")
    temp_expires = user.get("temp_password_expires_at")

    if not temp_hash or not temp_expires:
        verify_password_timing_safe(None, body.temp_password)
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if temp_expires.tzinfo is None:
        temp_expires = temp_expires.replace(tzinfo=timezone.utc)
    if datetime.now(timezone.utc) > temp_expires:
        raise HTTPException(status_code=401, detail="Temporary password has expired")

    if not verify_password_timing_safe(temp_hash, body.temp_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    config = get_config(db)
    policy = config.get("password_policy", {})
    history = user.get("password_history", [])
    violations = validate_password_policy(
        body.new_password, user["username"], policy, password_history=history,
    )
    if violations:
        raise HTTPException(status_code=422, detail="; ".join(violations))

    now = datetime.now(timezone.utc)
    max_age = policy.get("max_age_days", 90)
    new_history = [user["password_hash"]] + history[:4]

    db["users"].update_one(
        {"_id": user["_id"]},
        {"$set": {
            "password_hash": hash_password(body.new_password),
            "password_changed_at": now,
            "password_expires_at": now + timedelta(days=max_age) if max_age else None,
            "force_password_change": False,
            "password_history": new_history,
            "temp_password_hash": None,
            "temp_password_expires_at": None,
            "failed_login_attempts": 0,
            "locked_until": None,
            "updated_at": now,
            "last_login_at": now,
        }},
    )

    session_policy = config.get("session_policy", {})
    ip = _get_client_ip(request)
    ua = request.headers.get("user-agent", "")

    user["_id"] = user["_id"]
    tokens = create_session(db, user, ip, ua, session_policy)

    log_event(
        "password_changed",
        actor_id=user["_id"],
        actor_username=user["username"],
        target_type="user",
        target_id=user["_id"],
        detail={"via": "temp_password"},
        ip_address=ip,
        user_agent=ua,
    )

    return {
        "access_token": tokens["access_token"],
        "refresh_token": tokens["refresh_token"],
        "token_type": "bearer",
        "user": _user_response(user),
    }


# --------------------------------------------------------------------------- #
# 11. GET /auth/sessions
# --------------------------------------------------------------------------- #
@router.get("/auth/sessions")
def get_sessions(request: Request):
    cur = _get_current_user(request)
    if not cur:
        raise HTTPException(status_code=401, detail="Not authenticated")

    db = get_platform_db()
    sessions = list_user_sessions(db, ObjectId(cur["id"]), current_jti=cur.get("jti"))
    return {"sessions": sessions}


# --------------------------------------------------------------------------- #
# 12. DELETE /auth/sessions/{session_id}
# --------------------------------------------------------------------------- #
@router.delete("/auth/sessions/{session_id}")
def delete_session(session_id: str, request: Request):
    cur = _get_current_user(request)
    if not cur:
        raise HTTPException(status_code=401, detail="Not authenticated")

    db = get_platform_db()
    user_id = ObjectId(cur["id"])

    restriction = user_id if cur.get("role") != "admin" else None
    success = revoke_session(db, session_id, user_id=restriction)
    if not success:
        raise HTTPException(status_code=404, detail="Session not found")

    ip = _get_client_ip(request)
    ua = request.headers.get("user-agent", "")
    log_event(
        "session_revoked",
        actor_id=user_id,
        actor_username=cur.get("username", ""),
        target_type="session",
        target_id=session_id,
        ip_address=ip,
        user_agent=ua,
    )

    return {"detail": "Session revoked"}


# --------------------------------------------------------------------------- #
# 13. DELETE /auth/sessions
# --------------------------------------------------------------------------- #
@router.delete("/auth/sessions")
def delete_all_sessions(request: Request, body: RevokeAllSessionsRequest | None = None):
    cur = _get_current_user(request)
    if not cur:
        raise HTTPException(status_code=401, detail="Not authenticated")

    db = get_platform_db()
    user_id = ObjectId(cur["id"])
    include_current = body.include_current if body else False
    exclude_jti = cur.get("jti") if not include_current else None

    count = revoke_all_sessions(db, user_id, exclude_jti=exclude_jti)

    ip = _get_client_ip(request)
    ua = request.headers.get("user-agent", "")
    log_event(
        "all_sessions_revoked",
        actor_id=user_id,
        actor_username=cur.get("username", ""),
        target_type="user",
        target_id=user_id,
        detail={"revoked_count": count, "include_current": include_current},
        ip_address=ip,
        user_agent=ua,
    )

    return {"detail": f"Revoked {count} sessions"}


# --------------------------------------------------------------------------- #
# 14. GET /auth/api-keys
# --------------------------------------------------------------------------- #
@router.get("/auth/api-keys")
def list_api_keys(request: Request):
    cur = _get_current_user(request)
    if not cur:
        raise HTTPException(status_code=401, detail="Not authenticated")

    db = get_platform_db()
    user_id = ObjectId(cur["id"])
    keys = list(
        db["api_keys"]
        .find({"user_id": user_id, "status": "active"})
        .sort("created_at", -1)
    )

    return {
        "api_keys": [
            {
                "id": str(k["_id"]),
                "name": k["name"],
                "key_prefix": k["key_prefix"],
                "status": k["status"],
                "created_at": k["created_at"],
                "last_used_at": k.get("last_used_at"),
                "expires_at": k.get("expires_at"),
            }
            for k in keys
        ]
    }


# --------------------------------------------------------------------------- #
# 15. POST /auth/api-keys
# --------------------------------------------------------------------------- #
@router.post("/auth/api-keys")
def create_api_key_endpoint(body: CreateApiKeyRequest, request: Request):
    cur = _get_current_user(request)
    if not cur:
        raise HTTPException(status_code=401, detail="Not authenticated")

    db = get_platform_db()
    user_id = ObjectId(cur["id"])

    active_count = db["api_keys"].count_documents({"user_id": user_id, "status": "active"})
    if active_count >= 10:
        raise HTTPException(status_code=400, detail="Maximum of 10 API keys allowed")

    raw_key = generate_api_key()
    now = datetime.now(timezone.utc)
    expires_at = None
    if body.expires_in_days:
        expires_at = now + timedelta(days=body.expires_in_days)

    key_doc = {
        "user_id": user_id,
        "name": body.name.strip(),
        "key_prefix": raw_key[:12],
        "key_hash": hash_token(raw_key),
        "permissions": [],
        "status": "active",
        "created_at": now,
        "last_used_at": None,
        "expires_at": expires_at,
        "revoked_at": None,
    }
    result = db["api_keys"].insert_one(key_doc)

    ip = _get_client_ip(request)
    ua = request.headers.get("user-agent", "")
    log_event(
        "api_key_created",
        actor_id=user_id,
        actor_username=cur.get("username", ""),
        target_type="api_key",
        target_id=result.inserted_id,
        detail={"name": body.name, "prefix": raw_key[:12]},
        ip_address=ip,
        user_agent=ua,
    )

    return {
        "api_key": raw_key,
        "id": str(result.inserted_id),
        "name": body.name,
        "key_prefix": raw_key[:12],
        "expires_at": expires_at,
    }


# --------------------------------------------------------------------------- #
# 16. DELETE /auth/api-keys/{key_id}
# --------------------------------------------------------------------------- #
@router.delete("/auth/api-keys/{key_id}")
def revoke_api_key(key_id: str, request: Request):
    cur = _get_current_user(request)
    if not cur:
        raise HTTPException(status_code=401, detail="Not authenticated")

    db = get_platform_db()
    user_id = ObjectId(cur["id"])
    now = datetime.now(timezone.utc)

    result = db["api_keys"].update_one(
        {"_id": ObjectId(key_id), "user_id": user_id, "status": "active"},
        {"$set": {"status": "revoked", "revoked_at": now}},
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="API key not found")

    ip = _get_client_ip(request)
    ua = request.headers.get("user-agent", "")
    log_event(
        "api_key_revoked",
        actor_id=user_id,
        actor_username=cur.get("username", ""),
        target_type="api_key",
        target_id=key_id,
        ip_address=ip,
        user_agent=ua,
    )

    return {"detail": "API key revoked"}
