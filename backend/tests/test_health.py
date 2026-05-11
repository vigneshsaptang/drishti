"""
Smoke tests for unauthenticated health/status endpoints.
"""


def test_health_returns_200(client):
    resp = client.get("/api/health")
    assert resp.status_code == 200


def test_health_status_operational(client):
    resp = client.get("/api/health")
    data = resp.json()
    assert data["status"] == "operational"


def test_health_has_platform_field(client):
    resp = client.get("/api/health")
    data = resp.json()
    assert "platform" in data


def test_auth_status_returns_200(client):
    resp = client.get("/api/auth/status")
    assert resp.status_code == 200


def test_auth_status_has_setup_complete(client):
    resp = client.get("/api/auth/status")
    data = resp.json()
    assert "setup_complete" in data


def test_auth_status_has_auth_required(client):
    resp = client.get("/api/auth/status")
    data = resp.json()
    assert "auth_required" in data
    assert isinstance(data["auth_required"], bool)
