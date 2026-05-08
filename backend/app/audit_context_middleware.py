"""
Audit context middleware — populates request.state with audit fields.

Runs on every /api/* request. Does NOT write audit events itself (routes do that).
"""
import os
import time

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request


def _extract_client_ip(request: Request) -> str:
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip()
    xri = request.headers.get("x-real-ip")
    if xri:
        return xri.strip()
    if request.client:
        return request.client.host
    return "unknown"


class AuditContextMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if not request.url.path.startswith("/api/"):
            return await call_next(request)

        request.state.request_id = f"req_{os.urandom(8).hex()}"
        request.state.client_ip = _extract_client_ip(request)
        request.state.user_agent = request.headers.get("user-agent", "")
        request.state.request_start = time.time()

        response = await call_next(request)

        user = getattr(request.state, "user", None)
        if user and user.get("jti"):
            from app.audit import audit
            audit.touch_session(
                session_id=user["jti"],
                user_id=user["id"],
                username=user.get("username", ""),
                client_ip=request.state.client_ip,
                user_agent=request.state.user_agent,
            )

        return response
