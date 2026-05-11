"""
Smoke tests for the client error reporting endpoint.

This endpoint is public (no auth required) -- it is listed in _PUBLIC_PREFIXES
in the auth middleware.
"""


def test_error_reporting(client):
    """POST /api/errors with a valid error report returns 200."""
    resp = client.post("/api/errors", json={
        "type": "test",
        "message": "Smoke test error -- ignore",
        "url": "http://localhost/test",
        "timestamp": "2026-01-01T00:00:00Z",
    })
    assert resp.status_code == 200
    assert resp.json()["status"] == "recorded"


def test_error_reporting_minimal(client):
    """POST /api/errors with minimal payload still returns 200."""
    resp = client.post("/api/errors", json={
        "type": "test",
        "message": "Minimal smoke test error",
    })
    assert resp.status_code == 200
    assert resp.json()["status"] == "recorded"
