# tests/views/test_permissions.py
from __future__ import annotations

import pytest
from django.urls import reverse, NoReverseMatch
from django.contrib.auth import get_user_model
from django.utils import timezone
from django.core.files.uploadedfile import SimpleUploadedFile

from documents import models as doc_models


# ------------------------- helpers -------------------------

def _safe_username(base: str = "u") -> str:
    """Cắt username theo max_length của model thực tế để tránh DataError."""
    User = get_user_model()
    try:
        max_len = User._meta.get_field("username").max_length  # type: ignore[attr-defined]
        if not max_len:
            max_len = 20
    except Exception:
        max_len = 20
    s = base or "u"
    return s[: max_len]

def _mk_user(username: str = "user") :
    User = get_user_model()
    uname = _safe_username(username)
    return User.objects.create_user(username=uname, password="x")

def _mk_outbound_doc(title: str = "Doc", creator=None):
    if creator is None:
        creator = _mk_user("creator")
    now = timezone.now()
    return doc_models.Document.objects.create(
        title=title,
        doc_direction="di",
        issue_number=f"ISS-{int(now.timestamp())}",
        issued_date=now.date(),
        created_by=creator,
    )

def _rev_with_pk_or_id(name: str, **kwargs) -> str:
    """Reverse URL, ưu tiên pk rồi fallback id (phù hợp lookup_field='id')."""
    try:
        return reverse(name, kwargs=kwargs)
    except NoReverseMatch:
        # nếu kwargs có pk -> đổi sang id
        if "pk" in kwargs:
            newk = dict(kwargs)
            newk["id"] = newk.pop("pk")
            return reverse(name, kwargs=newk)
        raise

# ---------------------------- tests ----------------------------

@pytest.mark.django_db
def test_rbac_forbidden_on_actions_without_permission_prod(settings, auth_client):
    """
    Prod path (TESTING=False): user không có quyền phải bị 403 ở các action:
    submit / approve / publish / return-for-fix.
    """
    # ---- Force 'prod path' ----
    settings.TESTING = False
    settings.ALLOW_JSON_UPLOAD_FALLBACK = False

    creator = _mk_user("creator_forbidden_flow")  # sẽ được cắt <= max_length
    doc = _mk_outbound_doc("Forbidden Flow", creator=creator)

    # các endpoint action
    url_submit = _rev_with_pk_or_id("outbound-docs-submit", pk=doc.pk)
    url_approve = _rev_with_pk_or_id("outbound-docs-approve", pk=doc.pk)
    url_publish = _rev_with_pk_or_id("outbound-docs-publish", pk=doc.pk)
    url_return_fix = _rev_with_pk_or_id("outbound-docs-return-for-fix", pk=doc.pk)

    # không có quyền -> 403
    r1 = auth_client.post(url_submit, {})
    r2 = auth_client.post(url_approve, {})
    r3 = auth_client.post(url_publish, {})
    r4 = auth_client.post(url_return_fix, {"comment": "fix please"})

    assert r1.status_code == 403
    assert r2.status_code == 403
    assert r3.status_code == 403
    assert r4.status_code == 403


@pytest.mark.django_db
def test_upload_invalid_extension_400_prod(settings, auth_client):
    """
    Upload phần mở rộng không cho phép -> 400 ở prod path.
    """
    settings.TESTING = False
    settings.ALLOW_JSON_UPLOAD_FALLBACK = False
    settings.DOCUMENTS_ALLOWED_EXT = [".pdf"]  # chỉ cho phép pdf

    doc = _mk_outbound_doc("BadExt")

    bad = SimpleUploadedFile(
        "malware.exe", b"MZ" + b"\x00" * 16, content_type="application/octet-stream"
    )
    url = _rev_with_pk_or_id("outbound-docs-attachments", pk=doc.pk)

    resp = auth_client.post(url, {"file": bad}, format="multipart")
    # multipart-only ở prod; view sẽ kiểm tra ext và trả 400
    assert resp.status_code == 400
    assert "Định dạng" in (resp.json().get("detail", "") or "")


@pytest.mark.django_db
def test_upload_oversize_400_prod(settings, auth_client):
    """
    Upload vượt quá DOCUMENTS_MAX_UPLOAD_SIZE_MB -> 400 ở prod path.
    """
    settings.TESTING = False
    settings.ALLOW_JSON_UPLOAD_FALLBACK = False
    settings.DOCUMENTS_MAX_UPLOAD_SIZE_MB = 1  # 1 MB

    doc = _mk_outbound_doc("TooBig")

    too_big = SimpleUploadedFile(
        "x.pdf",
        b"0" * (1 * 1024 * 1024 + 10),  # lớn hơn 1MB một chút
        content_type="application/pdf",
    )
    url = _rev_with_pk_or_id("outbound-docs-attachments", pk=doc.pk)

    resp = auth_client.post(url, {"file": too_big}, format="multipart")
    assert resp.status_code == 400
    assert "Kích thước" in (resp.json().get("detail", "") or "")


@pytest.mark.django_db
def test_delete_attachment_404_prod(settings, auth_client):
    """
    Xoá attachment không tồn tại -> 404 ở prod path.
    """
    settings.TESTING = False
    settings.ALLOW_JSON_UPLOAD_FALLBACK = False

    doc = _mk_outbound_doc("Del404")

    url = _rev_with_pk_or_id(
        "outbound-docs-delete-attachment",
        pk=doc.pk,
        attachment_id=999999,
    )
    resp = auth_client.delete(url)
    assert resp.status_code == 404
