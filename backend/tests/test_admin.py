"""
Smoke tests for admin endpoints.
"""
import pytest


@pytest.mark.admin
def test_admin_user_list(client, admin_headers):
    """GET /api/admin/users returns 200 with an array."""
    resp = client.get("/api/admin/users", headers=admin_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)


@pytest.mark.admin
def test_admin_config_get(client, admin_headers):
    """GET /api/admin/config returns 200."""
    resp = client.get("/api/admin/config", headers=admin_headers)
    assert resp.status_code == 200


@pytest.mark.admin
def test_admin_audit_log(client, admin_headers):
    """GET /api/admin/audit-log returns 200."""
    resp = client.get("/api/admin/audit-log", headers=admin_headers)
    assert resp.status_code == 200


@pytest.mark.admin
def test_admin_roles_list(client, admin_headers):
    """GET /api/admin/roles returns 200."""
    resp = client.get("/api/admin/roles", headers=admin_headers)
    assert resp.status_code == 200


@pytest.mark.admin
def test_admin_credits_overview(client, admin_headers):
    """GET /api/admin/credits/overview returns 200."""
    resp = client.get("/api/admin/credits/overview", headers=admin_headers)
    assert resp.status_code == 200
