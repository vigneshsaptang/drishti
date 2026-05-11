# Spec 012 — Backend Smoke Tests (pytest)

## Worktree: wt-infra
## Priority: P1
## Depends on: spec 008 (engine error logging), spec 009 (error audit endpoint)

## Goal

Add pytest to the backend and write a smoke test suite that validates every critical endpoint responds correctly against a running Mongo stack. Not unit tests with mocks — real requests to a real FastAPI app with real database connections. This is the backend counterpart to spec 011: "does the API work end-to-end?"

## Context

- **No test framework exists** in the backend — no pytest, no test directory, no conftest.
- The app requires three Mongo connections (CREDMON, DARKMON, FTI) + optional audit Mongo.
- Auth is JWT-based. Tests need a valid token to hit most endpoints.
- The app has 100+ endpoints across 21 route modules.
- Config loads from `.env` via pydantic-settings (`app/config.py`).
- `MongoJSONResponse` handles BSON serialization — test client must handle this.

## Owned files (create)

```
backend/tests/__init__.py
backend/tests/conftest.py
backend/tests/test_health.py
backend/tests/test_auth.py
backend/tests/test_search.py
backend/tests/test_dashboard.py
backend/tests/test_admin.py
backend/tests/test_credits.py
backend/tests/test_errors.py
backend/pytest.ini
```

## Modified files

```
backend/requirements.txt       — add pytest, httpx (for async test client)
```

## Read-only (do not modify)

```
backend/app/**/*               — no production code changes
frontend/**/*                  — no frontend changes
```

## Implementation

### 1. Install

Add to `requirements.txt`:
```
pytest>=8.0
httpx>=0.27
```

### 2. `pytest.ini`

```ini
[pytest]
testpaths = tests
asyncio_mode = auto
```

### 3. `tests/conftest.py` — shared fixtures

```python
import pytest
from fastapi.testclient import TestClient
from app.main import app

@pytest.fixture(scope="session")
def client():
    """Synchronous test client against the real app."""
    with TestClient(app) as c:
        yield c

@pytest.fixture(scope="session")
def auth_headers(client):
    """Get auth headers by logging in. Skip all authed tests if login fails."""
    # Try login — if auth is disabled (empty SAPTANG_ADMIN_PASSWORD), skip auth
    status = client.get("/api/auth/status").json()
    if not status.get("auth_required"):
        return {}
    
    # Attempt login with env-configured credentials
    import os
    username = os.environ.get("TEST_USERNAME", "operator")
    password = os.environ.get("TEST_PASSWORD", "")
    if not password:
        pytest.skip("TEST_PASSWORD not set — cannot run authenticated tests")
    
    resp = client.post("/api/auth/login", json={
        "username": username,
        "password": password,
    })
    if resp.status_code != 200:
        pytest.skip(f"Login failed ({resp.status_code}) — cannot run authenticated tests")
    
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}

@pytest.fixture(scope="session")
def admin_headers(auth_headers):
    """Alias — assumes test user is admin. Separate fixture for clarity."""
    return auth_headers
```

### 4. Test files

#### `test_health.py` — no auth needed
```python
def test_health(client):
    resp = client.get("/api/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "operational"

def test_auth_status(client):
    resp = client.get("/api/auth/status")
    assert resp.status_code == 200
    data = resp.json()
    assert "setup_complete" in data
```

#### `test_auth.py`
- **Login success**: POST `/api/auth/login` with valid creds → 200 + tokens
- **Login failure**: POST `/api/auth/login` with wrong password → 401
- **Me endpoint**: GET `/api/auth/me` with auth headers → 200 + user object
- **Refresh token**: POST `/api/auth/refresh` with refresh token → 200 + new access token
- **Sessions list**: GET `/api/auth/sessions` → 200 + array
- **Unauthenticated access**: GET `/api/auth/me` without headers → 401

#### `test_search.py`
- **Search v2 basic**: POST `/api/v2/search` with `{"seeds": [{"type": "phone", "value": "9999999999"}], "max_depth": 1}` → 200 + SSE stream (read response as text, check for `event: search:start` and `event: search:complete`)
- **Search v2 missing seeds**: POST `/api/v2/search` with `{"seeds": []}` → 422 or appropriate error
- **Search v2 no auth**: POST `/api/v2/search` without headers → 401
- **Credit preview**: GET `/api/credits/preview?operation=search&seeds=1` → 200 (if credits enabled)

#### `test_dashboard.py`
- **Platform stats**: GET `/api/stats/platform` → 200 + `hero` key with counts
- **Dashboard panels**: For each of `fraud-upis`, `total-info`, `world-check`, `dw/forums`, `dw/dread`, `dw/markets`: GET `/api/dashboard/{panel}` → 200 (may have `_cached` flag)
- **Dashboard no auth**: GET `/api/stats/platform` without headers → 401

#### `test_admin.py`
- **User list**: GET `/api/admin/users` → 200 + array
- **Config get**: GET `/api/admin/config` → 200
- **Audit log**: GET `/api/admin/audit-log` → 200
- **Roles list**: GET `/api/admin/roles` → 200
- **Credits overview**: GET `/api/admin/credits/overview` → 200

#### `test_credits.py`
- **Balance**: GET `/api/credits/balance` → 200
- **Cost matrix**: GET `/api/credits/cost-matrix` → 200
- **Usage**: GET `/api/credits/usage` → 200

#### `test_errors.py` — no auth needed (public endpoint)
```python
def test_error_reporting(client):
    resp = client.post("/api/errors", json={
        "type": "test",
        "message": "Smoke test error — ignore",
        "url": "http://localhost/test",
        "timestamp": "2026-01-01T00:00:00Z",
    })
    assert resp.status_code == 200
    assert resp.json()["status"] == "recorded"
```

### 5. Test markers

Use pytest markers for optional grouping:
```python
# conftest.py
def pytest_configure(config):
    config.addinivalue_line("markers", "auth: requires authentication")
    config.addinivalue_line("markers", "admin: requires admin role")
    config.addinivalue_line("markers", "search: search pipeline tests")
```

## Acceptance criteria

- [ ] `pip install -r requirements.txt` installs pytest and httpx
- [ ] `cd backend && python -m pytest tests/test_health.py -v` passes against a running stack
- [ ] `python -m pytest tests/ -v` runs all test files without import errors
- [ ] Tests that need auth use the `auth_headers` fixture and skip gracefully if credentials are missing
- [ ] At least 20 test cases across the 7 test files
- [ ] No production code modified (`backend/app/**` untouched)
- [ ] SSE search test reads the stream and asserts at least `search:start` and `search:complete` events present

## Testing instructions

```bash
# Start the stack
docker compose -f docker-compose.dev.yml up --build -d

# Run smoke tests (set credentials if auth is enabled)
cd backend
export TEST_USERNAME=operator
export TEST_PASSWORD=your-password-here
python -m pytest tests/ -v

# Run just health (no auth needed)
python -m pytest tests/test_health.py -v
```

## HANDOFF items

None expected — all new files in `backend/tests/`, only `requirements.txt` modified.

## Summary output

Write summary to: `specs/infra/012-backend-smoke-tests.summary.md`

## Notes

- These are smoke tests, not unit tests. They hit a real database. Test data may vary between environments — assert response shapes, not specific values.
- The SSE test for search will get a real response from CREDMON/FTI/DARKMON. Use a throwaway seed (e.g., `9999999999`) that won't match real data, or accept that the response may have results.
- Do NOT mock the database. The whole point is to validate the real stack works end-to-end.
- If the backend doesn't start locally (missing PyJWT etc.), run tests inside Docker: `docker compose exec backend python -m pytest tests/ -v`.
