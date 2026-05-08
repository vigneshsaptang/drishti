"""
Saptang Intelligence — FastAPI Application Entry Point
"""
import logging
from pathlib import Path
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.auth_middleware import SaptangAuthMiddleware
from app.audit_context_middleware import AuditContextMiddleware
from app.security_headers import SecurityHeadersMiddleware
from app.rate_limiter import RateLimitMiddleware
from app.credit_headers_middleware import CreditHeadersMiddleware
from app.audit import audit
from app.config import settings
from app.db import get_credmon, get_darkmon, get_fti, close_all
from app.platform.init_db import init_platform
from app.error_handler import (
    validation_error_handler,
    http_exception_handler,
    unhandled_exception_handler,
)
from app.routes import search, stream, search_v2, darkweb, drugs, telegram, financial, graph, report, auth, admin, dashboard, stats, ecourts, ecourts_search, mca, audit_admin, credits, support

logger = logging.getLogger("auracle")

# In dev: sigint/frontend/dist (built by Vite)
# In Docker: /app/frontend/dist (copied by Dockerfile)
_candidates = [
    Path(__file__).resolve().parents[2] / "frontend",   # dev: sigint/backend/app -> sigint/frontend
    Path("/app/frontend"),                               # docker
]
FRONTEND_DIR = next((p for p in _candidates if (p / "dist").exists()), _candidates[0])


@asynccontextmanager
async def lifespan(app: FastAPI):
    _validate_jwt_secret()
    get_credmon()
    get_darkmon()
    get_fti()
    try:
        init_platform()
    except Exception as e:
        logger.warning("Platform init failed (DB auth?): %s — platform features may be unavailable", e)
    audit.start()
    yield
    audit.stop()
    close_all()


def _validate_jwt_secret():
    insecure = ("saptang-dev-change-me", "change-me-to-a-long-random-string", "")
    if settings.saptang_jwt_secret in insecure:
        domain = settings.domain.strip()
        if domain not in ("localhost", "127.0.0.1"):
            raise RuntimeError(
                "SAPTANG_JWT_SECRET is set to a default value. This is not allowed in production. "
                "Generate a secure secret with: python -c \"import secrets; print(secrets.token_urlsafe(64))\""
            )
        logger.warning(
            "SAPTANG_JWT_SECRET is set to a default/empty value. "
            "Generate a secure secret with: python -c \"import secrets; print(secrets.token_urlsafe(64))\""
        )


def _get_cors_origins() -> list[str]:
    domain = settings.domain.strip()
    if domain in ("localhost", "127.0.0.1"):
        return [
            "http://localhost:4444",
            "http://localhost:3000",
            "http://127.0.0.1:4444",
            "http://127.0.0.1:3000",
        ]
    else:
        return [f"https://{domain}"]


from app.serializer import MongoJSONResponse

_is_dev = settings.domain.strip() in ("localhost", "127.0.0.1")

app = FastAPI(
    title="Auracle",
    description="Auracle Intelligence Platform by Saptang Labs",
    version="1.0.0",
    lifespan=lifespan,
    default_response_class=MongoJSONResponse,
    docs_url="/api/docs" if _is_dev else None,
    redoc_url="/api/redoc" if _is_dev else None,
    openapi_url="/api/openapi.json" if _is_dev else None,
)

# Middleware ordering: last registered = first to execute on request.
# Order of execution: SecurityHeaders → CORS → AuditContext → RateLimit → Auth → CreditHeaders
app.add_middleware(CreditHeadersMiddleware)
app.add_middleware(SaptangAuthMiddleware)
if settings.rate_limit_enabled:
    app.add_middleware(RateLimitMiddleware)
app.add_middleware(AuditContextMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=_get_cors_origins(),
    allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-API-Key"],
    expose_headers=["X-Credits-Remaining", "X-Credits-Deducted", "X-Credits-Warning"],
    allow_credentials=True,
    max_age=3600,
)
app.add_middleware(SecurityHeadersMiddleware)

# Exception handlers
app.add_exception_handler(RequestValidationError, validation_error_handler)
app.add_exception_handler(StarletteHTTPException, http_exception_handler)
app.add_exception_handler(Exception, unhandled_exception_handler)

# Mount route modules
app.include_router(auth.router, prefix="/api")
app.include_router(admin.router, prefix="/api")
app.include_router(search.router, prefix="/api")
app.include_router(stream.router, prefix="/api")
app.include_router(search_v2.router, prefix="/api/v2")
app.include_router(darkweb.router, prefix="/api")
app.include_router(drugs.router, prefix="/api")
app.include_router(telegram.router, prefix="/api")
app.include_router(financial.router, prefix="/api")
app.include_router(graph.router, prefix="/api")
app.include_router(report.router, prefix="/api")
app.include_router(dashboard.router, prefix="/api")
app.include_router(stats.router, prefix="/api")
app.include_router(ecourts.router, prefix="/api/ecourts")
app.include_router(ecourts_search.router, prefix="/api/ecourts")
app.include_router(mca.router, prefix="/api/mca")
app.include_router(audit_admin.router, prefix="/api")
app.include_router(credits.router, prefix="/api")
app.include_router(support.router, prefix="/api")


@app.get("/api/health")
def health():
    return {"status": "operational", "platform": "Auracle by Saptang Labs"}


# Serve frontend build output (prod mode — Caddy also handles this in prod)
# In dev mode, Vite dev server proxies /api to this backend
DIST_DIR = FRONTEND_DIR / "dist"
if DIST_DIR.exists():
    @app.get("/", include_in_schema=False)
    def serve_index():
        return FileResponse(str(DIST_DIR / "index.html"))

    if (DIST_DIR / "assets").exists():
        app.mount("/assets", StaticFiles(directory=str(DIST_DIR / "assets")), name="assets")

    # Serve root-level static files (logo, favicon, etc.)
    @app.get("/{filename:path}", include_in_schema=False)
    def serve_static_or_spa(filename: str):
        file = (DIST_DIR / filename).resolve()
        if not str(file).startswith(str(DIST_DIR.resolve())):
            return FileResponse(str(DIST_DIR / "index.html"))
        if file.exists() and file.is_file():
            return FileResponse(str(file))
        return FileResponse(str(DIST_DIR / "index.html"))
