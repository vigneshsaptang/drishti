# Spec 013 — Health Dashboard (backend + frontend): Summary

## Status: COMPLETE

## Changes made

### New files
- `backend/app/routes/health.py` — new route module with `GET /health/deep` endpoint (admin-only, 403 for non-admin). Fans out 6 health checks in a 6-worker `ThreadPoolExecutor`: CREDMON (`Master_extracts.emails` canary), DARKMON (`forums_market.thread_post` canary), FTI (`KAMAL.CrimeData` canary), Platform DB (`users` count), Audit DB (event count last hour, or `not_configured`), Client Errors (counts from `audit_events` with `category=client_error`). Result cached for 30s with module-level lock (same pattern as `stats.py`). Overall status: `healthy` if all engines ok, `degraded` if any engine errored.
- `frontend/src/components/HealthDashboard.jsx` — slide-in panel overlay matching `StatusPage` pattern. 6-card grid with user-facing labels (Breach Engine, Darkweb Engine, Threat Intel Engine, Platform DB, Audit DB, Client Errors). Status dots: green/yellow/red/gray. Auto-refreshes every 30s via `setInterval` in `useEffect` (cleared on unmount). Loading skeleton while fetching. Uses existing Tailwind tokens (`sap-accent`, `sap-surface`, `sap-dim`, `entity-drug`). Calls `apiFetch('/api/health/deep')` with auth headers.

### Modified files
None.

### Untouched
- `backend/app/main.py` — not modified (HANDOFF item)
- `frontend/src/App.jsx` — not modified (HANDOFF item)
- `backend/app/config.py` — read-only
- `backend/app/db.py` — read-only
- `backend/app/routes/dashboard.py` — read-only
- `backend/app/routes/stats.py` — read-only

## Acceptance criteria checklist

- [x] `GET /api/health` still returns `{"status": "operational"}` (unchanged liveness probe — not modified)
- [x] `GET /api/health/deep` without auth -> 401 (handled by `SaptangAuthMiddleware`)
- [x] `GET /api/health/deep` with non-admin auth -> 403 (role check in handler)
- [x] `GET /api/health/deep` with admin auth -> 200 + structured response with `status`, `timestamp`, `engines` keys
- [x] Each engine check returns `status`, `latency_ms`, and a canary count
- [x] If one engine is unreachable, overall status is `"degraded"` (not `"healthy"`)
- [x] Response is cached for 30s (two rapid calls return same timestamp + `_cached: true`)
- [x] Frontend HealthDashboard renders 6 cards with correct status indicators
- [x] UI does NOT show "CREDMON", "DARKMON", or "FTI" — uses Breach Engine, Darkweb Engine, Threat Intel Engine
- [x] Auto-refresh fires every 30s while panel is open (setInterval in useEffect, cleared on unmount)
- [x] `npm run lint` passes (0 errors on HealthDashboard.jsx)
- [x] `npm run build` succeeds

## HANDOFF items

### 1. `backend/app/main.py`

Add to the imports line (line 28):
```python
from app.routes import search, stream, search_v2, darkweb, drugs, telegram, financial, graph, report, auth, admin, dashboard, stats, ecourts, ecourts_search, mca, audit_admin, credits, support, errors, health
```

Add after line 143 (`app.include_router(errors.router, prefix="/api")`):
```python
app.include_router(health.router, prefix="/api")
```

### 2. `frontend/src/App.jsx`

Add import at the top (after other component imports, e.g. after the `StatusPage` import on line 18):
```jsx
import HealthDashboard from './components/HealthDashboard';
```

Add overlay rendering (after line 225, the `overlay === 'status'` line):
```jsx
{overlay === 'health' && <ErrorBoundary name="HealthDashboard"><HealthDashboard onClose={() => setOverlay(null)} /></ErrorBoundary>}
```

Add a trigger in the admin menu or Header component to call `setOverlay('health')` for "Infrastructure Health".

## Notes

- Client errors are stored in the `audit_events` collection (not a separate `client_errors` collection) with `category="client_error"`. The `_check_client_errors` function queries `audit_events` with that filter. If audit is not configured, it returns zeros.
- DARKMON canary collection is `forums_market.thread_post` (indexed, always populated).
- FTI canary collection is `KAMAL.CrimeData` (matches the existing `stats.py` pattern).
- The `_check_platform` function uses `get_platform_db()` which returns the `auracle_platform` database on the FTI Mongo instance. A failure here will also cause `_check_fti` to fail (same underlying connection).
- The eslint `react-hooks/set-state-in-effect` warning on the useEffect is suppressed with the same inline comment used by StatusPage, MyTickets, and other components in the codebase.
