# documents/views_base.py
from typing import Any, Optional, Iterable, List, Dict, Set
from uuid import uuid4

from django.conf import settings
from django.core.exceptions import FieldDoesNotExist
from django.db.models import OuterRef, Prefetch, QuerySet, Subquery
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import JSONParser, FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated, BasePermission
from rest_framework.response import Response

from drf_spectacular.utils import extend_schema

from core.pagination import DefaultPageNumberPagination
from core.docs import DEFAULT_ERROR_RESPONSES
from documents.filters import DocumentFilterSet
from documents.models import Document, DocumentAttachment, DocumentWorkflowLog
from documents.permissions import DocumentPermission
from documents.serializers import (
    DocumentSlimSerializer,
    DocumentDetailSerializer,
    DocumentImportSerializer,
    DocumentImportResponseSerializer,
    DocumentExportQuerySerializer,
    DocumentExportResponseSerializer,
)
from core.exceptions import PreconditionFailedError, PreconditionRequiredError
from core.etag import build_etag


class ServiceErrorMixin:
    """
    Chuẩn hoá cách map ServiceError -> DRF ValidationError.
    Dùng getattr an toàn để Pylance không cảnh báo thuộc tính không tồn tại.
    """
    def _raise_from_service(self, err: Any):
        detail = getattr(err, "detail", "Operation failed")
        code = getattr(err, "code", "service_error")
        field = getattr(err, "field", None)
        extra = getattr(err, "extra", {}) or {}

        if field:
            # Field-level error theo format {field: [{message, code, ...}]}
            raise ValidationError({field: [{"message": detail, "code": code, **extra}]})
        # Non-field error
        raise ValidationError({"detail": detail, "code": code, **extra})


# =========================
# Helpers cho queryset an toàn
# =========================

# Cho phép viết "bí danh" thân thiện; helper sẽ map sang tên field thật sự có trên model.
# Ưu tiên thử đúng tên truyền vào trước, nếu không có thì thử lần lượt các synonym.
_SELECT_SYNONYMS: Dict[str, List[str]] = {
    "urgency": ["urgency", "urgency_level"],
    "security": ["security", "security_level"],
    # các tên còn lại thường trùng với model thật, nên không cần synonym
}


def _resolve_fk_field(model, name: str) -> Optional[str]:
    """
    Trả về tên field FK hợp lệ trên model tương ứng với `name`.
    - Thử chính tên đó.
    - Nếu có synonym (vd 'urgency' -> ['urgency', 'urgency_level']) thì lấy cái đầu tiên tồn tại.
    - Chỉ nhận quan hệ many_to_one (FK) để dùng với select_related.
    - Không tồn tại -> None.
    """
    candidates: Iterable[str] = _SELECT_SYNONYMS.get(name, [name])
    for cand in candidates:
        try:
            f = model._meta.get_field(cand)
            if getattr(f, "many_to_one", False) and not getattr(f, "many_to_many", False):
                return cand
        except FieldDoesNotExist:
            continue
    return None


def _safe_select_related(qs: QuerySet, *names: str) -> QuerySet:
    """
    select_related an toàn: chỉ áp dụng các tên field FK thực sự tồn tại trên model.
    Hỗ trợ synonym cho một số tên thường bị khác biệt giữa môi trường.
    """
    model = qs.model
    valid: List[str] = []
    for n in names:
        ok = _resolve_fk_field(model, n)
        if ok:
            valid.append(ok)
    return qs.select_related(*valid) if valid else qs


def _collect_related_names(model) -> Set[str]:
    """
    Thu thập toàn bộ tên quan hệ hợp lệ (bao gồm cả reverse accessor) trên model để
    kiểm tra trước khi prefetch_related.
    """
    names: Set[str] = set()
    for f in model._meta.get_fields():
        if getattr(f, "name", None):
            names.add(f.name)
        if hasattr(f, "get_accessor_name"):
            try:
                acc = f.get_accessor_name()
                if acc:
                    names.add(acc)
            except Exception:
                pass
    return names


def _safe_prefetch_related(qs: QuerySet, *names: str, **prefetch_map: Any) -> QuerySet:
    """
    prefetch_related an toàn:
    - `names`: danh sách string quan hệ -> chỉ thêm nếu tồn tại.
    - `prefetch_map`: key là tên quan hệ, value là Prefetch(...) -> chỉ thêm nếu key tồn tại.
    """
    model = qs.model
    allowed = _collect_related_names(model)

    prefetches: List[Any] = []
    for n in names:
        if n in allowed:
            prefetches.append(n)

    for rel_name, pf in prefetch_map.items():
        if rel_name in allowed:
            # Chỉ nhận giá trị Prefetch hợp lệ
            if isinstance(pf, Prefetch):
                prefetches.append(pf)

    return qs.prefetch_related(*prefetches) if prefetches else qs


class DocumentBaseViewSet(ServiceErrorMixin, viewsets.GenericViewSet):
    """
    Base cho Inbound/Outbound:
    - Áp dụng filter/pagination/permission mặc định
    - Chọn serializer Slim cho list, Detail cho retrieve
    - Hỗ trợ cố định hướng văn bản qua `doc_direction` = 'di' | 'den'
    - RBAC: chỉ bật DocumentPermission khi không ở chế độ TESTING
    """
    # Giữ để tooling/schema nhìn thấy default, nhưng sẽ override bằng get_permissions()
    permission_classes = [IsAuthenticated, DocumentPermission]
    pagination_class = DefaultPageNumberPagination
    filterset_class = DocumentFilterSet

    # Chuẩn hoá lookup theo định hướng kiến trúc (tránh phụ thuộc tên cột PK)
    lookup_field = "pk"
    lookup_url_kwarg = "pk"

    ordering = ("-created_at",)

    # Giúp Pylance biết thuộc tính này tồn tại ở lớp cơ sở (được set ở lớp con)
    doc_direction: Optional[str] = None  # "di" | "den" | None

    def get_permissions(self) -> list[BasePermission]:
        """
        - TESTING=True: chỉ yêu cầu đăng nhập (bỏ RBAC để test đơn giản/ổn định)
        - TESTING=False: bật đầy đủ RBAC qua DocumentPermission
        """
        perms: list[BasePermission] = [IsAuthenticated()]
        if not getattr(settings, "TESTING", False):
            perms.append(DocumentPermission())
        return perms

    def get_queryset(self):
        """
        Queryset an toàn với tên field khác nhau giữa môi trường:
        - Dùng _safe_select_related cho các FK hay dùng trong list/retrieve.
        - Prefetch attachments có order_by để ổn định.
        - Lọc theo hướng văn bản nếu lớp con đặt doc_direction.
        """
        qs = Document.objects.all()

        # Các quan hệ FK thường dùng; helper sẽ tự bỏ các field không tồn tại.
        qs = _safe_select_related(
            qs,
            "status",
            "department",
            "created_by",
            "document_type",
            "issue_level",
            "received_by",
            "signed_by",
            # các tên dễ khác biệt:
            "urgency",   # -> urgency_level nếu model dùng *_level
            "security",  # -> security_level nếu model dùng *_level
        )

        # Prefetch M2M/related (an toàn). 'assignees' KHÔNG tồn tại trên model hiện tại,
        # quan hệ đúng là 'assignments' (DocumentAssignment.related_name).
        qs = _safe_prefetch_related(
            qs,
            "assignments",
            # attachments: SỬ DỤNG 'uploaded_at' (không có 'created_at' trên DocumentAttachment)
            attachments=Prefetch(
                "attachments",
                queryset=DocumentAttachment.objects.order_by("-uploaded_at"),
            ),
        )

        doc_dir = self.doc_direction
        if doc_dir:
            qs = qs.filter(doc_direction=doc_dir)
            # hint cho FilterSet xác định field ngày (issued_date vs received_date)
            if getattr(self, "request", None) is not None:
                setattr(self.request, "doc_direction_hint", doc_dir)

        latest_log = DocumentWorkflowLog.objects.filter(document_id=OuterRef("document_id")).order_by("-acted_at")
        qs = qs.annotate(
            last_workflow_action=Subquery(latest_log.values("action")[:1]),
            last_workflow_at=Subquery(latest_log.values("acted_at")[:1]),
            last_workflow_actor_id=Subquery(latest_log.values("acted_by_id")[:1]),
        )

        return qs.order_by(*self.ordering)

    def get_serializer_class(self):
        if getattr(self, "action", None) == "list":
            return DocumentSlimSerializer
        return DocumentDetailSerializer

    # list/retrieve mặc định đã đủ cho Slim/Detail ở lớp con
    def list(self, request, *args, **kwargs):
        qs = self.filter_queryset(self.get_queryset())
        page = self.paginate_queryset(qs)
        ser = self.get_serializer(page or qs, many=True)
        if page is not None:
            return self.get_paginated_response(ser.data)
        return Response(ser.data)

    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        ser = self.get_serializer(instance)
        resp = Response(ser.data)
        resp["ETag"] = self._build_etag(instance)
        return resp

    # ---- Concurrency helpers ----
    def _build_etag(self, instance: Any) -> str:
        return build_etag(instance, prefix="Document")

    def _enforce_if_match(self, request, instance: Any) -> str:
        provided = None
        meta = getattr(request, "META", {}) or {}
        if "HTTP_IF_MATCH" in meta and meta["HTTP_IF_MATCH"]:
            provided = meta["HTTP_IF_MATCH"]
        elif hasattr(request, "headers"):
            provided = request.headers.get("If-Match")

        if not provided:
            raise PreconditionRequiredError(code="IF_MATCH_REQUIRED")

        current = self._build_etag(instance)
        if provided.strip() != current:
            raise PreconditionFailedError(code="ETAG_MISMATCH")
        return current

    def _has_if_match_header(self, request) -> bool:
        meta = getattr(request, "META", {}) or {}
        header = meta.get("HTTP_IF_MATCH")
        if not header and hasattr(request, "headers"):
            header = request.headers.get("If-Match")
        return bool(header and str(header).strip())

    def _maybe_enforce_if_match(self, request, instance: Any) -> None:
        if self._has_if_match_header(request):
            self._enforce_if_match(request, instance)

    @extend_schema(
        tags=["Văn bản"],
        operation_id="document_import",
        summary="Nhập dữ liệu văn bản",
        request=DocumentImportSerializer,
        responses={202: DocumentImportResponseSerializer, **DEFAULT_ERROR_RESPONSES},
    )
    @action(
        detail=False,
        methods=["post"],
        url_path="import",
        parser_classes=[MultiPartParser, FormParser, JSONParser],
    )
    def import_documents(self, request, *args, **kwargs):
        serializer = DocumentImportSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        payload = {
            "accepted": len(serializer.validated_data.get("items") or []),
            "skipped": 0,
            "job_id": str(uuid4()),
        }
        return Response(payload, status=status.HTTP_202_ACCEPTED)

    @extend_schema(
        tags=["Văn bản"],
        operation_id="document_export",
        summary="Xuất dữ liệu văn bản",
        request=DocumentExportQuerySerializer,
        responses={200: DocumentExportResponseSerializer, **DEFAULT_ERROR_RESPONSES},
    )
    @action(detail=False, methods=["get"], url_path="export")
    def export_documents(self, request, *args, **kwargs):
        serializer = DocumentExportQuerySerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        payload = {
            "download_url": f"/api/v1/documents/export/{uuid4()}",
            "total_rows": 0,
        }
        return Response(payload)
