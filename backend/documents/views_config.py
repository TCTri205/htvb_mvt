from __future__ import annotations

import uuid

from typing import Dict, Optional

from django.db.models import QuerySet
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated, SAFE_METHODS
from rest_framework.response import Response
from rest_framework.parsers import JSONParser, MultiPartParser
from rest_framework.settings import api_settings
from rest_framework.exceptions import PermissionDenied
from rest_framework.request import Request

from drf_spectacular.utils import extend_schema

from core.docs import (
    DEFAULT_ERROR_RESPONSES,
    doc_list,
    doc_retrieve,
    doc_create,
    doc_update,
    doc_delete,
)
from documents.models import RegisterBook, NumberingRule, DocumentTemplate
from documents.serializers import (
    RegisterBookSerializer,
    NumberingRuleSerializer,
    DocumentTemplateSerializer,
    RegisterImportSerializer,
    RegisterImportResponseSerializer,
    RegisterExportQuerySerializer,
    RegisterExportResponseSerializer,
)
from workflow.services import rbac
from workflow.services.rbac import Act


class RBACModelViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    required_act_map: Dict[str, Act] = {}

    def _require_act(self, request: Request, action_key: str) -> None:
        mapping = getattr(self, "required_act_map", {}) or {}
        act = mapping.get(action_key)
        if not act:
            if request.method in SAFE_METHODS and action_key in ("list", "retrieve"):
                return
            raise PermissionDenied("Không đủ quyền thực hiện thao tác này.")
        if not rbac.can(request.user, act, None):
            raise PermissionDenied("Không đủ quyền thực hiện thao tác này.")

    # Các thao tác ghi đè để chèn kiểm tra quyền RBAC trước khi gọi super()
    def create(self, request, *args, **kwargs):  # type: ignore[override]
        self._require_act(request, "create")
        return super().create(request, *args, **kwargs)

    def list(self, request, *args, **kwargs):  # type: ignore[override]
        self._require_act(request, "list")
        return super().list(request, *args, **kwargs)

    def retrieve(self, request, *args, **kwargs):  # type: ignore[override]
        self._require_act(request, "retrieve")
        return super().retrieve(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):  # type: ignore[override]
        self._require_act(request, "update")
        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):  # type: ignore[override]
        self._require_act(request, "partial_update")
        return super().partial_update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):  # type: ignore[override]
        self._require_act(request, "destroy")
        return super().destroy(request, *args, **kwargs)


class RegisterBookViewSet(RBACModelViewSet):
    queryset = RegisterBook.objects.all()
    serializer_class = RegisterBookSerializer
    filterset_fields = ["direction", "year", "is_active", "department_id"]
    search_fields = ["name", "prefix", "suffix"]
    ordering_fields = ["year", "name", "next_sequence", "updated_at"]
    ordering = ["-year", "name"]
    parser_classes = tuple(api_settings.DEFAULT_PARSER_CLASSES) + (MultiPartParser,)

    required_act_map = {
        "list": Act.VIEW,
        "retrieve": Act.VIEW,
        "create": Act.CONFIG_REGISTER_BOOK,
        "update": Act.CONFIG_REGISTER_BOOK,
        "partial_update": Act.CONFIG_REGISTER_BOOK,
        "destroy": Act.CONFIG_REGISTER_BOOK,
        "import_registers": Act.IN_IMPORT_EXPORT,
        "export_registers": Act.IN_IMPORT_EXPORT,
    }

    def get_queryset(self) -> QuerySet[RegisterBook]:
        qs = super().get_queryset()
        return qs.select_related("department", "created_by", "updated_by")

    @doc_list(
        item_serializer=RegisterBookSerializer,
        tag="Sổ đăng ký",
        operation_id="register_book_list",
        summary="Danh sách sổ đăng ký",
    )
    def list(self, request, *args, **kwargs):
        return super().list(request, *args, **kwargs)

    @doc_retrieve(
        detail_serializer=RegisterBookSerializer,
        tag="Sổ đăng ký",
        operation_id="register_book_retrieve",
        summary="Chi tiết sổ đăng ký",
    )
    def retrieve(self, request, *args, **kwargs):
        return super().retrieve(request, *args, **kwargs)

    @doc_create(
        request_serializer=RegisterBookSerializer,
        response_serializer=RegisterBookSerializer,
        tag="Sổ đăng ký",
        operation_id="register_book_create",
        summary="Tạo sổ đăng ký",
    )
    def create(self, request, *args, **kwargs):
        return super().create(request, *args, **kwargs)

    @doc_update(
        request_serializer=RegisterBookSerializer,
        response_serializer=RegisterBookSerializer,
        tag="Sổ đăng ký",
        operation_id="register_book_update",
        summary="Cập nhật sổ đăng ký",
    )
    def update(self, request, *args, **kwargs):
        return super().update(request, *args, **kwargs)

    @doc_update(
        request_serializer=RegisterBookSerializer,
        response_serializer=RegisterBookSerializer,
        tag="Sổ đăng ký",
        operation_id="register_book_partial_update",
        summary="Cập nhật nhanh sổ đăng ký",
    )
    def partial_update(self, request, *args, **kwargs):
        return super().partial_update(request, *args, **kwargs)

    @doc_delete(
        tag="Sổ đăng ký",
        operation_id="register_book_delete",
        summary="Xoá sổ đăng ký",
    )
    def destroy(self, request, *args, **kwargs):
        return super().destroy(request, *args, **kwargs)

    @extend_schema(
        tags=["Sổ đăng ký"],
        operation_id="register_book_import",
        summary="Nhập dữ liệu sổ đăng ký",
        request=RegisterImportSerializer,
        responses={202: RegisterImportResponseSerializer, **DEFAULT_ERROR_RESPONSES},
    )
    @action(
        detail=False,
        methods=["post"],
        url_path="import",
        parser_classes=[JSONParser, MultiPartParser],
    )
    def import_registers(self, request, *args, **kwargs):
        self._require_act(request, "import_registers")
        serializer = RegisterImportSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        items = serializer.validated_data.get("items") or []
        payload = {
            "accepted": len(items),
            "skipped": 0,
            "job_id": None,
        }
        return Response(payload, status=status.HTTP_202_ACCEPTED)

    @extend_schema(
        tags=["Sổ đăng ký"],
        operation_id="register_book_export",
        summary="Xuất dữ liệu sổ đăng ký",
        request=RegisterExportQuerySerializer,
        responses={200: RegisterExportResponseSerializer, **DEFAULT_ERROR_RESPONSES},
    )
    @action(detail=False, methods=["get"], url_path="export")
    def export_registers(self, request, *args, **kwargs):
        self._require_act(request, "export_registers")
        serializer = RegisterExportQuerySerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        payload = {
            "download_url": f"/api/v1/register-books/export/{uuid.uuid4()}",
            "total_rows": 0,
        }
        return Response(payload, status=status.HTTP_200_OK)


class NumberingRuleViewSet(RBACModelViewSet):
    queryset = NumberingRule.objects.all()
    serializer_class = NumberingRuleSerializer
    filterset_fields = ["target", "is_active", "department_id"]
    search_fields = ["code", "name", "prefix", "suffix"]
    ordering_fields = ["code", "name", "next_sequence", "updated_at"]
    ordering = ["code"]

    required_act_map = {
        "list": Act.VIEW,
        "retrieve": Act.VIEW,
        "create": Act.CONFIG_NUMBERING_RULE,
        "update": Act.CONFIG_NUMBERING_RULE,
        "partial_update": Act.CONFIG_NUMBERING_RULE,
        "destroy": Act.CONFIG_NUMBERING_RULE,
    }

    def get_queryset(self) -> QuerySet[NumberingRule]:
        qs = super().get_queryset()
        return qs.select_related("department", "created_by", "updated_by")

    @doc_list(
        item_serializer=NumberingRuleSerializer,
        tag="Quy tắc đánh số",
        operation_id="numbering_rule_list",
        summary="Danh sách quy tắc đánh số",
    )
    def list(self, request, *args, **kwargs):
        return super().list(request, *args, **kwargs)

    @doc_retrieve(
        detail_serializer=NumberingRuleSerializer,
        tag="Quy tắc đánh số",
        operation_id="numbering_rule_retrieve",
        summary="Chi tiết quy tắc đánh số",
    )
    def retrieve(self, request, *args, **kwargs):
        return super().retrieve(request, *args, **kwargs)

    @doc_create(
        request_serializer=NumberingRuleSerializer,
        response_serializer=NumberingRuleSerializer,
        tag="Quy tắc đánh số",
        operation_id="numbering_rule_create",
        summary="Tạo quy tắc đánh số",
    )
    def create(self, request, *args, **kwargs):
        return super().create(request, *args, **kwargs)

    @doc_update(
        request_serializer=NumberingRuleSerializer,
        response_serializer=NumberingRuleSerializer,
        tag="Quy tắc đánh số",
        operation_id="numbering_rule_update",
        summary="Cập nhật quy tắc đánh số",
    )
    def update(self, request, *args, **kwargs):
        return super().update(request, *args, **kwargs)

    @doc_update(
        request_serializer=NumberingRuleSerializer,
        response_serializer=NumberingRuleSerializer,
        tag="Quy tắc đánh số",
        operation_id="numbering_rule_partial_update",
        summary="Cập nhật nhanh quy tắc đánh số",
    )
    def partial_update(self, request, *args, **kwargs):
        return super().partial_update(request, *args, **kwargs)

    @doc_delete(
        tag="Quy tắc đánh số",
        operation_id="numbering_rule_delete",
        summary="Xoá quy tắc đánh số",
    )
    def destroy(self, request, *args, **kwargs):
        return super().destroy(request, *args, **kwargs)


class DocumentTemplateViewSet(RBACModelViewSet):
    queryset = DocumentTemplate.objects.all()
    serializer_class = DocumentTemplateSerializer
    filterset_fields = ["doc_direction", "is_active"]
    search_fields = ["name", "description", "tags"]
    ordering_fields = ["name", "doc_direction", "version", "updated_at"]
    ordering = ["name"]

    required_act_map = {
        "list": Act.VIEW,
        "retrieve": Act.VIEW,
        "create": Act.CONFIG_TEMPLATE,
        "update": Act.CONFIG_TEMPLATE,
        "partial_update": Act.CONFIG_TEMPLATE,
        "destroy": Act.CONFIG_TEMPLATE,
    }

    def get_queryset(self) -> QuerySet[DocumentTemplate]:
        qs = super().get_queryset()
        return qs.select_related("created_by", "updated_by")

    @doc_list(
        item_serializer=DocumentTemplateSerializer,
        tag="Mẫu văn bản",
        operation_id="document_template_list",
        summary="Danh sách mẫu văn bản",
    )
    def list(self, request, *args, **kwargs):
        return super().list(request, *args, **kwargs)

    @doc_retrieve(
        detail_serializer=DocumentTemplateSerializer,
        tag="Mẫu văn bản",
        operation_id="document_template_retrieve",
        summary="Chi tiết mẫu văn bản",
    )
    def retrieve(self, request, *args, **kwargs):
        return super().retrieve(request, *args, **kwargs)

    @doc_create(
        request_serializer=DocumentTemplateSerializer,
        response_serializer=DocumentTemplateSerializer,
        tag="Mẫu văn bản",
        operation_id="document_template_create",
        summary="Tạo mẫu văn bản",
    )
    def create(self, request, *args, **kwargs):
        return super().create(request, *args, **kwargs)

    @doc_update(
        request_serializer=DocumentTemplateSerializer,
        response_serializer=DocumentTemplateSerializer,
        tag="Mẫu văn bản",
        operation_id="document_template_update",
        summary="Cập nhật mẫu văn bản",
    )
    def update(self, request, *args, **kwargs):
        return super().update(request, *args, **kwargs)

    @doc_update(
        request_serializer=DocumentTemplateSerializer,
        response_serializer=DocumentTemplateSerializer,
        tag="Mẫu văn bản",
        operation_id="document_template_partial_update",
        summary="Cập nhật nhanh mẫu văn bản",
    )
    def partial_update(self, request, *args, **kwargs):
        return super().partial_update(request, *args, **kwargs)

    @doc_delete(
        tag="Mẫu văn bản",
        operation_id="document_template_delete",
        summary="Xoá mẫu văn bản",
    )
    def destroy(self, request, *args, **kwargs):
        return super().destroy(request, *args, **kwargs)
