# accounts/admin.py
from __future__ import annotations

from typing import Iterable, List, Optional, Type, Union
from django.contrib import admin
from django.db.models.fields.related import ManyToOneRel
from .models import (
    Department, User, Role, RbacPermission, RolePermission,
    UserRole, AuthSession, PasswordReset, SecurityEvent
)

# ----------------------------
# Helpers
# ----------------------------
def model_has_field(model, name: str) -> bool:
    return name in {f.name for f in model._meta.get_fields()}

def pick_existing(model, candidates: Iterable[str]) -> List[str]:
    return [n for n in candidates if model_has_field(model, n)]

def get_userrole_reverse_accessor(user_model) -> Optional[str]:
    """
    Tìm accessor reverse từ User -> UserRole (vd: 'userrole_set' hoặc 'user_roles').
    """
    for f in user_model._meta.get_fields():
        if isinstance(f, ManyToOneRel) and f.related_model is UserRole:
            return f.get_accessor_name()
    return None


# =====================================================================
# Department
# =====================================================================
@admin.register(Department)
class DepartmentAdmin(admin.ModelAdmin):
    list_display = tuple(pick_existing(
        Department,
        ["department_code", "name", "lead_user", "created_at", "address"]
    ))
    search_fields = tuple(pick_existing(Department, ["department_code", "name", "address"]))
    list_filter = tuple(pick_existing(Department, ["lead_user", "created_at"]))
    autocomplete_fields = tuple([f for f in ["lead_user"] if model_has_field(Department, f)])

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        if model_has_field(Department, "lead_user"):
            qs = qs.select_related("lead_user")
        return qs


# =====================================================================
# Custom ListFilter by Role for User
# =====================================================================
class RoleListFilter(admin.SimpleListFilter):
    title = "Vai trò"
    parameter_name = "role"

    def lookups(self, request, model_admin):
        return [(str(r.pk), r.name) for r in Role.objects.all().order_by("name")]

    def queryset(self, request, queryset):
        value = self.value()
        if not value:
            return queryset
        user_model = queryset.model
        accessor = get_userrole_reverse_accessor(user_model)
        if not accessor:
            return queryset
        filter_key = f"{accessor}__role__pk"
        return queryset.filter(**{filter_key: value}).distinct()


# =====================================================================
# User
# =====================================================================
UserModel = User

# Thuộc tính search_fields cho UserAdmin (Django yêu cầu là class attribute)
_user_search_fields: List[str] = []
for f in ("username", "email", "full_name", "first_name", "last_name"):
    if model_has_field(UserModel, f):
        _user_search_fields.append(f)
if not _user_search_fields:
    _user_search_fields = ["username"]

FilterItem = Union[str, Type[admin.SimpleListFilter]]

@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    """
    Admin cho User — dynamic để tương thích nhiều schema:
    - full_name_display: fallback nếu không có full_name
    - created_at_display: fallback sang date_joined nếu thiếu created_at
    - roles_str: từ bảng UserRole (tự dò accessor reverse)
    """

    search_fields = tuple(_user_search_fields)

    # Cột hiển thị
    list_display = (
        "username",
        "full_name_display",
        "department",
        "is_active",
        "is_staff",
        "roles_str",
        "created_at_display",
    )

    list_per_page = 50
    ordering = ("username",)

    def full_name_display(self, obj):
        if hasattr(obj, "full_name") and getattr(obj, "full_name"):
            return getattr(obj, "full_name")
        first = getattr(obj, "first_name", "") or ""
        last = getattr(obj, "last_name", "") or ""
        name = (first + " " + last).strip()
        return name or getattr(obj, "username", "")
    full_name_display.short_description = "Họ tên"

    def created_at_display(self, obj):
        if hasattr(obj, "created_at") and getattr(obj, "created_at") is not None:
            return getattr(obj, "created_at")
        return getattr(obj, "date_joined", None)
    created_at_display.short_description = "Tạo lúc"
    created_at_display.admin_order_field = "created_at" if model_has_field(UserModel, "created_at") else "date_joined"

    def roles_str(self, obj):
        accessor = get_userrole_reverse_accessor(obj.__class__)
        if not accessor:
            return ""
        rel_mgr = getattr(obj, accessor, None)
        if rel_mgr is None:
            return ""
        qs = rel_mgr.select_related("role").all()
        names = list(qs.values_list("role__name", flat=True))
        return ", ".join(names)
    roles_str.short_description = "Vai trò"

    def get_list_filter(self, request):
        filters: List[FilterItem] = ["is_active", "is_staff"]
        if model_has_field(UserModel, "department"):
            filters.append("department")
        filters.append(RoleListFilter)  # <- đã gán kiểu FilterItem nên Pylance không báo lỗi
        return tuple(filters)

    def get_readonly_fields(self, request, obj=None):
        ro = ["password", "last_login"]
        if model_has_field(UserModel, "created_at"):
            ro.append("created_at")
        if model_has_field(UserModel, "date_joined"):
            ro.append("date_joined")
        return tuple(ro)

    def get_fieldsets(self, request, obj=None):
        login_fields = [f for f in ["username", "password"] if model_has_field(UserModel, f)]
        personal_fields = [f for f in ["full_name", "email", "phone", "department"] if model_has_field(UserModel, f)]
        status_fields = [f for f in ["is_active", "is_staff", "is_superuser", "last_login", "created_at", "date_joined"]
                         if model_has_field(UserModel, f)]

        if "username" not in login_fields and model_has_field(UserModel, "username"):
            login_fields.insert(0, "username")

        fieldsets = []
        if login_fields:
            fieldsets.append(("Thông tin đăng nhập", {"fields": tuple(login_fields)}))
        if personal_fields:
            fieldsets.append(("Thông tin cá nhân", {"fields": tuple(personal_fields)}))
        if status_fields:
            fieldsets.append(("Trạng thái", {"fields": tuple(status_fields)}))
        return tuple(fieldsets)

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        if model_has_field(UserModel, "department"):
            qs = qs.select_related("department")
        return qs


# =====================================================================
# Role & Permission
# =====================================================================
@admin.register(Role)
class RoleAdmin(admin.ModelAdmin):
    list_display = tuple(pick_existing(Role, ["name", "description"]))
    search_fields = ("name",)  # thuộc tính class để hỗ trợ autocomplete


@admin.register(RbacPermission)
class RbacPermissionAdmin(admin.ModelAdmin):
    list_display = tuple(pick_existing(RbacPermission, ["code", "name", "description"]))
    search_fields = ("code", "name")


@admin.register(RolePermission)
class RolePermissionAdmin(admin.ModelAdmin):
    list_display = tuple(pick_existing(RolePermission, ["role", "permission"]))
    list_filter = tuple(pick_existing(RolePermission, ["role", "permission"]))
    autocomplete_fields = tuple(pick_existing(RolePermission, ["role", "permission"]))


@admin.register(UserRole)
class UserRoleAdmin(admin.ModelAdmin):
    list_display = tuple(pick_existing(UserRole, ["user", "role"]))
    list_filter = tuple(pick_existing(UserRole, ["role"]))
    _sf = []
    if model_has_field(UserModel, "username"):
        _sf.append("user__username")
    if model_has_field(UserModel, "full_name"):
        _sf.append("user__full_name")
    search_fields = tuple(_sf + ["role__name"])
    autocomplete_fields = tuple(pick_existing(UserRole, ["user", "role"]))


# =====================================================================
# Sessions / Password reset / Security events
# =====================================================================
@admin.register(AuthSession)
class AuthSessionAdmin(admin.ModelAdmin):
    list_display = tuple(pick_existing(AuthSession, ["session_id", "user", "issued_at", "expires_at", "revoked", "ip"]))
    list_filter = tuple(pick_existing(AuthSession, ["revoked"]))

    _sf = []
    if model_has_field(AuthSession, "user"):
        _sf.append("user__username")
    if model_has_field(AuthSession, "ip"):
        _sf.append("ip")
    search_fields = tuple(_sf)

    readonly_fields = tuple(pick_existing(AuthSession, ["session_id", "issued_at"]))

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        if model_has_field(AuthSession, "user"):
            qs = qs.select_related("user")
        return qs


@admin.register(PasswordReset)
class PasswordResetAdmin(admin.ModelAdmin):
    list_display = tuple(pick_existing(PasswordReset, ["id", "user", "expires_at", "used_at"]))

    _sf = []
    if model_has_field(PasswordReset, "user"):
        _sf.append("user__username")
    search_fields = tuple(_sf)

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        if model_has_field(PasswordReset, "user"):
            qs = qs.select_related("user")
        return qs


@admin.register(SecurityEvent)
class SecurityEventAdmin(admin.ModelAdmin):
    list_display = tuple(pick_existing(SecurityEvent, ["id", "user", "event_type", "at", "ip", "note"]))
    list_filter = tuple(pick_existing(SecurityEvent, ["event_type"]))

    _sf = []
    if model_has_field(SecurityEvent, "user"):
        _sf.append("user__username")
    if model_has_field(SecurityEvent, "ip"):
        _sf.append("ip")
    if model_has_field(SecurityEvent, "note"):
        _sf.append("note")
    search_fields = tuple(_sf)

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        if model_has_field(SecurityEvent, "user"):
            qs = qs.select_related("user")
        return qs
