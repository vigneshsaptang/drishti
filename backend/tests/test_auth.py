"""
Smoke tests for authentication endpoints.
"""
import pytest


@pytest.mark.auth
def test_login_wrong_password(client):
    """POST /api/auth/login with wrong password returns 401 or 400 (captcha)."""
    resp = client.post("/api/auth/login", json={
        "username": "nonexistent_user_smoke_test",
        "password": "definitely-wrong-password",
    })
    # Should fail: either 401 (invalid creds) or 400 (captcha required)
    assert resp.status_code in (400, 401, 403)


@pytest.mark.auth
def test_me_unauthenticated(client):
    """GET /api/auth/me without headers returns 401."""
    resp = client.get("/api/auth/me")
    assert resp.status_code == 401


@pytest.mark.auth
def test_me_authenticated(client, auth_headers):
    """GET /api/auth/me with auth headers returns 200 and user object."""
    resp = client.get("/api/auth/me", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "username" in data
    assert "role" in data
    assert "id" in data


@pytest.mark.auth
def test_sessions_list(client, auth_headers):
    """GET /api/auth/sessions returns 200 with sessions array."""
    resp = client.get("/api/auth/sessions", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "sessions" in data
    assert isinstance(data["sessions"], list)


@pytest.mark.auth
def test_sessions_unauthenticated(client):
    """GET /api/auth/sessions without headers returns 401."""
    resp = client.get("/api/auth/sessions")
    assert resp.status_code == 401
