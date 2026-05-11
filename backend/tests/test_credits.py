"""
Smoke tests for credits endpoints.
"""
import pytest


@pytest.mark.auth
def test_credits_balance(client, auth_headers):
    """GET /api/credits/balance returns 200."""
    resp = client.get("/api/credits/balance", headers=auth_headers)
    assert resp.status_code == 200


@pytest.mark.auth
def test_credits_cost_matrix(client, auth_headers):
    """GET /api/credits/cost-matrix returns 200."""
    resp = client.get("/api/credits/cost-matrix", headers=auth_headers)
    assert resp.status_code == 200


@pytest.mark.auth
def test_credits_usage(client, auth_headers):
    """GET /api/credits/usage returns 200."""
    resp = client.get("/api/credits/usage", headers=auth_headers)
    assert resp.status_code == 200


@pytest.mark.auth
def test_credits_preview(client, auth_headers):
    """GET /api/credits/preview?action=combined_search returns 200."""
    resp = client.get(
        "/api/credits/preview",
        params={"action": "combined_search"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "action" in data
    assert "cost" in data
    assert "balance" in data
    assert "sufficient" in data
