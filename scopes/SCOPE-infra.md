# Scope: wt-infra (Orchestrator)

You are working in the **wt-infra** worktree. You own infrastructure, configuration, the composition root, and you are the **merge orchestrator** — responsible for integrating all 6 worktree branches into `develop`.

## Your dual role

1. **Feature work**: Docker, Caddy, config, middleware, main.py, shared frontend infra
2. **Orchestration**: merge branches, resolve conflicts, apply HANDOFF.md changes, run integration tests

## Your files (you may edit these freely)

### Infrastructure
```
docker-compose.yml                       # production stack (backend + caddy)
docker-compose.dev.yml                   # dev stack (backend only, host-exposed)
docker-compose.vps.yml                   # VPS layout (external caddy)
Dockerfile                               # production multi-stage (node build + python runtime)
Dockerfile.dev                           # dev backend image (volume-mounted, hot reload)
Caddyfile                                # reverse proxy, TLS, security headers
.dockerignore
.env.example                             # template for all config vars
DEPLOY.md                                # production deployment guide
WORKTREE_PLAN.md                         # this plan — you own it
```

### Backend — composition root
```
backend/app/main.py                      # FastAPI app creation, route registration, middleware stack, lifecycle
backend/app/config.py                    # pydantic-settings: all env vars → Settings fields
backend/app/db.py                        # MongoDB client singletons (credmon, darkmon, fti, platform, audit)
backend/app/serializer.py                # MongoJSONResponse: ObjectId, datetime, bytes serialization
backend/app/models/__init__.py           # shared Pydantic models (if any)
backend/requirements.txt                 # Python dependencies
backend/app/scripts/mca_indexes.py       # DB index maintenance script
```

### Backend — middleware (non-auth, non-billing)
```
backend/app/security_headers.py          # SecurityHeadersMiddleware
backend/app/rate_limiter.py              # RateLimitMiddleware
backend/app/error_handler.py             # global exception handlers
backend/app/ip_control.py               # IP allowlist/blocklist
```

### Frontend — build and shared infra
```
frontend/package.json
frontend/vite.config.js
frontend/eslint.config.js
frontend/index.html
frontend/src/main.jsx                    # React entry point
frontend/src/index.css                   # Tailwind v4 config, custom tokens
frontend/src/assets/*                    # static images
frontend/src/components/ClassificationBanner.jsx
frontend/src/components/NotificationBell.jsx
frontend/src/components/NotificationDropdown.jsx
frontend/src/components/SidebarNav.jsx
frontend/src/components/AdminNav.jsx
frontend/src/components/ModuleWaitPlaceholder.jsx
frontend/src/hooks/useNotifications.js
```

### Merge targets (you own these, other worktrees request changes via HANDOFF.md)
```
frontend/src/App.jsx                     # god component — all tabs, overlays, search lifecycle
frontend/src/lib/api.js                  # central HTTP client — all API functions
```

## Files you must NOT edit (owned by other worktrees)

```
backend/app/engines/*                    → wt-search
backend/app/routes/search*.py            → wt-search
backend/app/routes/stream.py             → wt-search
backend/app/routes/auth.py               → wt-platform
backend/app/routes/admin.py              → wt-platform
backend/app/routes/support.py            → wt-platform
backend/app/routes/ecourts*.py           → wt-ecourts
backend/app/routes/darkweb.py            → wt-intel
backend/app/routes/drugs.py              → wt-intel
backend/app/routes/telegram.py           → wt-intel
backend/app/routes/financial.py          → wt-intel
backend/app/routes/mca.py               → wt-intel
backend/app/routes/graph.py              → wt-intel
backend/app/routes/dashboard.py          → wt-intel
backend/app/routes/stats.py              → wt-intel
backend/app/routes/report.py             → wt-intel
backend/app/routes/audit_admin.py        → wt-billing
backend/app/routes/credits.py            → wt-billing
backend/app/audit.py                     → wt-billing
backend/app/credits.py                   → wt-billing
backend/app/auth_middleware.py           → wt-platform
backend/app/platform/*                   → wt-platform
frontend/src/tabs/*                      → wt-search / wt-intel / wt-ecourts
frontend/src/AuthGate.jsx                → wt-platform
```

---

## Orchestration playbook

### Step 1: Create worktrees

```bash
cd /Users/vigneshe/Developer/Pinaca/claude-research/sigint

git worktree add ../sigint-ecourts   -b wt-ecourts   develop
git worktree add ../sigint-platform  -b wt-platform  develop
git worktree add ../sigint-search    -b wt-search    develop
git worktree add ../sigint-intel     -b wt-intel     develop
git worktree add ../sigint-billing   -b wt-billing   develop
git worktree add ../sigint-infra     -b wt-infra     develop
```

### Step 2: Work in parallel

Each worktree has a `SCOPE-<name>.md` in `sigint/scopes/`. Paste the relevant scope into each Claude Code session as the first message.

### Step 3: Merge (when feature worktrees are done)

Execute from the **main sigint directory** (not a worktree), on the `develop` branch.

#### Phase 1 — Independent features (no hot-file conflicts)

```bash
git checkout develop

# 1. eCourts — zero overlap
git merge --no-ff wt-ecourts -m "merge: wt-ecourts — eCourts feature work"
cat ../sigint-ecourts/HANDOFF.md 2>/dev/null   # check for deferred changes
# Apply any HANDOFF.md entries to main.py, config.py, lib/api.js
cd frontend && npm run build && cd ..
python -c "from app.main import app"

# 2. Billing — stable interfaces
git merge --no-ff wt-billing -m "merge: wt-billing — audit and credit system"
cat ../sigint-billing/HANDOFF.md 2>/dev/null
cd frontend && npm run build && cd ..
python -c "from app.main import app"
```

#### Phase 2 — Subsystems

```bash
# 3. Platform — auth, RBAC, admin
git merge --no-ff wt-platform -m "merge: wt-platform — auth and admin subsystem"
cat ../sigint-platform/HANDOFF.md 2>/dev/null
# Likely has lib/api.js additions — merge conflicts are append-only, trivial
cd frontend && npm run build && cd ..
python -c "from app.main import app"

# 4. Intel — specialty routes
git merge --no-ff wt-intel -m "merge: wt-intel — specialty intelligence tabs"
cat ../sigint-intel/HANDOFF.md 2>/dev/null
cd frontend && npm run build && cd ..
python -c "from app.main import app"
```

#### Phase 3 — Core

```bash
# 5. Search — core pipeline
git merge --no-ff wt-search -m "merge: wt-search — core search pipeline"
cat ../sigint-search/HANDOFF.md 2>/dev/null
# May conflict on App.jsx if wt-intel also had App.jsx HANDOFF items
cd frontend && npm run build && cd ..
python -c "from app.main import app"
```

#### Phase 4 — Orchestrator integration

```bash
# 6. Merge your own wt-infra work
git merge --no-ff wt-infra -m "merge: wt-infra — infrastructure and config"

# 7. Apply ALL remaining HANDOFF.md changes
# Read each HANDOFF.md, apply changes to:
#   - backend/app/main.py (new route registrations)
#   - backend/app/config.py (new Settings fields)
#   - frontend/src/App.jsx (new tab imports, provider wiring)
#   - frontend/src/lib/api.js (new API functions)
#   - backend/requirements.txt (new dependencies)

# 8. Full integration test
docker compose -f docker-compose.dev.yml up --build -d
cd frontend && npm install && npm run dev
```

#### Phase 5 — Integration verification

```bash
# Backend health
curl http://localhost:8888/api/health

# Import check
cd backend && python -c "from app.main import app; print('OK')"

# Frontend build
cd frontend && npm run lint && npm run build
```

Then open `http://localhost:4444` and verify:
- [ ] Login works (wt-platform)
- [ ] Search returns results from all 3 engines (wt-search)
- [ ] Each intelligence tab renders (wt-intel)
- [ ] eCourts tab loads court directory (wt-ecourts)
- [ ] Credit balance updates after search (wt-billing)
- [ ] Audit log shows search events (wt-billing)
- [ ] Admin pages accessible (wt-platform)

#### Phase 6 — Cleanup

```bash
# Remove worktrees
git worktree remove ../sigint-ecourts
git worktree remove ../sigint-platform
git worktree remove ../sigint-search
git worktree remove ../sigint-intel
git worktree remove ../sigint-billing
git worktree remove ../sigint-infra

# Delete branches
git branch -d wt-ecourts wt-platform wt-search wt-intel wt-billing wt-infra
```

---

## Hot file conflict resolution guide

### main.py conflicts
Usually route registration order. Resolution: keep all route registrations, sort by prefix alphabetically.

### config.py conflicts
Multiple worktrees adding Settings fields. Resolution: keep all fields, group by subsystem with a comment line.

### App.jsx conflicts
Multiple worktrees adding tab imports or wiring. Resolution:
- Imports: alphabetical by module path
- Tab array: match the TabStrip order
- Provider nesting: CreditProvider wraps everything (already in AuthGate)

### lib/api.js conflicts
Multiple worktrees appending new functions. This file is append-only — conflicts are always trivial. Resolution: keep all functions, group by feature area.

### requirements.txt conflicts
Resolution: keep all, run `pip install -r requirements.txt` to verify compatibility.

---

## Config reference — all Settings fields by owner

```python
# wt-infra owns:
domain, backend_port, backend_workers, log_level

# wt-platform consumes:
saptang_admin_password, saptang_jwt_secret, access_token_expire_minutes, refresh_token_expire_days

# wt-search consumes:
default_search_depth, credmon_socket_timeout_ms, darkmon_query_timeout_ms

# wt-billing consumes:
mongo_uri_audit, audit_db_name, audit_buffer_size, audit_flush_interval_s,
audit_retention_days, audit_search_history_days, audit_analytics_retention_days,
audit_store_plaintext, audit_hmac_key, credits_enabled

# wt-ecourts consumes:
ecourts_api_token (if exists)

# All consume:
mongo_uri_credmon, mongo_uri_darkmon, mongo_uri_fti (via db.py)
```
