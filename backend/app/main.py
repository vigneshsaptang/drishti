"""
Saptang Intelligence — FastAPI Application Entry Point
"""
from pathlib import Path
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from app.auth_middleware import SaptangAuthMiddleware
from app.db import get_credmon, get_darkmon, get_fti, close_all
from app.routes import search, stream, darkweb, drugs, telegram, financial, graph, report, tor, auth, dashboard

# In dev: sigint/frontend/dist (built by Vite)
# In Docker: /app/frontend/dist (copied by Dockerfile)
_candidates = [
    Path(__file__).resolve().parents[2] / "frontend",   # dev: sigint/backend/app -> sigint/frontend
    Path("/app/frontend"),                               # docker
]
FRONTEND_DIR = next((p for p in _candidates if (p / "dist").exists()), _candidates[0])


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup — warm up DB connections
    get_credmon()
    get_darkmon()
    get_fti()
    yield
    # Shutdown
    close_all()


from app.serializer import MongoJSONResponse

app = FastAPI(
    title="Auracle",
    description="Auracle Intelligence Platform by Saptang Labs",
    version="1.0.0",
    lifespan=lifespan,
    default_response_class=MongoJSONResponse,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(SaptangAuthMiddleware)

# Mount route modules
app.include_router(auth.router, prefix="/api")
app.include_router(search.router, prefix="/api")
app.include_router(stream.router, prefix="/api")
app.include_router(darkweb.router, prefix="/api")
app.include_router(drugs.router, prefix="/api")
app.include_router(telegram.router, prefix="/api")
app.include_router(financial.router, prefix="/api")
app.include_router(graph.router, prefix="/api")
app.include_router(report.router, prefix="/api")
app.include_router(tor.router, prefix="/api")
app.include_router(dashboard.router, prefix="/api")


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
        file = DIST_DIR / filename
        if file.exists() and file.is_file():
            return FileResponse(str(file))
        return FileResponse(str(DIST_DIR / "index.html"))
