"""
Smoke tests for the v2 search (SSE streaming) pipeline.
"""
import pytest


@pytest.mark.search
def test_search_v2_no_auth(client):
    """POST /api/v2/search without headers returns 401."""
    resp = client.post("/api/v2/search", json={
        "seeds": [{"type": "phone", "value": "9999999999"}],
        "max_depth": 1,
    })
    assert resp.status_code == 401


@pytest.mark.search
def test_search_v2_missing_seeds(client, auth_headers):
    """POST /api/v2/search with empty seeds returns 422."""
    resp = client.post("/api/v2/search", json={
        "seeds": [],
        "max_depth": 1,
    }, headers=auth_headers)
    assert resp.status_code == 422


@pytest.mark.search
def test_search_v2_basic_stream(client, auth_headers):
    """POST /api/v2/search streams SSE with search:start and search:complete."""
    resp = client.post("/api/v2/search", json={
        "seeds": [{"type": "phone", "value": "9999999999"}],
        "max_depth": 1,
    }, headers=auth_headers)
    assert resp.status_code == 200

    # Read the SSE stream text
    body = resp.text
    assert "event: search:start" in body, "SSE stream must contain search:start event"
    assert "event: search:complete" in body, "SSE stream must contain search:complete event"


@pytest.mark.search
def test_search_v2_invalid_seed_type(client, auth_headers):
    """POST /api/v2/search with invalid seed type returns 422."""
    resp = client.post("/api/v2/search", json={
        "seeds": [{"type": "invalid_type", "value": "test"}],
        "max_depth": 1,
    }, headers=auth_headers)
    assert resp.status_code == 422
