# accounts/api_admin.py
from __future__ import annotations

from collections.abc import Iterable
from typing import Any, Optional, Set

from django.db.models import Q, Count
from django.contrib.auth.password_validation import validate_password
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import MethodNotAllowed
from rest_framework.permissions import BasePermission, IsAuthenticated
from rest_framework.response import Response
from drf_spectacular.utils import OpenApiResponse, extend_schema, extend_schema_view

from documents.models import Document
from workflow.services.rbac import (
    Role as WorkflowRole,
    get_permission_columns,
    get_role_display_name,
    get_single_role_code,
)

from .models import Department, RbacPermission, Role, RolePermission, User, UserRole


def _normalize_role_values(values: Any) -> Optional[Set[str]]:
    if values is None:
        return None
    if isinstance(values, (str, WorkflowRole)):
        values = (values,)
    if not isinstance(values, Iterable):
        values = (values,)
    normalized: Set[str] = set()
    for raw in values:
        if raw is None:
            continue
        if isinstance(raw, WorkflowRole):
            normalized.add(raw.value)
            continue
        raw_text = str(raw).strip()
        if not raw_text:
            continue
        normalized.add(raw_text)
    return normalized


def _parse_boolean(value: Optional[str]) -> Optional[bool]:
    if value is None:
        return None
    normalized = value.strip().lower()
    if not normalized:
        return None
    if normalized in {"1", "true", "t", "yes", "y"}:
        return True
    if normalized in {"0", "false", "f", "no", "n"}:
        return False
    return None


class RoleAccessPermission(BasePermission):
    def has_permission(self, request, view) -> bool:
        if not request.user or not request.user.is_authenticated:
            return False
        
        # For APIViews (no 'action' attribute), check required_roles directly
        action_map = getattr(view, "action_role_map", None) or {}
        view_action = getattr(view, "action", None)
        
        allowed = None
        if view_action and action_map:
            allowed = action_map.get(view_action, None)
        
        if allowed is None:
            allowed = getattr(view, "required_roles", None)
        
        if allowed is None:
            return True
        
        normalized = _normalize_role_values(allowed)
        if not normalized:
            return True
        role_code = get_single_role_code(request.user)
        if not role_code:
            return False
        return role_code in normalized


class PermissionSerializer(serializers.ModelSerializer):
    columns = serializers.SerializerMethodField()

    class Meta:
        model = RbacPermission
        fields = ("permission_id", "code", "name", "description", "columns")

    def get_columns(self, obj: RbacPermission) -> list[str]:
        return get_permission_columns(obj.code)


class RoleInlineSerializer(serializers.ModelSerializer):
    class Meta:
        model = Role
        fields = ("role_id", "name", "description", "display_name")

    display_name = serializers.SerializerMethodField()

    def get_display_name(self, obj: Role) -> str:
        return get_role_display_name(obj.name)


class UserReadSerializer(serializers.ModelSerializer):
    department_id = serializers.IntegerField(source="department.department_id", read_only=True, default=None)
    department_name = serializers.CharField(source="department.name", read_only=True, default=None)
    department_code = serializers.CharField(
        source="department.department_code", read_only=True, default=None
    )
    roles = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = (
            "user_id",
            "user_code",
            "username",
            "full_name",
            "email",
            "phone",
            "is_active",
            "department_id",
            "department_code",
            "department_name",
            "created_at",
            "last_login",
            "roles",
        )

    def get_roles(self, obj: User) -> list[dict[str, Any]]:
        manager = getattr(obj, "user_roles", None)
        if manager is None:
            return []
        data = []
        for user_role in manager.all():
            role = getattr(user_role, "role", None)
            if not role:
                continue
            serializer = RoleInlineSerializer(role, context=self.context)
            data.append(serializer.data)
        return data


class UserCreateSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True)
    department_id = serializers.IntegerField(write_only=True, required=False, allow_null=True)

    class Meta:
        model = User
        fields = (
            "username",
            "full_name",
            "email",
            "phone",
            "user_code",
            "department_id",
            "is_active",
            "password",
        )
        extra_kwargs = {"is_active": {"default": True}}

    def validate_department_id(self, value: Optional[int]) -> Optional[int]:
        if value is None:
            return None
        if not Department.objects.filter(department_id=value).exists():
            raise serializers.ValidationError("Phòng ban không tồn tại.")
        return value

    def validate_password(self, value: str) -> str:
        validate_password(value)
        return value

    def create(self, validated_data: dict[str, Any]) -> User:
        department_id = validated_data.pop("department_id", None)
        password = validated_data.pop("password")
        department = None
        if department_id is not None:
            department = Department.objects.get(department_id=department_id)
        user = User(**validated_data)
        if department is not None:
            user.department = department
        user.set_password(password)
        user.save()
        return user


class UserUpdateSerializer(serializers.ModelSerializer):
    department_id = serializers.IntegerField(write_only=True, required=False, allow_null=True)

    class Meta:
        model = User
        fields = (
            "username",
            "full_name",
            "email",
            "phone",
            "user_code",
            "is_active",
            "department_id",
        )
        extra_kwargs = {
            "username": {"required": False},
            "email": {"required": False},
            "full_name": {"required": False},
            "phone": {"required": False},
            "user_code": {"required": False},
            "is_active": {"required": False},
        }

    def validate_department_id(self, value: Optional[int]) -> Optional[int]:
        if value is None:
            return None
        if not Department.objects.filter(department_id=value).exists():
            raise serializers.ValidationError("Phòng ban không tồn tại.")
        return value

    def update(self, instance: User, validated_data: dict[str, Any]) -> User:
        has_department = "department_id" in self.initial_data
        department_id = validated_data.pop("department_id", None)
        if has_department:
            if department_id is None:
                instance.department = None
            else:
                instance.department = Department.objects.get(department_id=department_id)
        return super().update(instance, validated_data)


class SpecialistSerializer(serializers.ModelSerializer):
    department_id = serializers.IntegerField(
        source="department.department_id", read_only=True, required=False
    )
    department_name = serializers.CharField(
        source="department.name", read_only=True, required=False
    )

    class Meta:
        model = User
        fields = (
            "user_id",
            "username",
            "full_name",
            "department_id",
            "department_name",
        )


class UserRoleAssignmentSerializer(serializers.Serializer):
    role_ids = serializers.ListField(
        child=serializers.IntegerField(min_value=1),
        allow_empty=True,
        required=False,
        default=list,
    )

    def validate_role_ids(self, value: list[int]) -> list[int]:
        normalized: list[int] = []
        seen: Set[int] = set()
        for role_id in value:
            if role_id in seen:
                continue
            seen.add(role_id)
            normalized.append(role_id)
        if not normalized:
            return []
        found = set(Role.objects.filter(role_id__in=normalized).values_list("role_id", flat=True))
        missing = set(normalized) - found
        if missing:
            raise serializers.ValidationError(f"Không tìm thấy role_id(s): {sorted(missing)}")
        return normalized


class RolePermissionAssignmentSerializer(serializers.Serializer):
    permission_ids = serializers.ListField(
        child=serializers.IntegerField(min_value=1),
        allow_empty=True,
        required=False,
        default=list,
    )

    def validate_permission_ids(self, value: list[int]) -> list[int]:
        normalized: list[int] = []
        seen: Set[int] = set()
        for perm_id in value:
            if perm_id in seen:
                continue
            seen.add(perm_id)
            normalized.append(perm_id)
        if not normalized:
            return []
        found = set(
            RbacPermission.objects.filter(permission_id__in=normalized).values_list("permission_id", flat=True)
        )
        missing = set(normalized) - found
        if missing:
            raise serializers.ValidationError(f"Không tìm thấy permission_id(s): {sorted(missing)}")
        return normalized


class DepartmentListSerializer(serializers.ModelSerializer):
    lead_user_id = serializers.UUIDField(source="lead_user.user_id", read_only=True, default=None)
    lead_user_name = serializers.CharField(source="lead_user.full_name", read_only=True, default=None)
    documents_count = serializers.SerializerMethodField()
    documents_preview = serializers.SerializerMethodField()

    class Meta:
        model = Department
        fields = (
            "department_id",
            "department_code",
            "name",
            "address",
            "lead_user_id",
            "lead_user_name",
            "documents_count",
            "documents_preview",
        )

    def _with_counts(self) -> bool:
        return bool(self.context.get("with_counts"))

    def _with_docs(self) -> bool:
        return bool(self.context.get("with_docs"))

    def get_documents_count(self, obj: Department) -> int | None:
        if not self._with_counts():
            return None
        if hasattr(obj, "documents_count"):
            return getattr(obj, "documents_count")
        return Document.objects.filter(department=obj).count()

    def get_documents_preview(self, obj: Department) -> list[dict[str, Any]] | None:
        if not self._with_docs():
            return None
        qs = (
            Document.objects.filter(department=obj)
            .order_by("-created_at")
            .values("document_id", "title")[:5]
        )
        return list(qs)


class DepartmentCreateSerializer(serializers.ModelSerializer):
    lead_user_id = serializers.UUIDField(required=False, allow_null=True, write_only=True)

    class Meta:
        model = Department
        fields = ("department_code", "name", "address", "lead_user_id")

    def validate_lead_user_id(self, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        if not User.objects.filter(user_id=value).exists():
            raise serializers.ValidationError("Không tìm thấy người phụ trách.")
        return value

    def create(self, validated_data: dict[str, Any]) -> Department:
        lead_user_id = validated_data.pop("lead_user_id", None)
        lead_user = None
        if lead_user_id is not None:
            lead_user = User.objects.get(user_id=lead_user_id)
        department = Department(**validated_data)
        department.lead_user = lead_user
        department.save()
        return department


class RoleSerializer(serializers.ModelSerializer):
    permissions = serializers.SerializerMethodField()
    display_name = serializers.SerializerMethodField()

    class Meta:
        model = Role
        fields = ("role_id", "name", "description", "permissions", "display_name")

    def get_permissions(self, obj: Role) -> list[dict[str, Any]]:
        permission_objs = []
        for link in obj.rolepermission_set.all():
            perm = getattr(link, "permission", None)
            if perm:
                permission_objs.append(perm)
        return PermissionSerializer(permission_objs, many=True).data

    def get_display_name(self, obj: Role) -> str:
        return get_role_display_name(obj.name)


@extend_schema_view(
    list=extend_schema(
        tags=["Accounts"],
        summary="Danh sách người dùng",
        responses={200: UserReadSerializer(many=True)},
    ),
    retrieve=extend_schema(
        tags=["Accounts"],
        summary="Chi tiết người dùng",
        responses={200: UserReadSerializer},
    ),
    create=extend_schema(
        tags=["Accounts"],
        summary="Tạo người dùng",
        request=UserCreateSerializer,
        responses={201: UserReadSerializer},
    ),
    partial_update=extend_schema(
        tags=["Accounts"],
        summary="Cập nhật người dùng",
        request=UserUpdateSerializer,
        responses={200: UserReadSerializer},
    ),
    lock=extend_schema(
        tags=["Accounts"],
        summary="Khóa tài khoản",
        responses={204: OpenApiResponse(description="Tài khoản bị khóa")},
    ),
    unlock=extend_schema(
        tags=["Accounts"],
        summary="Mở khóa tài khoản",
        responses={204: OpenApiResponse(description="Tài khoản được mở khóa")},
    ),
    roles=extend_schema(
        tags=["Accounts"],
        summary="Vai trò của người dùng",
        responses={200: RoleSerializer(many=True)},
    ),
)
class UserAdminViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    queryset = (
        User.objects.select_related("department")
        .prefetch_related("user_roles__role")
        .order_by("username")
    )
    lookup_field = "user_id"
    http_method_names = ["get", "post", "patch", "put", "head", "options"]
    permission_classes = [IsAuthenticated, RoleAccessPermission]
    required_roles = {WorkflowRole.QT.value}

    @property
    def allowed_methods(self):
        methods = list(super().allowed_methods)
        if self.action == "roles" and "PUT" not in methods:
            methods.append("PUT")
        return methods

    def get_serializer_class(self):
        if self.action == "create":
            return UserCreateSerializer
        if self.action in ("partial_update", "update"):
            return UserUpdateSerializer
        return UserReadSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        params = self.request.query_params
        search = (params.get("q") or "").strip()
        if search:
            qs = qs.filter(
                Q(username__icontains=search)
                | Q(full_name__icontains=search)
                | Q(email__icontains=search)
                | Q(phone__icontains=search)
            )
        department_id = params.get("department_id")
        if department_id:
            try:
                qs = qs.filter(department_id=int(department_id))
            except ValueError:
                pass
        active_flag = _parse_boolean(params.get("active"))
        if active_flag is not None:
            qs = qs.filter(is_active=active_flag)
        return qs

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        read_serializer = UserReadSerializer(
            serializer.instance, context=self.get_serializer_context()
        )
        headers = self.get_success_headers(read_serializer.data)
        return Response(read_serializer.data, status=status.HTTP_201_CREATED, headers=headers)

    def update(self, request, *args, **kwargs):
        raise MethodNotAllowed("PUT")

    def partial_update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", True)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        read_serializer = UserReadSerializer(
            serializer.instance, context=self.get_serializer_context()
        )
        return Response(read_serializer.data)

    @action(detail=True, methods=["post"], url_path="lock")
    def lock(self, request, user_id=None):
        user = self.get_object()
        if user.is_active:
            user.is_active = False
            user.save(update_fields=["is_active"])
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["post"], url_path="unlock")
    def unlock(self, request, user_id=None):
        user = self.get_object()
        if not user.is_active:
            user.is_active = True
            user.save(update_fields=["is_active"])
        return Response(status=status.HTTP_204_NO_CONTENT)

    @extend_schema(
        methods=["put"],
        request=UserRoleAssignmentSerializer,
        responses={204: OpenApiResponse(description="Vai trò được cập nhật")},
    )
    @action(detail=True, methods=["get", "put"], url_path="roles")
    def roles(self, request, user_id=None):
        user = self.get_object()
        if request.method == "GET":
            roles_qs = Role.objects.filter(user_roles__user=user).distinct()
            serializer = RoleSerializer(roles_qs, many=True, context=self.get_serializer_context())
            return Response(serializer.data)

        serializer = UserRoleAssignmentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        desired_ids = set(serializer.validated_data.get("role_ids", []))
        existing_ids = set(user.user_roles.values_list("role_id", flat=True))
        removable = existing_ids - desired_ids
        if removable:
            UserRole.objects.filter(user=user, role_id__in=removable).delete()
        to_add = desired_ids - existing_ids
        if to_add:
            roles = Role.objects.filter(role_id__in=to_add)
            UserRole.objects.bulk_create(
                [UserRole(user=user, role=role) for role in roles]
            )
        return Response(status=status.HTTP_204_NO_CONTENT)


class SpecialistViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    def get_queryset(self):
        import logging
        logger = logging.getLogger(__name__)
        
        alias_names = [WorkflowRole.CV.value, "CHUYEN_VIEN"]
        logger.info(f"[SpecialistViewSet] Looking for roles: {alias_names}")
        
        qs = (
            User.objects.select_related("department")
            .filter(user_roles__role__name__in=alias_names)
            .distinct()
            .order_by("full_name", "username")
        )
        
        logger.info(f"[SpecialistViewSet] Base queryset count: {qs.count()}")
        
        params = self.request.query_params if hasattr(self, "request") else {}
        search = (params.get("q") or "").strip() if params else ""
        if search:
            qs = qs.filter(
                Q(full_name__icontains=search)
                | Q(username__icontains=search)
                | Q(user_code__icontains=search)
            )
            logger.info(f"[SpecialistViewSet] After search filter: {qs.count()}")
            
        department_id = params.get("department_id") if params else None
        if department_id:
            try:
                dept_id_int = int(department_id)
                logger.info(f"[SpecialistViewSet] Filtering by department_id: {dept_id_int}")
                qs = qs.filter(department_id=dept_id_int)
                logger.info(f"[SpecialistViewSet] After department filter: {qs.count()}")
            except ValueError:
                logger.warning(f"[SpecialistViewSet] Invalid department_id: {department_id}")
                pass
        
        logger.info(f"[SpecialistViewSet] Final queryset count: {qs.count()}")
        return qs
        
    serializer_class = SpecialistSerializer
    permission_classes = [IsAuthenticated, RoleAccessPermission]
    required_roles = {WorkflowRole.CV.value, WorkflowRole.VT.value, WorkflowRole.LD.value, WorkflowRole.QT.value}
    pagination_class = None


class ClerkViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    """
    Danh sách văn thư (role VT) để lãnh đạo phân công theo dõi.
    """

    serializer_class = SpecialistSerializer  # Reuse minimal fields (id, name, department)
    permission_classes = [IsAuthenticated, RoleAccessPermission]
    required_roles = {WorkflowRole.VT.value, WorkflowRole.LD.value, WorkflowRole.QT.value}
    pagination_class = None

    def get_queryset(self):
        alias_names = [WorkflowRole.VT.value, "VAN_THU"]
        qs = (
            User.objects.select_related("department")
            .filter(user_roles__role__name__in=alias_names)
            .distinct()
            .order_by("full_name", "username")
        )
        params = self.request.query_params if hasattr(self, "request") else {}
        search = (params.get("q") or "").strip() if params else ""
        if search:
            qs = qs.filter(
                Q(full_name__icontains=search)
                | Q(username__icontains=search)
                | Q(user_code__icontains=search)
            )
        department_id = params.get("department_id") if params else None
        if department_id:
            try:
                qs = qs.filter(department_id=int(department_id))
            except ValueError:
                pass
        return qs


@extend_schema_view(
    list=extend_schema(
        tags=["Accounts"],
        summary="Danh sách vai trò",
        responses={200: RoleSerializer(many=True)},
    ),
    create=extend_schema(
        tags=["Accounts"],
        summary="Tạo vai trò",
        request=RoleSerializer,
        responses={201: RoleSerializer},
    ),
    permissions=extend_schema(
        tags=["Accounts"],
        summary="Cập nhật quyền cho vai trò",
        request=RolePermissionAssignmentSerializer,
        responses={204: OpenApiResponse(description="Quyền được gắn cho vai trò")},
    ),
)
class RoleAdminViewSet(mixins.ListModelMixin, mixins.CreateModelMixin, viewsets.GenericViewSet):
    queryset = Role.objects.order_by("name").prefetch_related("rolepermission_set__permission")
    serializer_class = RoleSerializer
    permission_classes = [IsAuthenticated, RoleAccessPermission]
    required_roles = {WorkflowRole.QT.value}

    @action(
        detail=True,
        methods=["put"],
        url_path="permissions",
        serializer_class=RolePermissionAssignmentSerializer,
    )
    def permissions(self, request, pk=None):
        role = self.get_object()
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        permission_ids = serializer.validated_data.get("permission_ids", [])
        RolePermission.objects.filter(role=role).delete()
        if permission_ids:
            permissions = list(RbacPermission.objects.filter(permission_id__in=permission_ids))
            RolePermission.objects.bulk_create(
                [RolePermission(role=role, permission=perm) for perm in permissions]
            )
        return Response(status=status.HTTP_204_NO_CONTENT)


@extend_schema_view(
    list=extend_schema(
        tags=["Accounts"],
        summary="Danh sách quyền",
        responses={200: PermissionSerializer(many=True)},
    )
)
class PermissionViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    queryset = RbacPermission.objects.order_by("code")
    serializer_class = PermissionSerializer
    permission_classes = [IsAuthenticated, RoleAccessPermission]
    required_roles = {WorkflowRole.QT.value}


@extend_schema_view(
    list=extend_schema(
        tags=["Accounts"],
        summary="Danh sách phòng ban",
        responses={200: DepartmentListSerializer(many=True)},
    ),
    create=extend_schema(
        tags=["Accounts"],
        summary="Tạo phòng ban",
        request=DepartmentCreateSerializer,
        responses={201: DepartmentListSerializer},
    ),
)
class DepartmentViewSet(mixins.ListModelMixin, mixins.CreateModelMixin, viewsets.GenericViewSet):
    queryset = Department.objects.select_related("lead_user").order_by("name")
    permission_classes = [IsAuthenticated, RoleAccessPermission]
    action_role_map = {
        "list": {
            WorkflowRole.QT.value,
            WorkflowRole.VT.value,
            WorkflowRole.CV.value,
            WorkflowRole.LD.value,
        },
        "create": {WorkflowRole.QT.value},
    }

    def get_serializer_class(self):
        if self.action == "create":
            return DepartmentCreateSerializer
        return DepartmentListSerializer

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        if self.action == "list":
            params = self.request.query_params
            ctx["with_counts"] = params.get("with_counts") in ("1", "true", "yes")
            ctx["with_docs"] = params.get("with_docs") in ("1", "true", "yes")
        return ctx

    def get_queryset(self):
        qs = super().get_queryset()
        params = getattr(self.request, "query_params", {})
        with_counts = params.get("with_counts") in ("1", "true", "yes")
        if with_counts:
            qs = qs.annotate(documents_count=Count("document"))
        return qs
