# ═══════════════════════════════════════════
# Saptang Intelligence — production Dockerfile
# Build from project root: docker compose up --build
# ═══════════════════════════════════════════

# ── Stage 1: Build React Frontend ──
FROM node:22-alpine AS frontend
WORKDIR /build
COPY frontend/package*.json ./
RUN npm ci --production=false
COPY frontend/ .
RUN npm run build

# ── Stage 2: Python Backend + Built Frontend ──
FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends gcc \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/app/ ./app/
COPY --from=frontend /build/dist ./frontend/dist

EXPOSE 8000

# Use shell form so $BACKEND_PORT expands from env
CMD uvicorn app.main:app \
    --host 0.0.0.0 \
    --port ${BACKEND_PORT:-8000} \
    --workers ${WORKERS:-2} \
    --log-level ${LOG_LEVEL:-info} \
    --timeout-keep-alive 120
