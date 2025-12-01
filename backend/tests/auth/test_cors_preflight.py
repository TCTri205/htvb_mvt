import pytest
from typing import Any, Optional
from django.test import override_settings
from rest_framework.test import APIClient


def _status(resp: Any) -> int:
    """Trích status_code an toàn cho Pylance."""
    return int(getattr(resp, "status_code", 0))


def _header(resp: Any, name: str) -> Optional[str]:
    """
    Lấy header an toàn:
    - Ưu tiên resp.headers.get(name) (Django >= 3.2+)
    - Fallback resp[name] nếu có hỗ trợ __getitem__
    """
    hdrs = getattr(resp, "headers", None)
    if hasattr(hdrs, "get"):
        return hdrs.get(name)  # type: ignore[no-any-return]
    try:
        return resp[name]  # type: ignore[index]
    except Exception:
        return None


@pytest.mark.django_db
@override_settings(
    CORS_ALLOW_ALL_ORIGINS=False,
    CORS_ALLOWED_ORIGINS=["http://localhost:5173"],
)
def test_cors_preflight_inbound_docs_ok():
    client = APIClient()
    resp: Any = client.options(
        "/api/v1/inbound-docs/",
        HTTP_ORIGIN="http://localhost:5173",
        HTTP_ACCESS_CONTROL_REQUEST_METHOD="GET",
        HTTP_ACCESS_CONTROL_REQUEST_HEADERS="authorization,content-type",
    )
    assert _status(resp) in (200, 204)
    assert _header(resp, "Access-Control-Allow-Origin") == "http://localhost:5173"
