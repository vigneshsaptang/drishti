"""
Smoke tests for dashboard and platform stats endpoints.
"""
import pytest

_DASHBOARD_PANELS = [
    "fraud-upis",
    "total-info",
    "world-check",
    "dw/forums",
    "dw/dread",
    "dw/markets",
]


@pytest.mark.auth
def test_platform_stats(client, auth_headers):
    """GET /api/stats/platform returns 200 with hero key."""
    resp = client.get("/api/stats/platform", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "hero" in data
    hero = data["hero"]
    assert "total_records" in hero
    assert "breach_records" in hero
    assert "threat_records" in hero


def test_platform_stats_no_auth(client):
    """GET /api/stats/platform without headers returns 401."""
    resp = client.get("/api/stats/platform")
    assert resp.status_code == 401


@pytest.mark.auth
@pytest.mark.parametrize("panel", _DASHBOARD_PANELS)
def test_dashboard_panel(client, auth_headers, panel):
    """GET /api/dashboard/{panel} returns 200."""
    resp = client.get(f"/api/dashboard/{panel}", headers=auth_headers)
    assert resp.status_code == 200
