# apps/accounts/models.py
import uuid
from django.conf import settings
from django.db import models
from django.utils import timezone
from django.contrib.auth.base_user import AbstractBaseUser, BaseUserManager
from django.contrib.auth.models import PermissionsMixin


class Department(models.Model):
    class Meta:
        db_table = "departments"
        indexes = [
            models.Index(fields=["department_code"]),
        ]
        constraints = [
            models.UniqueConstraint(fields=["name"], name="uq_department_name"),
        ]

    department_id = models.BigAutoField(primary_key=True)
    department_code = models.CharField(max_length=20, unique=True, null=True, blank=True)
    name = models.CharField(max_length=200)
    address = models.CharField(max_length=250, null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)
    lead_user = models.ForeignKey(
        "User", null=True, blank=True, on_delete=models.SET_NULL, related_name="leading_departments"
        # vòng tham chiếu OK vì lớp User định nghĩa ở dưới
    )

    def __str__(self):
        return self.name


class Role(models.Model):
    class Meta:
        db_table = "roles"

    role_id = models.BigAutoField(primary_key=True)
    name = models.CharField(max_length=200, unique=True)
    description = models.CharField(max_length=250, null=True, blank=True)

    def __str__(self):
        return self.name


class RbacPermission(models.Model):
    """Tránh trùng tên với django.contrib.auth.models.Permission"""
    class Meta:
        db_table = "permissions"

    permission_id = models.BigAutoField(primary_key=True)
    code = models.CharField(max_length=100, unique=True)  # ví dụ: DOC.CREATE
    name = models.CharField(max_length=200)
    description = models.CharField(max_length=250, null=True, blank=True)

    def __str__(self):
        return f"{self.code} - {self.name}"


class RolePermission(models.Model):
    class Meta:
        db_table = "role_permissions"
        constraints = [
            models.UniqueConstraint(
                fields=["role", "permission"], name="uq_role_permission"
            )
        ]

    id = models.BigAutoField(primary_key=True)
    role = models.ForeignKey(Role, on_delete=models.CASCADE)
    permission = models.ForeignKey(RbacPermission, on_delete=models.CASCADE)


class UserManager(BaseUserManager):
    def create_user(self, username, password=None, **extra):
        if not username:
            raise ValueError("Username is required")
        user = self.model(username=username, **extra)
        if password:
            user.set_password(password)  # lưu vào password_hash
        user.save(using=self._db)
        return user

    def create_superuser(self, username, password=None, **extra):
        extra.setdefault("is_staff", True)
        extra.setdefault("is_superuser", True)
        return self.create_user(username, password, **extra)


class User(AbstractBaseUser, PermissionsMixin):
    class Meta:
        db_table = "users"
        indexes = [
            models.Index(fields=["username"]),
            models.Index(fields=["user_code"]),
            models.Index(fields=["department"]),
        ]

    user_id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user_code = models.CharField(max_length=20, unique=True, null=True, blank=True)
    username = models.CharField(max_length=20, unique=True)
    # AbstractBaseUser cung cấp password field => ánh xạ đúng "password_hash"
    full_name = models.CharField(max_length=200)
    email = models.EmailField(max_length=200, unique=True, null=True, blank=True)
    phone = models.CharField(max_length=15, null=True, blank=True)
    department = models.ForeignKey(Department, null=True, blank=True, on_delete=models.SET_NULL, related_name="users")
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)  # để vào admin
    created_at = models.DateTimeField(default=timezone.now)
    last_login = models.DateTimeField(null=True, blank=True)

    USERNAME_FIELD = "username"
    REQUIRED_FIELDS = []

    objects = UserManager()

    def __str__(self):
        return f"{self.username} - {self.full_name}"


class UserRole(models.Model):
    """Hỗ trợ multi-role nếu cần."""
    class Meta:
        db_table = "user_roles"
        constraints = [
            models.UniqueConstraint(fields=["user", "role"], name="uq_user_role")
        ]

    id = models.BigAutoField(primary_key=True)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="user_roles")
    role = models.ForeignKey(Role, on_delete=models.CASCADE, related_name="user_roles")


class AuthSession(models.Model):
    class Meta:
        db_table = "auth_sessions"
        indexes = [
            models.Index(fields=["user", "expires_at"]),
        ]

    session_id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    issued_at = models.DateTimeField(default=timezone.now)
    expires_at = models.DateTimeField()
    ip = models.CharField(max_length=45, null=True, blank=True)
    user_agent = models.CharField(max_length=300, null=True, blank=True)
    revoked = models.BooleanField(default=False)


class PasswordReset(models.Model):
    class Meta:
        db_table = "password_resets"
        indexes = [models.Index(fields=["user", "expires_at"])]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    token_hash = models.CharField(max_length=200)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)


class SecurityEvent(models.Model):
    class EventType(models.TextChoices):
        LOGIN_SUCCESS = "LOGIN_SUCCESS", "LOGIN_SUCCESS"
        LOGIN_FAIL = "LOGIN_FAIL", "LOGIN_FAIL"
        LOCKED = "LOCKED", "LOCKED"

    class Meta:
        db_table = "security_events"
        indexes = [models.Index(fields=["user", "at"])]

    id = models.BigAutoField(primary_key=True)
    user = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL)
    event_type = models.CharField(max_length=50, choices=EventType.choices)
    at = models.DateTimeField(default=timezone.now)
    ip = models.CharField(max_length=45, null=True, blank=True)
    note = models.CharField(max_length=250, null=True, blank=True)
