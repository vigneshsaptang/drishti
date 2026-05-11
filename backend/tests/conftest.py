"""
Shared fixtures for backend smoke tests.

These tests hit the real FastAPI app with real database connections.
They are smoke tests — they validate response shapes, not specific data values.
"""
import os

import pytest
from fastapi.testclient import TestClient
from app.main import app


def pytest_configure(config):
    config.addinivalue_line("markers", "auth: requires authentication")
    config.addinivalue_line("markers", "admin: requires admin role")
    config.addinivalue_line("markers", "search: search pipeline tests")


@pytest.fixture(scope="session")
def client():
    """Synchronous test client against the real app."""
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="session")
def auth_headers(client):
    """Get auth headers by logging in. Skip all authed tests if login fails."""
    # Try login -- if auth is disabled (empty SAPTANG_ADMIN_PASSWORD), skip auth
    resp = client.get("/api/auth/status")
    status = resp.json()
    if not status.get("auth_required"):
        return {}

    # Attempt login with env-configured credentials
    username = os.environ.get("TEST_USERNAME", "operator")
    password = os.environ.get("TEST_PASSWORD", "")
    if not password:
        pytest.skip("TEST_PASSWORD not set -- cannot run authenticated tests")

    resp = client.post("/api/auth/login", json={
        "username": username,
        "password": password,
    })
    if resp.status_code != 200:
        pytest.skip(f"Login failed ({resp.status_code}) -- cannot run authenticated tests")

    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="session")
def admin_headers(auth_headers):
    """Alias -- assumes test user is admin. Separate fixture for clarity."""
    return auth_headers
