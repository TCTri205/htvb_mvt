from __future__ import annotations

from typing import Any

from .models import AuthSession

SESSION_COOKIE_NAME = "htvb_session_id"
SESSION_COOKIE_PATH = "/"


def get_session_id_from_request(request: Any) -> str | None:
    """
    Extract the session identifier set by ``JWTCreateView`` / the client.
    """
    cookies = getattr(request, "COOKIES", None) or {}
    session_id = cookies.get(SESSION_COOKIE_NAME)
    if not session_id:
        headers = getattr(request, "headers", None)
        session_id = headers.get("X-Session-Id") if headers else None

    if isinstance(session_id, bytes):
        try:
            session_id = session_id.decode("utf-8")
        except Exception:
            session_id = None

    if isinstance(session_id, str) and session_id.strip():
        return session_id.strip()

    return None


def revoke_session_for_request(request: Any, user: Any) -> None:
    """
    Mark the session_id presented by the client as revoked for the given user.
    """
    session_id = get_session_id_from_request(request)
    if not session_id:
        return

    AuthSession.objects.filter(session_id=session_id, user=user, revoked=False).update(revoked=True)
