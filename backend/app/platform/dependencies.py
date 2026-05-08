"""
FastAPI dependencies for permission checks and rate limiting.
"""
from fastapi import Depends, HTTPException, Request

from app.db import get_platform_db
from app.platform.rbac import resolve_effective_permissions, resolve_effective_limits
from app.platform.rate_limiter import check_rate_limit


def require_permission(*permissions: str):
    async def _check(request: Request):
        user = getattr(request.state, "user", None)
        if not user:
            raise HTTPException(401, "Not authenticated")
        effective = resolve_effective_permissions(user["id"])
        missing = [p for p in permissions if p not in effective]
        if missing:
            raise HTTPException(403, "Insufficient permissions")
        return user
    return Depends(_check)


def require_any_permission(*permissions: str):
    async def _check(request: Request):
        user = getattr(request.state, "user", None)
        if not user:
            raise HTTPException(401, "Not authenticated")
        effective = resolve_effective_permissions(user["id"])
        if not any(p in effective for p in permissions):
            raise HTTPException(403, "Insufficient permissions")
        return user
    return Depends(_check)


def require_rate_limit(counter_type: str):
    async def _check(request: Request):
        user = getattr(request.state, "user", None)
        if not user:
            raise HTTPException(401, "Not authenticated")
        limits = resolve_effective_limits(user["id"])
        rate_limits = limits.get("rate", {})
        max_count = rate_limits.get(counter_type, -1)
        if max_count == -1:
            return user
        if max_count == 0:
            raise HTTPException(403, f"Rate limit: {counter_type} is disabled for your role")
        db = get_platform_db()
        allowed = check_rate_limit(db, user["id"], counter_type, max_count)
        if not allowed:
            raise HTTPException(
                429,
                f"Rate limit exceeded: {counter_type} (max {max_count})",
                headers={"Retry-After": "3600"},
            )
        return user
    return Depends(_check)


def get_search_depth_limit():
    async def _check(request: Request):
        user = getattr(request.state, "user", None)
        if not user:
            return None
        limits = resolve_effective_limits(user["id"])
        return limits.get("max_search_depth", 3)
    return Depends(_check)
