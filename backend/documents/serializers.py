# documents/serializers.py
from __future__ import annotations
from typing import Any, Optional, Mapping, Iterable, List, Callable, Dict, cast, Type
from datetime import datetime
import unicodedata
from django.utils import timezone

from django.contrib.auth import get_user_model
from django.core.files.storage import default_storage
from django.db.models.query import QuerySet
from rest_framework import serializers
from rest_framework.request import Request
from rest_framework.utils.serializer_helpers import ReturnDict, ReturnList
from drf_spectacular.utils import extend_schema_field
from drf_spectacular.types import OpenApiTypes

from common.serializers import (
    TinyDictSerializer,
    CompactUserSerializer,
    TrimmedCharField,
    ServiceErrorToDRFMixin,
)
from accounts.models import Department
from catalog.models import (
    Field,
    DocumentType,
    UrgencyLevel,
    SecurityLevel,
    IssueLevel,
    DocumentStatus,
)

from documents.models import (
    Document,
    DocumentAttachment,
    DocumentAssignment,
    DocumentApproval,
    DocumentVersion,
    DocumentWorkflowLog,
    RegisterBook,
    NumberingRule,
    DocumentTemplate,
    Organization,
    OrgContact,
    DispatchOutbox,
)

from core.etag import build_etag
from workflow.services import rbac
from workflow.services.status_resolver import (
    InboundStatus,
    OutboundStatus,
    canonical_status_key,
    DRAFT_STATUSES,
    OFFICIAL_STATUSES,
    is_draft,
    is_official,
)

User = get_user_model()



# ----------------- helpers -----------------
def _created_at_key(obj: Any) -> float:
    val = getattr(obj, "created_at", None)
    if isinstance(val, datetime):
        try:
            return float(val.timestamp())
        except Exception:
            return 0.0
    return 0.0


def _to_plain_dict(data: Any) -> Optional[Dict[str, Any]]:
    if data is None:
        return None
    if isinstance(data, dict):
        return data
    if isinstance(data, ReturnDict):
        return dict(data)
    if isinstance(data, Mapping):
        return dict(data)
    return None


def _to_plain_list_of_dicts(data: Any) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    if data is None:
        return out
    if isinstance(data, ReturnList) or isinstance(data, list):
        seq = list(data)
        for item in seq:
            if isinstance(item, dict):
                out.append(item)
            elif isinstance(item, ReturnDict):
                out.append(dict(item))
            elif isinstance(item, Mapping):
                out.append(dict(item))
    return out


def _get_direction_value(obj: Any) -> Optional[str]:
    value = getattr(obj, "direction", None) or getattr(obj, "doc_direction", None)
    if value is None:
        return None
    return str(getattr(value, "value", value))


def _direction_label(obj: Any) -> Optional[str]:
    value = _get_direction_value(obj)
    if not value:
        return None
    normalized = value.strip().lower()
    if normalized == "den":
        return "INBOUND"
    if normalized in ("di", "du_thao"):
        return "OUTBOUND"
    return value.strip().upper()


def _status_label(obj: Any) -> Optional[str]:
    status = getattr(obj, "status", None)
    if status is None:
        return None
    return getattr(status, "status_name", None) or getattr(status, "name", None)


def _assignments_list(obj: Any) -> List[Any]:
    rel = getattr(obj, "assignments", None)
    if rel is None:
        return []
    all_fn: Optional[Callable[[], Any]] = getattr(rel, "all", None)  # type: ignore[attr-defined]
    if callable(all_fn):
        try:
            data = all_fn()
            if isinstance(data, list):
                return data
            return list(cast(Iterable[Any], data))
        except Exception:
            return []
    if isinstance(rel, QuerySet):
        try:
            return list(rel)
        except Exception:
            return []
    if isinstance(rel, list):
        return rel
    try:
        return list(rel)
    except Exception:
        return []


def _current_assignee_id(obj: Any) -> Optional[Any]:
    assignments = _assignments_list(obj)
    for assignment in assignments:
        if getattr(assignment, "role_on_doc", None) == DocumentAssignment.RoleOnDoc.ASSIGNEE:
            user = getattr(assignment, "user", None)
            if user is not None:
                return getattr(user, "pk", None) or getattr(user, "user_id", None)
            return getattr(assignment, "user_id", None)
    return None


def _sla_due_at(obj: Any) -> Optional[Any]:
    due_dates: List[Any] = []
    assignments = _assignments_list(obj)
    for assignment in assignments:
        if getattr(assignment, "role_on_doc", None) == DocumentAssignment.RoleOnDoc.ASSIGNEE:
            due = getattr(assignment, "due_at", None)
            if due is not None:
                due_dates.append(due)
    if not due_dates:
        return None
    try:
        return min(due_dates)
    except Exception:
        return None


def _pick_dt(obj: Any, *names: str) -> Optional[datetime]:
    """Chọn field datetime đầu tiên tồn tại trong danh sách tên."""
    for n in names:
        v = getattr(obj, n, None)
        if isinstance(v, datetime):
            return v
    return None


# ========== Config Serializers (Register book / Numbering / Templates) ==========
class _OrgConfigSerializerMixin(serializers.ModelSerializer):
    department = serializers.SerializerMethodField()
    department_id = serializers.IntegerField(
        required=False, allow_null=True, write_only=True
    )
    created_by = CompactUserSerializer(read_only=True)
    updated_by = CompactUserSerializer(read_only=True)

    def _current_user(self):
        request = self.context.get("request") if isinstance(self.context, dict) else None
        user = getattr(request, "user", None)
        if user is not None and getattr(user, "is_authenticated", False):
            return user
        return None

    def _assign_department(self, validated_data: Dict[str, Any]) -> None:
        dept_id = validated_data.pop("department_id", None)
        if dept_id is None:
            if "department" in validated_data and validated_data["department"] is None:
                validated_data.pop("department", None)
            return
        try:
            validated_data["department"] = Department.objects.get(pk=dept_id)
        except Department.DoesNotExist as exc:  # pragma: no cover - defensive
            raise serializers.ValidationError(
                {"department_id": ["Phòng ban không hợp lệ."]}
            ) from exc

    def get_department(self, obj: Any) -> Optional[Dict[str, Any]]:
        return TinyDictSerializer.from_model(getattr(obj, "department", None))


class RegisterBookSerializer(_OrgConfigSerializerMixin):
    class Meta:
        model = RegisterBook
        fields = (
            "register_id",
            "name",
            "direction",
            "year",
            "prefix",
            "suffix",
            "padding",
            "next_sequence",
            "reset_policy",
            "description",
            "metadata",
            "is_active",
            "department_id",
            "department",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        )
        read_only_fields = (
            "register_id",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        )

    name = TrimmedCharField()

    def create(self, validated_data: Dict[str, Any]) -> RegisterBook:
        self._assign_department(validated_data)
        user = self._current_user()
        if user:
            validated_data.setdefault("created_by", user)
            validated_data.setdefault("updated_by", user)
        return super().create(validated_data)

    def update(
        self, instance: RegisterBook, validated_data: Dict[str, Any]
    ) -> RegisterBook:
        self._assign_department(validated_data)
        user = self._current_user()
        if user:
            validated_data.setdefault("updated_by", user)
        return super().update(instance, validated_data)


class NumberingRuleSerializer(_OrgConfigSerializerMixin):
    class Meta:
        model = NumberingRule
        fields = (
            "rule_id",
            "code",
            "name",
            "target",
            "prefix",
            "suffix",
            "padding",
            "start_sequence",
            "next_sequence",
            "reset_policy",
            "description",
            "metadata",
            "is_active",
            "department_id",
            "department",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        )
        read_only_fields = (
            "rule_id",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        )

    code = TrimmedCharField()
    name = TrimmedCharField()

    def create(self, validated_data: Dict[str, Any]) -> NumberingRule:
        self._assign_department(validated_data)
        user = self._current_user()
        if user:
            validated_data.setdefault("created_by", user)
            validated_data.setdefault("updated_by", user)
        return super().create(validated_data)

    def update(
        self, instance: NumberingRule, validated_data: Dict[str, Any]
    ) -> NumberingRule:
        self._assign_department(validated_data)
        user = self._current_user()
        if user:
            validated_data.setdefault("updated_by", user)
        return super().update(instance, validated_data)


class DocumentTemplateSerializer(serializers.ModelSerializer):
    created_by = CompactUserSerializer(read_only=True)
    updated_by = CompactUserSerializer(read_only=True)

    class Meta:
        model = DocumentTemplate
        fields = (
            "template_id",
            "name",
            "doc_direction",
            "version",
            "description",
            "content",
            "format",
            "tags",
            "is_active",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        )
        read_only_fields = (
            "template_id",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        )

    name = TrimmedCharField()

    def _current_user(self):
        request = self.context.get("request") if isinstance(self.context, dict) else None
        user = getattr(request, "user", None)
        if user is not None and getattr(user, "is_authenticated", False):
            return user
        return None

    def create(self, validated_data: Dict[str, Any]) -> DocumentTemplate:
        user = self._current_user()
        if user:
            validated_data.setdefault("created_by", user)
            validated_data.setdefault("updated_by", user)
        return super().create(validated_data)

    def update(
        self, instance: DocumentTemplate, validated_data: Dict[str, Any]
    ) -> DocumentTemplate:
        user = self._current_user()
        if user:
            validated_data.setdefault("updated_by", user)
        return super().update(instance, validated_data)


# ========== Slim/List ==========
class DocumentSlimSerializer(serializers.ModelSerializer):
    """
    Dùng cho listing nhanh:
      - Trường gọn & đủ cho bảng danh sách
      - Alias: outgoing_number / incoming_number
      - Status/Department/Urgency/Security dạng tiny object
      - created_at/updated_at được map an toàn từ nhiều tên khả dĩ
    """
    id = serializers.SerializerMethodField()
    doc_direction = serializers.SerializerMethodField()
    direction = serializers.SerializerMethodField()
    kind = serializers.SerializerMethodField()
    status = serializers.SerializerMethodField()
    status_name = serializers.SerializerMethodField()
    status_key = serializers.SerializerMethodField()
    department = serializers.SerializerMethodField()
    main_department_id = serializers.SerializerMethodField()
    urgency = serializers.SerializerMethodField()
    security = serializers.SerializerMethodField()
    sender = serializers.SerializerMethodField()
    from_org_name = serializers.SerializerMethodField()

    outgoing_number = serializers.SerializerMethodField()
    incoming_number = serializers.SerializerMethodField()
    number = serializers.SerializerMethodField()

    issued_date = serializers.DateField(read_only=True, required=False, allow_null=True)
    received_date = serializers.DateField(read_only=True, required=False, allow_null=True)

    creator = serializers.SerializerMethodField()
    assignee_count = serializers.SerializerMethodField()
    current_assignee_id = serializers.SerializerMethodField()
    has_attachments = serializers.SerializerMethodField()

    created_at = serializers.SerializerMethodField()
    updated_at = serializers.SerializerMethodField()
    etag = serializers.SerializerMethodField()
    last_action = serializers.SerializerMethodField()
    last_action_at = serializers.SerializerMethodField()
    sla_due_at = serializers.SerializerMethodField()

    class Meta:
        model = Document
        fields = (
            "id",
            "title",
            "doc_direction",
            "direction",
            "kind",
            "status",
            "status_name",
            "status_key",
            "department",
            "main_department_id",
            "urgency",
            "security",
            "sender",
            "from_org_name",
            "number",
            "outgoing_number",
            "incoming_number",
            "issued_date",
            "received_date",
            "creator",
            "assignee_count",
            "current_assignee_id",
            "has_attachments",
            "last_action",
            "last_action_at",
            "sla_due_at",
            "created_at",
            "updated_at",
            "etag",
        )
        read_only_fields = fields

    @extend_schema_field(OpenApiTypes.STR)
    def get_etag(self, obj: Any) -> str:
        return build_etag(obj, prefix="Document")

    # -------- computed getters --------
    @extend_schema_field(OpenApiTypes.INT)
    def get_id(self, obj: Any) -> Optional[int]:
        pk = getattr(obj, "pk", None)
        if pk is None:
            return None
        try:
            return int(pk)
        except (TypeError, ValueError):
            # Trong schema hệ thống dùng INT; trong project hiện tại PK là INT nên nhánh này không xảy ra.
            # Giữ fallback để an toàn nếu môi trường khác.
            return pk  # type: ignore[return-value]

    @extend_schema_field(OpenApiTypes.STR)
    def get_doc_direction(self, obj: Any) -> Optional[str]:
        value = getattr(obj, "direction", None) or getattr(obj, "doc_direction", None)
        if value is None:
            return None
        return getattr(value, "value", value)

    @extend_schema_field(OpenApiTypes.STR)
    def get_direction(self, obj: Any) -> Optional[str]:
        return _direction_label(obj)

    @extend_schema_field(OpenApiTypes.STR)
    def get_kind(self, obj: Any) -> Optional[str]:
        status_label = _status_label(obj)
        direction = self.get_direction(obj)
        if direction == "OUTBOUND":
            canonical = canonical_status_key(status_label, direction=direction)
            if canonical in DRAFT_STATUSES:
                return "DRAFT"
            return "OFFICIAL"
        return "OFFICIAL"

    @extend_schema_field(OpenApiTypes.STR)
    def get_number(self, obj: Any) -> Optional[str]:
        direction = self.get_direction(obj)
        if direction == "INBOUND":
            return getattr(obj, "received_number", None)
        return getattr(obj, "issue_number", None)

    @extend_schema_field(OpenApiTypes.STR)
    def get_from_org_name(self, obj: Any) -> Optional[str]:
        direction = self.get_direction(obj)
        if direction == "INBOUND":
            return getattr(obj, "sender", None)
        return getattr(obj, "recipient", None)

    @extend_schema_field(OpenApiTypes.INT)
    def get_main_department_id(self, obj: Any) -> Optional[int]:
        return getattr(obj, "department_id", None)

    @extend_schema_field(OpenApiTypes.INT)
    def get_current_assignee_id(self, obj: Any) -> Optional[Any]:
        return _current_assignee_id(obj)

    @extend_schema_field(OpenApiTypes.STR)
    def get_last_action(self, obj: Any) -> Optional[str]:
        return getattr(obj, "last_workflow_action", None)

    @extend_schema_field(OpenApiTypes.DATETIME)
    def get_last_action_at(self, obj: Any) -> Optional[datetime]:
        return getattr(obj, "last_workflow_at", None)

    @extend_schema_field(OpenApiTypes.DATETIME)
    def get_sla_due_at(self, obj: Any) -> Optional[Any]:
        return _sla_due_at(obj)

    @extend_schema_field(OpenApiTypes.OBJECT)
    def get_status(self, obj: Any) -> Optional[Dict[str, Any]]:
        return _status_label(obj)

    @extend_schema_field(OpenApiTypes.STR)
    def get_status_name(self, obj: Any) -> Optional[str]:
        st = getattr(obj, "status", None)
        if st is None:
            return None
        return getattr(st, "name", None) or getattr(st, "code", None)

    @extend_schema_field(OpenApiTypes.STR)
    def get_status_key(self, obj: Any) -> Optional[str]:
        direction = self.get_direction(obj)
        status = getattr(obj, "status", None)
        if status is None:
            return ""
        name = getattr(status, "status_name", None)
        return canonical_status_key(name, direction=direction)

    @extend_schema_field(OpenApiTypes.OBJECT)
    def get_department(self, obj: Any) -> Optional[Dict[str, Any]]:
        return TinyDictSerializer.from_model(getattr(obj, "department", None))

    @extend_schema_field(OpenApiTypes.OBJECT)
    def get_urgency(self, obj: Any) -> Optional[Dict[str, Any]]:
        return TinyDictSerializer.from_model(getattr(obj, "urgency", None))

    @extend_schema_field(OpenApiTypes.OBJECT)
    def get_security(self, obj: Any) -> Optional[Dict[str, Any]]:
        return TinyDictSerializer.from_model(getattr(obj, "security", None))

    @extend_schema_field(OpenApiTypes.STR)
    def get_sender(self, obj: Any) -> Optional[str]:
        value = getattr(obj, "sender", None)
        if value is None:
            return None
        return str(value)

    @extend_schema_field(OpenApiTypes.STR)
    def get_outgoing_number(self, obj: Any) -> Optional[str]:
        return getattr(obj, "issue_number", None)

    @extend_schema_field(OpenApiTypes.STR)
    def get_incoming_number(self, obj: Any) -> Optional[str]:
        return getattr(obj, "received_number", None)

    @extend_schema_field(OpenApiTypes.OBJECT)
    def get_creator(self, obj: Any) -> Optional[Dict[str, Any]]:
        user = getattr(obj, "created_by", None)
        if not user:
            return None
        data = CompactUserSerializer(user).data
        return _to_plain_dict(data)

    @extend_schema_field(OpenApiTypes.INT)
    def get_assignee_count(self, obj: Any) -> int:
        # Ưu tiên annotation (assignments_count) nếu có để tránh query thừa
        annotated = getattr(obj, "assignments_count", None)
        try:
            if annotated is not None:
                return int(annotated)
        except Exception:
            pass
        return len(_assignments_list(obj))

    @extend_schema_field(OpenApiTypes.BOOL)
    def get_has_attachments(self, obj: Any) -> bool:
        annotated = getattr(obj, "attachments_count", None)
        if isinstance(annotated, int):
            return annotated > 0
        rel = getattr(obj, "attachments", None)
        exists_fn: Optional[Callable[[], bool]] = getattr(rel, "exists", None) if rel is not None else None  # type: ignore[attr-defined]
        if callable(exists_fn):
            try:
                return bool(exists_fn())
            except Exception:
                return False
        try:
            return bool(
                DocumentAttachment.objects.filter(document_id=getattr(obj, "pk", None)).exists()
            )
        except Exception:
            return False

    @extend_schema_field(OpenApiTypes.DATETIME)
    def get_created_at(self, obj: Any) -> Optional[datetime]:
        return _pick_dt(obj, "created_at", "created_on", "created")

    @extend_schema_field(OpenApiTypes.DATETIME)
    def get_updated_at(self, obj: Any) -> Optional[datetime]:
        return _pick_dt(obj, "updated_at", "updated_on", "modified", "modified_at")


# ========== List + include (embeds) ==========
class DocumentListSerializer(DocumentSlimSerializer):
    """
    Phiên bản Slim mở rộng cho API list:
    - Cho phép include nhẹ assignments/approvals và các số đếm.
    - Chỉ trả các trường include khi query param `include` chứa tên tương ứng.
    """

    assignments = serializers.SerializerMethodField()
    approvals = serializers.SerializerMethodField()
    attachments_count = serializers.SerializerMethodField()
    approvals_count = serializers.SerializerMethodField()
    versions_count = serializers.SerializerMethodField()
    counts = serializers.SerializerMethodField()

    _OPTIONAL_FIELDS = {
        "assignments": {"assignments"},
        "approvals": {"approvals"},
        "attachments_count": {"attachments_count", "attachments", "counts"},
        "approvals_count": {"approvals_count", "approvals", "counts"},
        "versions_count": {"versions_count", "versions", "counts"},
        "counts": {"counts"},
    }

    class Meta(DocumentSlimSerializer.Meta):
        model = Document
        fields = DocumentSlimSerializer.Meta.fields + (
            "assignments",
            "approvals",
            "attachments_count",
            "approvals_count",
            "versions_count",
            "counts",
        )
        read_only_fields = fields

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        include = set()
        if isinstance(self.context, dict):
            include = set(self.context.get("include") or [])
        self._include_set = {str(x) for x in include}

    def _included(self, field: str) -> bool:
        if not self._include_set:
            return False
        triggers = self._OPTIONAL_FIELDS.get(field, {field})
        return bool(self._include_set.intersection(triggers))

    def to_representation(self, instance: Any):
        data = super().to_representation(instance)
        for field in ("assignments", "approvals", "attachments_count", "approvals_count", "versions_count", "counts"):
            if not self._included(field):
                data.pop(field, None)
        return data

    def _count_from_annotation(self, obj: Any, attr: str) -> Optional[int]:
        val = getattr(obj, attr, None)
        try:
            return int(val)
        except Exception:
            return None

    def _safe_count_related(self, rel: Any) -> int:
        if rel is None:
            return 0
        count_fn: Optional[Callable[[], int]] = getattr(rel, "count", None)
        if callable(count_fn):
            try:
                return int(count_fn())
            except Exception:
                pass
        try:
            return len(list(rel))
        except Exception:
            return 0

    @extend_schema_field(OpenApiTypes.INT)
    def get_attachments_count(self, obj: Any) -> Optional[int]:
        if not self._included("attachments_count"):
            return None
        annotated = self._count_from_annotation(obj, "attachments_count")
        if annotated is not None:
            return annotated
        rel = getattr(obj, "attachments", None)
        return self._safe_count_related(rel)

    @extend_schema_field(OpenApiTypes.INT)
    def get_approvals_count(self, obj: Any) -> Optional[int]:
        if not self._included("approvals_count"):
            return None
        annotated = self._count_from_annotation(obj, "approvals_count")
        if annotated is not None:
            return annotated
        rel = getattr(obj, "approvals", None)
        return self._safe_count_related(rel)

    @extend_schema_field(OpenApiTypes.INT)
    def get_versions_count(self, obj: Any) -> Optional[int]:
        if not self._included("versions_count"):
            return None
        annotated = self._count_from_annotation(obj, "versions_count")
        if annotated is not None:
            return annotated
        rel = getattr(obj, "versions", None)
        return self._safe_count_related(rel)

    @extend_schema_field(serializers.ListField(child=serializers.JSONField()))
    def get_assignments(self, obj: Any) -> Optional[List[Dict[str, Any]]]:
        if not self._included("assignments"):
            return None
        items: List[Dict[str, Any]] = []
        for assign in _assignments_list(obj):
            user = getattr(assign, "user", None)
            items.append(
                {
                    "id": getattr(assign, "id", None),
                    "user_id": getattr(assign, "user_id", None) or getattr(user, "pk", None),
                    "role_on_doc": getattr(assign, "role_on_doc", None),
                    "due_at": getattr(assign, "due_at", None),
                    "is_owner": getattr(assign, "is_owner", False),
                    "assigned_at": getattr(assign, "assigned_at", None),
                }
            )
        return items

    @extend_schema_field(serializers.ListField(child=serializers.JSONField()))
    def get_approvals(self, obj: Any) -> Optional[List[Dict[str, Any]]]:
        if not self._included("approvals"):
            return None
        rel = getattr(obj, "approvals", None)
        if rel is None:
            return []
        all_fn: Optional[Callable[[], Any]] = getattr(rel, "all", None)  # type: ignore[attr-defined]
        approvals: List[Any] = []
        if callable(all_fn):
            approvals = list(all_fn())
        elif isinstance(rel, list):
            approvals = rel
        out: List[Dict[str, Any]] = []
        for ap in approvals:
            out.append(
                {
                    "id": getattr(ap, "approval_id", None) or getattr(ap, "pk", None),
                    "step_no": getattr(ap, "step_no", None),
                    "approver_id": getattr(ap, "approver_id", None),
                    "decision": getattr(ap, "decision", None),
                    "decided_at": getattr(ap, "decided_at", None),
                }
            )
        return out

    @extend_schema_field(OpenApiTypes.OBJECT)
    def get_counts(self, obj: Any) -> Optional[Dict[str, int]]:
        if not self._included("counts"):
            return None
        attachments = self.get_attachments_count(obj) or 0
        versions = self.get_versions_count(obj) or 0
        approvals = self.get_approvals_count(obj) or 0
        assignments = len(_assignments_list(obj))
        return {
            "attachments": attachments,
            "versions": versions,
            "assignments": assignments,
            "approvals": approvals,
        }


# ========== Detail ==========
class DocumentAttachmentSerializer(serializers.ModelSerializer):
    attachment_id = serializers.SerializerMethodField()
    id = serializers.SerializerMethodField()
    file_url = serializers.SerializerMethodField()
    size = serializers.SerializerMethodField()
    uploaded_by = CompactUserSerializer(read_only=True)

    class Meta:
        model = DocumentAttachment
        fields = (
            "attachment_id",
            "id",
            "file_name",
            "attachment_type",
            "note",
            "file_url",
            "size",
            "uploaded_at",
            "uploaded_by",
        )
        read_only_fields = fields

    @extend_schema_field(OpenApiTypes.STR)
    def get_attachment_id(self, obj: Any) -> Optional[str]:
        pk = getattr(obj, "pk", None)
        return None if pk is None else str(pk)

    @extend_schema_field(OpenApiTypes.STR)
    def get_id(self, obj: Any) -> Optional[str]:
        return self.get_attachment_id(obj)

    @extend_schema_field(OpenApiTypes.STR)
    def get_file_url(self, obj: Any) -> Optional[str]:
        f = getattr(obj, "file", None)
        if f is not None and hasattr(f, "url"):
            try:
                return cast(str, f.url)
            except Exception:
                return None
        storage_path = getattr(obj, "storage_path", None)
        if storage_path:
            try:
                return default_storage.url(storage_path)
            except Exception:
                return storage_path
        return None

    @extend_schema_field(OpenApiTypes.INT)
    def get_size(self, obj: Any) -> Optional[int]:
        v = getattr(obj, "size", None)
        if isinstance(v, int):
            return v
        f = getattr(obj, "file", None)
        if f is not None:
            s = getattr(f, "size", None)
            if isinstance(s, int):
                return s
        try:
            return int(v) if v is not None else None
        except Exception:
            return None


class DocumentWorkflowLogSerializer(serializers.ModelSerializer):
    actor = CompactUserSerializer(source="acted_by", read_only=True)
    actor_role = serializers.SerializerMethodField()
    meta = serializers.JSONField(source="meta_json", read_only=True)
    from_status = serializers.SerializerMethodField()
    to_status = serializers.SerializerMethodField()

    class Meta:
        model = DocumentWorkflowLog
        fields = (
            "log_id",
            "action",
            "comment",
            "meta",
            "from_status",
            "to_status",
            "actor",
            "actor_role",
            "acted_at",
        )
        read_only_fields = fields

    def _status_tiny(self, obj: Any) -> Optional[Dict[str, Any]]:
        if obj is None:
            return None
        return {
            "id": getattr(obj, "id", None),
            "name": getattr(obj, "name", None) or getattr(obj, "code", None),
        }

    @extend_schema_field(OpenApiTypes.OBJECT)
    def get_from_status(self, instance: Any) -> Optional[Dict[str, Any]]:
        return self._status_tiny(getattr(instance, "from_status", None))

    @extend_schema_field(OpenApiTypes.OBJECT)
    def get_to_status(self, instance: Any) -> Optional[Dict[str, Any]]:
        return self._status_tiny(getattr(instance, "to_status", None))

    @extend_schema_field(OpenApiTypes.STR)
    def get_actor_role(self, instance: Any) -> Optional[str]:
        user = getattr(instance, "acted_by", None)
        if user is None:
            return None
        return rbac.get_single_role_code(user)


class DocumentWorkflowLogListSerializer(serializers.ModelSerializer):
    """
    Simple shape cho endpoint /documents/{id}/workflow-logs (phục vụ tích hợp/report).
    """

    id = serializers.SerializerMethodField()
    document_id = serializers.SerializerMethodField()
    from_status = serializers.SerializerMethodField()
    to_status = serializers.SerializerMethodField()
    actor_id = serializers.SerializerMethodField()
    actor_role = serializers.SerializerMethodField()
    note = serializers.SerializerMethodField()
    meta = serializers.JSONField(source="meta_json", read_only=True)

    class Meta:
        model = DocumentWorkflowLog
        fields = (
            "id",
            "document_id",
            "from_status",
            "to_status",
            "action",
            "actor_id",
            "actor_role",
            "acted_at",
            "note",
            "meta",
        )
        read_only_fields = fields

    @extend_schema_field(OpenApiTypes.STR)
    def get_id(self, obj: Any) -> Optional[str]:
        pk = getattr(obj, "log_id", None) or getattr(obj, "pk", None)
        return None if pk is None else str(pk)

    @extend_schema_field(OpenApiTypes.INT)
    def get_document_id(self, obj: Any) -> Optional[Any]:
        return getattr(obj, "document_id", None) or getattr(getattr(obj, "document", None), "pk", None)

    @extend_schema_field(OpenApiTypes.STR)
    def get_from_status(self, obj: Any) -> Optional[str]:
        status = getattr(obj, "from_status", None)
        return getattr(status, "status_name", None) if status is not None else None

    @extend_schema_field(OpenApiTypes.STR)
    def get_to_status(self, obj: Any) -> Optional[str]:
        status = getattr(obj, "to_status", None)
        return getattr(status, "status_name", None) if status is not None else None

    @extend_schema_field(OpenApiTypes.INT)
    def get_actor_id(self, obj: Any) -> Optional[Any]:
        actor = getattr(obj, "acted_by", None)
        if actor is not None:
            return getattr(actor, "pk", None) or getattr(actor, "user_id", None)
        return getattr(obj, "acted_by_id", None)

    @extend_schema_field(OpenApiTypes.STR)
    def get_actor_role(self, obj: Any) -> Optional[str]:
        actor = getattr(obj, "acted_by", None)
        if actor is None:
            return None
        return rbac.get_single_role_code(actor)

    @extend_schema_field(OpenApiTypes.STR)
    def get_note(self, obj: Any) -> Optional[str]:
        return getattr(obj, "comment", None)


class DocumentDetailSerializer(DocumentSlimSerializer):
    """
    Mở rộng từ Slim: thêm mô tả, nội dung, tham chiếu, logs.
    Tất cả READ-ONLY (ghi/chuyển trạng thái phải qua Action Serializer + Service).
    """
    summary = TrimmedCharField(required=False, allow_blank=True)
    content = TrimmedCharField(required=False, allow_blank=True)
    sender = TrimmedCharField(required=False, allow_blank=True, allow_null=True)
    recipient = TrimmedCharField(required=False, allow_blank=True, allow_null=True)

    assignees = serializers.SerializerMethodField()
    approvals = serializers.SerializerMethodField()  # nếu có bảng approvals
    attachments = serializers.SerializerMethodField()
    attachment_count = serializers.SerializerMethodField()
    workflow_log_count = serializers.SerializerMethodField()
    last_workflow_log = serializers.SerializerMethodField()
    logs = serializers.SerializerMethodField()
    subject = serializers.SerializerMethodField()
    counts = serializers.SerializerMethodField()
    last_workflow_event = serializers.SerializerMethodField()
    security_level = serializers.SerializerMethodField()
    important_level = serializers.SerializerMethodField()
    created_by_id = serializers.SerializerMethodField()
    signer_id = serializers.SerializerMethodField()
    inbound_ref_id = serializers.SerializerMethodField()

    class Meta(DocumentSlimSerializer.Meta):
        model = Document
        fields = DocumentSlimSerializer.Meta.fields + (
            "summary",
            "content",
            "sender",
            "recipient",
            "assignees",
            "approvals",
            "attachments",
            "attachment_count",
            "workflow_log_count",
            "last_workflow_log",
            "logs",
            "subject",
            "counts",
            "last_workflow_event",
            "security_level",
            "important_level",
            "created_by_id",
            "signer_id",
            "inbound_ref_id",
        )
        read_only_fields = fields

    @extend_schema_field(serializers.ListField(child=serializers.JSONField()))
    def get_assignees(self, obj: Any) -> List[Dict[str, Any]]:
        rel = getattr(obj, "assignments", None)
        if rel is None:
            return []
        all_fn: Optional[Callable[[], Any]] = getattr(rel, "all", None)  # type: ignore[attr-defined]
        items: Iterable[Any] = []
        if callable(all_fn):
            try:
                fetched = all_fn()
                items = fetched if isinstance(fetched, list) else cast(Iterable[Any], fetched)
            except Exception:
                return []
        elif isinstance(rel, QuerySet):
            try:
                items = list(rel)
            except Exception:
                return []
        else:
            return []

        out: List[Dict[str, Any]] = []
        for assign in items:
            out.append(
                {
                    "id": getattr(assign, "id", None),
                    "role_on_doc": getattr(assign, "role_on_doc", None),
                    "due_at": getattr(assign, "due_at", None),
                    "assigned_at": getattr(assign, "assigned_at", None),
                    "is_owner": getattr(assign, "is_owner", False),
                    "instruction": getattr(assign, "instruction", None),
                    "user": _to_plain_dict(CompactUserSerializer(getattr(assign, "user", None)).data),
                    "assigned_by": _to_plain_dict(CompactUserSerializer(getattr(assign, "assigned_by", None)).data),
                }
            )
        return out

    @extend_schema_field(serializers.ListField(child=serializers.JSONField()))
    def get_approvals(self, obj: Any) -> List[Dict[str, Any]]:
        rel = getattr(obj, "approvals", None)
        if rel is None:
            return []
        all_fn: Optional[Callable[[], Any]] = getattr(rel, "all", None)  # type: ignore[attr-defined]
        if not callable(all_fn):
            return []
        try:
            items = all_fn()
            iterable_items: Iterable[Any]
            if isinstance(items, list):
                iterable_items = items
            else:
                iterable_items = cast(Iterable[Any], items)
            out: List[Dict[str, Any]] = []
            for ap in iterable_items:
                out.append(
                    {
                        "id": getattr(ap, "id", None),
                        "step": getattr(ap, "step", None),
                        "status": getattr(ap, "status", None),
                        "actor": _to_plain_dict(CompactUserSerializer(getattr(ap, "actor", None)).data),
                    }
                )
            return out
        except Exception:
            return []

    def _resolve_attachments(self, obj: Any) -> List[DocumentAttachment]:
        cached = getattr(self, "_cached_attachments", None)
        if cached is not None:
            return cached
        rel = getattr(obj, "attachments", None)
        attachments: List[DocumentAttachment] = []
        if rel is not None:
            all_fn: Optional[Callable[[], Any]] = getattr(rel, "all", None)  # type: ignore[attr-defined]
            if callable(all_fn):
                items = all_fn()
                if isinstance(items, QuerySet):
                    try:
                        attachments = list(items.order_by("-uploaded_at"))
                    except Exception:
                        attachments = list(items)
                else:
                    attachments = list(cast(Iterable[DocumentAttachment], items))
            elif isinstance(rel, QuerySet):
                try:
                    attachments = list(rel.order_by("-uploaded_at"))
                except Exception:
                    attachments = list(rel)
        if not attachments:
            try:
                attachments = list(
                    DocumentAttachment.objects.filter(document_id=getattr(obj, "pk", None)).order_by("-uploaded_at")
                )
            except Exception:
                attachments = []
        self._cached_attachments = attachments
        return attachments

    def _resolve_workflow_logs(self, obj: Any) -> List[DocumentWorkflowLog]:
        cached = getattr(self, "_cached_workflow_logs", None)
        if cached is not None:
            return cached
        rel = getattr(obj, "workflow_logs", None)
        logs: List[DocumentWorkflowLog] = []
        if rel is not None:
            all_fn: Optional[Callable[[], Any]] = getattr(rel, "all", None)  # type: ignore[attr-defined]
            if callable(all_fn):
                items = all_fn()
                if isinstance(items, QuerySet):
                    try:
                        logs = list(
                            items.select_related("acted_by", "from_status", "to_status").order_by("-acted_at")
                        )
                    except Exception:
                        logs = list(items)
                else:
                    seq = list(cast(Iterable[Any], items))
                    logs = sorted(
                        cast(List[DocumentWorkflowLog], seq),
                        key=lambda x: getattr(x, "acted_at", None)
                        or getattr(x, "created_at", None)
                        or datetime.min,
                        reverse=True,
                    )
            elif isinstance(rel, QuerySet):
                try:
                    logs = list(
                        rel.select_related("acted_by", "from_status", "to_status").order_by("-acted_at")
                    )
                except Exception:
                    logs = list(rel)
        if not logs:
            try:
                qs = (
                    DocumentWorkflowLog.objects.filter(document_id=getattr(obj, "pk", None))
                    .select_related("acted_by", "from_status", "to_status")
                    .order_by("-acted_at")
                )
                logs = list(qs)
            except Exception:
                logs = []
        self._cached_workflow_logs = logs
        return logs

    @extend_schema_field(serializers.ListField(child=serializers.JSONField()))
    def get_attachments(self, obj: Any) -> List[Dict[str, Any]]:
        attachments = self._resolve_attachments(obj)
        data = DocumentAttachmentSerializer(attachments, many=True).data
        return _to_plain_list_of_dicts(data)

    @extend_schema_field(OpenApiTypes.INT)
    def get_attachment_count(self, obj: Any) -> int:
        return len(self._resolve_attachments(obj))

    @extend_schema_field(OpenApiTypes.INT)
    def get_workflow_log_count(self, obj: Any) -> int:
        return len(self._resolve_workflow_logs(obj))

    @extend_schema_field(OpenApiTypes.OBJECT)
    def get_last_workflow_log(self, obj: Any) -> Optional[Dict[str, Any]]:
        logs = self._resolve_workflow_logs(obj)
        if not logs:
            return None
        data = DocumentWorkflowLogSerializer(logs[0]).data
        return _to_plain_dict(data)

    @extend_schema_field(serializers.ListField(child=serializers.JSONField()))
    def get_logs(self, obj: Any) -> List[Dict[str, Any]]:
        logs = self._resolve_workflow_logs(obj)
        data = DocumentWorkflowLogSerializer(logs, many=True).data
        return _to_plain_list_of_dicts(data)

    @extend_schema_field(OpenApiTypes.STR)
    def get_subject(self, obj: Any) -> Optional[str]:
        return getattr(obj, "summary", None) or getattr(obj, "title", None)

    @extend_schema_field(OpenApiTypes.OBJECT)
    def get_counts(self, obj: Any) -> Dict[str, int]:
        attachment_count = self.get_attachment_count(obj)
        version_rel = getattr(obj, "versions", None)
        if version_rel is not None:
            if hasattr(version_rel, "count"):
                try:
                    version_count = int(version_rel.count())
                except Exception:
                    version_count = len(list(version_rel))
            else:
                version_count = len(list(version_rel))
        else:
            version_count = 0

        assignments_count = len(_assignments_list(obj))
        approvals_rel = getattr(obj, "approvals", None)
        if approvals_rel is not None and hasattr(approvals_rel, "count"):
            try:
                approvals_count = int(approvals_rel.count())
            except Exception:
                approvals_count = len(list(approvals_rel))
        else:
            approvals_count = len(list(approvals_rel)) if approvals_rel is not None else 0

        return {
            "attachments": attachment_count,
            "versions": version_count,
            "assignments": assignments_count,
            "approvals": approvals_count,
        }

    @extend_schema_field(OpenApiTypes.OBJECT)
    def get_last_workflow_event(self, obj: Any) -> Optional[Dict[str, Any]]:
        action = getattr(obj, "last_workflow_action", None)
        at = getattr(obj, "last_workflow_at", None)
        actor_id = getattr(obj, "last_workflow_actor_id", None)
        if not action and not at and not actor_id:
            return None
        return {
            "action": action,
            "by_user_id": actor_id,
            "at": at,
        }

    @extend_schema_field(OpenApiTypes.STR)
    def get_security_level(self, obj: Any) -> Optional[str]:
        security = getattr(obj, "security_level", None)
        if security is None:
            return None
        return getattr(security, "level_name", None) or getattr(security, "name", None)

    @extend_schema_field(OpenApiTypes.STR)
    def get_important_level(self, obj: Any) -> Optional[str]:
        urgency = getattr(obj, "urgency_level", None)
        if urgency is None:
            return None
        return getattr(urgency, "level_name", None) or getattr(urgency, "name", None)

    @extend_schema_field(OpenApiTypes.STR)
    def get_created_by_id(self, obj: Any) -> Optional[Any]:
        return getattr(obj, "created_by_id", None)

    @extend_schema_field(OpenApiTypes.STR)
    def get_signer_id(self, obj: Any) -> Optional[Any]:
        return getattr(obj, "signed_by_id", None)

    @extend_schema_field(OpenApiTypes.STR)
    def get_inbound_ref_id(self, obj: Any) -> Optional[Any]:
        return getattr(obj, "inbound_ref_id", None)

    def validate(self, attrs: Dict[str, Any]) -> Dict[str, Any]:
        instance_dir = getattr(self.instance, "doc_direction", None) if self.instance else None
        if instance_dir is None and self.instance is not None:
            instance_dir = getattr(self.instance, "direction", None)
        direction = attrs.get("doc_direction") or instance_dir
        direction = getattr(direction, "value", direction)
        direction = str(direction or "").lower()
        raw = getattr(self, "initial_data", None)
        if raw is None:
            raw = attrs
        if direction == Document.Direction.DI and raw.get("incoming_number") is not None:
            raise serializers.ValidationError({"incoming_number": ["CAN_NOT_SET_FOR_OUTBOUND"]})
        if direction == Document.Direction.DEN and raw.get("outgoing_number") is not None:
            raise serializers.ValidationError({"outgoing_number": ["CAN_NOT_SET_FOR_INBOUND"]})
        return attrs


class DocumentUpsertSerializer(serializers.ModelSerializer):
    field_id = serializers.PrimaryKeyRelatedField(
        queryset=Field.objects.all(), source="field", required=False, allow_null=True
    )
    document_type_id = serializers.PrimaryKeyRelatedField(
        queryset=DocumentType.objects.all(),
        source="document_type",
        required=False,
        allow_null=True,
    )
    urgency_level_id = serializers.PrimaryKeyRelatedField(
        queryset=UrgencyLevel.objects.all(),
        source="urgency_level",
        required=False,
        allow_null=True,
    )
    security_level_id = serializers.PrimaryKeyRelatedField(
        queryset=SecurityLevel.objects.all(),
        source="security_level",
        required=False,
        allow_null=True,
    )
    issue_level_id = serializers.PrimaryKeyRelatedField(
        queryset=IssueLevel.objects.all(),
        source="issue_level",
        required=False,
        allow_null=True,
    )
    department_id = serializers.PrimaryKeyRelatedField(
        queryset=Department.objects.all(),
        source="department",
        required=False,
        allow_null=True,
    )
    status_id = serializers.PrimaryKeyRelatedField(
        queryset=DocumentStatus.objects.all(),
        source="status",
        required=False,
        allow_null=True,
    )
    field_name = serializers.CharField(write_only=True, required=False, allow_blank=True)
    document_type_name = serializers.CharField(write_only=True, required=False, allow_blank=True)
    department_name = serializers.CharField(write_only=True, required=False, allow_blank=True)
    urgency_level = serializers.CharField(write_only=True, required=False, allow_blank=True)
    security_level = serializers.CharField(write_only=True, required=False, allow_blank=True)

    class Meta:
        model = Document
        fields = (
            "document_id",
            "doc_direction",
            "document_code",
            "issue_number",
            "title",
            "field_id",
            "document_type_id",
            "urgency_level_id",
            "security_level_id",
            "issue_level_id",
            "is_legal_doc",
            "signing_method",
            "signer_position",
            "issued_date",
            "received_number",
            "received_date",
            "sender",
            "department_id",
            "field_name",
            "document_type_name",
            "department_name",
            "urgency_level",
            "security_level",
            "status_id",
        )
        read_only_fields = ("document_id",)

    def validate(self, attrs: Dict[str, Any]) -> Dict[str, Any]:
        instance = getattr(self, "instance", None)
        direction = attrs.get(
            "doc_direction",
            getattr(instance, "doc_direction", None),
        )
        if not direction:
            raise serializers.ValidationError({"doc_direction": "Bắt buộc chọn hướng văn bản."})

        def _ensure(field: str, message: str):
            if attrs.get(field) is None and not (instance and getattr(instance, field, None)):
                raise serializers.ValidationError({field: message})

        if direction == Document.Direction.DI:
            _ensure("issue_number", "Văn bản đi phải có số đi.")
            _ensure("issued_date", "Văn bản đi phải có ngày phát hành.")
            issued_date = attrs.get("issued_date") or getattr(instance, "issued_date", None)
            if issued_date:
                attrs["issue_year"] = issued_date.year
        elif direction == Document.Direction.DEN:
            _ensure("received_number", "Văn bản đến phải có số đến.")
            _ensure("received_date", "Văn bản đến phải có ngày đến.")
            _ensure("sender", "Văn bản đến phải có nơi gửi.")
        elif direction == Document.Direction.DU_THAO:
            _ensure("document_code", "Dự thảo phải có mã hồ sơ.")
            attrs["issue_year"] = None
        else:
            attrs["issue_year"] = None

        if instance and "doc_direction" in attrs and attrs["doc_direction"] != instance.doc_direction:
            raise serializers.ValidationError({"doc_direction": "Không thể đổi hướng văn bản hiện có."})

        self._resolve_related_from_name(attrs, "field", "field", Field, "field_name")
        self._resolve_related_from_name(
            attrs, "document_type_name", "document_type", DocumentType, "type_name"
        )
        self._resolve_related_from_name(attrs, "department_name", "department", Department, "name")
        self._resolve_related_from_name(
            attrs, "urgency_level", "urgency_level", UrgencyLevel, "level_name"
        )
        self._resolve_related_from_name(
            attrs, "security_level", "security_level", SecurityLevel, "level_name"
        )

        return attrs

    def create(self, validated_data: Dict[str, Any]) -> Document:
        self._strip_name_only_fields(validated_data)
        return super().create(validated_data)

    def update(self, instance: Document, validated_data: Dict[str, Any]) -> Document:
        self._strip_name_only_fields(validated_data)
        return super().update(instance, validated_data)

    def _strip_name_only_fields(self, data: Dict[str, Any]) -> None:
        for key in (
            "field_name",
            "document_type_name",
            "department_name",
            "urgency_level",
            "security_level",
        ):
            data.pop(key, None)

    def _resolve_related_from_name(
        self,
        attrs: Dict[str, Any],
        raw_key: str,
        rel_key: str,
        model: Type[Any],
        lookup_field: str,
    ) -> None:
        if rel_key in attrs and attrs.get(rel_key):
            return
        raw_value = self.initial_data.get(raw_key)
        if not raw_value:
            return
        normalized = str(raw_value).strip()
        if not normalized:
            return
        lookup_kwargs = {f"{lookup_field}__iexact": normalized}
        obj = model.objects.filter(**lookup_kwargs).first()
        if not obj:
            normalized_input = self._normalize_text(normalized)
            for candidate in model.objects.only(lookup_field):
                candidate_value = getattr(candidate, lookup_field, "")
                if candidate_value and self._normalize_text(candidate_value) == normalized_input:
                    obj = candidate
                    break
        if not obj:
            obj, _ = model.objects.get_or_create(**{lookup_field: normalized})
        attrs[rel_key] = obj

    def _normalize_text(self, value: str) -> str:
        normalized = unicodedata.normalize("NFD", value)
        return "".join(ch for ch in normalized if unicodedata.category(ch) != "Mn").lower().strip()


class DocumentAssignmentSerializer(serializers.ModelSerializer):
    user = CompactUserSerializer(read_only=True)
    assigned_by = CompactUserSerializer(read_only=True)

    class Meta:
        model = DocumentAssignment
        fields = (
            "id",
            "role_on_doc",
            "due_at",
            "assigned_at",
            "is_owner",
            "user",
            "assigned_by",
            "instruction",
        )
        read_only_fields = fields


class _AssignmentItemSerializer(serializers.Serializer):
    user_id = serializers.UUIDField(format="hex")
    role = serializers.ChoiceField(choices=DocumentAssignment.RoleOnDoc.choices)
    due_at = serializers.DateTimeField(required=False, allow_null=True)
    instruction = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    is_owner = serializers.BooleanField(required=False, default=False)


class DocumentAssignmentUpsertSerializer(serializers.Serializer):
    assignments = _AssignmentItemSerializer(many=True, allow_empty=True)
    append = serializers.BooleanField(required=False, default=False, write_only=True)

    def validate_assignments(self, value):
        seen = set()
        for item in value:
            uid = item["user_id"]
            if uid in seen:
                raise serializers.ValidationError("Trùng user_id trong danh sách.")
            seen.add(uid)
        return value

    def save(self, *, document: Document, assigned_by) -> List[DocumentAssignment]:
        validated = self.validated_data.get("assignments", [])
        append = bool(self.validated_data.get("append"))
        user_pk = getattr(User._meta.pk, "attname", "id")
        user_ids = [item["user_id"] for item in validated]
        users = {
            getattr(u, user_pk): u
            for u in User.objects.filter(**{f"{user_pk}__in": user_ids})
        }
        missing = [uid for uid in user_ids if uid not in users]
        if missing:
            raise serializers.ValidationError(
                {"assignments": [f"Không tìm thấy user_id {uid}" for uid in map(str, missing)]}
            )

        now = timezone.now()
        existing_qs = DocumentAssignment.objects.filter(document=document).select_related("user")
        if not append:
            existing_qs.delete()
            existing_qs = DocumentAssignment.objects.none()
        existing_by_user = {getattr(a.user, user_pk): a for a in existing_qs}
        rows: List[DocumentAssignment] = []
        updates: List[DocumentAssignment] = []
        for item in validated:
            user = users[item["user_id"]]
            existing = existing_by_user.get(getattr(user, user_pk))
            if append and existing:
                existing.role_on_doc = item["role"]
                existing.due_at = item.get("due_at")
                existing.instruction = item.get("instruction")
                existing.is_owner = item.get("is_owner", False)
                existing.assigned_by = assigned_by
                existing.assigned_at = now
                updates.append(existing)
                continue
            rows.append(
                DocumentAssignment(
                    document=document,
                    user=user,
                    role_on_doc=item["role"],
                    due_at=item.get("due_at"),
                    instruction=item.get("instruction"),
                    is_owner=item.get("is_owner", False),
                    assigned_by=assigned_by,
                    assigned_at=now,
                )
            )
        if rows:
            DocumentAssignment.objects.bulk_create(rows, ignore_conflicts=True)
        if updates:
            DocumentAssignment.objects.bulk_update(
                updates, ["role_on_doc", "due_at", "instruction", "is_owner", "assigned_by", "assigned_at"]
            )
        return list(
            DocumentAssignment.objects.filter(document=document)
            .select_related("user", "assigned_by")
            .order_by("-assigned_at")
        )


class DocumentApprovalSerializer(serializers.ModelSerializer):
    approver = CompactUserSerializer(read_only=True)

    class Meta:
        model = DocumentApproval
        fields = (
            "approval_id",
            "step_no",
            "approver",
            "decision",
            "decided_at",
            "sign_hash",
            "sign_meta",
        )
        read_only_fields = fields


class _ApprovalItemSerializer(serializers.Serializer):
    step_no = serializers.IntegerField(min_value=1)
    approver_id = serializers.UUIDField(format="hex")


class DocumentApprovalUpsertSerializer(serializers.Serializer):
    approvals = _ApprovalItemSerializer(many=True, allow_empty=True)

    def validate_approvals(self, value):
        steps = set()
        for item in value:
            step = item["step_no"]
            if step in steps:
                raise serializers.ValidationError("Trùng step_no trong danh sách.")
            steps.add(step)
        return value

    def save(self, *, document: Document) -> List[DocumentApproval]:
        validated = self.validated_data.get("approvals", [])
        user_pk = getattr(User._meta.pk, "attname", "id")
        approver_ids = [item["approver_id"] for item in validated]
        users = {
            getattr(u, user_pk): u
            for u in User.objects.filter(**{f"{user_pk}__in": approver_ids})
        }
        missing = [uid for uid in approver_ids if uid not in users]
        if missing:
            raise serializers.ValidationError(
                {"approvals": [f"Không tìm thấy approver_id {uid}" for uid in map(str, missing)]}
            )

        DocumentApproval.objects.filter(document=document).delete()
        rows: List[DocumentApproval] = []
        for item in validated:
            approver = users[item["approver_id"]]
            rows.append(
                DocumentApproval(
                    document=document,
                    step_no=item["step_no"],
                    approver=approver,
                    decision=DocumentApproval.Decision.PENDING,
                )
            )
        if rows:
            DocumentApproval.objects.bulk_create(rows)
        return list(
            DocumentApproval.objects.filter(document=document)
            .select_related("approver")
            .order_by("step_no")
        )


class DocumentApprovalDecisionSerializer(serializers.Serializer):
    decision = serializers.ChoiceField(
        choices=[
            DocumentApproval.Decision.APPROVE,
            DocumentApproval.Decision.REJECT,
        ]
    )
    note = serializers.CharField(required=False, allow_blank=True, allow_null=True)


class DocumentVersionSerializer(serializers.ModelSerializer):
    changed_by = CompactUserSerializer(read_only=True)

    class Meta:
        model = DocumentVersion
        fields = (
            "version_id",
            "version_no",
            "file_name",
            "storage_path",
            "changed_by",
            "changed_at",
        )
        read_only_fields = fields


class DocumentVersionCreateSerializer(serializers.Serializer):
    version_no = serializers.IntegerField(min_value=1)
    note = serializers.CharField(required=False, allow_blank=True, allow_null=True)


class OrganizationSerializer(serializers.ModelSerializer):
    dispatches_count = serializers.SerializerMethodField()
    documents_preview = serializers.SerializerMethodField()

    class Meta:
        model = Organization
        fields = (
            "organization_id",
            "name",
            "address",
            "email",
            "phone",
            "tax_code",
            "is_active",
            "dispatches_count",
            "documents_preview",
        )
        read_only_fields = ("organization_id",)

    def _with_counts(self) -> bool:
        return bool(self.context.get("with_counts"))

    def _with_docs(self) -> bool:
        return bool(self.context.get("with_docs"))

    def get_dispatches_count(self, obj: Organization) -> int | None:
        if not self._with_counts():
            return None
        if hasattr(obj, "dispatches_count"):
            return getattr(obj, "dispatches_count")
        return obj.dispatchoutbox_set.count()

    def get_documents_preview(self, obj: Organization) -> list[dict[str, Any]] | None:
        if not self._with_docs():
            return None
        qs = (
            obj.dispatchoutbox_set.select_related("document")
            .order_by("-sent_at")[:5]
            .values("document__document_id", "document__title")
        )
        preview = []
        for item in qs:
            preview.append(
                {
                    "document_id": item.get("document__document_id"),
                    "title": item.get("document__title"),
                }
            )
        return preview


class OrgContactSerializer(serializers.ModelSerializer):
    organization_id = serializers.IntegerField(write_only=True, required=False)

    class Meta:
        model = OrgContact
        fields = (
            "contact_id",
            "organization_id",
            "full_name",
            "email",
            "phone",
            "position",
        )
        read_only_fields = ("contact_id",)


class DocumentDispatchSerializer(serializers.ModelSerializer):
    organization = OrganizationSerializer(read_only=True)
    contact = OrgContactSerializer(read_only=True)

    class Meta:
        model = DispatchOutbox
        fields = (
            "dispatch_id",
            "document_id",
            "organization",
            "contact",
            "method",
            "sent_at",
            "status",
            "tracking_no",
            "note",
        )
        read_only_fields = ("dispatch_id", "document_id", "sent_at")


class DocumentDispatchCreateSerializer(serializers.Serializer):
    organization_id = serializers.IntegerField(required=False, allow_null=True)
    contact_id = serializers.IntegerField(required=False, allow_null=True)
    method = serializers.ChoiceField(choices=DispatchOutbox.Method.choices)
    note = serializers.CharField(required=False, allow_blank=True, allow_null=True)


class InboundDocumentCreateSerializer(serializers.ModelSerializer):
    department_id = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    received_number = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    received_date = serializers.DateField(required=False, allow_null=True)

    class Meta:
        model = Document
        fields = (
            "title",
            "sender",
            "received_number",
            "received_date",
            "department_id",
        )

    def create(self, validated_data: Dict[str, Any]) -> Document:
        validated_data["doc_direction"] = Document.Direction.DEN
        validated_data.setdefault("received_number", None)
        validated_data.setdefault("received_date", None)
        validated_data.setdefault("sender", None)
        user = self.context.get("request").user if self.context else None
        if user and getattr(user, "is_authenticated", False):
            validated_data.setdefault("created_by", user)
        return super().create(validated_data)

    def _clean_int_field(self, value):
        if value in ("", None):
            return None
        raw = str(value).strip()
        if raw.lower() in {"", "null", "undefined"}:
            return None
        try:
            return int(raw)
        except (TypeError, ValueError):
            raise serializers.ValidationError("A valid integer is required.")

    def validate_department_id(self, value):
        return self._clean_int_field(value)

    def validate_received_number(self, value):
        if value in ("", None):
            return None
        cleaned = str(value).strip()
        return cleaned or None

class DocumentDispatchUpdateSerializer(serializers.Serializer):
    status = serializers.ChoiceField(
        choices=DispatchOutbox.Status.choices, required=False
    )
    tracking_no = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    note = serializers.CharField(required=False, allow_blank=True, allow_null=True)

    # ------------------ VALIDATION (đầu vào thô) ------------------
    def validate(self, attrs: Dict[str, Any]) -> Dict[str, Any]:
        direction = self._extract_direction()
        incoming = attrs.get("incoming_number")
        outgoing = attrs.get("outgoing_number")

        if incoming and direction == "di":
            raise serializers.ValidationError({"incoming_number": ["CAN_NOT_SET_FOR_OUTBOUND"]})
        if outgoing and direction == "den":
            raise serializers.ValidationError({"outgoing_number": ["CAN_NOT_SET_FOR_INBOUND"]})
        return attrs

    def _extract_direction(self) -> Optional[str]:
        if getattr(self, "instance", None) is not None:
            if hasattr(self.instance, "direction"):
                val = getattr(self.instance, "direction")
                return getattr(val, "value", val)
        data = getattr(self, "initial_data", None)
        if isinstance(data, Mapping):
            dd = data.get("doc_direction")
            if dd is not None:
                return str(dd)
        return None


# ==================== ACTION SERIALIZERS ====================
try:
    from workflow.services import outbound_service as _outbound_svc  # type: ignore
    outbound_svc = cast(Any, _outbound_svc)
except Exception:
    outbound_svc = cast(Any, object())


class _BaseDocumentActionSerializer(ServiceErrorToDRFMixin, serializers.Serializer):
    comment = TrimmedCharField(required=False, allow_blank=True)
    meta = serializers.DictField(required=False, default=dict)

    def _get_instance(self) -> Document:
        inst = getattr(self, "instance", None)
        if inst is None:
            raise AssertionError("Action serializer requires 'instance=Document' at initialization.")
        return cast(Document, inst)

    def _get_user(self):
        ctx = cast(Dict[str, Any], getattr(self, "context", {}) or {})
        req = cast(Optional[Request], ctx.get("request"))
        return getattr(req, "user", None)


class TouchDraftActionSerializer(_BaseDocumentActionSerializer):
    def save(self, **kwargs) -> Document:
        doc = self._get_instance()
        user = self._get_user()
        data = cast(Dict[str, Any], self.validated_data)
        try:
            result = outbound_svc.touch_draft(
                user, doc,
                comment=data.get("comment"),
                meta=data.get("meta"),
            )
            return cast(Document, result or doc)
        except Exception as e:
            self.raise_from_service(e)


class SubmitActionSerializer(_BaseDocumentActionSerializer):
    def save(self, **kwargs) -> Document:
        doc = self._get_instance()
        user = self._get_user()
        data = cast(Dict[str, Any], self.validated_data)
        try:
            result = outbound_svc.submit(
                user, doc,
                comment=data.get("comment"),
                meta=data.get("meta"),
            )
            return cast(Document, result or doc)
        except Exception as e:
            self.raise_from_service(e)


class ReturnForFixActionSerializer(_BaseDocumentActionSerializer):
    comment = TrimmedCharField(required=True, allow_blank=False)

    def save(self, **kwargs) -> Document:
        doc = self._get_instance()
        user = self._get_user()
        data = cast(Dict[str, Any], self.validated_data)
        try:
            result = outbound_svc.return_for_fix(
                user, doc,
                comment=data.get("comment"),
                meta=data.get("meta"),
            )
            return cast(Document, result or doc)
        except Exception as e:
            self.raise_from_service(e)


class ApproveActionSerializer(_BaseDocumentActionSerializer):
    def save(self, **kwargs) -> Document:
        doc = self._get_instance()
        user = self._get_user()
        data = cast(Dict[str, Any], self.validated_data)
        try:
            result = outbound_svc.approve(
                user, doc,
                comment=data.get("comment"),
                meta=data.get("meta"),
            )
            return cast(Document, result or doc)
        except Exception as e:
            self.raise_from_service(e)


class SignActionSerializer(_BaseDocumentActionSerializer):
    SIGNING_METHOD_CHOICES = ("digital", "wet", "stamp")
    signing_method = serializers.ChoiceField(choices=SIGNING_METHOD_CHOICES, required=True)

    def save(self, **kwargs) -> Document:
        doc = self._get_instance()
        user = self._get_user()
        data = cast(Dict[str, Any], self.validated_data)
        try:
            result = outbound_svc.sign(
                user, doc,
                signing_method=data.get("signing_method"),
                comment=data.get("comment"),
                meta=data.get("meta"),
            )
            return cast(Document, result or doc)
        except Exception as e:
            self.raise_from_service(e)


class ReceiveForFinalCheckActionSerializer(_BaseDocumentActionSerializer):
    def save(self, **kwargs) -> Document:
        doc = self._get_instance()
        user = self._get_user()
        data = cast(Dict[str, Any], self.validated_data)
        try:
            result = outbound_svc.receive_for_final_check(
                user, doc,
                note=data.get("comment"),
                meta=data.get("meta"),
            )
            return cast(Document, result or doc)
        except Exception as e:
            self.raise_from_service(e)


class FinalCheckRejectActionSerializer(_BaseDocumentActionSerializer):
    def save(self, **kwargs) -> Document:
        doc = self._get_instance()
        user = self._get_user()
        data = cast(Dict[str, Any], self.validated_data)
        try:
            result = outbound_svc.final_check_reject(
                user, doc,
                reason=data.get("comment"),
                meta=data.get("meta"),
            )
            return cast(Document, result or doc)
        except Exception as e:
            self.raise_from_service(e)


class LeaderRequestChangesFromClerkActionSerializer(_BaseDocumentActionSerializer):
    def save(self, **kwargs) -> Document:
        doc = self._get_instance()
        user = self._get_user()
        data = cast(Dict[str, Any], self.validated_data)
        try:
            result = outbound_svc.leader_request_changes_from_clerk(
                user, doc,
                note=data.get("comment"),
                meta=data.get("meta"),
            )
            return cast(Document, result or doc)
        except Exception as e:
            self.raise_from_service(e)


class FinalizeRegistrationActionSerializer(_BaseDocumentActionSerializer):
    register_book_id = serializers.IntegerField(required=False, allow_null=True, min_value=1)
    
    def save(self, **kwargs) -> Document:
        doc = self._get_instance()
        user = self._get_user()
        data = cast(Dict[str, Any], self.validated_data)
        try:
            result = outbound_svc.finalize_registration(
                user, doc,
                note=data.get("comment"),
                register_book_id=data.get("register_book_id"),
                meta=data.get("meta"),
            )
            return cast(Document, result or doc)
        except Exception as e:
            self.raise_from_service(e)


class PublishActionSerializer(_BaseDocumentActionSerializer):
    SERVICE_CODE_FIELD_MAP: Dict[str, str] = {}
    SERVICE_CODE_FIELD_MAP.update(getattr(_BaseDocumentActionSerializer, "SERVICE_CODE_FIELD_MAP", {}))
    SERVICE_CODE_FIELD_MAP.update({"DUPLICATE_ISSUE_NUMBER": "issue_number"})

    issue_number = TrimmedCharField(required=False, allow_blank=True, allow_null=True)
    issued_date = serializers.DateField(required=False, allow_null=True)
    channels = serializers.ListField(child=TrimmedCharField(), required=False, allow_empty=True)
    prefix = TrimmedCharField(required=False, allow_blank=True, allow_null=True)
    postfix = TrimmedCharField(required=False, allow_blank=True, allow_null=True)
    year = serializers.IntegerField(required=False, allow_null=True, min_value=1900)

    def validate_issue_number(self, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        vv = v.strip()
        return vv or None

    def save(self, **kwargs) -> Document:
        doc = self._get_instance()
        user = self._get_user()
        data = cast(Dict[str, Any], self.validated_data)
        try:
            result = outbound_svc.publish(
                user, doc,
                issue_number=data.get("issue_number"),
                issued_date=data.get("issued_date"),
                channels=data.get("channels"),
                prefix=data.get("prefix"),
                postfix=data.get("postfix"),
                year=data.get("year"),
                comment=data.get("comment"),
                meta=data.get("meta"),
            )
            if isinstance(result, tuple) and len(result) == 2:
                doc_result, numbering = result
            else:
                doc_result = result
                numbering = None
            return {"document": doc_result or doc, "numbering": numbering}
        except Exception as e:
            self.raise_from_service(e)


class WithdrawPublishActionSerializer(_BaseDocumentActionSerializer):
    def save(self, **kwargs) -> Document:
        doc = self._get_instance()
        user = self._get_user()
        data = cast(Dict[str, Any], self.validated_data)
        try:
            result = outbound_svc.withdraw_publish(
                user, doc,
                comment=data.get("comment"),
                meta=data.get("meta"),
            )
            return cast(Document, result or doc)
        except Exception as e:
            self.raise_from_service(e)


class ArchiveActionSerializer(_BaseDocumentActionSerializer):
    def save(self, **kwargs) -> Document:
        doc = self._get_instance()
        user = self._get_user()
        data = cast(Dict[str, Any], self.validated_data)
        try:
            result = outbound_svc.archive(
                user, doc,
                comment=data.get("comment"),
                meta=data.get("meta"),
            )
            return cast(Document, result or doc)
        except Exception as e:
            self.raise_from_service(e)


# ==== OpenAPI schema-only serializers (shared across views) ====
from rest_framework import serializers as drf_serializers  # alias để phân biệt, vẫn dùng được song song


class APIErrorSerializer(drf_serializers.Serializer):
    detail = drf_serializers.CharField()
    extra = drf_serializers.JSONField(required=False)


class StatusOnlyResponseSerializer(drf_serializers.Serializer):
    status_id = drf_serializers.IntegerField()


class DraftInitResponseSerializer(StatusOnlyResponseSerializer):
    doc_direction = drf_serializers.CharField(allow_null=True, required=False)


class PublishResponseSerializer(StatusOnlyResponseSerializer):
    issue_number = drf_serializers.CharField(allow_null=True, required=False)
    issued_date = drf_serializers.DateField(allow_null=True, required=False)


class RegisterImportSerializer(drf_serializers.Serializer):
    register_id = drf_serializers.IntegerField(required=True, min_value=1)
    items = drf_serializers.ListField(
        child=drf_serializers.DictField(), required=False, allow_empty=True
    )
    file = drf_serializers.FileField(required=False, allow_empty_file=False)


class RegisterImportResponseSerializer(drf_serializers.Serializer):
    accepted = drf_serializers.IntegerField()
    skipped = drf_serializers.IntegerField()
    job_id = drf_serializers.CharField(required=False, allow_null=True)


class RegisterExportQuerySerializer(drf_serializers.Serializer):
    register_id = drf_serializers.IntegerField(required=False, min_value=1)
    year = drf_serializers.IntegerField(required=False, min_value=2000)
    direction = drf_serializers.CharField(required=False, allow_blank=True)


class RegisterExportResponseSerializer(drf_serializers.Serializer):
    download_url = drf_serializers.CharField()
    total_rows = drf_serializers.IntegerField(required=False)


class DocumentImportSerializer(drf_serializers.Serializer):
    direction = drf_serializers.CharField(required=False, allow_blank=True)
    items = drf_serializers.ListField(
        child=drf_serializers.DictField(), required=False, allow_empty=True
    )
    file = drf_serializers.FileField(required=False, allow_empty_file=False)


class DocumentImportResponseSerializer(drf_serializers.Serializer):
    accepted = drf_serializers.IntegerField()
    skipped = drf_serializers.IntegerField()
    job_id = drf_serializers.CharField(required=False, allow_null=True)


class DocumentExportQuerySerializer(drf_serializers.Serializer):
    direction = drf_serializers.CharField(required=False, allow_blank=True)
    status = drf_serializers.CharField(required=False, allow_blank=True)
    level = drf_serializers.CharField(required=False, allow_blank=True)
    keyword = drf_serializers.CharField(required=False, allow_blank=True)
    page_size = drf_serializers.IntegerField(required=False, min_value=1, max_value=2000)
    ordering = drf_serializers.CharField(required=False, allow_blank=True)


class DocumentExportResponseSerializer(drf_serializers.Serializer):
    download_url = drf_serializers.CharField()
    total_rows = drf_serializers.IntegerField(required=False)


# ------- Inbound action request payloads (schema-only) --------
class ReceiveInboundActionSerializer(drf_serializers.Serializer):
    note = drf_serializers.CharField(required=False, allow_blank=True)


class RegisterInboundActionSerializer(drf_serializers.Serializer):
    received_number = drf_serializers.IntegerField()
    received_date = drf_serializers.DateField()
    sender = drf_serializers.CharField()


class AssignInboundActionSerializer(drf_serializers.Serializer):
    assignees = drf_serializers.ListField(
        child=drf_serializers.IntegerField(min_value=1),
        required=True,
        allow_empty=False,
        help_text="Danh sách user_id được phân công",
    )
    due_at = drf_serializers.DateTimeField(required=False, allow_null=True)
    instruction = drf_serializers.CharField(required=False, allow_blank=True, allow_null=True)


class StartInboundActionSerializer(drf_serializers.Serializer):
    pass


class CompleteInboundActionSerializer(drf_serializers.Serializer):
    note = drf_serializers.CharField(required=False, allow_blank=True)


class ArchiveInboundActionSerializer(drf_serializers.Serializer):
    reason = drf_serializers.CharField(required=False, allow_blank=True, allow_null=True)


class WithdrawInboundActionSerializer(drf_serializers.Serializer):
    reason = drf_serializers.CharField(required=False, allow_blank=True, allow_null=True)


class DocumentSerializer(DocumentDetailSerializer):
    """
    Bridge serializer để tương thích với views_outbound.py.
    Kế thừa DocumentDetailSerializer để trả full-detail cho cả list & retrieve.
    """
    pass
