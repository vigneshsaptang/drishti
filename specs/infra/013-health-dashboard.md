# Spec 013 — Health Dashboard (backend + frontend)

## Worktree: wt-infra (backend portion) + wt-platform (frontend portion)
## Priority: P2
## Depends on: spec 008 (engine error logging), spec 009 (error audit endpoint)

## Goal

Build a real health dashboard that shows infrastructure status at a glance: are all three Mongo engines reachable? What's the latency to each? Are critical collections populated? Is the audit chain intact? How many client errors have been reported in the last hour?

The current `/api/health` returns a static `{"status": "operational"}` regardless of actual engine health. The existing `StatusPage` component (`frontend/src/components/StatusPage.jsx`) shows manually-posted status messages — it does not probe infrastructure. This spec adds live infrastructure health.

## Context

- Three independent Mongo deployments: CREDMON, DARKMON, FTI (each may go down independently)
- Platform DB lives on FTI instance (`auracle_platform`)
- Optional audit DB (separate URI)
- `dashboard.py` already has a `_SectionCache` pattern we can reuse
- `stats.py` already fans out `estimatedDocumentCount` across engines in a thread pool
- The frontend `StatusPage` exists but shows support-style status messages, not infra health
- Error endpoint (`POST /api/errors`) records client errors — we can surface counts

## Owned files

### Backend (create)
```
backend/app/routes/health.py    — new route module with /api/health/deep endpoint
```

### Frontend (create)
```
frontend/src/components/HealthDashboard.jsx   — infrastructure health panel
```

### Backend (modify)
```
backend/app/main.py             — import and mount health router, keep existing /api/health inline
```

### Frontend (modify)
```
frontend/src/App.jsx            — add 'health' overlay case rendering HealthDashboard
```

## Read-only (do not modify)
```
backend/app/routes/dashboard.py
backend/app/routes/stats.py
backend/app/config.py
backend/app/db.py
```

## Implementation

### 1. `backend/app/routes/health.py`

New router with tag `health`. Two endpoints:

#### `GET /api/health/deep`

Requires auth (admin role only — uses `request.state.user`). Probes all infrastructure and returns a structured health report.

```python
router = APIRouter(tags=["health"])

@router.get("/health/deep")
async def deep_health(request: Request):
    user = request.state.user
    if user.get("role") not in ("admin", "superadmin"):
        return JSONResponse({"detail": "Admin only"}, status_code=403)
    
    # Fan out health checks in a thread pool
    results = {}
    with ThreadPoolExecutor(max_workers=6) as ex:
        futures = {
            ex.submit(_check_credmon): "credmon",
            ex.submit(_check_darkmon): "darkmon",
            ex.submit(_check_fti): "fti",
            ex.submit(_check_platform): "platform",
            ex.submit(_check_audit): "audit",
            ex.submit(_check_client_errors): "client_errors",
        }
        for fut in concurrent.futures.as_completed(futures):
            name = futures[fut]
            try:
                results[name] = fut.result()
            except Exception as e:
                results[name] = {"status": "error", "error": str(e)}
    
    overall = "healthy"
    for name, check in results.items():
        if name == "audit" and check.get("status") == "not_configured":
            continue  # audit is optional
        if check.get("status") == "error":
            overall = "degraded"
            break
    
    return {
        "status": overall,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "engines": results,
    }
```

Each `_check_*` function:

**`_check_credmon()`**:
- `ping()` on the credmon client — measure round-trip latency
- `estimatedDocumentCount` on `Master_extracts.emails` (canary collection)
- Return: `{"status": "ok"|"error", "latency_ms": N, "canary_count": N}`

**`_check_darkmon()`**:
- `ping()` on the darkmon client
- `estimatedDocumentCount` on a known collection
- Return: `{"status": "ok"|"error", "latency_ms": N, "canary_count": N}`

**`_check_fti()`**:
- `ping()` on the FTI client
- `estimatedDocumentCount` on `CrimeData` (canary)
- Return: `{"status": "ok"|"error", "latency_ms": N, "canary_count": N}`

**`_check_platform()`**:
- Check that `auracle_platform` DB is accessible
- Count `users` collection
- Return: `{"status": "ok"|"error", "user_count": N}`

**`_check_audit()`**:
- If `settings.mongo_uri_audit` is empty, return `{"status": "not_configured"}`
- Otherwise ping audit DB, count events in last hour
- Return: `{"status": "ok"|"error"|"not_configured", "events_last_hour": N}`

**`_check_client_errors()`**:
- Count errors in `client_errors` collection from last hour
- Return: `{"count_last_hour": N, "count_last_24h": N}`

Cache the result for 30 seconds (avoid hammering Mongo on every admin refresh). Use a simple module-level cache like stats.py.

#### Keep existing `GET /api/health`

The existing inline `/api/health` in `main.py` stays as-is (it's a lightweight liveness probe for Docker/Caddy health checks). The new `/api/health/deep` is the rich version.

### 2. `frontend/src/components/HealthDashboard.jsx`

A panel (rendered as an overlay like StatusPage) showing:

**Layout — 6 cards in a grid:**

```
┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│  CREDMON     │ │  DARKMON    │ │  FTI        │
│  ● Healthy   │ │  ● Healthy   │ │  ● Degraded  │
│  12ms        │ │  45ms        │ │  timeout     │
│  1.2B docs   │ │  890K docs   │ │  error...    │
└─────────────┘ └─────────────┘ └─────────────┘
┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│  Platform   │ │  Audit      │ │  Client Errs │
│  ● Healthy   │ │  ○ N/A       │ │  3 last hour │
│  42 users    │ │  not config  │ │  12 last 24h │
└─────────────┘ └─────────────┘ └─────────────┘
```

**Behavior:**
- Calls `GET /api/health/deep` on mount
- Shows loading skeleton while fetching
- Auto-refreshes every 30 seconds while the panel is open
- Status dot: green (ok), yellow (degraded/stale), red (error), gray (not_configured)
- Overall status banner at top: "All systems operational" / "Some systems degraded"
- Latency shown in ms for engine checks
- Canary counts formatted with commas (1,234,567)
- Client error count in last hour highlighted red if > 0

**Styling:** Use existing Tailwind tokens (`sap-accent`, `sap-surface`, `sap-dim`, `entity-drug` for errors). Match the card style used in the Overview tab.

**Engine labels in UI:** Use "Breach Engine", "Darkweb Engine", "Threat Intel Engine", "Platform DB", "Audit DB", "Client Errors" — do NOT expose internal names (CREDMON, DARKMON, FTI) per the internal-name ban.

### 3. `main.py` changes

```python
from app.routes import health
app.include_router(health.router, prefix="/api")
```

Add after the existing route mounts. The existing inline `@app.get("/api/health")` stays.

### 4. `App.jsx` changes

Add `'health'` to the overlay switch in `renderBody`:
```jsx
case 'health':
  return <ErrorBoundary name="HealthDashboard"><HealthDashboard onClose={() => setOverlay(null)} /></ErrorBoundary>;
```

Add a menu entry in the admin dropdown (or wherever StatusPage is triggered) for "Infrastructure Health" that sets `overlay` to `'health'`.

## Acceptance criteria

- [ ] `GET /api/health` still returns `{"status": "operational"}` (unchanged liveness probe)
- [ ] `GET /api/health/deep` without auth → 401
- [ ] `GET /api/health/deep` with non-admin auth → 403
- [ ] `GET /api/health/deep` with admin auth → 200 + structured response with `status`, `timestamp`, `engines` keys
- [ ] Each engine check returns `status`, `latency_ms`, and a canary count
- [ ] If one engine is unreachable, overall status is `"degraded"` (not `"healthy"`)
- [ ] Response is cached for 30s (two rapid calls return same timestamp)
- [ ] Frontend HealthDashboard renders 6 cards with correct status indicators
- [ ] UI does NOT show "CREDMON", "DARKMON", or "FTI" — uses user-facing engine names
- [ ] Auto-refresh fires every 30s while panel is open (verify with network tab)
- [ ] `npm run lint` passes
- [ ] `npm run build` succeeds

## Testing instructions

```bash
# Backend
docker compose -f docker-compose.dev.yml up --build -d
curl -H "Authorization: Bearer <admin-token>" http://localhost:8888/api/health/deep | jq .

# Frontend
cd frontend && npm run dev
# Open http://localhost:4444 → admin menu → Infrastructure Health
```

## HANDOFF items

**For orchestrator to apply:**
1. `backend/app/main.py` — add `from app.routes import health` to imports and `app.include_router(health.router, prefix="/api")` to route mounts
2. `frontend/src/App.jsx` — add `HealthDashboard` import and `'health'` overlay case

## Summary output

Write summary to: `specs/infra/013-health-dashboard.summary.md`

## Notes

- The deep health endpoint is admin-only because it exposes infrastructure topology (collection names, latencies, document counts). Don't make it public.
- The 30s cache on the backend prevents a hammering loop if the frontend auto-refresh interval is misconfigured. Defense in depth.
- Engine canary collections should be ones that are always populated in any deployment: `Master_extracts.emails` for CREDMON, `CrimeData` for FTI, and any indexed collection in DARKMON. If a canary collection is empty, that's still "ok" (engine is reachable) — the count is informational.
- The audit check returns `not_configured` if `mongo_uri_audit` is empty — this is expected in dev setups and should render as gray/neutral, not as an error.
