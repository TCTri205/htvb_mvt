# tests/serializers/test_outbound_action_serializers.py
from __future__ import annotations

from datetime import date
from types import SimpleNamespace
from typing import Any, Dict, Tuple

import pytest
from rest_framework.exceptions import ValidationError

import documents.serializers as doc_ser  # để monkeypatch outbound_svc ngay trong module này
from documents.serializers import (
    TouchDraftActionSerializer,
    SubmitActionSerializer,
    ReturnForFixActionSerializer,
    ApproveActionSerializer,
    SignActionSerializer,
    PublishActionSerializer,
    WithdrawPublishActionSerializer,
    ArchiveActionSerializer,
)
from workflow.services.errors import ServiceError  # dùng object thật để mapping đúng


def _ctx(user: Any = object()) -> Dict[str, Any]:
    # Chỉ cần context["request"].user
    return {"request": SimpleNamespace(user=user)}


class _Calls:
    """Thu thập tham số được truyền vào service stub."""
    args: Tuple[Any, ...]
    kw: Dict[str, Any]

    def __init__(self):
        self.args = ()         # KHÔNG dùng None -> tránh lỗi "None is not subscriptable"
        self.kw = {}           # KHÔNG dùng None

    def set(self, *a, **kw):
        self.args = a
        self.kw = kw
        # trả lại doc (arg thứ 2) để save() có thể trả về
        return a[1] if len(a) >= 2 else None


@pytest.fixture
def dummy_doc():
    # Đủ để serializer chuyển qua service; không cần model thực
    return SimpleNamespace(id=123)


def test_touch_draft_calls_service(monkeypatch, dummy_doc):
    calls = _Calls()
    outbound_ns = SimpleNamespace(touch_draft=lambda *a, **kw: calls.set(*a, **kw))
    monkeypatch.setattr(doc_ser, "outbound_svc", outbound_ns, raising=True)

    s = TouchDraftActionSerializer(instance=dummy_doc, data={"comment": "init"}, context=_ctx())
    assert s.is_valid(), s.errors
    res = s.save()

    assert isinstance(calls.args, tuple) and len(calls.args) >= 2
    assert calls.args[1] is dummy_doc  # user, doc, ...
    assert res is dummy_doc


def test_submit_calls_service(monkeypatch, dummy_doc):
    calls = _Calls()
    monkeypatch.setattr(
        doc_ser, "outbound_svc",
        SimpleNamespace(submit=lambda *a, **kw: calls.set(*a, **kw)),
        raising=True,
    )

    s = SubmitActionSerializer(instance=dummy_doc, data={"comment": "present"}, context=_ctx())
    assert s.is_valid(), s.errors
    s.save()

    assert isinstance(calls.args, tuple) and len(calls.args) >= 2
    assert calls.args[1] is dummy_doc


def test_return_for_fix_requires_comment():
    s = ReturnForFixActionSerializer(instance=SimpleNamespace(), data={}, context=_ctx())
    assert not s.is_valid()
    assert "comment" in s.errors


def test_return_for_fix_calls_service(monkeypatch, dummy_doc):
    calls = _Calls()
    monkeypatch.setattr(
        doc_ser, "outbound_svc",
        SimpleNamespace(return_for_fix=lambda *a, **kw: calls.set(*a, **kw)),
        raising=True,
    )

    s = ReturnForFixActionSerializer(instance=dummy_doc, data={"comment": "thiếu phụ lục"}, context=_ctx())
    assert s.is_valid(), s.errors
    s.save()

    kw = calls.kw
    assert kw.get("comment") == "thiếu phụ lục"


def test_approve_calls_service(monkeypatch, dummy_doc):
    calls = _Calls()
    monkeypatch.setattr(
        doc_ser, "outbound_svc",
        SimpleNamespace(approve=lambda *a, **kw: calls.set(*a, **kw)),
        raising=True,
    )

    s = ApproveActionSerializer(instance=dummy_doc, data={"comment": "ok"}, context=_ctx())
    assert s.is_valid(), s.errors
    s.save()

    kw = calls.kw
    assert kw.get("comment") == "ok"


def test_sign_validates_choice():
    s = SignActionSerializer(instance=SimpleNamespace(), data={"signing_method": "invalid"}, context=_ctx())
    assert not s.is_valid()
    assert "signing_method" in s.errors


def test_sign_calls_service(monkeypatch, dummy_doc):
    calls = _Calls()
    monkeypatch.setattr(
        doc_ser, "outbound_svc",
        SimpleNamespace(sign=lambda *a, **kw: calls.set(*a, **kw)),
        raising=True,
    )

    s = SignActionSerializer(
        instance=dummy_doc,
        data={"signing_method": "digital", "comment": "ký số", "meta": {"device": "token"}},
        context=_ctx(),
    )
    assert s.is_valid(), s.errors
    s.save()

    kw = calls.kw
    assert kw.get("signing_method") == "digital"
    assert kw.get("meta") == {"device": "token"}


def test_publish_calls_service_with_payload(monkeypatch, dummy_doc):
    calls = _Calls()
    monkeypatch.setattr(
        doc_ser, "outbound_svc",
        SimpleNamespace(publish=lambda *a, **kw: calls.set(*a, **kw)),
        raising=True,
    )

    s = PublishActionSerializer(
        instance=dummy_doc,
        data={
            "issue_number": "1234/UBND-VP",
            "issued_date": "2025-11-01",
            "channels": ["internal", "email"],
            "comment": "phát hành",
        },
        context=_ctx(),
    )
    assert s.is_valid(), s.errors
    s.save()

    kw = calls.kw
    assert kw.get("issue_number") == "1234/UBND-VP"
    assert isinstance(kw.get("issued_date"), date)
    assert kw.get("channels") == ["internal", "email"]


def test_publish_duplicate_issue_number_maps_field_error(monkeypatch, dummy_doc):
    def _raise_dup(*a, **kw):
        # Gây lỗi giống Service thật
        raise ServiceError(
            "Duplicate issue number",
            code="DUPLICATE_ISSUE_NUMBER",
            extra={"number": kw.get("issue_number")},
        )

    monkeypatch.setattr(doc_ser, "outbound_svc", SimpleNamespace(publish=_raise_dup), raising=True)

    s = PublishActionSerializer(
        instance=dummy_doc,
        data={"issue_number": "DUP/001", "issued_date": "2025-11-01"},
        context=_ctx(),
    )
    assert s.is_valid(), s.errors
    with pytest.raises(ValidationError) as ei:
        s.save()

    data = ei.value.detail
    assert "issue_number" in data  # Field-level error đúng mapping


def test_withdraw_publish_calls_service(monkeypatch, dummy_doc):
    calls = _Calls()
    monkeypatch.setattr(
        doc_ser, "outbound_svc",
        SimpleNamespace(withdraw_publish=lambda *a, **kw: calls.set(*a, **kw)),
        raising=True,
    )

    s = WithdrawPublishActionSerializer(instance=dummy_doc, data={"comment": "thu hồi"}, context=_ctx())
    assert s.is_valid(), s.errors
    s.save()

    kw = calls.kw
    assert kw.get("comment") == "thu hồi"


def test_archive_calls_service(monkeypatch, dummy_doc):
    calls = _Calls()
    monkeypatch.setattr(
        doc_ser, "outbound_svc",
        SimpleNamespace(archive=lambda *a, **kw: calls.set(*a, **kw)),
        raising=True,
    )

    s = ArchiveActionSerializer(instance=dummy_doc, data={"comment": "lưu trữ"}, context=_ctx())
    assert s.is_valid(), s.errors
    s.save()

    kw = calls.kw
    assert kw.get("comment") == "lưu trữ"
