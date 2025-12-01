# documents/filters.py
from __future__ import annotations

from typing import Optional, List
import django_filters
from django.db.models import Q, QuerySet
from django.db.models.fields import DateTimeField
from workflow.services.status_resolver import InboundStatus, OutboundStatus, canonical_status_key

from documents.models import Document, DocumentAssignment


INBOUND_KIND_STATUSES = {
    InboundStatus.RECEIVED.value,
    InboundStatus.WAITING_ASSIGNMENT.value,
    InboundStatus.PROCESSING.value,
    InboundStatus.PENDING_LEADER_APPROVAL.value,
    InboundStatus.PENDING_CLERK_CHECK.value,
    InboundStatus.REGISTERED.value,
    InboundStatus.DISPATCHED.value,
    InboundStatus.ARCHIVED.value,
    InboundStatus.THU_HOI.value,
}

OUTBOUND_DRAFT_STATUSES = {
    OutboundStatus.DRAFT.value,
    OutboundStatus.SUBMITTED.value,
    OutboundStatus.RETURNED.value,
    OutboundStatus.LEGACY_DU_THAO.value,
    OutboundStatus.LEGACY_TRINH_DUYET.value,
    OutboundStatus.LEGACY_TRA_LAI.value,
    "DA_TRINH",
    "TRINH_LANH_DAO",
    "DA_TRINH_LANH_DAO",
    "TRINH_LD",
    "DA_TRINH_LD",
    "CHO_LANH_DAO_PHE_DUYET",
    "CHO_LD_PHE_DUYET",
    "BI_TRA_LAI",
}

OUTBOUND_OFFICIAL_STATUSES = {
    OutboundStatus.APPROVED.value,
    OutboundStatus.PENDING_CLERK_CHECK.value,
    OutboundStatus.REGISTERED.value,
    OutboundStatus.ISSUED.value,
    OutboundStatus.ARCHIVED.value,
    OutboundStatus.HUY_PHAT_HANH.value,
    OutboundStatus.LEGACY_PHE_DUYET.value,
    OutboundStatus.LEGACY_KY_SO.value,
    OutboundStatus.LEGACY_PHAT_HANH.value,
    OutboundStatus.LEGACY_LUU_TRU.value,
    "LD_DA_PHE_DUYET",
    "DA_PHAT_HANH",
    "CHO_VAN_THU_KIEM_TRA",
    "CHO_VT_KIEM_TRA",
}

OFFICIAL_KIND_STATUSES = INBOUND_KIND_STATUSES.union(OUTBOUND_OFFICIAL_STATUSES)

STATUS_NAME_ALIASES = {
    "RECEIVED": {"RECEIVED", "TIEP_NHAN", "DANG_KY"},
    "WAITING_ASSIGNMENT": {"WAITING_ASSIGNMENT", "PHAN_CONG"},
    "PROCESSING": {"PROCESSING", "DANG_XU_LY"},
    "PENDING_LEADER_APPROVAL": {"PENDING_LEADER_APPROVAL", "HOAN_TAT"},
    "PENDING_CLERK_CHECK": {"PENDING_CLERK_CHECK"},
    "REGISTERED": {"REGISTERED", "LUU_TRU"},
    "DISPATCHED": {"DISPATCHED"},
    "ARCHIVED": {"ARCHIVED", "LUU_TRU"},
}


class DocumentFilterSet(django_filters.FilterSet):
    """
    Tham số hỗ trợ:
      - q: tìm kiếm nhanh (title, summary, content, numbers, sender, recipient) — chỉ add field nếu tồn tại
      - status: id hoặc code trạng thái (vd: 3 hoặc 'PUBLISHED')
      - doc_direction: 'di' | 'den' (viewset đã cố định nhưng vẫn hỗ trợ)
      - department, urgency, security: id (urgency/security tự map sang urgency_level/security_level nếu có)
      - creator: id người tạo (created_by)
      - assignee: id người được phân công
      - has_attachments: true/false
      - date_from/date_to: phạm vi ngày (issued_date cho outbound, received_date cho inbound)
      - mine: true → lọc theo assignees chứa request.user
      - ordering: created_at, updated_at, issued_date, received_date (tiền tố '-' để giảm dần)
    """

    q = django_filters.CharFilter(method="filter_q")
    status = django_filters.CharFilter(method="filter_status")
    doc_direction = django_filters.CharFilter(method="filter_doc_direction")
    direction = django_filters.CharFilter(method="filter_direction")
    kind = django_filters.CharFilter(method="filter_kind")

    # department/creator để nguyên theo tên phổ biến
    department = django_filters.NumberFilter(field_name="department_id")
    department_id = django_filters.NumberFilter(field_name="department_id")
    creator = django_filters.NumberFilter(field_name="created_by_id")

    # urgency/security map an toàn theo schema
    urgency = django_filters.NumberFilter(method="filter_urgency")
    security = django_filters.NumberFilter(method="filter_security")

    assignee = django_filters.NumberFilter(method="filter_assignee")
    assignee_id = django_filters.NumberFilter(method="filter_assignee")
    assigned_to = django_filters.NumberFilter(method="filter_assigned_to")
    assigned_to_id = django_filters.NumberFilter(method="filter_assigned_to")
    my_role = django_filters.CharFilter(method="filter_my_role")
    has_attachments = django_filters.BooleanFilter(method="filter_has_attachments")
    date_from = django_filters.DateFilter(method="filter_date_from")
    date_to = django_filters.DateFilter(method="filter_date_to")
    received_date_from = django_filters.DateFilter(method="filter_received_date_from")
    received_date_to = django_filters.DateFilter(method="filter_received_date_to")
    issued_date_from = django_filters.DateFilter(method="filter_issued_date_from")
    issued_date_to = django_filters.DateFilter(method="filter_issued_date_to")
    mine = django_filters.BooleanFilter(method="filter_mine")

    ordering = django_filters.CharFilter(method="filter_ordering")
    sort = django_filters.CharFilter(method="filter_sort")

    class Meta:
        model = Document
        fields = [
            "q",
            "status",
            "doc_direction",
            "direction",
            "kind",
            "department",
            "department_id",
            "urgency",
            "security",
            "creator",
            "assignee",
            "assignee_id",
            "assigned_to",
            "assigned_to_id",
            "my_role",
            "has_attachments",
            "date_from",
            "date_to",
            "received_date_from",
            "received_date_to",
            "issued_date_from",
            "issued_date_to",
            "mine",
            "ordering",
            "sort",
        ]

    # ================= Helpers =================
    @staticmethod
    def _has_field(field_name: str) -> bool:
        try:
            Document._meta.get_field(field_name)  # type: ignore[attr-defined]
            return True
        except Exception:
            return False

    @staticmethod
    def _is_datetime_field(field_name: str) -> bool:
        try:
            f = Document._meta.get_field(field_name)  # type: ignore[attr-defined]
            return isinstance(f, DateTimeField)
        except Exception:
            return False

    def _date_field_name(self) -> str:
        """
        Outbound view: issued_date; Inbound view: received_date; fallback: created_at → id.
        """
        data = getattr(self, "data", None)
        direction = None
        if data:
            direction = data.get("doc_direction")

        if not direction:
            req = getattr(self, "request", None)
            direction = getattr(req, "doc_direction_hint", None)

        if direction == "di" and self._has_field("issued_date"):
            return "issued_date"
        if direction == "den" and self._has_field("received_date"):
            return "received_date"

        if self._has_field("created_at"):
            return "created_at"
        return "id"

    def _map_order_field(self, name: str) -> str:
        """
        Map nhãn order bên ngoài → field thật trong DB (tồn tại).
        """
        candidate_map = {
            "created_at": ["created_at", "created_on", "created"],
            "updated_at": ["updated_at", "modified_at", "updated", "modified", "created_at"],
            "issued_date": ["issued_date", "created_at"],
            "received_date": ["received_date", "created_at"],
        }
        for cand in candidate_map.get(name, [name]):
            if self._has_field(cand):
                return cand
        return "created_at" if self._has_field("created_at") else "id"

    # ================= Implementations =================
    def filter_q(self, qs: QuerySet[Document], name: str, value: Optional[str]) -> QuerySet[Document]:
        if not value:
            return qs

        # Chỉ add điều kiện cho những field thực sự tồn tại
        cond = Q()
        for field in (
            "title",
            "summary",
            "content",
            "issue_number",
            "received_number",
            "sender",
            "recipient",
        ):
            if self._has_field(field):
                cond |= Q(**{f"{field}__icontains": value})

        # Nếu không field nào tồn tại, giữ nguyên qs (không raise lỗi)
        if cond == Q():
            return qs
        try:
            return qs.filter(cond)
        except Exception:
            # Trong trường hợp schema đặc biệt vẫn sinh lỗi, trả về qs để an toàn
            return qs

    def _direction_hint(self) -> Optional[str]:
        data = getattr(self, "data", None) or {}
        direction = data.get("direction") or data.get("doc_direction")
        if direction:
            return str(direction)
        req = getattr(self, "request", None)
        return getattr(req, "doc_direction_hint", None)

    def _canonical_direction(self) -> Optional[str]:
        hint = self._direction_hint()
        if not hint:
            return None
        upper = str(hint).strip().upper()
        if upper in {"DI", "DU_THAO", "OUTBOUND"}:
            return "OUTBOUND"
        if upper in {"DEN", "INBOUND"}:
            return "INBOUND"
        return None

    def filter_status(self, qs: QuerySet[Document], name: str, value: Optional[str]) -> QuerySet[Document]:
        if value is None or value == "":
            return qs
        raw_items = [v.strip() for v in str(value).split(",") if v.strip()]
        if not raw_items:
            return qs

        status_ids: List[int] = []
        status_names: List[str] = []
        direction = self._canonical_direction()

        for item in raw_items:
            if item.isdigit():
                try:
                    status_ids.append(int(item))
                except Exception:
                    continue
                continue
            canonical = canonical_status_key(item, direction=direction)
            if canonical:
                status_names.append(canonical)
                continue
            candidates = STATUS_NAME_ALIASES.get(item.upper())
            if candidates:
                status_names.extend(list(candidates))
                continue
            status_names.append(item)

        try:
            cond = Q()
            if status_ids:
                cond |= Q(status_id__in=status_ids)
            if status_names:
                cond |= Q(status__status_name__in=status_names)
            return qs.filter(cond)
        except Exception:
            return qs.none()

    def filter_kind(self, qs: QuerySet[Document], name: str, value: Optional[str]) -> QuerySet[Document]:
        if not value:
            return qs
        slug = str(value).strip().upper()
        try:
            if slug == "DRAFT":
                return qs.filter(status__status_name__in=OUTBOUND_DRAFT_STATUSES)
            if slug == "OFFICIAL":
                return qs.filter(status__status_name__in=OFFICIAL_KIND_STATUSES)
        except Exception:
            return qs
        return qs

    def filter_doc_direction(self, qs: QuerySet[Document], name: str, value: Optional[str]) -> QuerySet[Document]:
        """
        Hỗ trợ cả field "doc_direction" và "direction" trong model.
        """
        if not value:
            return qs
        v = str(value).strip().lower()
        try:
            if self._has_field("doc_direction"):
                return qs.filter(doc_direction__iexact=v)
            if self._has_field("direction"):
                return qs.filter(direction__iexact=v)
        except Exception:
            return qs
        return qs

    def filter_direction(self, qs: QuerySet[Document], name: str, value: Optional[str]) -> QuerySet[Document]:
        if not value:
            return qs
        v = str(value).strip().upper()
        mapping = {
            "INBOUND": ["den"],
            "OUTBOUND": ["di", "du_thao"],
            "DI": ["di"],
            "DEN": ["den"],
            "DU_THAO": ["du_thao"],
            "DRAFT": ["du_thao"],
        }
        values = mapping.get(v)
        if values:
            return qs.filter(doc_direction__in=values)
        return qs

    def filter_urgency(self, qs: QuerySet[Document], name: str, value) -> QuerySet[Document]:
        if value in (None, ""):
            return qs
        try:
            if self._has_field("urgency"):
                return qs.filter(urgency_id=value)
            if self._has_field("urgency_level"):
                return qs.filter(urgency_level_id=value)
        except Exception:
            return qs.none()
        return qs

    def filter_security(self, qs: QuerySet[Document], name: str, value) -> QuerySet[Document]:
        if value in (None, ""):
            return qs
        try:
            if self._has_field("security"):
                return qs.filter(security_id=value)
            if self._has_field("security_level"):
                return qs.filter(security_level_id=value)
        except Exception:
            return qs.none()
        return qs

    def filter_assignee(self, qs: QuerySet[Document], name: str, value) -> QuerySet[Document]:
        try:
            return qs.filter(assignments__user__id=value).distinct()
        except Exception:
            return qs.none()

    def filter_assigned_to(self, qs: QuerySet[Document], name: str, value) -> QuerySet[Document]:
        return self.filter_assignee(qs, name, value)

    def filter_my_role(self, qs: QuerySet[Document], name: str, value: Optional[str]) -> QuerySet[Document]:
        if not value:
            return qs
        req = getattr(self, "request", None)
        user = getattr(req, "user", None)
        if not user or not getattr(user, "is_authenticated", False):
            return qs.none()
        role = str(value).strip().lower()
        role_map = {
            "owner": DocumentAssignment.RoleOnDoc.OWNER.value,
            "assignee": DocumentAssignment.RoleOnDoc.ASSIGNEE.value,
            "watcher": DocumentAssignment.RoleOnDoc.WATCHER.value,
        }
        target = role_map.get(role, role)
        try:
            return qs.filter(
                assignments__user_id=user.id,
                assignments__role_on_doc__iexact=target,
            ).distinct()
        except Exception:
            return qs.none()

    def filter_has_attachments(self, qs: QuerySet[Document], name: str, value: Optional[bool]) -> QuerySet[Document]:
        if value is None:
            return qs
        try:
            if value:
                return qs.filter(attachments__isnull=False).distinct()
            return qs.filter(attachments__isnull=True)
        except Exception:
            return qs.none()

    def filter_date_from(self, qs: QuerySet[Document], name: str, value) -> QuerySet[Document]:
        field = self._date_field_name()
        try:
            lookup = f"{field}__date__gte" if self._is_datetime_field(field) else f"{field}__gte"
            return qs.filter(**{lookup: value})
        except Exception:
            return qs

    def filter_date_to(self, qs: QuerySet[Document], name: str, value) -> QuerySet[Document]:
        field = self._date_field_name()
        try:
            lookup = f"{field}__date__lte" if self._is_datetime_field(field) else f"{field}__lte"
            return qs.filter(**{lookup: value})
        except Exception:
            return qs

    def _filter_date_field(self, qs: QuerySet[Document], field: str, lookup: str, value) -> QuerySet[Document]:
        if value in (None, ""):
            return qs
        if not self._has_field(field):
            return qs
        try:
            lk = f"{field}__date__{lookup}" if self._is_datetime_field(field) else f"{field}__{lookup}"
            return qs.filter(**{lk: value})
        except Exception:
            return qs

    def filter_received_date_from(self, qs: QuerySet[Document], name: str, value) -> QuerySet[Document]:
        return self._filter_date_field(qs, "received_date", "gte", value)

    def filter_received_date_to(self, qs: QuerySet[Document], name: str, value) -> QuerySet[Document]:
        return self._filter_date_field(qs, "received_date", "lte", value)

    def filter_issued_date_from(self, qs: QuerySet[Document], name: str, value) -> QuerySet[Document]:
        return self._filter_date_field(qs, "issued_date", "gte", value)

    def filter_issued_date_to(self, qs: QuerySet[Document], name: str, value) -> QuerySet[Document]:
        return self._filter_date_field(qs, "issued_date", "lte", value)

    def filter_mine(self, qs: QuerySet[Document], name: str, value: Optional[bool]) -> QuerySet[Document]:
        if not value:
            return qs
        req = getattr(self, "request", None)
        user = getattr(req, "user", None)
        if user and getattr(user, "is_authenticated", False):
            try:
                return qs.filter(assignments__user_id=user.id).distinct()
            except Exception:
                return qs.none()
        return qs.none()

    def filter_ordering(self, qs: QuerySet[Document], name: str, value: Optional[str]) -> QuerySet[Document]:
        """
        Hỗ trợ: created_at, updated_at, issued_date, received_date (có thể nhiều, phân tách bởi ',').
        Tự map sang field thực tế có tồn tại trong model để tránh lỗi.
        """
        if not value:
            return qs

        parts = [p.strip() for p in str(value).split(",") if p.strip()]
        order_by_fields: List[str] = []

        for p in parts:
            desc = p.startswith("-")
            key = p[1:] if desc else p
            mapped = self._map_order_field(key)
            if mapped:
                order_by_fields.append(f"-{mapped}" if desc else mapped)

        if not order_by_fields:
            return qs
        try:
            return qs.order_by(*order_by_fields)
        except Exception:
            return qs

    def filter_sort(self, qs: QuerySet[Document], name: str, value: Optional[str]) -> QuerySet[Document]:
        """
        Alias cho ordering (sort=-issued_date,title).
        """
        return self.filter_ordering(qs, name, value)
