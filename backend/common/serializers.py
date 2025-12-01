# common/serializers.py
from __future__ import annotations
from typing import Any, Optional, Dict

from django.contrib.auth import get_user_model
from rest_framework import serializers
from drf_spectacular.utils import extend_schema_field
from drf_spectacular.types import OpenApiTypes

User = get_user_model()

__all__ = [
    "ServiceErrorToDRFMixin",
    "TinyDictSerializer",
    "PositiveIntOrNoneField",
    "TrimmedCharField",
    "StrictDateField",
    "CompactUserSerializer",
]


# ============================================================
# 1) Chuẩn hoá lỗi Service -> DRF ValidationError
# ============================================================
class ServiceErrorToDRFMixin:
    """
    Mixin: Chuẩn hoá chuyển ServiceError -> DRF ValidationError.
    Có sẵn map code -> field để bắn lỗi theo field cho UI.
    """
    SERVICE_CODE_FIELD_MAP: Dict[str, str] = {
        # ví dụ: test kỳ vọng 'issue_number' có trong body
        "DUPLICATE_ISSUE_NUMBER": "issue_number",
        # mở rộng thêm khi cần
    }

    def raise_from_service(self, err: Exception):
        # import cục bộ để tránh vòng lặp import
        from workflow.services.errors import ServiceError  # type: ignore

        if isinstance(err, ServiceError):
            field = getattr(err, "field", None) or self.SERVICE_CODE_FIELD_MAP.get(
                getattr(err, "code", ""), None
            )
            detail = (
                getattr(err, "detail", None)
                or getattr(err, "message", None)
                or str(err)
            )
            extra = getattr(err, "extra", None)

            payload: Dict[str, Any] = {"detail": detail}
            if extra is not None:
                payload["extra"] = extra

            if field:
                raise serializers.ValidationError({field: [payload]})
            raise serializers.ValidationError(payload)

        # Không phải ServiceError -> ném lên cho tầng gọi xử lý
        raise err


# ============================================================
# 2) Field & Serializer dùng chung
# ============================================================
class PositiveIntOrNoneField(serializers.IntegerField):
    """Integer >= 1 hoặc None."""
    def to_internal_value(self, data):
        if data in ("", None):
            return None
        value = super().to_internal_value(data)
        if value is not None and value <= 0:
            raise serializers.ValidationError("Must be a positive integer.")
        return value


class TrimmedCharField(serializers.CharField):
    """CharField tự trim khoảng trắng 2 đầu. Hỗ trợ allow_blank."""
    def to_internal_value(self, data):
        data = super().to_internal_value(data)
        if isinstance(data, str):
            return data.strip()
        return data


class StrictDateField(serializers.DateField):
    """DateField nhưng báo lỗi rõ ràng cho UI (để map thông báo)."""
    default_error_messages = {
        "invalid": "INVALID_DATE",
        "date": "INVALID_DATE",
        "null": "REQUIRED",
    }


class TinyDictSerializer(serializers.Serializer):
    """
    Chuẩn tiny object {id, name, code?} cho các FK catalog (status, urgency, security, department, ...).
    Không bind cứng vào model nào để tránh lệ thuộc app label & tên PK.
    """
    id = serializers.IntegerField(required=False, allow_null=True)
    name = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    code = serializers.CharField(required=False, allow_null=True, allow_blank=True)

    class Meta:
        fields = ("id", "name", "code")

    @staticmethod
    def from_model(obj: Any) -> Optional[Dict[str, Any]]:
        if not obj:
            return None

        # tìm id theo nhiều tên thường gặp
        id_val: Optional[int] = None
        for attr in (
            "id", "pk",
            "status_id", "department_id", "urgency_id", "security_id",
            "role_id", "user_id", "case_id", "document_id", "attachment_id",
        ):
            if hasattr(obj, attr):
                candidate = getattr(obj, attr)
                if isinstance(candidate, int):
                    id_val = candidate
                    break

        # name: ưu tiên name -> title -> full_name -> display_name
        name_val: Optional[str] = None
        for attr in ("name", "title", "full_name", "display_name"):
            candidate = getattr(obj, attr, None)
            if isinstance(candidate, str) and candidate.strip():
                name_val = candidate.strip()
                break

        # code/slug nếu có
        code_val: Optional[str] = None
        for attr in ("code", "slug"):
            candidate = getattr(obj, attr, None)
            if isinstance(candidate, str) and candidate.strip():
                code_val = candidate.strip()
                break

        return {"id": id_val, "name": name_val, "code": code_val}


# ============================================================
# 3) User compact (không tạo vòng lặp)
# ============================================================
class CompactUserSerializer(serializers.ModelSerializer):
    """
    Serializer gọn cho User:
      - id: lấy pk an toàn (dù PK là id hay user_id)
      - full_name: get_full_name()/full_name/...; fallback username/email
    """
    id = serializers.SerializerMethodField()
    full_name = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ("id", "username", "email", "full_name")
        read_only_fields = fields

    @extend_schema_field(OpenApiTypes.STR)
    def get_id(self, obj: Any) -> Optional[Any]:
        """
        Return primary key value - handles both UUID (user_id) and int (id/pk)
        """
        # Try user_id first (for UUID PKs)
        user_id = getattr(obj, "user_id", None)
        if user_id is not None:
            return str(user_id)
        
        # Try pk (for int PKs)
        pk_val = getattr(obj, "pk", None)
        if pk_val is not None:
            return pk_val if isinstance(pk_val, int) else str(pk_val)
        
        # Try id field
        id_val = getattr(obj, "id", None)
        if id_val is not None:
            return id_val if isinstance(id_val, int) else str(id_val)
            
        return None

    @extend_schema_field(OpenApiTypes.STR)
    def get_full_name(self, obj: Any) -> Optional[str]:
        # callable get_full_name() nếu có
        fn = getattr(obj, "get_full_name", None)
        if callable(fn):
            try:
                val = fn()
                if isinstance(val, str) and val.strip():
                    return val.strip()
            except Exception:
                pass

        # thuộc tính tên
        for attr in ("full_name", "name", "display_name"):
            val = getattr(obj, attr, None)
            if isinstance(val, str) and val.strip():
                return val.strip()

        # fallback
        for attr in ("username", "email"):
            val = getattr(obj, attr, None)
            if isinstance(val, str) and val.strip():
                return val.strip()

        return None
