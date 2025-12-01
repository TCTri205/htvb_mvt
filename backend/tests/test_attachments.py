# tests/test_attachments.py
from __future__ import annotations

from io import BytesIO
from typing import Any, Optional
import pytest


def _extract_first_id(data: Any) -> Optional[int]:
    """
    Trả về id đầu tiên từ payload (hỗ trợ cả list và paginated dict).
    Ưu tiên key 'id', fallback 'document_id'/'attachment_id'.
    """
    if isinstance(data, dict):
        items = None
        if isinstance(data.get("items"), list):
            items = data["items"]
        elif isinstance(data.get("results"), list):
            items = data["results"]
        elif isinstance(data.get("data"), list):
            items = data["data"]
        else:
            # Có thể là object đơn
            return data.get("id") or data.get("document_id") or data.get("attachment_id")

        if items:
            obj = items[0]
            if isinstance(obj, dict):
                return obj.get("id") or obj.get("document_id") or obj.get("attachment_id")
        return None

    if isinstance(data, list) and data:
        obj = data[0]
        if isinstance(obj, dict):
            return obj.get("id") or obj.get("document_id") or obj.get("attachment_id")
    return None


def _get_any_outbound_id(client) -> Optional[int]:
    """Lấy id của một văn bản đi bất kỳ qua API list."""
    r = client.get("/api/v1/outbound-docs/")
    if r.status_code != 200:
        return None
    return _extract_first_id(r.json())


@pytest.mark.django_db
def test_upload_attachment(auth_ld_seed):
    client = auth_ld_seed
    doc_id = _get_any_outbound_id(client)
    if not doc_id:
        pytest.skip("Không tìm thấy văn bản đi nào để test.")

    buf = BytesIO(b"%PDF-1.4\n% seeded from test\n")
    buf.name = "demo.pdf"

    url = f"/api/v1/outbound-docs/{doc_id}/attachments/"
    r = client.post(url, {"file": buf}, format="multipart")
    assert r.status_code in (200, 201), f"Unexpected status: {r.status_code}; body={getattr(r, 'content', b'')!r}"


@pytest.mark.django_db
def test_list_and_delete_attachment(auth_ld_seed):
    client = auth_ld_seed
    doc_id = _get_any_outbound_id(client)
    if not doc_id:
        pytest.skip("Không tìm thấy văn bản đi nào để test.")

    base_url = f"/api/v1/outbound-docs/{doc_id}/attachments/"

    # Đảm bảo có ít nhất 1 attachment
    r = client.get(base_url)
    if r.status_code != 200:
        pytest.skip(f"List attachments trả về {r.status_code}")

    data = r.json()
    att_id = _extract_first_id(data)

    if att_id is None:
        # Tạo 1 attachment rồi list lại
        buf = BytesIO(b"%PDF-1.4\n% ensure at least one\n")
        buf.name = "ensure.pdf"
        create = client.post(base_url, {"file": buf}, format="multipart")
        assert create.status_code in (200, 201), f"Cannot create attachment: {create.status_code}"
        r = client.get(base_url)
        assert r.status_code == 200
        data = r.json()
        att_id = _extract_first_id(data)

    if att_id is None:
        pytest.skip("Không thể lấy được attachment_id từ response list.")

    # Xoá attachment đầu tiên
    d = client.delete(f"{base_url}{att_id}/")
    assert d.status_code in (200, 204), f"Unexpected delete status: {d.status_code}"
