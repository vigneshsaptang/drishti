"""
Sliding-window counter rate limiter — in-memory, per-worker.
"""
import re
import time
import threading
from collections import defaultdict
from dataclasses import dataclass, field

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse


@dataclass
class WindowCounter:
    prev_count: int = 0
    curr_count: int = 0
    window_start: float = 0.0


class RateLimiter:
    def __init__(self, window_seconds: int = 60):
        self.window = window_seconds
        self._counters: dict[str, WindowCounter] = defaultdict(WindowCounter)
        self._lock = threading.Lock()

    def is_allowed(self, key: str, limit: int) -> tuple[bool, dict]:
        if limit <= 0:
            return True, {}

        now = time.time()
        with self._lock:
            c = self._counters[key]

            if now - c.window_start >= self.window:
                if now - c.window_start >= 2 * self.window:
                    c.prev_count = 0
                else:
                    c.prev_count = c.curr_count
                c.curr_count = 0
                c.window_start = now - (now % self.window)

            elapsed = now - c.window_start
            weight = (self.window - elapsed) / self.window
            estimated = c.prev_count * weight + c.curr_count

            if estimated >= limit:
                retry_after = int(self.window - elapsed) + 1
                return False, {
                    "X-RateLimit-Limit": str(limit),
                    "X-RateLimit-Remaining": "0",
                    "X-RateLimit-Reset": str(int(c.window_start + self.window)),
                    "Retry-After": str(retry_after),
                }

            c.curr_count += 1
            remaining = max(0, int(limit - estimated - 1))
            return True, {
                "X-RateLimit-Limit": str(limit),
                "X-RateLimit-Remaining": str(remaining),
                "X-RateLimit-Reset": str(int(c.window_start + self.window)),
            }

    def cleanup(self, max_age: float = 300):
        cutoff = time.time() - max_age
        with self._lock:
            stale = [k for k, v in self._counters.items() if v.window_start < cutoff]
            for k in stale:
                del self._counters[k]


_limiter = RateLimiter(window_seconds=60)

_ROUTE_LIMITS: list[tuple[re.Pattern, int, int]] = [
    # (path_pattern, per_ip_limit, per_user_limit)
    (re.compile(r"^/api/auth/(login|captcha)$"), 20, 0),
    (re.compile(r"^/api/(search|stream/search|v2/search)$"), 30, 30),
    (re.compile(r"^/api/darkweb/dread$"), 10, 10),
    (re.compile(r"^/api/telegram/search$"), 10, 10),
    (re.compile(r"^/api/dashboard/"), 60, 60),
    (re.compile(r"^/api/ecourts/(search|case/)"), 20, 20),
    (re.compile(r"^/api/financial/"), 30, 30),
    (re.compile(r"^/api/health$"), 120, 0),
]

_GLOBAL_IP_LIMIT = 300
_GLOBAL_USER_LIMIT = 200

_CLEANUP_INTERVAL = 60
_last_cleanup = time.time()


def _get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[-1].strip()
    return request.client.host if request.client else "unknown"


def _get_limits(path: str) -> tuple[int, int]:
    for pattern, ip_limit, user_limit in _ROUTE_LIMITS:
        if pattern.search(path):
            return ip_limit, user_limit
    return 0, 0


class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        if not path.startswith("/api/") or request.method == "OPTIONS":
            return await call_next(request)

        global _last_cleanup
        now = time.time()
        if now - _last_cleanup > _CLEANUP_INTERVAL:
            _last_cleanup = now
            _limiter.cleanup()

        client_ip = _get_client_ip(request)
        user = getattr(request.state, "user", None)
        user_id = user.get("id") if user and isinstance(user, dict) else None

        ip_limit, user_limit = _get_limits(path)

        if ip_limit > 0:
            allowed, headers = _limiter.is_allowed(f"ip:{client_ip}:{path}", ip_limit)
            if not allowed:
                retry = headers.get("Retry-After", "60")
                resp = JSONResponse(
                    {"detail": f"Rate limit exceeded. Try again in {retry} seconds."},
                    status_code=429,
                )
                for k, v in headers.items():
                    resp.headers[k] = v
                return resp

        if user_id and user_limit > 0:
            allowed, headers = _limiter.is_allowed(f"user:{user_id}:{path}", user_limit)
            if not allowed:
                retry = headers.get("Retry-After", "60")
                resp = JSONResponse(
                    {"detail": f"Rate limit exceeded. Try again in {retry} seconds."},
                    status_code=429,
                )
                for k, v in headers.items():
                    resp.headers[k] = v
                return resp

        global_allowed, global_headers = _limiter.is_allowed(f"global:ip:{client_ip}", _GLOBAL_IP_LIMIT)
        if not global_allowed:
            retry = global_headers.get("Retry-After", "60")
            resp = JSONResponse(
                {"detail": f"Rate limit exceeded. Try again in {retry} seconds."},
                status_code=429,
            )
            for k, v in global_headers.items():
                resp.headers[k] = v
            return resp

        response = await call_next(request)

        if global_headers:
            for k, v in global_headers.items():
                response.headers[k] = v

        return response
