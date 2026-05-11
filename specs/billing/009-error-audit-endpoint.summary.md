# Summary: Frontend error capture endpoint + slow query / empty result audit events

## Status: DONE

## Changes made
- `backend/app/audit.py`: Added `log_client_error()`, `log_slow_query()`, `log_empty_result()` methods to `AuditService`
- `backend/app/routes/errors.py`: Created new route file with `POST /api/errors` endpoint, `ClientErrorReport` Pydantic model, logging via `audit.log_client_error()` + Python WARNING log
- `backend/app/routes/audit_admin.py`: No change needed — `_build_filter()` accepts any `category` string dynamically, so `client_error`, `performance`, `diagnostic` events will appear automatically in the admin audit log viewer

## Acceptance criteria
- [x] `AuditService` has `log_client_error()`, `log_slow_query()`, and `log_empty_result()` methods
- [x] `backend/app/routes/errors.py` exists with `POST /api/errors` endpoint
- [x] The endpoint accepts the `ClientErrorReport` schema and logs via `audit.log_client_error()`
- [x] The endpoint also logs a WARNING to Python's logging (for immediate visibility in docker logs)
- [x] Event categories `client_error`, `performance`, `diagnostic` appear correctly in audit events (dynamic filtering, no hardcoded list)
- [x] `cd backend && python3 -c "from app.routes.errors import router; print('OK')"` succeeds
- [x] `cd backend && python3 -c "from app.audit import audit; audit.log_client_error(error_type='test', message='test')"` doesn't crash

## HANDOFF items (for orchestrator to apply)

### main.py
- Import and register the new errors router:
  ```python
  from app.routes import errors
  app.include_router(errors.router, prefix="/api")
  ```
- Exclude `/api/errors` from `SaptangAuthMiddleware` — add to the auth bypass list alongside `/api/health` and `/api/auth/`. This is critical because frontend errors can happen before/during login.

### config.py (optional, P2)
- Consider adding `SLOW_QUERY_THRESHOLD_MS: int = 5000` for engines to use when deciding whether to call `audit.log_slow_query()`. Not blocking for this spec.

## Notes
- The spec references `audit_service` as the singleton name, but the actual codebase exports it as `audit` (`audit = AuditService()` in audit.py line 492). The new `errors.py` route uses the correct `audit` name.
- `audit_admin.py` needed no changes — the `_build_filter()` function accepts arbitrary category strings via query parameter, so the three new categories (`client_error`, `performance`, `diagnostic`) will be filterable immediately once events exist.
