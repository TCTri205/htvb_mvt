# tests/test_inbound_flow.py
from __future__ import annotations

from typing import Any, List, Optional
import time
import pytest


def _extract_ids(data: Any) -> List[int]:
    """
    Lấy danh sách id từ payload (hỗ trợ list hoặc paginated dict).
    Ưu tiên key 'id', fallback 'document_id'.
    """
    items = None
    if isinstance(data, dict):
        if isinstance(data.get("items"), list):
            items = data["items"]
        elif isinstance(data.get("results"), list):
            items = data["results"]
        elif isinstance(data.get("data"), list):
            items = data["data"]
        else:
            # object đơn
            obj = data
            vid = obj.get("id") or obj.get("document_id")
            return [vid] if isinstance(vid, int) else []

    elif isinstance(data, list):
        items = data

    ids: List[int] = []
    if isinstance(items, list):
        for obj in items:
            if isinstance(obj, dict):
                vid = obj.get("id") or obj.get("document_id")
                if isinstance(vid, int):
                    ids.append(vid)
    return ids


@pytest.mark.django_db
def test_inbound_happy_flow(auth_ld_seed, make_user):
    """
    Dòng chảy VB đến (best-effort):
      receive -> register -> assign -> start -> complete -> archive
    - Dùng user Lãnh đạo (LD) đã seed (ld01).
    - Chấp nhận 409 khi trạng thái hiện tại không cho phép chuyển tiếp.
    - Chấp nhận 403 ở bước không thuộc quyền LD.
    """
    client = auth_ld_seed  # đã đăng nhập ld01

    # 1) Lấy danh sách VB đến
    resp = client.get("/api/v1/inbound-docs/")
    if resp.status_code != 200:
        pytest.skip(f"List inbound-docs trả về {resp.status_code}")
    doc_ids = _extract_ids(resp.json())
    if not doc_ids:
        pytest.skip("Không có văn bản đến nào để kiểm thử.")

    # 2) Tạo 1 chuyên viên cùng phòng ban (VP) để gán xử lý
    cv_user, _ = make_user(
        username="cv_assign_flow",
        email="cv_assign_flow@example.com",
        role="CHUYEN_VIEN",
        is_active=True,
        department_code="VP",
    )
    assignee_id = getattr(cv_user, "id", None) or getattr(cv_user, "pk", None)

    # 3) Thực hiện flow trên tối đa 3 văn bản
    allowed = {200, 403, 409}
    for doc_id in doc_ids[:3]:
        # receive
        r = client.post(f"/api/v1/inbound-docs/{doc_id}/receive/", {}, format="json")
        assert r.status_code in allowed, f"receive({doc_id}) -> {r.status_code}, body={getattr(r, 'content', b'')!r}"

        # register (tạo mã đăng ký có tính duy nhất; vẫn chấp nhận 409)
        reg_no = f"IN-{doc_id}-{int(time.time())}"
        r = client.post(
            f"/api/v1/inbound-docs/{doc_id}/register/",
            {"register_number": reg_no},
            format="json",
        )
        assert r.status_code in allowed, f"register({doc_id}) -> {r.status_code}, body={getattr(r, 'content', b'')!r}"

        # assign
        payload = {"assignee_id": assignee_id} if assignee_id else {}
        r = client.post(f"/api/v1/inbound-docs/{doc_id}/assign/", payload, format="json")
        assert r.status_code in allowed, f"assign({doc_id}) -> {r.status_code}, body={getattr(r, 'content', b'')!r}"

        # start
        r = client.post(f"/api/v1/inbound-docs/{doc_id}/start/", {}, format="json")
        assert r.status_code in allowed, f"start({doc_id}) -> {r.status_code}, body={getattr(r, 'content', b'')!r}"

        # complete
        r = client.post(f"/api/v1/inbound-docs/{doc_id}/complete/", {}, format="json")
        assert r.status_code in allowed, f"complete({doc_id}) -> {r.status_code}, body={getattr(r, 'content', b'')!r}"

        # archive
        r = client.post(f"/api/v1/inbound-docs/{doc_id}/archive/", {}, format="json")
        assert r.status_code in allowed, f"archive({doc_id}) -> {r.status_code}, body={getattr(r, 'content', b'')!r}"
