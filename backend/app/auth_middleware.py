from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from app.config import settings
from app.routes.auth import _auth_enabled, verify_token


class SaptangAuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.method == "OPTIONS":
            return await call_next(request)
        if not _auth_enabled():
            return await call_next(request)
        path = request.url.path
        if not path.startswith("/api/"):
            return await call_next(request)
        if path == "/api/health" or path.startswith("/api/auth/"):
            return await call_next(request)
        if verify_token(request.headers.get("authorization")):
            return await call_next(request)
        return JSONResponse({"detail": "Not authenticated"}, status_code=401)
