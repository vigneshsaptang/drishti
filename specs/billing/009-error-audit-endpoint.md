# SPEC: Frontend error capture endpoint + slow query / empty result audit events

**Worktree**: wt-billing
**Priority**: P1 (operational visibility for production)
**Protocol**: Read `/Users/vigneshe/Developer/Pinaca/claude-research/sigint/specs/SPEC_PROTOCOL.md` first
**Summary output**: `/Users/vigneshe/Developer/Pinaca/claude-research/sigint/specs/billing/009-error-audit-endpoint.summary.md`

## Problem

1. Frontend errors (render crashes, unhandled rejections, runtime errors) vanish into the browser console. There's no server-side record when a client's browser hits an error.
2. The audit system logs searches but not errors, slow queries, or empty results. When something goes wrong in production, we have no audit trail to investigate.

## Changes

### File: `backend/app/audit.py`

**Add 3 new logging methods to `AuditService`:**

**Method 1 — `log_client_error`** (for frontend errors POSTed to /api/errors):

```python
def log_client_error(self, *,
                     error_type: str,
                     message: str,
                     stack: str | None = None,
                     component: str | None = None,
                     url: str | None = None,
                     client_ip: str | None = None,
                     user_agent: str | None = None,
                     user_id: str | None = None,
                     username: str | None = None):
    self.log(
        category="client_error",
        action=f"client_error.{error_type}",
        severity="error",
        user_id=user_id,
        username=username,
        client_ip=client_ip,
        user_agent=user_agent,
        detail={
            "error_type": error_type,
            "message": message[:2000],
            "stack": (stack or "")[:5000],
            "component": component,
            "url": url,
        },
    )
```

**Method 2 — `log_slow_query`** (for queries exceeding a threshold):

```python
def log_slow_query(self, *,
                   engine: str,
                   query_type: str,
                   duration_ms: int,
                   user_id: str | None = None,
                   username: str | None = None,
                   detail: dict | None = None):
    self.log(
        category="performance",
        action=f"slow_query.{engine}",
        severity="warn",
        user_id=user_id,
        username=username,
        response_time_ms=duration_ms,
        detail={
            "engine": engine,
            "query_type": query_type,
            "duration_ms": duration_ms,
            **(detail or {}),
        },
    )
```

**Method 3 — `log_empty_result`** (search completed but returned zero results — often indicates a problem):

```python
def log_empty_result(self, *,
                     engine: str,
                     search_type: str,
                     user_id: str | None = None,
                     username: str | None = None,
                     detail: dict | None = None):
    self.log(
        category="diagnostic",
        action=f"empty_result.{engine}",
        severity="info",
        user_id=user_id,
        username=username,
        detail={
            "engine": engine,
            "search_type": search_type,
            **(detail or {}),
        },
    )
```

### File: `backend/app/routes/errors.py` (NEW FILE)

Create a new route file for the `/api/errors` endpoint:

```python
import logging
from fastapi import APIRouter, Request
from pydantic import BaseModel

from app.audit import audit_service

log = logging.getLogger("errors")
router = APIRouter(prefix="/errors", tags=["errors"])


class ClientErrorReport(BaseModel):
    type: str = "unknown"
    message: str = ""
    stack: str | None = None
    componentStack: str | None = None
    component: str | None = None
    filename: str | None = None
    lineno: int | None = None
    colno: int | None = None
    url: str | None = None
    timestamp: str | None = None


@router.post("")
async def report_client_error(report: ClientErrorReport, request: Request):
    user = getattr(request.state, "user", None) or {}
    client_ip = request.headers.get("x-forwarded-for", "").split(",")[0].strip() or (request.client.host if request.client else "")

    log.warning("Client error [%s]: %s (component=%s, url=%s)",
                report.type, report.message[:200], report.component, report.url)

    audit_service.log_client_error(
        error_type=report.type,
        message=report.message,
        stack=report.stack or report.componentStack,
        component=report.component,
        url=report.url,
        client_ip=client_ip,
        user_agent=request.headers.get("user-agent"),
        user_id=user.get("id"),
        username=user.get("username"),
    )

    return {"status": "recorded"}
```

**IMPORTANT**: This endpoint must be accessible WITHOUT authentication — frontend errors can happen before/during login. Add a note in the HANDOFF for main.py to exclude `/api/errors` from auth middleware, similar to how `/api/health` and `/api/auth/*` are excluded.

### File: `backend/app/routes/audit_admin.py`

**Add a filter for the new event categories** so they appear in the admin audit log viewer:

Find where audit events are queried/filtered (the admin audit log endpoint). Ensure the filter options include the new categories: `client_error`, `performance`, `diagnostic`. If there's a hardcoded category list for the UI filter dropdown, add these three.

If there's no hardcoded list and it uses dynamic aggregation, no change needed — just verify.

## Must NOT touch

- `backend/app/config.py` — owned by wt-infra
- `backend/app/main.py` — owned by wt-infra (HANDOFF for route registration)
- `backend/app/engines/*` — owned by wt-search
- `frontend/src/*` — owned by other worktrees

## HANDOFF (request to orchestrator)

### main.py
- Import and register the new errors router:
  ```python
  from app.routes import errors
  app.include_router(errors.router, prefix="/api")
  ```
- Exclude `/api/errors` from `SaptangAuthMiddleware` — add to the auth bypass list alongside `/api/health` and `/api/auth/`

### config.py (optional, P2)
- Consider adding `SLOW_QUERY_THRESHOLD_MS: int = 5000` for engines to use when deciding whether to call `audit_service.log_slow_query()`. Not blocking for this spec.

## Acceptance criteria

1. `AuditService` has `log_client_error()`, `log_slow_query()`, and `log_empty_result()` methods
2. `backend/app/routes/errors.py` exists with `POST /api/errors` endpoint
3. The endpoint accepts the `ClientErrorReport` schema and logs via `audit_service.log_client_error()`
4. The endpoint also logs a WARNING to Python's logging (for immediate visibility in docker logs)
5. Event categories `client_error`, `performance`, `diagnostic` appear correctly in audit events
6. `cd backend && python -c "from app.routes.errors import router; print('OK')"` succeeds
7. `cd backend && python -c "from app.audit import audit_service; audit_service.log_client_error(error_type='test', message='test')"` doesn't crash

## Report back

Write summary to the path in "Summary output" above. Include the HANDOFF items for orchestrator.
