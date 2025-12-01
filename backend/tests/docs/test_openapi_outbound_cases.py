import pytest
from django.urls import reverse


def _load_spec_json(client):
    url = reverse("schema")  # /api/schema/
    res = client.get(url + "?format=json")
    assert res.status_code == 200
    spec = res.json()
    assert isinstance(spec, dict)
    return spec


def _find_path(paths_dict, target_suffixes):
    """
    Tìm path trong spec.paths khớp 1 trong các hậu tố target_suffixes.
    Trả về chuỗi path hoặc None nếu không tìm thấy.
    """
    for p in paths_dict.keys():
        pr = p.rstrip("/")
        for suf in target_suffixes:
            if pr.endswith(suf.rstrip("/")):
                return p
    return None


def _extract_paged_props_for_200(spec, get_op):
    """
    Lấy schema properties cho response 200 application/json và trả về dict properties.
    Hỗ trợ cả $ref sang components.schemas.*
    """
    if not isinstance(get_op, dict):
        return None

    responses = get_op.get("responses") or {}
    resp200 = responses.get("200") or {}
    content = resp200.get("content") or {}
    app_json_schema = None
    for ct in ("application/json", "application/vnd.api+json"):
        if ct in content:
            schema = content[ct].get("schema")
            if schema:
                app_json_schema = schema
                break
    if not isinstance(app_json_schema, dict):
        return None

    # Resolve $ref nếu có
    if "$ref" in app_json_schema:
        ref = app_json_schema["$ref"]
        if isinstance(ref, str) and ref.startswith("#/components/schemas/"):
            comp_name = ref.split("/")[-1]
            comp = ((spec.get("components") or {}).get("schemas") or {}).get(comp_name)
            if isinstance(comp, dict):
                return comp.get("properties") or {}
        return None

    return app_json_schema.get("properties") or {}


@pytest.mark.django_db
def test_openapi_outbound_list_tag_and_paging(client):
    """
    /api/v1/outbound-docs/ phải có GET list, có tag hợp lệ, và schema 200 có envelope mới.
    """
    spec = _load_spec_json(client)
    paths = spec.get("paths") or {}
    outbound_path = _find_path(paths, ["/api/v1/outbound-docs/"])

    if not outbound_path:
        pytest.skip("Outbound routes are not present in the schema yet.")

    get_op = (paths.get(outbound_path) or {}).get("get")
    assert isinstance(get_op, dict), "GET operation missing for outbound-docs."

    # Tag hiển thị (VN/EN tuỳ cấu hình)
    tags = get_op.get("tags") or []
    assert isinstance(tags, list)
    assert any(t in ("Văn bản đi", "Outbound Documents") for t in tags), f"Unexpected tags for outbound: {tags}"

    # Kiểm tra schema 200 có envelope mới
    props = _extract_paged_props_for_200(spec, get_op)
    required = {"items", "total_items", "total_pages", "page", "page_size"}
    assert isinstance(props, dict) and required.issubset(props), (
        "Paged schema for outbound must expose the contract envelope fields."
    )


@pytest.mark.django_db
def test_openapi_cases_list_tag_and_paging(client):
    """
    /api/v1/cases/ phải có GET list, có tag hợp lệ, và schema 200 có envelope mới.
    """
    spec = _load_spec_json(client)
    paths = spec.get("paths") or {}
    cases_path = _find_path(paths, ["/api/v1/cases/"])

    if not cases_path:
        pytest.skip("Cases routes are not present in the schema yet.")

    get_op = (paths.get(cases_path) or {}).get("get")
    assert isinstance(get_op, dict), "GET operation missing for cases."

    # Tag hiển thị (VN/EN tuỳ cấu hình). Với code hiện tại: "Hồ sơ".
    tags = get_op.get("tags") or []
    assert isinstance(tags, list)
    assert any(t in ("Hồ sơ", "Cases") for t in tags), f"Unexpected tags for cases: {tags}"

    # Kiểm tra schema 200 có envelope mới
    props = _extract_paged_props_for_200(spec, get_op)
    required = {"items", "total_items", "total_pages", "page", "page_size"}
    assert isinstance(props, dict) and required.issubset(props), (
        "Paged schema for cases must expose the contract envelope fields."
    )
