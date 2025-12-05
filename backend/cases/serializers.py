# cases/serializers.py
from __future__ import annotations
from typing import Any, Optional, Callable, List, Dict, cast

from django.contrib.auth import get_user_model
from rest_framework import serializers
from drf_spectacular.utils import extend_schema_field
from drf_spectacular.types import OpenApiTypes

from cases.models import (
    Case,
    CaseActivityLog,
    CaseAttachment,
    CaseDocument,
    CaseParticipant,
    CaseTask,
    Comment,
)
from accounts.models import Department
from catalog.models import CaseType
from common.serializers import (
    TinyDictSerializer,
    CompactUserSerializer,
    TrimmedCharField,
)

from core.etag import build_etag

# === Import schema chung & tạo alias để tương thích ngược ===
from common.schema import APIError as _APIError, StatusOnlyResponse as _StatusOnlyResponse
APIErrorSerializer = _APIError                    # Back-compat alias (không tạo component trùng)
StatusOnlyResponseSerializer = _StatusOnlyResponse  # Back-compat alias (không tạo component trùng)

__all__ = [
    # model serializers
    "CaseSlimSerializer",
    "CaseDetailSerializer",
    "CaseSerializer",
    "CaseUpsertSerializer",
    "CaseActivityLogSerializer",
    "CaseParticipantSerializer",
    "CaseTaskSerializer",
    "CaseAttachmentSerializer",
    "CommentSerializer",
    # schema-only (alias tới common.schema để tránh trùng component)
    "APIErrorSerializer",
    "StatusOnlyResponseSerializer",
    # action payloads
    "WaitAssignActionSerializer",
    "AssignCaseActionSerializer",
    "StartCaseActionSerializer",
    "PauseCaseActionSerializer",
    "ResumeCaseActionSerializer",
    "RequestCloseCaseActionSerializer",
    "ApproveCloseCaseActionSerializer",
    "ArchiveCaseActionSerializer",
    "CaseParticipantUpsertSerializer",
    "CaseTaskCreateSerializer",
    "CaseTaskUpdateSerializer",
    "CaseAttachmentUploadSerializer",
    "CaseDocumentLinkSerializer",
    "CommentCreateSerializer",
    "CaseMetaUpdateSerializer",
]


# =========================
#   MODEL SERIALIZERS
# =========================
class CaseMetaUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Case
        fields = ("title", "description", "priority", "due_date")


class CaseSlimSerializer(serializers.ModelSerializer):
    # Bảo đảm luôn có 'id' bất kể PK thật là gì (case_id, pk, ...)
    id = serializers.IntegerField(source="pk", read_only=True)

    status = serializers.SerializerMethodField()
    status_name = serializers.SerializerMethodField()
    department = serializers.SerializerMethodField()
    leader = serializers.SerializerMethodField()
    owner = serializers.SerializerMethodField()  # Added: person in charge
    case_type = serializers.SerializerMethodField()
    case_type_name = serializers.SerializerMethodField()
    assignee_count = serializers.SerializerMethodField()
    
    # New fields for UI display
    priority_display = serializers.SerializerMethodField()
    is_overdue = serializers.SerializerMethodField()
    progress_percent = serializers.SerializerMethodField()

    # Dùng MethodField để an toàn khi model đặt tên khác/không có
    created_at = serializers.SerializerMethodField()
    updated_at = serializers.SerializerMethodField()
    deadline = serializers.SerializerMethodField()
    etag = serializers.SerializerMethodField()

    class Meta:
        model = Case
        fields = (
            "id",
            "case_code",
            "title",
            "status",
            "status_name",
            "case_type",
            "case_type_name",
            "department",
            "leader",
            "owner",  # Added: person in charge
            "assignee_count",
            "priority",
            "priority_display",
            "is_overdue",
            "progress_percent",
            "deadline",
            "created_at",
            "updated_at",
            "etag",
        )
        read_only_fields = fields

    # ---- status (tiny dict) ----
    @extend_schema_field(TinyDictSerializer)
    def get_status(self, obj: Case) -> Optional[Dict[str, Any]]:
        # TinyDictSerializer.from_model đã trả dict thuần
        return cast(Optional[Dict[str, Any]], TinyDictSerializer.from_model(getattr(obj, "status", None)))

    @extend_schema_field(OpenApiTypes.STR)
    def get_status_name(self, obj: Case) -> Optional[str]:
        st = getattr(obj, "status", None)
        if st is None:
            return None
        return getattr(st, "name", None) or getattr(st, "code", None)

    # ---- department (tiny dict) ----
    @extend_schema_field(TinyDictSerializer)
    def get_department(self, obj: Case) -> Optional[Dict[str, Any]]:
        return cast(Optional[Dict[str, Any]], TinyDictSerializer.from_model(getattr(obj, "department", None)))

    @extend_schema_field(TinyDictSerializer)
    def get_case_type(self, obj: Case) -> Optional[Dict[str, Any]]:
        return cast(Optional[Dict[str, Any]], TinyDictSerializer.from_model(getattr(obj, "case_type", None)))

    @extend_schema_field(OpenApiTypes.STR)
    def get_case_type_name(self, obj: Case) -> Optional[str]:
        case_type = getattr(obj, "case_type", None)
        if not case_type:
            return None
        return getattr(case_type, "case_type_name", None)

    # ---- leader (compact user) -> ép về dict thuần để tránh ReturnDict ----
    @extend_schema_field(CompactUserSerializer)
    def get_leader(self, obj: Case) -> Optional[Dict[str, Any]]:
        leader = getattr(obj, "leader", None)
        if not leader:
            return None
        data = CompactUserSerializer(leader).data  # ReturnDict
        return dict(data)  # ép về dict thường để hài lòng type checker

    # ---- owner (compact user) -> người phụ trách ----
    @extend_schema_field(CompactUserSerializer)
    def get_owner(self, obj: Case) -> Optional[Dict[str, Any]]:
        owner = getattr(obj, "owner", None)
        if not owner:
            return None
        data = CompactUserSerializer(owner).data  # ReturnDict
        return dict(data)  # ép về dict thường để hài lòng type checker

    @extend_schema_field(OpenApiTypes.INT)
    def get_assignee_count(self, obj: Case) -> int:
        m2m = getattr(obj, "assignees", None)
        if m2m is None:
            return 0
        count_fn: Optional[Callable[[], int]] = getattr(m2m, "count", None)  # type: ignore[attr-defined]
        if callable(count_fn):
            try:
                return int(count_fn())
            except Exception:
                return 0
        return 0

    @extend_schema_field(OpenApiTypes.STR)
    def get_priority_display(self, obj: Case) -> str:
        """Return user-friendly priority display"""
        priority = getattr(obj, "priority", None)
        if not priority:
            return "Thường"
        priority_map = {
            "HIGH": "Cao",
            "MEDIUM": "Trung bình", 
            "LOW": "Thấp",
            "URGENT": "Khẩn"
        }
        return priority_map.get(priority.upper(), priority)

    @extend_schema_field(OpenApiTypes.BOOL)
    def get_is_overdue(self, obj: Case) -> bool:
        """Check if case is overdue"""
        from django.utils import timezone
        due_date = getattr(obj, "due_date", None)
        if not due_date:
            return False
        status = getattr(obj, "status", None)
        if status:
            status_name = getattr(status, "case_status_name", "")
            # Not overdue if already closed
            if status_name == "DONG":
                return False
        return due_date < timezone.now()

    @extend_schema_field(OpenApiTypes.INT)
    def get_progress_percent(self, obj: Case) -> int:
        """Calculate task completion percentage"""
        try:
            tasks = getattr(obj, "tasks", None)
            if tasks is None:
                return 0
            all_tasks = tasks.all()
            if not all_tasks:
                return 0
            total = len(all_tasks)
            completed = sum(1 for t in all_tasks if getattr(t, "status", "") == "DONE")
            return int((completed / total) * 100) if total > 0 else 0
        except Exception:
            return 0

    @extend_schema_field(OpenApiTypes.STR)
    def get_etag(self, obj: Case) -> str:
        return build_etag(obj, prefix="Case")

    # ---- timestamps & deadline (method field cho an toàn) ----
    @extend_schema_field(OpenApiTypes.DATETIME)
    def get_created_at(self, obj: Case) -> Optional[str]:
        return getattr(obj, "created_at", None)

    @extend_schema_field(OpenApiTypes.DATETIME)
    def get_updated_at(self, obj: Case) -> Optional[str]:
        return getattr(obj, "updated_at", None)

    @extend_schema_field(OpenApiTypes.DATETIME)
    def get_deadline(self, obj: Case) -> Optional[str]:
        """Return due_date as deadline for frontend consistency."""
        return getattr(obj, "due_date", None)


class CaseDetailSerializer(CaseSlimSerializer):
    instruction = TrimmedCharField(required=False, allow_blank=True, allow_null=True)
    goal = TrimmedCharField(required=False, allow_blank=True, allow_null=True)
    assignees = serializers.SerializerMethodField()

    class Meta(CaseSlimSerializer.Meta):
        model = Case
        fields = CaseSlimSerializer.Meta.fields + (
            "instruction",
            "goal",
            "assignees",
        )
        read_only_fields = fields

    # Trả về list[dict] thuần, tránh ReturnList
    @extend_schema_field(CompactUserSerializer(many=True))
    def get_assignees(self, obj: Case) -> List[Dict[str, Any]]:
        rel = getattr(obj, "assignees", None)
        if rel is None:
            return []
        all_fn = getattr(rel, "all", None)  # type: ignore[attr-defined]
        if callable(all_fn):
            try:
                items = all_fn()
                ser = CompactUserSerializer(items, many=True)
                data_list = ser.data  # ReturnList
                return [dict(x) for x in cast(List[Dict[str, Any]], list(data_list))]
            except Exception:
                return []
        return []


class CaseSerializer(CaseDetailSerializer):
    """
    Bridge serializer để tương thích với views.py (đã tạo từ bước Service).
    Kế thừa CaseDetailSerializer để trả full-detail.
    """
    pass


User = get_user_model()


class CaseUpsertSerializer(serializers.ModelSerializer):
    case_type_id = serializers.PrimaryKeyRelatedField(
        queryset=CaseType.objects.all(), source="case_type"
    )
    department_id = serializers.PrimaryKeyRelatedField(
        queryset=Department.objects.all(),
        source="department",
        required=False,
        allow_null=True,
    )
    leader_id = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(),
        source="leader",
        required=False,
        allow_null=True,
    )
    owner_id = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(),
        source="owner",
        required=False,
        allow_null=True,
    )

    class Meta:
        model = Case
        fields = (
            "case_code",
            "title",
            "description",
            "case_type_id",
            "department_id",
            "leader_id",
            "owner_id",
            "priority",
            "due_date",
        )

    def validate_case_code(self, value: str) -> str:
        if self.instance and value != getattr(self.instance, "case_code", None):
            raise serializers.ValidationError("Không thể thay đổi mã hồ sơ.")
        return value

    def create(self, validated_data: Dict[str, Any]) -> Case:
        """
        Trả về instance chưa lưu; CaseService sẽ chịu trách nhiệm thiết lập trạng thái
        và ghi log trước khi persist.
        """
        return Case(**validated_data)


class CaseParticipantSerializer(serializers.ModelSerializer):
    user = CompactUserSerializer(read_only=True)

    class Meta:
        model = CaseParticipant
        fields = ("id", "role_on_case", "user")
        read_only_fields = fields


class CaseParticipantItemSerializer(serializers.Serializer):
    user_id = serializers.UUIDField(format="hex")
    role_on_case = serializers.ChoiceField(choices=CaseParticipant.RoleOnCase.choices)


class CaseParticipantUpsertSerializer(serializers.Serializer):
    participants = CaseParticipantItemSerializer(many=True, allow_empty=True)


class CaseTaskSerializer(serializers.ModelSerializer):
    assignee = CompactUserSerializer(read_only=True)
    created_by = CompactUserSerializer(read_only=True)

    class Meta:
        model = CaseTask
        fields = (
            "task_id",
            "title",
            "status",
            "assignee",
            "due_at",
            "note",
            "created_by",
            "created_at",
            "completed_at",
        )
        read_only_fields = ("task_id", "created_by", "created_at")


class CaseTaskCreateSerializer(serializers.Serializer):
    title = TrimmedCharField()
    assignee_id = serializers.UUIDField(format="hex", required=False, allow_null=True)
    due_at = serializers.DateTimeField(required=False, allow_null=True)
    note = serializers.CharField(required=False, allow_blank=True, allow_null=True)


class CaseTaskUpdateSerializer(serializers.Serializer):
    title = TrimmedCharField(required=False)
    status = serializers.ChoiceField(choices=CaseTask.Status.choices, required=False)
    assignee_id = serializers.UUIDField(format="hex", required=False, allow_null=True)
    due_at = serializers.DateTimeField(required=False, allow_null=True)
    note = serializers.CharField(required=False, allow_blank=True, allow_null=True)


class CaseAttachmentSerializer(serializers.ModelSerializer):
    uploaded_by = CompactUserSerializer(read_only=True)

    class Meta:
        model = CaseAttachment
        fields = (
            "attachment_id",
            "attachment_type",
            "file_name",
            "uploaded_at",
            "uploaded_by",
        )
        read_only_fields = ("attachment_id", "uploaded_at", "uploaded_by")


class CaseAttachmentUploadSerializer(serializers.Serializer):
    attachment_type = TrimmedCharField(required=False, allow_blank=True, allow_null=True)


class CaseDocumentSerializer(serializers.ModelSerializer):
    class Meta:
        model = CaseDocument
        fields = ("id", "document_id")
        read_only_fields = fields


class CaseDocumentLinkSerializer(serializers.Serializer):
    document_ids = serializers.ListField(
        child=serializers.IntegerField(min_value=1), allow_empty=True
    )


class CommentSerializer(serializers.ModelSerializer):
    user = CompactUserSerializer(read_only=True)

    class Meta:
        model = Comment
        fields = ("comment_id", "entity_type", "entity_id", "content", "created_at", "user")
        read_only_fields = fields


class CommentCreateSerializer(serializers.Serializer):
    entity_type = serializers.ChoiceField(choices=Comment.Entity.choices)
    entity_id = serializers.IntegerField(min_value=1)
    content = TrimmedCharField()


class CaseActivityLogSerializer(serializers.ModelSerializer):
    actor = CompactUserSerializer(read_only=True)
    meta = serializers.JSONField(source="meta_json", read_only=True)

    class Meta:
        model = CaseActivityLog
        fields = ("log_id", "action", "note", "meta", "actor", "at")
        read_only_fields = fields


# =========================
#   SCHEMA-ONLY (OpenAPI)
# =========================
class WaitAssignActionSerializer(serializers.Serializer):
    # Không có payload
    pass


class AssignTaskSerializer(serializers.Serializer):
    """Nested serializer for task assignment validation"""
    assignee_id = serializers.UUIDField(
        format="hex",
        help_text="UUID chuyên viên được giao nhiệm vụ"
    )
    title = TrimmedCharField(
        help_text="Tiêu đề nhiệm vụ"
    )
    due_at = serializers.DateTimeField(
        required=False,
        allow_null=True,
        help_text="Hạn hoàn thành (ISO 8601)"
    )


class AssignCaseActionSerializer(serializers.Serializer):
    assignees = serializers.ListField(
        child=serializers.UUIDField(format="hex"),
        required=False,
        allow_empty=True,
        help_text="Danh sách user_id chuyên viên được phân công",
    )
    leader = serializers.UUIDField(
        format="hex",
        required=False, allow_null=True, help_text="user_id lãnh đạo phụ trách"
    )
    due_date = serializers.DateTimeField(
        required=False, allow_null=True, help_text="Hạn xử lý"
    )
    instruction = serializers.CharField(
        required=False, allow_blank=True, allow_null=True, help_text="Ghi chú/Yêu cầu phân công"
    )
    tasks = AssignTaskSerializer(
        many=True,
        required=False,
        allow_empty=True,
        help_text="Danh sách nhiệm vụ cần tạo cho chuyên viên"
    )


class StartCaseActionSerializer(serializers.Serializer):
    pass


class PauseCaseActionSerializer(serializers.Serializer):
    reason = serializers.CharField(required=False, allow_blank=True, allow_null=True)


class ResumeCaseActionSerializer(serializers.Serializer):
    pass


class RequestCloseCaseActionSerializer(serializers.Serializer):
    note = serializers.CharField(required=False, allow_blank=True, allow_null=True)


class ApproveCloseCaseActionSerializer(serializers.Serializer):
    pass


class ArchiveCaseActionSerializer(serializers.Serializer):
    pass
