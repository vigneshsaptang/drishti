"""
Authentication middleware — supports JWT (with JTI validation), API keys, and setup-mode gating.
"""
import time
import threading
import logging

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from app.db import get_platform_db
from app.platform.auth import decode_access_token, hash_token
from app.platform.config_store import is_setup_complete
from app.platform.registry import ROUTE_PERMISSION_MAP
from app.platform.rbac import resolve_effective_permissions

log = logging.getLogger("auth_middleware")

_PUBLIC_PREFIXES = ("/api/health", "/api/auth/status", "/api/auth/setup", "/api/auth/login",
                    "/api/auth/refresh", "/api/auth/change-password/temp", "/api/auth/captcha",
                    "/api/errors")

_jti_cache: dict[str, tuple[dict, float]] = {}
_JTI_CACHE_TTL = 60
_JTI_CACHE_MAX = 1000
_cache_lock = threading.Lock()


def _cache_get(jti: str) -> dict | None:
    entry = _jti_cache.get(jti)
    if entry and (time.time() - entry[1]) < _JTI_CACHE_TTL:
        return entry[0]
    return None


def _cache_set(jti: str, data: dict):
    with _cache_lock:
        if len(_jti_cache) >= _JTI_CACHE_MAX:
            cutoff = time.time() - _JTI_CACHE_TTL
            stale = [k for k, (_, ts) in _jti_cache.items() if ts < cutoff]
            for k in stale:
                del _jti_cache[k]
        _jti_cache[jti] = (data, time.time())


class SaptangAuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.method == "OPTIONS":
            return await call_next(request)

        path = request.url.path

        if not path.startswith("/api/"):
            return await call_next(request)

        for prefix in _PUBLIC_PREFIXES:
            if path == prefix or path.startswith(prefix + "/"):
                return await call_next(request)

        db = get_platform_db()

        if not is_setup_complete(db):
            return JSONResponse({"detail": "Platform setup required"}, status_code=503)

        user_info = _try_api_key(request, db)
        if user_info is None:
            user_info = _try_jwt(request, db)

        if user_info is None:
            return JSONResponse({"detail": "Not authenticated"}, status_code=401)

        request.state.user = user_info

        required_permission = ROUTE_PERMISSION_MAP.match(path, request.method)
        if required_permission is not None:
            user_perms = resolve_effective_permissions(user_info["id"])
            if required_permission not in user_perms:
                return JSONResponse(
                    {"detail": "Insufficient permissions"},
                    status_code=403,
                )

        return await call_next(request)


def _try_api_key(request: Request, db) -> dict | None:
    api_key = request.headers.get("x-api-key")
    if not api_key:
        return None

    key_hash = hash_token(api_key)
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)

    key_doc = db["api_keys"].find_one({
        "key_hash": key_hash,
        "status": "active",
    })
    if key_doc is None:
        return None

    expires = key_doc.get("expires_at")
    if expires and expires < now:
        return None

    user = db["users"].find_one({"_id": key_doc["user_id"]})
    if user is None or user.get("status") != "active":
        return None

    last_used = key_doc.get("last_used_at")
    if last_used is None or (now - last_used).total_seconds() > 300:
        db["api_keys"].update_one({"_id": key_doc["_id"]}, {"$set": {"last_used_at": now}})

    return {
        "id": str(user["_id"]),
        "username": user["username"],
        "role": user["role"],
        "auth_method": "api_key",
    }


def _try_jwt(request: Request, db) -> dict | None:
    auth_header = request.headers.get("authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        return None

    token = auth_header[7:].strip()
    if not token:
        return None

    claims = decode_access_token(token)
    if claims is None:
        return None

    jti = claims.get("jti")
    if not jti:
        return None

    cached = _cache_get(jti)
    if cached:
        return cached

    from app.platform.sessions import validate_jti
    session = validate_jti(db, jti)
    if session is None:
        return None

    user_info = {
        "id": claims["sub"],
        "username": claims.get("username", ""),
        "role": claims.get("role", "analyst"),
        "jti": jti,
        "session_id": str(session["_id"]),
        "auth_method": "jwt",
    }
    _cache_set(jti, user_info)
    return user_info
