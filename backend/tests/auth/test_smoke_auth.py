# tests/auth/test_smoke_auth.py
from __future__ import annotations

import json
from typing import Any, Dict

import pytest
from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APIClient

User = get_user_model()


def _json(response: Any) -> Dict[str, Any]:
    if hasattr(response, "data"):
        return response.data  # type: ignore[no-any-return]
    if hasattr(response, "json"):
        try:
            return response.json()  # type: ignore[misc]
        except Exception:
            pass
    content = getattr(response, "content", b"") or b"{}"
    try:
        return json.loads(content.decode("utf-8"))
    except Exception:
        return {}


@pytest.mark.django_db
def test_jwt_issue_verify_and_me():
    # Tạo user
    User.objects.create_user(username="u1", password="p@ss")
    client = APIClient()

    # 1) Issue  (CHÚ Ý: dùng URL có trailing slash)
    r: Any = client.post(
        "/api/v1/auth/jwt/create/",
        {"username": "u1", "password": "p@ss"},
        format="json",
    )
    assert getattr(r, "status_code", None) == status.HTTP_200_OK, _json(r)
    tokens = _json(r)
    access = tokens["access"]

    # 2) Verify
    r2: Any = client.post("/api/v1/auth/jwt/verify/", {"token": access}, format="json")
    assert getattr(r2, "status_code", None) == status.HTTP_200_OK, _json(r2)

    # 3) Me
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
    r3: Any = client.get("/api/v1/auth/me/")  # cũng thêm slash
    assert getattr(r3, "status_code", None) == status.HTTP_200_OK, _json(r3)
    me = _json(r3)
    assert me.get("username") == "u1"


@pytest.mark.django_db
def test_inbound_requires_auth_401():
    client = APIClient()
    r: Any = client.get("/api/v1/inbound-docs/")  # router DRF mặc định có slash
    assert getattr(r, "status_code", None) == status.HTTP_401_UNAUTHORIZED, _json(r)


@pytest.mark.django_db
@override_settings(TESTING=False)  # bật RBAC/DocumentPermission trong viewset
def test_inbound_forbidden_403_when_rbac_denies(monkeypatch):
    from workflow.services import rbac

    # User hợp lệ để lấy token
    User.objects.create_user(username="u2", password="p@ss")
    client = APIClient()

    r0: Any = client.post(
        "/api/v1/auth/jwt/create/",
        {"username": "u2", "password": "p@ss"},
        format="json",
    )
    assert getattr(r0, "status_code", None) == status.HTTP_200_OK, _json(r0)
    access = _json(r0)["access"]
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")

    # Ép RBAC từ chối
    monkeypatch.setattr(rbac, "can", lambda user, act, obj=None: False)

    r: Any = client.get("/api/v1/inbound-docs/")
    assert getattr(r, "status_code", None) == status.HTTP_403_FORBIDDEN, _json(r)
