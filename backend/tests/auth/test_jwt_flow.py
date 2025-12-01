import pytest
from typing import Any
from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APIClient

User = get_user_model()

def _json(resp: Any) -> dict:
    return getattr(resp, "data", {}) or {}

@pytest.mark.django_db
def test_jwt_issue_verify_use_me():
    User.objects.create_user(username="dev", password="p@ss")
    client = APIClient()

    # Issue
    r_issue: Any = client.post(
        "/api/v1/auth/jwt/create/",
        {"username": "dev", "password": "p@ss"},
        format="json",
    )
    assert getattr(r_issue, "status_code", None) == status.HTTP_200_OK, _json(r_issue)
    access = r_issue.data["access"]

    # Verify
    r_verify: Any = client.post(
        "/api/v1/auth/jwt/verify/",
        {"token": access},
        format="json",
    )
    assert getattr(r_verify, "status_code", None) == status.HTTP_200_OK, _json(r_verify)

    # Use /auth/me
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
    r_me: Any = client.get("/api/v1/auth/me/")
    assert getattr(r_me, "status_code", None) == status.HTTP_200_OK, _json(r_me)
    assert r_me.data.get("username") == "dev"
