# accounts/management/commands/seed_accounts.py
from __future__ import annotations

from typing import Any, Dict, Optional, Tuple, Type, Set
from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.apps import apps
from django.db.models import Model

from workflow.services.rbac import (
    ROLE_ACTIONS as WF_ROLE_ACTIONS,
    PERM_CODE as WF_PERM_CODE,
    ROLE_NAME_ALIASES as WF_ROLE_NAME_ALIASES,
    canonical_role_value,
    get_role_display_name,
    Role as WorkflowRole,
)

PASSWORD = "Passw0rd!"

# Danh mục phòng ban: (mã, tên)
DEPTS = [
    ("VP", "Văn phòng"),
    ("TC", "Tài chính"),
    ("TP", "Tiếp nhận & Trả kết quả"),
    ("XD", "Xây dựng"),
    ("KT", "Kế toán"),
    ("TH", "Tổng hợp"),
    ("QL", "Quản lý"),
]

# Người dùng cố định: (username, role, dept_code, full_name)
USERS = [
    ("ld01", "LD", "VP", "Lãnh đạo 01"),
    ("cv01", "CV", "VP", "Chuyên viên 01"),
    ("vt01", "VT", "VP", "Văn thư 01"),
    ("qt01", "QT", "VP", "Quản trị 01"),
]

ROLE_TO_GROUP = {
    "LD": "LD",
    "CV": "CV",
    "VT": "VT",
    "QT": "QT",
}


def M(app_label: str, model_name: str) -> Optional[Type[Model]]:
    try:
        return apps.get_model(app_label, model_name)
    except Exception:
        return None


def model_has_field(model: Optional[Type[Model]], name: str) -> bool:
    if not model:
        return False
    try:
        return name in {f.name for f in model._meta.get_fields()}
    except Exception:
        return False


def ensure_departments() -> Tuple[int, Dict[str, Any]]:
    """
    Đảm bảo các phòng ban trong DEPTS tồn tại.
    Tránh vi phạm UNIQUE(name) bằng cách:
      1) tìm theo code (nếu có),
      2) nếu không có thì tìm theo name,
      3) nếu vẫn chưa có mới tạo (kèm cả code/name nếu có).
    Chỉ cập nhật trường đang trống để không đụng UNIQUE/INDEX khác.
    """
    Department = M("accounts", "Department")
    if not Department:
        return 0, {}

    code_field: Optional[str] = None
    if model_has_field(Department, "department_code"):
        code_field = "department_code"
    elif model_has_field(Department, "code"):
        code_field = "code"

    name_field: Optional[str] = "name" if model_has_field(Department, "name") else None

    code2obj: Dict[str, Any] = {}
    ensured = 0

    for code, name in DEPTS:
        dept_obj = None

        # 1) ưu tiên tìm theo code (nếu có)
        if code_field:
            try:
                dept_obj = Department.objects.filter(**{code_field: code}).first()
            except Exception:
                dept_obj = None

        # 2) nếu chưa có, tìm theo name (tránh UNIQUE(name))
        if not dept_obj and name_field:
            try:
                dept_obj = Department.objects.filter(**{name_field: name}).first()
            except Exception:
                dept_obj = None

        # 3) nếu vẫn chưa có, tạo mới
        if not dept_obj:
            create_payload: Dict[str, Any] = {}
            if code_field:
                create_payload[code_field] = code
            if name_field:
                create_payload[name_field] = name
            # nếu cả code_field và name_field đều không có thì bỏ qua
            if not create_payload:
                continue
            dept_obj = Department.objects.create(**create_payload)
            ensured += 1
        else:
            # cập nhật các trường còn trống (không ép đổi để tránh đụng UNIQUE)
            changed = False
            if name_field and not getattr(dept_obj, name_field, ""):
                setattr(dept_obj, name_field, name)
                changed = True
            if code_field and not getattr(dept_obj, code_field, ""):
                setattr(dept_obj, code_field, code)
                changed = True
            if changed:
                dept_obj.save()

        code2obj[code] = dept_obj

    # Trả về tổng đếm theo số phần tử đã xử lý (không nhất thiết là số tạo mới)
    return len(code2obj), code2obj


def ensure_role_for_user(user: Any, role_name: str) -> None:
    """Assign the canonical role to the user. Falls back to the group when the Role model is missing."""
    Role = M("accounts", "Role")
    UserRole = M("accounts", "UserRole")

    canonical = canonical_role_value(role_name)
    if not canonical:
        return

    try:
        if Role and UserRole and model_has_field(Role, "name"):
            role_obj, _ = Role.objects.get_or_create(name=canonical)
            UserRole.objects.get_or_create(user=user, role=role_obj)
            return
    except Exception:
        pass

    gname = ROLE_TO_GROUP.get(canonical)
    if gname:
        grp, _ = Group.objects.get_or_create(name=gname)
        user.groups.add(grp)

def ensure_user(
    username: str,
    role: str,
    dept_map: Dict[str, Any],
    dept_code: Optional[str],
    full_name: Optional[str],
) -> Any:
    """
    Đảm bảo 1 user tồn tại với username, gán phòng ban & role phù hợp.
    Không chạm vào field 'role' trên User (vì có thể model không có).
    """
    User = get_user_model()
    user_field_names = {f.name for f in User._meta.get_fields()}

    create_defaults: Dict[str, Any] = {
        "email": f"{username}@example.com",
        "is_active": True,
    }
    if full_name and "full_name" in user_field_names:
        create_defaults["full_name"] = full_name
    if "department" in user_field_names and dept_code and dept_code in dept_map:
        create_defaults["department"] = dept_map[dept_code]

    user, created = User.objects.get_or_create(username=username, defaults=create_defaults)
    canonical_role = canonical_role_value(role)

    # Bổ sung department nếu chưa có
    if "department" in user_field_names and dept_code and dept_code in dept_map:
        if getattr(user, "department_id", None) is None:
            setattr(user, "department", dept_map[dept_code])
            user.save(update_fields=["department"])

    if created:
        user.set_password(PASSWORD)
        user.save()

    # Nếu là QUAN_TRI, bật staff/superuser nếu các field này tồn tại
    if canonical_role == WorkflowRole.QT.value:
        changed = False
        if hasattr(user, "is_staff") and not getattr(user, "is_staff", False):
            user.is_staff = True
            changed = True
        if hasattr(user, "is_superuser") and not getattr(user, "is_superuser", False):
            user.is_superuser = True
            changed = True
        if changed:
            user.save(update_fields=["is_staff", "is_superuser"])

    # Gán role (Role/UserRole) hoặc Group
    ensure_role_for_user(user, role)
    return user


def ensure_canonical_roles() -> Dict[str, Any]:
    RoleModel = M("accounts", "Role")
    if not RoleModel:
        return {}
    RolePermissionModel = M("accounts", "RolePermission")
    UserRoleModel = M("accounts", "UserRole")

    alias_groups: Dict[str, list[str]] = {}
    for alias, canonical in WF_ROLE_NAME_ALIASES.items():
        alias_groups.setdefault(canonical, []).append(alias)

    ensured: Dict[str, Any] = {}
    for wf_role in WorkflowRole:
        canonical = wf_role.value
        display = get_role_display_name(canonical)
        role_obj = RoleModel.objects.filter(name=canonical).first()
        if not role_obj:
            alias_candidates = [alias for alias in alias_groups.get(canonical, []) if alias != canonical]
            alias_role = RoleModel.objects.filter(name__in=alias_candidates).first()
            if alias_role:
                alias_role.name = canonical
                alias_role.description = display
                alias_role.save(update_fields=["name", "description"])
                role_obj = alias_role
            else:
                role_obj = RoleModel.objects.create(name=canonical, description=display)
        else:
            if role_obj.description != display:
                role_obj.description = display
                role_obj.save(update_fields=["description"])
        ensured[canonical] = role_obj

        for alias in alias_groups.get(canonical, []):
            if alias == canonical:
                continue
            duplicates = RoleModel.objects.filter(name=alias)
            for alias_role in duplicates:
                if alias_role.pk == role_obj.pk:
                    continue
                if RolePermissionModel:
                    RolePermissionModel.objects.filter(role=alias_role).update(role=role_obj)
                if UserRoleModel:
                    UserRoleModel.objects.filter(role=alias_role).update(role=role_obj)
                alias_role.delete()

    return ensured


def ensure_permissions() -> Tuple[int, int]:
    """
    Đảm bảo bảng permissions & role_permissions có đầy đủ mã quyền theo workflow.services.rbac.
    Trả về tuple (số quyền, số gán role-permission).
    """
    Permission = M("accounts", "RbacPermission")
    RoleModel = M("accounts", "Role")
    RolePermission = M("accounts", "RolePermission")
    if not Permission or not RoleModel or not RolePermission:
        return 0, 0

    canonical_roles = ensure_canonical_roles()

    # 1) Tạo/đảm bảo các permission code tồn tại
    code_to_perm: Dict[str, Any] = {}
    created_perm = 0
    for code in sorted({c for c in WF_PERM_CODE.values() if c}):
        perm, created = Permission.objects.get_or_create(
            code=code,
            defaults={
                "name": code.replace(".", " ").title(),
                "description": f"Auto-seeded permission for {code}",
            },
        )
        if created:
            created_perm += 1
        code_to_perm[code] = perm

    # 2) Gán quyền cho từng role dựa vào ROLE_ACTIONS
    created_links = 0
    for wf_role, acts in WF_ROLE_ACTIONS.items():
        role_obj = canonical_roles.get(wf_role.value)
        if not role_obj and RoleModel:
            role_obj, _ = RoleModel.objects.get_or_create(
                name=wf_role.value,
                defaults={
                    "description": get_role_display_name(wf_role.value),
                },
            )
        if not role_obj:
            continue

        desired_codes: Set[str] = set()
        for act in acts:
            code = WF_PERM_CODE.get(act)
            if code:
                desired_codes.add(code)
        for code in desired_codes:
            perm = code_to_perm.get(code)
            if not perm:
                continue
            _, created = RolePermission.objects.get_or_create(role=role_obj, permission=perm)
            if created:
                created_links += 1

    return created_perm, created_links


class Command(BaseCommand):
    help = "Seed Departments + các user cố định: ld01, cv01, vt01, qt01 (mật khẩu: Passw0rd!) để phục vụ test."

    def handle(self, *args, **kwargs):
        # Departments
        dept_count, dept_map = ensure_departments()
        self.stdout.write(self.style.SUCCESS(f"✓ Departments ready: {dept_count}"))

        perm_created, link_created = ensure_permissions()
        self.stdout.write(
            self.style.SUCCESS(
                f"✓ Permissions ready: {perm_created} new, {link_created} role mappings"
            )
        )

        # Users
        ensured = 0
        for username, role, dept_code, full_name in USERS:
            ensure_user(username, role, dept_map, dept_code, full_name)
            ensured += 1

        self.stdout.write(self.style.SUCCESS(f"✓ Users ready: {ensured} (password: {PASSWORD})"))
        self.stdout.write(self.style.SUCCESS("Done."))
