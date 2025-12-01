# tests/test_rbac.py
from __future__ import annotations

from typing import Any, Optional
from uuid import uuid4
import pytest
from django.contrib.auth import get_user_model
from workflow.services.rbac import Act, can as rbac_can, get_single_role_code, Role as RBACRole
from documents.views_config import RegisterBookViewSet


def _extract_first_id(data: Any) -> Optional[int]:
    """
    Lấy id đầu tiên từ payload (hỗ trợ cả list và paginated dict).
    Ưu tiên key 'id', fallback 'case_id' nếu PK không tên 'id'.
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
            return data.get("id") or data.get("case_id")

        if items:
            obj = items[0]
            if isinstance(obj, dict):
                return obj.get("id") or obj.get("case_id")
        return None

    if isinstance(data, list) and data:
        obj = data[0]
        if isinstance(obj, dict):
            return obj.get("id") or obj.get("case_id")
    return None


@pytest.fixture
def auth_qt_seed(_client_auth_for_seed):
    return _client_auth_for_seed(
        role_name="QUAN_TRI",
        group_names=("QT", "QUẢN TRỊ"),
        username_candidates=("qt01", "qt_quantri", "quantri"),
    )


@pytest.mark.django_db
def test_requires_authentication(api):
    r = api.get("/api/v1/inbound-docs/")
    assert r.status_code in (401, 403)


@pytest.mark.django_db
def test_case_workflow_rest_disabled_for_cv(auth_cv_seed):
    """
    Workflow REST endpoints không còn phục vụ CV: assign bị gỡ, create REST trả 405.
    - Đăng nhập CV đã seed (cv01)
    - Lấy 1 case bất kỳ từ /api/v1/cases/
    - Gọi /api/v1/cases/{id}/assign/ và kỳ vọng 404/405
    """
    client = auth_cv_seed

    # Lấy 1 case bất kỳ
    list_resp = client.get("/api/v1/cases/")
    if list_resp.status_code != 200:
        pytest.skip(f"List cases trả về {list_resp.status_code}")
    case_id = _extract_first_id(list_resp.json())
    if not case_id:
        pytest.skip("Không tìm thấy hồ sơ (case) nào để test phân quyền.")

    # Thử gán phân công — endpoint REST đã gỡ bỏ
    resp = client.post(f"/api/v1/cases/{case_id}/assign/", {"assignee_id": 999999}, format="json")
    assert resp.status_code in (404, 405), f"Expected 404/405, got {resp.status_code}; body={getattr(resp, 'content', b'')!r}"

    # Create case qua REST cũng bị chặn (MVT-only)
    create_resp = client.post("/api/v1/cases/", {"title": "Should fail"}, format="json")
    assert create_resp.status_code == 405


@pytest.mark.django_db
def test_register_book_creation_requires_privileged_role():
    payload = {
        "name": "Sổ thử nghiệm",
        "direction": "den",
        "year": 2025,
        "padding": 4,
        "reset_policy": "yearly",
        "is_active": True,
    }

    User = get_user_model()
    cv_user = User.objects.get(username="cv01")
    vt_user = User.objects.get(username="vt01")
    assert not rbac_can(cv_user, Act.CONFIG_REGISTER_BOOK)
    assert rbac_can(vt_user, Act.CONFIG_REGISTER_BOOK)

    from accounts.models import Role, RbacPermission, RolePermission

    perm_id = RbacPermission.objects.filter(code="CONFIG.REGISTER_BOOK").values_list("permission_id", flat=True).first()
    roles_cv = list(Role.objects.filter(name__in=["CV", "CHUYEN_VIEN"]).values_list("role_id", "name"))
    role_perm_cv = list(
        RolePermission.objects.filter(role_id__in=[r[0] for r in roles_cv], permission_id=perm_id).values_list(
            "role_id", flat=True
        )
    )
    assert perm_id
    assert roles_cv
    assert not role_perm_cv

    from rest_framework.test import APIClient

    client = APIClient()
    client.force_authenticate(user=cv_user)
    resp_forbidden = client.post("/api/v1/register-books/", payload, format="json")
    assert resp_forbidden.status_code == 403

    client.force_authenticate(user=vt_user)
    resp_allowed = client.post("/api/v1/register-books/", payload, format="json")
    assert resp_allowed.status_code == 201, resp_allowed.content
    data = resp_allowed.json()
    assert data.get("register_id")


@pytest.mark.django_db
def test_workflow_transition_management_restricted():
    payload = {
        "module": "doc_in",
        "from_status": f"TEST_{uuid4().hex[:6]}",
        "to_status": f"NEXT_{uuid4().hex[:6]}",
        "allowed_roles": ["QT"],
        "allowed_permissions": ["DOC.IN.REGISTER"],
        "is_active": True,
    }

    User = get_user_model()
    vt_user = User.objects.get(username="vt01")
    qt_user = User.objects.get(username="qt01")

    from rest_framework.test import APIClient

    client = APIClient()
    client.force_authenticate(user=vt_user)
    resp_vt = client.post("/api/v1/workflow-transitions/", payload, format="json")
    assert resp_vt.status_code == 403

    client.force_authenticate(user=qt_user)
    resp_qt = client.post("/api/v1/workflow-transitions/", payload, format="json")
    assert resp_qt.status_code == 201, resp_qt.content
    data = resp_qt.json()
    assert data.get("transition_id")


@pytest.mark.django_db
@pytest.mark.parametrize(
    "role_name",
    [
        "Chuyên viên",
        "Chuyên - viên",
        " CHUYÊN  VIỆN ",
        "CHUYÊN.VIỆN",
    ],
)
def test_get_single_role_code_handles_accented_role_names(role_name):
    User = get_user_model()
    suffix = uuid4().hex[:6]
    user = User.objects.create_user(
        username=f"accent-{suffix}",
        password="pass123",
        email=f"accent-{suffix}@example.com",
    )
    from accounts.models import Role as AccountRole, UserRole

    role_obj, _ = AccountRole.objects.get_or_create(name=role_name)
    UserRole.objects.get_or_create(user=user, role=role_obj)

    assert get_single_role_code(user) == RBACRole.CV.value


@pytest.mark.django_db
def test_get_single_role_code_respects_group_names():
    User = get_user_model()
    suffix = uuid4().hex[:6]
    user = User.objects.create_user(
        username=f"group-role-{suffix}",
        password="pass123",
        email=f"group-role-{suffix}@example.com",
    )
    from django.contrib.auth.models import Group

    group, _ = Group.objects.get_or_create(name="Chuyên viên")
    user.groups.add(group)

    assert get_single_role_code(user) == RBACRole.CV.value
