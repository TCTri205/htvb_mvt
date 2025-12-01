import pytest
from typing import Any
from rest_framework import status
from rest_framework.test import APIClient


def _status(resp: Any) -> int:
    """Trích status_code an toàn cho Pylance."""
    return int(getattr(resp, "status_code", 0))


@pytest.mark.django_db
def test_inbound_list_requires_auth_401():
    client = APIClient()
    resp: Any = client.get("/api/v1/inbound-docs/")  # không gửi Bearer
    assert _status(resp) == status.HTTP_401_UNAUTHORIZED
