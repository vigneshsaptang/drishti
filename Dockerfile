# ═══════════════════════════════════════════
# Saptang Intelligence — production Dockerfile
# Build from project root: docker compose up --build
# ═══════════════════════════════════════════

# ── Stage 1: Build React Frontend ──
FROM node:22-alpine AS frontend
WORKDIR /build
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build

# ── Stage 2: Python Backend + Built Frontend ──
FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends gcc curl \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

RUN useradd -m -u 1000 appuser

COPY --chown=appuser:appuser backend/app/ ./app/
COPY --from=frontend --chown=appuser:appuser /build/dist ./frontend/dist

USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=15s \
    CMD curl -f http://localhost:${BACKEND_PORT:-8000}/api/health || exit 1

# Use shell form so $BACKEND_PORT expands from env
CMD uvicorn app.main:app \
    --host 0.0.0.0 \
    --port ${BACKEND_PORT:-8000} \
    --workers ${WORKERS:-2} \
    --log-level ${LOG_LEVEL:-info} \
    --timeout-keep-alive 120
