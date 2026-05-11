## main.py
- Import and register the new errors router:
  ```python
  from app.routes import errors
  app.include_router(errors.router, prefix="/api")
  ```
- Exclude `/api/errors` from `SaptangAuthMiddleware` — add to the auth bypass list alongside `/api/health` and `/api/auth/`. Frontend errors can happen before/during login, so this endpoint must be accessible without authentication.

## config.py (optional, P2)
- Consider adding `SLOW_QUERY_THRESHOLD_MS: int = 5000` for engines to use when deciding whether to call `audit.log_slow_query()`. Not blocking.
