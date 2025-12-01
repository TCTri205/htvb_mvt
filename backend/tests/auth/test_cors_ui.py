# tests/auth/test_cors_ui.py
from typing import Any

import pytest
from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APIClient

User = get_user_model()


def _hdr(resp: Any, key: str) -> str:
    """
    Lấy header an toàn từ DRF Response / Django HttpResponse mà không làm Pylance phàn nàn.
    Ưu tiên truy cập dạng resp[key], fallback sang resp.headers và _headers (Django cũ).
    """
    # DRF/Django cho phép index-style truy cập: resp["Header-Name"]
    try:
        return resp[key]  # type: ignore[index]
    except Exception:
        pass

    # Fallback: resp.headers (Django >= 2.2)
    h = getattr(resp, "headers", None)
    if h is not None:
        try:
            return h.get(key, "")  # type: ignore[call-arg]
        except Exception:
            pass

    # Fallback cũ: resp._headers (deprecated nhưng vẫn tồn tại ở vài môi trường)
    if hasattr(resp, "_headers"):  # type: ignore[attr-defined]
        lower = key.lower()
        try:
            val = resp._headers.get(lower)  # type: ignore[attr-defined]
            if val:
                return val[1]
        except Exception:
            pass

    return ""


@pytest.mark.django_db
@override_settings(
    CORS_ALLOW_ALL_ORIGINS=False,
    CORS_ALLOWED_ORIGINS=["http://localhost:5173"],
)
def test_preflight_inbound_allows_origin_and_headers():
    """
    Preflight OPTIONS phải trả về ACAO khớp origin và cho phép 'authorization, content-type'.
    Lưu ý: luôn gọi URL có dấu gạch chéo cuối để tránh 301 làm hỏng preflight.
    """
    client = APIClient()
    r: Any = client.options(
        "/api/v1/inbound-docs/",
        HTTP_ORIGIN="http://localhost:5173",
        HTTP_ACCESS_CONTROL_REQUEST_METHOD="GET",
        HTTP_ACCESS_CONTROL_REQUEST_HEADERS="authorization,content-type",
    )

    assert getattr(r, "status_code", None) in (200, 204)
    assert _hdr(r, "Access-Control-Allow-Origin") == "http://localhost:5173"

    allow_headers = _hdr(r, "Access-Control-Allow-Headers").lower()
    assert "authorization" in allow_headers
    assert "content-type" in allow_headers


@pytest.mark.django_db
@override_settings(
    CORS_ALLOW_ALL_ORIGINS=False,
    CORS_ALLOWED_ORIGINS=["http://localhost:5173"],
)
def test_actual_request_has_acao_header():
    """
    Request thực (GET /auth/me/) có Authorization phải nhận được ACAO = origin UI.
    """
    client = APIClient()

    # Tạo user & lấy token (CHÚ Ý dấu gạch chéo cuối)
    User.objects.create_user(username="c_user", password="p@ss")
    r0: Any = client.post(
        "/api/v1/auth/jwt/create/",
        {"username": "c_user", "password": "p@ss"},
        format="json",
    )
    assert getattr(r0, "status_code", None) == status.HTTP_200_OK
    access = getattr(r0, "data", {}).get("access", "")

    # Gọi /auth/me/ với Origin + Bearer
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
    r1: Any = client.get(
        "/api/v1/auth/me/",
        HTTP_ORIGIN="http://localhost:5173",
    )

    assert getattr(r1, "status_code", None) == status.HTTP_200_OK
    assert _hdr(r1, "Access-Control-Allow-Origin") == "http://localhost:5173"
