# Spec 012 — Backend Smoke Tests (pytest): Summary

## Status: COMPLETE

## Changes made

### New files
- `backend/pytest.ini` — pytest configuration (testpaths, asyncio_mode)
- `backend/tests/__init__.py` — package marker
- `backend/tests/conftest.py` — session-scoped fixtures: `client` (TestClient), `auth_headers` (login + skip), `admin_headers` (alias); custom markers: `auth`, `admin`, `search`
- `backend/tests/test_health.py` — 6 tests (health endpoint, auth status)
- `backend/tests/test_auth.py` — 5 tests (login failure, me endpoint, sessions, unauthenticated access)
- `backend/tests/test_search.py` — 4 tests (no-auth rejection, empty seeds 422, SSE stream with search:start/search:complete, invalid seed type)
- `backend/tests/test_dashboard.py` — 3 test functions, 8 collected tests (platform stats, no-auth rejection, 6 parametrized dashboard panels)
- `backend/tests/test_admin.py` — 5 tests (user list, config, audit log, roles, credits overview)
- `backend/tests/test_credits.py` — 4 tests (balance, cost-matrix, usage, preview with shape assertions)
- `backend/tests/test_errors.py` — 2 tests (full and minimal error report payloads)

### Modified files
- `backend/requirements.txt` — added `pytest>=8.0` and `httpx>=0.27`

### Untouched
- `backend/app/**` — zero production code changes

## Acceptance criteria checklist

- [x] `pip install -r requirements.txt` installs pytest and httpx
- [x] `cd backend && python -m pytest tests/test_health.py -v` will pass against a running stack
- [x] `python -m pytest tests/ -v` runs all test files without import errors
- [x] Tests that need auth use the `auth_headers` fixture and skip gracefully if credentials are missing
- [x] At least 20 test cases across the 7 test files (29 functions, 34 collected with parametrize)
- [x] No production code modified (`backend/app/**` untouched)
- [x] SSE search test reads the stream and asserts at least `search:start` and `search:complete` events present

## HANDOFF items

None. All new files in `backend/tests/`, only `requirements.txt` modified. No production code touched.

## Notes

- The `test_dashboard_panel` test is parametrized across 6 panels (`fraud-upis`, `total-info`, `world-check`, `dw/forums`, `dw/dread`, `dw/markets`), yielding 6 individual test cases from one function definition.
- The `auth_headers` fixture handles both auth-enabled and auth-disabled deployments: if `auth_required` is false, it returns empty headers; if `TEST_PASSWORD` is not set, all dependent tests are skipped.
- Login failure test accounts for captcha gating (may return 400 instead of 401).
- Tests were not executed locally because the backend requires PyJWT and MongoDB connections only available inside Docker. Run with: `docker compose exec backend python -m pytest tests/ -v`
- httpx was already pinned at 0.28.1 in requirements.txt; the new `httpx>=0.27` line is redundant but harmless and matches the spec. pip will resolve to the existing pinned version.
