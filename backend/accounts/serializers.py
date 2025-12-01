# accounts/serializers.py
from __future__ import annotations

import unicodedata
from typing import Any, Dict, Optional

from django.contrib.auth import get_user_model
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from .models import UserRole


User = get_user_model()

ROLE_REDIRECT = {
    "CV": "chuyenvien/dashboard.html",
    "CHUYEN_VIEN": "chuyenvien/dashboard.html",
    "VT": "vanthu/dashboard.html",
    "VAN_THU": "vanthu/dashboard.html",
    "LD": "lanhdao/dashboard.html",
    "LANH_DAO": "lanhdao/dashboard.html",
    "QT": "quantri/dashboard.html",
    "QUAN_TRI": "quantri/dashboard.html",
}

ROLE_ALIASES = {
    "CHUYEN_VIEN": "CV",
    "CHUYENVIEN": "CV",
    "LANH_DAO": "LD",
    "LANHDAO": "LD",
    "VAN_THU": "VT",
    "VANTHU": "VT",
    "QUAN_TRI": "QT",
    "QUANTRI": "QT",
}

DEFAULT_ROLE = "CV"
_ROLE_CACHE_ATTR = "_htvb_role_code_cache"
_ROLE_CACHE_MISS = object()


def _display_full_name(u: Any) -> str:
    """
    Lấy full_name an toàn:
    - Ưu tiên thuộc tính u.full_name nếu có.
    - Fallback u.get_full_name() nếu có.
    - Fallback ghép first_name + last_name.
    - Cuối cùng rơi về username.
    """
    v = getattr(u, "full_name", None)
    if v:
        return str(v)

    # Thử method get_full_name()
    try:
        v2 = u.get_full_name()  # type: ignore[attr-defined]
        if v2:
            return str(v2)
    except Exception:
        pass

    fn = str(getattr(u, "first_name", "") or "")
    ln = str(getattr(u, "last_name", "") or "")
    name = (fn + " " + ln).strip()
    return name or str(getattr(u, "username", "") or "")


def _derive_initials(value: str) -> str:
    if not value:
        return ""
    source = value.strip()
    if not source:
        return ""
    parts = [part for part in source.split() if part]
    if not parts:
        return source[:2].upper()
    if len(parts) == 1:
        return parts[0][:2].upper()
    first = parts[0][0] if parts[0] else ""
    last = parts[-1][0] if parts[-1] else ""
    return (first + last).upper()

def _strip_accents(value: str) -> str:
    normalized = unicodedata.normalize("NFD", value)
    return "".join(ch for ch in normalized if unicodedata.category(ch) != "Mn")


def _normalize_role_value(value: Any) -> Optional[str]:
    if value is None:
        return None
    raw = value.name if hasattr(value, "name") else value
    text = str(raw).strip()
    if not text:
        return None
    key = _strip_accents(text).replace(" ", "_").replace("-", "_").upper()
    if key in ROLE_REDIRECT:
        return key if key in ("CV", "VT", "LD", "QT") else ROLE_ALIASES.get(key, key)
    return ROLE_ALIASES.get(key)


def _resolve_role_code(user: Any) -> Optional[str]:
    if not user:
        return None
    cached = getattr(user, _ROLE_CACHE_ATTR, _ROLE_CACHE_MISS)
    if cached is not _ROLE_CACHE_MISS:
        return cached

    # 1) Direct hints on the user instance
    for attr in ("role_code", "role", "role_name", "primary_role"):
        if not hasattr(user, attr):
            continue
        code = _normalize_role_value(getattr(user, attr))
        if code:
            setattr(user, _ROLE_CACHE_ATTR, code)
            return code

    # 2) Django auth groups
    try:
        group_names = list(user.groups.values_list("name", flat=True))
    except Exception:
        group_names = []
    for name in group_names:
        code = _normalize_role_value(name)
        if code:
            setattr(user, _ROLE_CACHE_ATTR, code)
            return code

    # 3) UserRole relation (RBAC)
    try:
        user_pk = getattr(user, "pk", None)
        if user_pk:
            qs = UserRole.objects.select_related("role").filter(user_id=user_pk)
            for raw in qs.values_list("role__name", flat=True):
                code = _normalize_role_value(raw)
                if code:
                    setattr(user, _ROLE_CACHE_ATTR, code)
                    return code
    except Exception:
        pass

    # 4) Fallback for superuser -> QT
    if getattr(user, "is_superuser", False):
        setattr(user, _ROLE_CACHE_ATTR, "QT")
        return "QT"

    setattr(user, _ROLE_CACHE_ATTR, None)
    return None


def _default_redirect(user: Any) -> str:
    role = _resolve_role_code(user) or DEFAULT_ROLE
    return ROLE_REDIRECT.get(role, ROLE_REDIRECT[DEFAULT_ROLE])


class UserSlimSerializer(serializers.ModelSerializer):
    """
    Dùng cho /auth/me và có thể tái sử dụng ở các nơi cần user nhẹ.
    """
    id = serializers.IntegerField(read_only=True)
    full_name = serializers.SerializerMethodField()
    role = serializers.SerializerMethodField()
    role_name = serializers.SerializerMethodField()
    default_redirect = serializers.SerializerMethodField()
    initials = serializers.SerializerMethodField()
    phone = serializers.CharField(read_only=True, default="")
    user_code = serializers.CharField(read_only=True, default="")
    department = serializers.SerializerMethodField()
    department_name = serializers.SerializerMethodField()
    created_at = serializers.DateTimeField(read_only=True)
    last_login = serializers.DateTimeField(read_only=True, allow_null=True)

    class Meta:
        model = User
        fields = (
            "id",
            "username",
            "email",
            "full_name",
            "role",
            "role_name",
            "default_redirect",
            "initials",
            "phone",
            "user_code",
            "department",
            "department_name",
            "created_at",
            "last_login",
        )

    def get_full_name(self, obj: Any) -> str:  # noqa: D401
        # Trả về full name hiển thị thân thiện
        return _display_full_name(obj)

    def get_role(self, obj: Any) -> Optional[str]:
        return _resolve_role_code(obj)

    def get_role_name(self, obj: Any) -> Optional[str]:
        return getattr(obj, "role_name", None) or getattr(obj, "role", None)

    def get_initials(self, obj: Any) -> str:
        return _derive_initials(_display_full_name(obj))

    def get_department(self, obj: Any) -> Optional[str]:
        return self.get_department_name(obj)

    def get_department_name(self, obj: Any) -> Optional[str]:
        dept = getattr(obj, "department", None)
        if dept is None:
            return None
        return getattr(dept, "name", None)

    def get_default_redirect(self, obj: Any) -> str:
        return _default_redirect(obj)


class TokenObtainPairWithProfileSerializer(TokenObtainPairSerializer):
    """
    - Nhúng claims nhẹ vào cả Refresh/Access token (SimpleJWT sẽ sao chép sang access).
    - Đồng thời trả về thông tin user rút gọn ở response để UI dùng ngay.
    """

    @classmethod
    def get_token(cls, user: Any):
        token = super().get_token(user)
        # ===== Custom claims nhẹ (không chứa thông tin nhạy cảm) =====
        token["username"] = getattr(user, "username", "")
        token["full_name"] = _display_full_name(user)
        return token

    def validate(self, attrs: Dict[str, Any]) -> Dict[str, Any]:
        data = super().validate(attrs)
        # Thêm block "user" để UI không cần gọi thêm /auth/me ngay sau khi login
        data["user"] = UserSlimSerializer(self.user).data  # type: ignore[attr-defined]
        return data


__all__ = [
    "UserSlimSerializer",
    "TokenObtainPairWithProfileSerializer",
]
