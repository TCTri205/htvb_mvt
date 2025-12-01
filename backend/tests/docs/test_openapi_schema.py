# tests/docs/test_openapi_schema.py
import pytest
from django.core.management import call_command
from django.urls import reverse


@pytest.mark.django_db
def test_openapi_schema_json_core_sections(client):
    """
    /api/v1/schema/?format=json phải trả về OpenAPI hợp lệ tối thiểu:
    - openapi, paths, components
    """
    url = reverse("schema")  # /api/v1/schema/
    res = client.get(url + "?format=json")
    assert res.status_code == 200

    spec = res.json()
    assert isinstance(spec, dict)
    assert "openapi" in spec
    assert "paths" in spec and isinstance(spec["paths"], dict)
    assert "components" in spec and isinstance(spec["components"], dict)


@pytest.mark.django_db
def test_openapi_auth_and_security(client):
    """
    Các endpoint JWT & /me phải có mặt, và BearerAuth phải được công bố trong components.securitySchemes.
    """
    url = reverse("schema")
    res = client.get(url + "?format=json")
    assert res.status_code == 200
    spec = res.json()

    paths = spec.get("paths", {})
    assert "/api/v1/auth/jwt/create/" in paths
    assert "/api/v1/auth/jwt/refresh/" in paths
    assert "/api/v1/auth/jwt/verify/" in paths
    assert "/api/v1/auth/me/" in paths

    # Kiểm tra security scheme BearerAuth
    components = spec.get("components", {})
    security_schemes = components.get("securitySchemes", {})
    assert "BearerAuth" in security_schemes

    # Bảo vệ: security global có thể là [] hoặc danh sách rule
    assert isinstance(spec.get("security", []), list)


@pytest.mark.django_db
def test_openapi_inbound_list_tag_and_paging(client):
    """
    Nếu đã đăng ký route inbound, kiểm tra:
    - Có GET (list)
    - Có tag phù hợp
    - Response 200 dùng envelope phân trang chuẩn (items/total_items/...)
    """
    url = reverse("schema")
    res = client.get(url + "?format=json")
    assert res.status_code == 200
    spec = res.json()

    paths = spec.get("paths", {})
    inbound_path = None
    for p in paths.keys():
        if p == "/api/v1/inbound-docs/" or p.rstrip("/").endswith("/api/v1/inbound-docs"):
            inbound_path = p
            break

    if not inbound_path:
        pytest.skip("Inbound routes are not present in the schema yet.")

    get_op = paths[inbound_path].get("get")
    assert get_op is not None

    # Tag hiển thị (VN hoặc EN tuỳ cấu hình)
    tags = get_op.get("tags", [])
    assert any(t in ("Văn bản đến", "Inbound Documents") for t in tags)

    # Lấy schema của 200 -> application/json
    resp200 = get_op.get("responses", {}).get("200", {})
    content = resp200.get("content", {})
    app_json_schema = None
    for ct in ("application/json", "application/vnd.api+json"):
        if ct in content:
            app_json_schema = content[ct].get("schema")
            break
    assert app_json_schema is not None

    # Nếu là $ref -> resolve đến component; ngược lại lấy properties trực tiếp
    if "$ref" in app_json_schema:
        comp_name = app_json_schema["$ref"].split("/")[-1]
        comp = spec["components"]["schemas"][comp_name]
        props = comp.get("properties", {})
    else:
        props = app_json_schema.get("properties", {})

    required = {"items", "total_items", "total_pages", "page", "page_size"}
    assert required.issubset(props.keys())


@pytest.mark.django_db
def test_export_openapi_command_writes_files(tmp_path):
    """
    Lệnh management export_openapi phải ghi được file YAML,
    và khi có --json thì ghi thêm file JSON.
    """
    out_yaml = tmp_path / "openapi.yaml"

    # Ghi YAML
    call_command("export_openapi", "--out", str(out_yaml))
    assert out_yaml.exists() and out_yaml.stat().st_size > 0

    # Ghi thêm JSON
    call_command("export_openapi", "--out", str(out_yaml), "--json")
    out_json = out_yaml.with_suffix(".json")
    assert out_json.exists() and out_json.stat().st_size > 0
