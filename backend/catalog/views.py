from __future__ import annotations

from typing import Any, Iterable
import re
import unicodedata

from django.db import IntegrityError
from django.shortcuts import get_object_or_404
from rest_framework import serializers, status
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema, OpenApiParameter, OpenApiResponse

from catalog.services import CatalogSpec, catalog_choices, get_catalog_spec
from common.serializers import TrimmedCharField
from core.exceptions import ForbiddenError
from documents.models import Document
from workflow.services.status_resolver import canonical_status_key, ALL_INBOUND_STATUSES, ALL_OUTBOUND_STATUSES
from workflow.services.rbac import Role, get_single_role_code


CATALOG_NAME_PARAM = OpenApiParameter(
    name="name",
    location=OpenApiParameter.PATH,
    description="Slug danh mục (fields, document-types, issue-levels, ...).",
    required=True,
    type=OpenApiTypes.STR,
    enum=list(catalog_choices()),
)

CATALOG_ITEM_ID_PARAM = OpenApiParameter(
    name="item_id",
    location=OpenApiParameter.PATH,
    description="ID cụ thể trong danh mục.",
    required=True,
    type=OpenApiTypes.INT,
)

WRITE_ROLES = {Role.QT.value, Role.VT.value}
DELETE_ROLES = {Role.QT.value}


class CatalogItemResponseSerializer(serializers.Serializer):
    id = serializers.IntegerField(read_only=True)
    name = serializers.CharField(read_only=True)


class CatalogItemPayloadSerializer(serializers.Serializer):
    name = TrimmedCharField()

    def __init__(self, *args: Any, max_length: int | None = None, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        if max_length is not None:
            field = self.fields.get("name")
            if hasattr(field, "max_length"):
                field.max_length = max_length


def _serialize_item(instance: Any, spec: CatalogSpec, *, docs_count: int | None = None, docs_preview: list[dict] | None = None) -> dict[str, Any]:
    payload = {
        "id": getattr(instance, "pk", None),
        "name": spec.get_name_value(instance),
    }
    if docs_count is not None:
        payload["documents_count"] = docs_count
    if docs_preview:
        payload["documents_preview"] = docs_preview
    return payload


def _require_role(user, allowed: Iterable[str], action: str) -> None:
    role_code = get_single_role_code(user)
    if role_code not in allowed:
        friendly = ", ".join(sorted({r for r in allowed if r}))
        raise ForbiddenError(
            detail=f"Chỉ người dùng {friendly or 'hợp lệ'} được phép {action} danh mục."
        )


def _canonical_document_status(raw: str) -> str:
    """
    Chuẩn hoá trạng thái văn bản về key chuẩn, ưu tiên bộ status mới.
    Legacy/alias sẽ quy về cùng key để tránh trùng lặp.
    """
    canonical_set = ALL_INBOUND_STATUSES.union(ALL_OUTBOUND_STATUSES)
    candidates = (
        canonical_status_key(raw, direction="OUTBOUND"),
        canonical_status_key(raw, direction="INBOUND"),
    )
    for candidate in candidates:
        if candidate in canonical_set:
            return candidate
    # fallback: trả về text đã normalize
    return canonical_status_key(raw)


_URGENCY_CANONICAL = {
    "HOA_TOC": "Hỏa tốc",
    "KHAN": "Khẩn",
    "THUONG": "Thường",
    "THUONG_KHAN": "Thường khẩn",
}


def _normalize_text(raw: str) -> str:
    if not raw:
        return ""
    normalized = unicodedata.normalize("NFD", raw.strip())
    stripped = "".join(ch for ch in normalized if unicodedata.category(ch) != "Mn")
    uppered = stripped.upper()
    spaced = re.sub(r"\s+", "_", uppered)
    sanitized = re.sub(r"[^A-Z0-9_]+", "_", spaced)
    collapsed = re.sub(r"_+", "_", sanitized)
    return collapsed.strip("_")


def _canonical_urgency(raw: str) -> tuple[str, str]:
    """
    Trả về (key chuẩn, tên hiển thị chuẩn) cho mức độ ưu tiên, gộp alias/legacy.
    """
    key = _normalize_text(raw)
    display = _URGENCY_CANONICAL.get(key, raw.strip() if raw else "")
    return key or display, display or key


class CatalogEntriesView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        summary="Lấy danh sách mục trong danh mục định nghĩa",
        parameters=[CATALOG_NAME_PARAM],
        responses=CatalogItemResponseSerializer(many=True),
    )
    def get(self, request, name: str) -> Response:
        spec = get_catalog_spec(name)
        with_counts = request.query_params.get("with_counts") in ("1", "true", "yes")
        with_docs = request.query_params.get("with_docs") in ("1", "true", "yes")
        items = spec.model.objects.order_by(spec.name_field)

        # Map catalog slug -> field name trên Document để tính toán văn bản liên quan
        field_map = {
            "fields": "field",
            "document-types": "document_type",
            "issue-levels": "issue_level",
            "security-levels": "security_level",
            "urgency-levels": "urgency_level",
            "document-statuses": "status",
        }
        doc_field = field_map.get(spec.slug)

        data: list[dict[str, Any]] = []
        # Riêng document-statuses: gộp alias/legacy theo key chuẩn để tránh trùng lặp
        if spec.slug == "document-statuses":
            aggregated: dict[str, dict[str, Any]] = {}
            for item in items:
                canonical = _canonical_document_status(spec.get_name_value(item) or "")
                bucket = aggregated.setdefault(
                    canonical,
                    {"canonical": canonical, "source": []},
                )
                bucket["source"].append(item)
            results: list[dict[str, Any]] = []
            for canonical, bucket in aggregated.items():
                docs_count: int | None = None
                docs_preview: list[dict[str, Any]] | None = None
                name_display = canonical
                if doc_field:
                    qs = Document.objects.filter(status__status_name__in=[spec.get_name_value(obj) for obj in bucket["source"]])
                    if with_counts:
                        docs_count = qs.count()
                    if with_docs:
                        docs_preview = list(qs.values("document_id", "title").order_by("-created_at")[:5])
                # Dùng id của bản ghi đầu tiên để tham chiếu (không quan trọng với UI read-only)
                item_obj = bucket["source"][0]
                payload = _serialize_item(item_obj, spec, docs_count=docs_count, docs_preview=docs_preview)
                payload["name"] = name_display
                results.append(payload)
            return Response(results)

        # Gộp mức độ ưu tiên (urgency-levels) theo key chuẩn để tránh trùng
        if spec.slug == "urgency-levels":
            aggregated: dict[str, dict[str, Any]] = {}
            for item in items:
                raw_name = spec.get_name_value(item) or ""
                canonical, display = _canonical_urgency(raw_name)
                bucket = aggregated.setdefault(
                    canonical,
                    {"canonical": canonical, "display": display, "source": []},
                )
                bucket["source"].append(item)

            results: list[dict[str, Any]] = []
            default_key, _ = _canonical_urgency("Thường")
            for canonical, bucket in aggregated.items():
                docs_count: int | None = None
                docs_preview: list[dict[str, Any]] | None = None
                qs = Document.objects.filter(urgency_level__in=bucket["source"])
                qs_null = Document.objects.none()
                if canonical == default_key:
                    qs_null = Document.objects.filter(urgency_level__isnull=True)
                combined_qs = qs.union(qs_null) if qs_null.exists() else qs
                if with_counts:
                    docs_count = combined_qs.count()
                if with_docs:
                    docs_preview = list(combined_qs.values("document_id", "title").order_by("-created_at")[:5])
                item_obj = bucket["source"][0]
                payload = _serialize_item(item_obj, spec, docs_count=docs_count, docs_preview=docs_preview)
                payload["name"] = bucket["display"]
                results.append(payload)
            return Response(results)

        for item in items:
            docs_count: int | None = None
            docs_preview: list[dict[str, Any]] | None = None
            if doc_field:
                qs = Document.objects.filter(**{doc_field: item})
                if with_counts:
                    docs_count = qs.count()
                if with_docs:
                    docs_preview = list(
                        qs.values("document_id", "title").order_by("-created_at")[:5]
                    )
            data.append(_serialize_item(item, spec, docs_count=docs_count, docs_preview=docs_preview))
        return Response(data)

    @extend_schema(
        summary="Thêm mục mới vào danh mục",
        parameters=[CATALOG_NAME_PARAM],
        request=CatalogItemPayloadSerializer,
        responses={201: CatalogItemResponseSerializer},
    )
    def post(self, request, name: str) -> Response:
        _require_role(request.user, WRITE_ROLES, "thêm")
        spec = get_catalog_spec(name)
        max_length = getattr(spec.model._meta.get_field(spec.name_field), "max_length", None)
        serializer = CatalogItemPayloadSerializer(data=request.data, max_length=max_length)
        serializer.is_valid(raise_exception=True)
        payload = serializer.validated_data["name"]
        instance = spec.model(**{spec.name_field: payload})
        try:
            instance.save()
        except IntegrityError:
            raise ValidationError(
                {"name": [f"{spec.verbose_name} '{payload}' đã tồn tại."]}
            )
        return Response(
            _serialize_item(instance, spec),
            status=status.HTTP_201_CREATED,
        )


class CatalogItemDetailView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        summary="Cập nhật tên mục danh mục",
        parameters=[CATALOG_NAME_PARAM, CATALOG_ITEM_ID_PARAM],
        request=CatalogItemPayloadSerializer,
        responses=CatalogItemResponseSerializer,
    )
    def patch(self, request, name: str, item_id: int) -> Response:
        _require_role(request.user, WRITE_ROLES, "chỉnh sửa")
        spec = get_catalog_spec(name)
        instance = get_object_or_404(spec.model, pk=item_id)
        max_length = getattr(spec.model._meta.get_field(spec.name_field), "max_length", None)
        serializer = CatalogItemPayloadSerializer(data=request.data, max_length=max_length)
        serializer.is_valid(raise_exception=True)
        payload = serializer.validated_data["name"]
        setattr(instance, spec.name_field, payload)
        try:
            instance.save(update_fields=[spec.name_field])
        except IntegrityError:
            raise ValidationError(
                {"name": [f"{spec.verbose_name} '{payload}' đã tồn tại."]}
            )
        return Response(_serialize_item(instance, spec))

    @extend_schema(
        summary="Xoá mục danh mục",
        parameters=[CATALOG_NAME_PARAM, CATALOG_ITEM_ID_PARAM],
        responses={204: OpenApiResponse(response=None)},
    )
    def delete(self, request, name: str, item_id: int) -> Response:
        _require_role(request.user, DELETE_ROLES, "xoá")
        spec = get_catalog_spec(name)
        instance = get_object_or_404(spec.model, pk=item_id)
        instance.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class CatalogStatsView(APIView):
    """Get summary statistics for all catalogs."""
    permission_classes = [IsAuthenticated]
    
    @extend_schema(
        summary="Thống kê tổng quan danh mục hệ thống",
        responses={200: OpenApiResponse(
            response={
                "type": "object",
                "properties": {
                    "fields_count": {"type": "integer"},
                    "document_types_count": {"type": "integer"},
                    "issue_levels_count": {"type": "integer"},
                    "security_levels_count": {"type": "integer"},
                    "urgency_levels_count": {"type": "integer"},
                    "document_statuses_count": {"type": "integer"},
                    "case_types_count": {"type": "integer"},
                    "case_statuses_count": {"type": "integer"},
                    "attachment_types_count": {"type": "integer"},
                }
            }
        )}
    )
    def get(self, request) -> Response:
        """Return counts for all catalogs."""
        from catalog.services import CATALOG_REGISTRY
        
        stats = {}
        for slug, spec in CATALOG_REGISTRY.items():
            count = spec.model.objects.count()
            # Convert slug to stats key (e.g., "document-types" -> "document_types_count")
            key = slug.replace('-', '_') + '_count'
            stats[key] = count
        
        return Response({
            "success": True,
            "data": stats
        })
