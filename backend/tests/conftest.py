# tests/conftest.py
from __future__ import annotations

from typing import Any, Callable, Dict, Iterable, Optional
import pytest


# ============================================================
# Seed vào TEST DB ngay khi pytest khởi động (idempotent)
# ============================================================
@pytest.fixture(scope="session", autouse=True)
def _seed_minimal_data(django_db_setup, django_db_blocker):
    """
    Đảm bảo test DB có sẵn:
      - Departments + Users (ld01/cv01/vt01/qt01 nếu command tạo)
      - Documents inbound/outbound + attachments
      - Ít nhất 1 Case
    Gọi management commands theo cách idempotent.
    """
    with django_db_blocker.unblock():
        from django.core.management import call_command
        # Nếu command không tồn tại hoặc model lệch schema → bỏ qua để không chặn test
        try:
            call_command("seed_accounts", verbosity=0)
        except Exception:
            pass
        try:
            call_command("seed_docs_cases", verbosity=0)
        except Exception:
            pass


# ============================================================
# API clients & user factories
# ============================================================
@pytest.fixture
def api(db) -> Any:
    """API client chưa xác thực."""
    from rest_framework.test import APIClient  # lazy import
    return APIClient()


@pytest.fixture
def api_client(api) -> Any:
    """Alias tiện dụng."""
    return api


@pytest.fixture
def make_user(db, django_user_model) -> Callable[..., Any]:
    """
    Factory tạo user linh hoạt.
    Lưu ý:
      - Không truyền trực tiếp 'role' vào create_user (tránh TypeError).
      - Có thể truyền department_code hoặc department (obj) nếu User có field 'department'.
    """
    def _make_user(
        username: str = "test_user",
        password: str = "test_password",
        **extra: Any,
    ):
        role = extra.pop("role", None)
        dept_code = extra.pop("department_code", None)
        dept_obj = extra.pop("department", None)

        user_field_names = {f.name for f in django_user_model._meta.get_fields()}
        safe_extra: Dict[str, Any] = {k: v for k, v in extra.items() if k in user_field_names}

        user = django_user_model.objects.create_user(
            username=username,
            password=password,
            **safe_extra,
        )

        # set department nếu có
        try:
            if "department" in user_field_names:
                if dept_obj is not None:
                    setattr(user, "department", dept_obj)
                    user.save(update_fields=["department"])
                elif dept_code is not None:
                    try:
                        from accounts.models import Department  # lazy
                        if hasattr(Department, "department_code"):
                            dep = Department.objects.filter(department_code=dept_code).first()
                        elif hasattr(Department, "code"):
                            dep = Department.objects.filter(code=dept_code).first()
                        else:
                            dep = None
                        if dep is not None:
                            setattr(user, "department", dep)
                            user.save(update_fields=["department"])
                    except Exception:
                        pass
        except Exception:
            pass

        # gán role qua Role/UserRole nếu có; fallback Group
        if role:
            try:
                from accounts.models import Role, UserRole  # lazy
                role_obj, _ = Role.objects.get_or_create(name=role)
                UserRole.objects.get_or_create(user=user, role=role_obj)
            except Exception:
                try:
                    from django.contrib.auth.models import Group  # lazy
                    ROLE_TO_GROUP = {
                        "LANH_DAO": "LD",
                        "CHUYEN_VIEN": "CV",
                        "VAN_THU": "VT",
                        "QUAN_TRI": "QT",
                    }
                    gname = ROLE_TO_GROUP.get(str(role))
                    if gname:
                        grp, _ = Group.objects.get_or_create(name=gname)
                        user.groups.add(grp)
                except Exception:
                    pass

        return user, password

    return _make_user


@pytest.fixture
def jwt_for(db) -> Callable[[Any], str]:
    def _jwt_for(user: Any) -> str:
        from rest_framework_simplejwt.tokens import RefreshToken  # lazy
        return str(RefreshToken.for_user(user).access_token)
    return _jwt_for


@pytest.fixture
def auth_client(db, django_user_model) -> Any:
    from rest_framework.test import APIClient  # lazy

    user = django_user_model.objects.create_user(
        username="auth_user",
        password="test_password",
        email="auth@example.com",
        is_active=True,
    )
    client = APIClient()

    try:
        from rest_framework_simplejwt.tokens import RefreshToken  # type: ignore
        access = str(RefreshToken.for_user(user).access_token)
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
    except Exception:
        client.force_authenticate(user=user)

    return client


@pytest.fixture
def client_with_user(api, make_user, jwt_for) -> Callable[..., Any]:
    def _client_with_user(**kwargs: Any):
        user, _ = make_user(**kwargs)
        role_name = str(kwargs.get("role", "")).upper()
        if role_name in {"LANH_DAO", "LD"}:
            try:
                from django.contrib.auth.models import Group  # lazy import
                grp, _ = Group.objects.get_or_create(name="LD")
                user.groups.add(grp)
            except Exception:
                pass
        try:
            token = jwt_for(user)
            api.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        except Exception:
            api.force_authenticate(user=user)
        return api
    return _client_with_user


@pytest.fixture
def media_tmp_path(tmp_path, settings):
    root = tmp_path / "media"
    root.mkdir(exist_ok=True)
    settings.MEDIA_ROOT = str(root)
    return root


# ============================================================
# Helpers: chọn user đã seed theo Role/Group/username
# ============================================================
def _first(qs):
    return qs.first() if hasattr(qs, "first") else None

def _pick_seed_user(
    role_name: Optional[str] = None,
    group_names: Iterable[str] = (),
    username_candidates: Iterable[str] = (),
):
    from django.contrib.auth import get_user_model  # lazy
    User = get_user_model()

    # 1) theo username ứng viên
    cand_usernames = [u for u in username_candidates if u]
    if cand_usernames:
        u = _first(User.objects.filter(username__in=cand_usernames, is_active=True))
        if u:
            return u

    # 2) theo Role/UserRole (nếu có)
    if role_name:
        try:
            # related_query_name mặc định của FK user trong UserRole thường là 'userrole'
            u = _first(User.objects.filter(userrole__role__name=role_name, is_active=True))
            if u:
                return u
        except Exception:
            pass

    # 3) theo Group
    gnames = [g for g in group_names if g]
    if gnames:
        try:
            u = _first(User.objects.filter(groups__name__in=gnames, is_active=True))
            if u:
                return u
        except Exception:
            pass

    # 4) fallback: bất kỳ user active
    return _first(User.objects.filter(is_active=True))


@pytest.fixture
def _client_auth_for_seed(api) -> Callable[..., Any]:
    """
    Trả về client đã đăng nhập một user thỏa role/group/username cho trước.
    Ưu tiên: username_candidates -> Role -> Group -> any active user.
    """
    def _login(
        role_name: Optional[str] = None,
        group_names: Iterable[str] = (),
        username_candidates: Iterable[str] = (),
    ) -> Any:
        user = _pick_seed_user(role_name=role_name, group_names=group_names, username_candidates=username_candidates)
        if user is None:
            pytest.skip("Không tìm thấy user đã seed phù hợp để đăng nhập.")
        try:
            from rest_framework_simplejwt.tokens import RefreshToken  # lazy
            token = str(RefreshToken.for_user(user).access_token)
            api.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        except Exception:
            api.force_authenticate(user=user)
        return api
    return _login


# Các fixture đăng nhập bằng user ĐÃ SEED (khớp RBAC/phạm vi)
@pytest.fixture
def auth_ld_seed(_client_auth_for_seed) -> Any:
    # ưu tiên usernames: ld01, ld_lanhdao; sau đó Role LANH_DAO; sau đó Group LD
    return _client_auth_for_seed(
        role_name="LANH_DAO",
        group_names=("LD", "LÃNH ĐẠO"),
        username_candidates=("ld01", "ld_lanhdao", "lanhdao"),
    )


@pytest.fixture
def auth_cv_seed(_client_auth_for_seed) -> Any:
    return _client_auth_for_seed(
        role_name="CHUYEN_VIEN",
        group_names=("CV", "CHUYÊN VIÊN"),
        username_candidates=("cv01", "cv_chuyenvien", "chuyenvien"),
    )


@pytest.fixture
def auth_vt_seed(_client_auth_for_seed) -> Any:
    return _client_auth_for_seed(
        role_name="VAN_THU",
        group_names=("VT", "VĂN THƯ"),
        username_candidates=("vt01", "vt_vanthu", "vanthu"),
    )


# ============================================================
# MEDIA ROOT tạm cho test upload
# ============================================================
@pytest.fixture(autouse=True)
def _media_tmpdir(tmp_path, settings):
    media_root = tmp_path / "media"
    media_root.mkdir(parents=True, exist_ok=True)
    settings.MEDIA_ROOT = str(media_root)
    yield
