# tests/views/test_outbound_views.py
import pytest
from django.core.files.uploadedfile import SimpleUploadedFile

from documents.permissions import Act
from documents import views_outbound as outbound_views


class DummyDoc:
    def __init__(self, pk: int = 123):
        self.id = pk
        self.doc_direction = "di"

        class _Q:
            def first(self):  # dùng "self" đúng chuẩn để Pylance không cảnh báo
                return None

        class _Attachments:
            def filter(self, id):
                return _Q()

            def order_by(self, *args):
                return []

        self.attachments = _Attachments()


@pytest.mark.django_db
def test_list_pagination_structure(auth_client, monkeypatch):
    # Trả về QuerySet rỗng để test khung pagination
    from documents.models import Document

    monkeypatch.setattr(
        outbound_views.OutboundDocumentViewSet,
        "get_queryset",
        lambda self: Document.objects.none(),
    )

    resp = auth_client.get("/api/v1/outbound-docs/?page=1&page_size=20")
    assert resp.status_code == 200
    body = resp.json()
    assert {"items", "total_items", "total_pages", "page", "page_size"} <= set(body.keys())
    assert body["items"] == []


@pytest.mark.django_db
def test_submit_calls_serializer_save(auth_client, monkeypatch):
    monkeypatch.setattr(
        outbound_views.OutboundDocumentViewSet, "get_object", lambda self: DummyDoc()
    )

    class _Ser:
        def __init__(self, *a, **kw):
            pass

        def is_valid(self, raise_exception=False):
            return True

        def save(self):
            return None

    monkeypatch.setattr(outbound_views, "SubmitActionSerializer", _Ser)

    resp = auth_client.post(
        "/api/v1/outbound-docs/123/submit/", data={"comment": "ok"}, format="json"
    )
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


@pytest.mark.django_db
def test_publish_maps_service_error_to_field_error(auth_client, monkeypatch):
    monkeypatch.setattr(
        outbound_views.OutboundDocumentViewSet, "get_object", lambda self: DummyDoc()
    )

    class _E(Exception):
        detail = "Số văn bản đã tồn tại"
        code = "DUPLICATE_ISSUE_NUMBER"
        field = "issue_number"
        extra = {"dup": True}

    class _Ser:
        def __init__(self, *a, **kw):
            pass

        def is_valid(self, raise_exception=False):
            return True

        def save(self):
            raise _E()

    monkeypatch.setattr(outbound_views, "PublishActionSerializer", _Ser)

    resp = auth_client.post(
        "/api/v1/outbound-docs/1/publish/",
        data={"issue_number": "12/UBND"},
        format="json",
    )
    assert resp.status_code == 400
    body = resp.json()
    assert "issue_number" in body
    assert body["issue_number"][0]["code"] == "DUPLICATE_ISSUE_NUMBER"


@pytest.mark.django_db
def test_sign_permission_mapping_uses_act_out_sign(auth_client, monkeypatch):
    # Kiểm tra mapping RBAC: sign → Act.OUT_SIGN
    called = {"act": None, "obj": None}

    from workflow.services import rbac

    def _fake_can(user, act, obj):
        called["act"] = act
        called["obj"] = obj
        return True

    monkeypatch.setattr(rbac, "can", _fake_can)
    monkeypatch.setattr(
        outbound_views.OutboundDocumentViewSet, "get_object", lambda self: DummyDoc()
    )

    class _Ser:
        def __init__(self, *a, **kw):
            pass

        def is_valid(self, raise_exception=False):
            return True

        def save(self):
            return None

    monkeypatch.setattr(outbound_views, "SignActionSerializer", _Ser)

    resp = auth_client.post(
        "/api/v1/outbound-docs/99/sign/", data={"signing_method": "digital"}, format="json"
    )
    assert resp.status_code == 200
    assert called["act"] == Act.OUT_SIGN
    assert isinstance(called["obj"], DummyDoc)


@pytest.mark.django_db
def test_upload_attachment_ok(auth_client, monkeypatch):
    monkeypatch.setattr(
        outbound_views.OutboundDocumentViewSet, "get_object", lambda self: DummyDoc()
    )

    # Tránh tạo model thật
    class _Attachment:
        id = 7
        file_name = "x.pdf"
        size = 12
        created_at = None

        class _F:
            url = "/media/x.pdf"

        file = _F()

    from documents import models as doc_models

    monkeypatch.setattr(
        doc_models.DocumentAttachment.objects, "create", lambda **kw: _Attachment()
    )

    class _Ser:
        def __init__(self, obj, many=False):
            self.obj = obj

        @property
        def data(self):
            return {
                "id": self.obj.id,
                "file_name": self.obj.file_name,
                "size": self.obj.size,
                "file_url": self.obj.file.url,
            }

    monkeypatch.setattr(outbound_views, "DocumentAttachmentSerializer", _Ser)

    f = SimpleUploadedFile(
        "x.pdf", b"%PDF-1.4\n...", content_type="application/pdf"
    )
    resp = auth_client.post(
        "/api/v1/outbound-docs/1/attachments/", data={"file": f}
    )
    print(resp.status_code, resp["content-type"], resp.content)
    assert resp.status_code == 200
    assert resp.json()["file_url"] == "/media/x.pdf"


@pytest.mark.django_db
def test_delete_attachment_404_when_not_found(auth_client, monkeypatch):
    monkeypatch.setattr(
        outbound_views.OutboundDocumentViewSet, "get_object", lambda self: DummyDoc()
    )
    resp = auth_client.delete("/api/v1/outbound-docs/1/attachments/999/")
    assert resp.status_code == 404
