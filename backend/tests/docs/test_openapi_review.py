# tests/docs/test_openapi_review.py
from __future__ import annotations

from typing import Any, Dict, Iterable, Optional, Tuple
import pytest
from django.urls import reverse, NoReverseMatch


def _reverse_schema_url() -> str:
    """
    Cố gắng reverse tên route schema phổ biến; fallback sang '/api/schema/' nếu cần.
    """
    for name in ("schema", "spectacular-json"):
        try:
            return reverse(name)
        except NoReverseMatch:
            continue
    return "/api/schema/"


def _get_spec(client) -> Dict[str, Any]:
    url = _reverse_schema_url()
    res = client.get(url + "?format=json")
    assert res.status_code == 200, f"Cannot GET schema JSON: {res.status_code}"
    data = res.json()
    assert isinstance(data, dict), "Schema JSON phải là dict"
    return data


def _iter_operations(paths_obj: Dict[str, Any]) -> Iterable[Tuple[str, str, Dict[str, Any]]]:
    """
    Yield (path, method, operation) for every HTTP operation in spec['paths'].
    """
    for p, item in paths_obj.items():
        if not isinstance(item, dict):
            continue
        for m, op in item.items():
            if m.lower() in {"get", "post", "put", "patch", "delete"} and isinstance(op, dict):
                yield p, m.lower(), op


def _find_path_endswith(
    paths_obj: Dict[str, Any],
    suffixes: Iterable[str],
) -> Tuple[Optional[str], Optional[Dict[str, Any]]]:
    """
    Tìm path có đuôi khớp với 1 trong các suffix (ưu tiên khớp đầu tiên),
    trả về (path, path_item).
    """
    for s in suffixes:
        for p, item in paths_obj.items():
            if isinstance(p, str) and p.endswith(s):
                return p, item if isinstance(item, dict) else None
    return None, None


def _resolve_schema_ref(spec: Dict[str, Any], schema: Any) -> Optional[Dict[str, Any]]:
    """
    Nếu schema là $ref, trả về schema đã resolve; nếu không, trả về chính nó (nếu là dict).
    """
    if not isinstance(schema, dict):
        return None
    if "$ref" in schema:
        comp_name = schema["$ref"].split("/")[-1]
        return spec.get("components", {}).get("schemas", {}).get(comp_name) or {}
    return schema


@pytest.mark.django_db
def test_tags_and_unique_operation_ids(client):
    """
    1) Tag chuẩn hóa: phải có 'Auth' và tag cho Inbound ('Văn bản đến' hoặc 'Inbound Documents')
    2) operationId phải là duy nhất.
    """
    spec = _get_spec(client)
    paths = spec.get("paths", {}) or {}

    all_tags = set()
    op_ids = []
    for _, _, op in _iter_operations(paths):
        tags = op.get("tags", []) or []
        for t in tags:
            all_tags.add(t)
        oid = op.get("operationId")
        if oid:
            op_ids.append(oid)

    assert "Auth" in all_tags, "Thiếu tag Auth"
    assert any(t in all_tags for t in ("Văn bản đến", "Inbound Documents")), "Thiếu tag cho Inbound Documents"

    # operationId duy nhất
    assert len(op_ids) == len(set(op_ids)), "operationId bị trùng lặp"


@pytest.mark.django_db
def test_inbound_actions_docs_have_403_and_assign_requires_assignees_or_assignee_id(client):
    """
    - Một action Inbound phải có response 403 (RBAC thiếu quyền).
    - Action 'assign' nếu tồn tại phải có requestBody yêu cầu 'assignees' hoặc 'assignee_id'.
      (Dự án có thể dùng danh sách hoặc 1 id đơn.)
    """
    spec = _get_spec(client)
    paths: Dict[str, Any] = spec.get("paths", {}) or {}

    # Tìm một action Inbound
    # Ưu tiên 'assign', sau đó đến 'start', 'register', 'complete', 'archive', 'withdraw'
    action_suffixes = [
        "/api/v1/inbound-docs/{id}/assign/",
        "/api/v1/inbound-docs/{id}/start/",
        "/api/v1/inbound-docs/{id}/register/",
        "/api/v1/inbound-docs/{id}/complete/",
        "/api/v1/inbound-docs/{id}/archive/",
        "/api/v1/inbound-docs/{id}/withdraw/",
        # fallback không slash
        "/api/v1/inbound-docs/{id}/assign",
        "/api/v1/inbound-docs/{id}/start",
        "/api/v1/inbound-docs/{id}/register",
        "/api/v1/inbound-docs/{id}/complete",
        "/api/v1/inbound-docs/{id}/archive",
        "/api/v1/inbound-docs/{id}/withdraw",
    ]
    action_path, action_item = _find_path_endswith(paths, action_suffixes)
    if not action_path:
        pytest.skip("Chưa có action Inbound trong schema.")

    assert isinstance(action_item, dict), f"Path item for {action_path} phải là object"

    post_op = action_item.get("post")
    assert isinstance(post_op, dict), f"{action_path} không có POST"

    # Kiểm tra có response 403
    responses = post_op.get("responses", {}) or {}
    assert "403" in responses, f"{action_path} phải thể hiện 403 trong docs (RBAC thiếu quyền)."

    # Nếu là assign, kiểm tra request body yêu cầu field hợp lệ
    if action_path.endswith("/assign/") or action_path.endswith("/assign"):
        rb = post_op.get("requestBody", {}) or {}
        content = rb.get("content", {}) or {}
        schema = None
        for ct in ("application/json", "application/x-www-form-urlencoded", "multipart/form-data"):
            if ct in content:
                schema = content[ct].get("schema")
                if schema:
                    break
        assert schema, "Assign phải có requestBody schema"

        schema = _resolve_schema_ref(spec, schema)
        assert isinstance(schema, dict), "Assign requestBody schema không hợp lệ"

        required = set(schema.get("required", []) or [])
        has_assignees = "assignees" in required
        has_assignee_id = "assignee_id" in required
        assert (has_assignees or has_assignee_id), "Assign phải yêu cầu 'assignees' hoặc 'assignee_id' trong request."


@pytest.mark.django_db
def test_inbound_list_paging_fields(client):
    """
    List Inbound phải là paging schema gồm đủ các trường trong envelope contract mới.
    """
    spec = _get_spec(client)
    paths: Dict[str, Any] = spec.get("paths", {}) or {}

    # Tìm path list inbound
    list_suffixes = ["/api/v1/inbound-docs/", "/api/v1/inbound-docs"]
    list_path, list_item = _find_path_endswith(paths, list_suffixes)
    if not list_path:
        pytest.skip("Chưa có route list Inbound trong schema.")

    assert isinstance(list_item, dict), f"Path item for {list_path} phải là object"

    get_op = list_item.get("get")
    assert isinstance(get_op, dict), "List Inbound phải có GET"

    resp200 = get_op.get("responses", {}).get("200", {}) or {}
    content = resp200.get("content", {}) or {}
    schema = None
    for ct in ("application/json", "application/vnd.api+json"):
        if ct in content:
            schema = content[ct].get("schema")
            if schema:
                break
    assert schema, "List Inbound 200 phải có schema"

    schema = _resolve_schema_ref(spec, schema)
    assert isinstance(schema, dict), "List Inbound 200 schema không hợp lệ"

    props = schema.get("properties", {}) or {}
    for key in ("items", "total_items", "total_pages", "page", "page_size"):
        assert key in props, f"Paging schema thiếu trường '{key}'"


@pytest.mark.django_db
def test_auth_endpoints_have_auth_tag_and_operation_id(client):
    """
    Các endpoint /auth/jwt/* và /auth/me phải có tag 'Auth' và có operationId.
    """
    spec = _get_spec(client)
    paths: Dict[str, Any] = spec.get("paths", {}) or {}

    required_paths = [
        "/api/v1/auth/jwt/create/",
        "/api/v1/auth/jwt/refresh/",
        "/api/v1/auth/jwt/verify/",
        "/api/v1/auth/me/",
    ]

    for p in required_paths:
        assert p in paths, f"Thiếu path {p}"
        item = paths.get(p) if isinstance(paths, dict) else None
        assert isinstance(item, dict), f"{p} path item không hợp lệ"

        # Lấy 1 method đầu tiên (create/refresh/verify là POST; me là GET)
        op = item.get("post") or item.get("get")
        assert isinstance(op, dict), f"{p} không có operation"
        assert "Auth" in (op.get("tags") or []), f"{p} thiếu tag 'Auth'"
        assert op.get("operationId"), f"{p} thiếu operationId"


@pytest.mark.django_db
def test_servers_metadata_optional(client):
    """
    Nếu spec có 'servers' thì phải có danh sách chứa các object có 'url'.
    (Không bắt buộc phải có servers; test này chỉ đảm bảo tính hợp lệ nếu có.)
    """
    spec = _get_spec(client)
    servers = spec.get("servers")
    if servers is None:
        pytest.skip("Spec không khai báo 'servers' (chấp nhận được).")
    assert isinstance(servers, list) and len(servers) > 0, "'servers' phải là list không rỗng"
    assert all(isinstance(s, dict) and "url" in s for s in servers), "'servers' phải là các object có 'url'"
