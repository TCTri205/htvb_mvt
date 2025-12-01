# tests/views/test_urls_routes.py
import pytest


@pytest.mark.django_db
def test_schema_available(api_client):
    resp = api_client.get("/api/schema/")
    assert resp.status_code == 200


@pytest.mark.django_db
def test_outbound_list_unauth_returns_401_or_403(api_client):
    # DefaultRouter mặc định có trailing slash
    resp = api_client.get("/api/v1/outbound-docs/")
    assert resp.status_code in (401, 403)
