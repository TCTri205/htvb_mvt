import pytest
from django.urls import reverse

@pytest.mark.django_db
def test_inbound_schema_paths_and_tags(client):
    """
    Smoke: /api/v1/inbound-docs/ phải có trong OpenAPI,
    method GET có tag 'Văn bản đến' và có response 200.
    """
    url = reverse("schema")
    res = client.get(url + "?format=json")
    assert res.status_code == 200

    spec = res.json()
    paths = spec.get("paths", {})
    assert "/api/v1/inbound-docs/" in paths

    get_op = paths["/api/v1/inbound-docs/"].get("get")
    assert isinstance(get_op, dict)

    tags = get_op.get("tags", [])
    assert "Văn bản đến" in tags

    responses = get_op.get("responses", {})
    assert "200" in responses
