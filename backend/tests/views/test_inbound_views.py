# tests/views/test_inbound_views.py
from typing import Any, Dict, cast
import pytest

from documents import views_inbound as inbound_views
from documents.permissions import Act


class DummyDoc:
    def __init__(self, pk: int = 55):
        self.id = pk
        self.doc_direction = "den"


@pytest.mark.django_db
def test_assign_calls_inbound_service(auth_client, monkeypatch):
    # get_object → trả object giả, không cần đụng DB
    monkeypatch.setattr(
        inbound_views.InboundDocumentViewSet, "get_object", lambda self: DummyDoc()
    )

    # Dùng dict kiểu rộng để Pylance không báo lỗi setitem
    called: Dict[str, Any] = {}

    def _fake_assign(user, document, **kw):
        called["payload"] = {
            "user": getattr(user, "id", None),
            "document": document.id,
            **kw,
        }
        return None

    # Tránh cảnh báo "inbound_service is not a known attribute"
    svc = getattr(inbound_views, "inbound_service")  # type: ignore[attr-defined]
    monkeypatch.setattr(svc, "assign", _fake_assign)

    # Cho qua RBAC
    from workflow.services import rbac
    monkeypatch.setattr(rbac, "can", lambda user, act, obj: True)

    resp = auth_client.post(
        "/api/v1/inbound-docs/55/assign/",
        data={"assignees": [1, 2], "deadline": "2025-12-31"},
        format="json",
    )
    assert resp.status_code == 200

    payload = cast(Dict[str, Any], called.get("payload"))
    assert payload is not None
    assert payload["document"] == 55
    assert payload["assignees"] == [1, 2]


@pytest.mark.django_db
def test_start_denied_when_rbac_refuses(auth_client, monkeypatch):
    monkeypatch.setattr(
        inbound_views.InboundDocumentViewSet, "get_object", lambda self: DummyDoc()
    )

    # RBAC từ chối Act.IN_START
    from workflow.services import rbac

    def _deny(user, act, obj):
        assert act == Act.IN_START
        return False

    monkeypatch.setattr(rbac, "can", _deny)

    # Service không nên bị gọi; nếu bị gọi thì fail
    def _oops(*a, **kw):
        raise AssertionError("Service must not be called when RBAC denies")

    svc = getattr(inbound_views, "inbound_service")  # type: ignore[attr-defined]
    monkeypatch.setattr(svc, "start", _oops)

    resp = auth_client.post(
        "/api/v1/inbound-docs/55/start/", data={"comment": "go"}, format="json"
    )
    assert resp.status_code in (403, 404)  # 403 chuẩn; 404 nếu routing thay đổi


@pytest.mark.django_db
def test_complete_ok_when_rbac_allows(auth_client, monkeypatch):
    monkeypatch.setattr(
        inbound_views.InboundDocumentViewSet, "get_object", lambda self: DummyDoc()
    )

    from workflow.services import rbac
    monkeypatch.setattr(rbac, "can", lambda user, act, obj: True)

    called: Dict[str, Any] = {"ok": False}

    def _complete(user, document, **kw):
        called["ok"] = True

    svc = getattr(inbound_views, "inbound_service")  # type: ignore[attr-defined]
    monkeypatch.setattr(svc, "complete", _complete)

    resp = auth_client.post(
        "/api/v1/inbound-docs/55/complete/", data={"comment": "done"}, format="json"
    )
    assert resp.status_code == 200
    assert called["ok"] is True
