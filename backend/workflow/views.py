from __future__ import annotations

from typing import Dict

from django.db.models import QuerySet
from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated, SAFE_METHODS
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied
from rest_framework.request import Request

from core.docs import (
    DEFAULT_ERROR_RESPONSES,
    doc_list,
    doc_retrieve,
    doc_create,
    doc_update,
    doc_delete,
)
from workflow.models import WorkflowTransition
from workflow.serializers import WorkflowTransitionSerializer
from workflow.services import rbac
from workflow.services.rbac import Act


class RBACWorkflowViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    required_act_map: Dict[str, Act] = {}

    def _get_required_act(self, request: Request) -> Act:
        mapping = getattr(self, "required_act_map", {}) or {}
        action = getattr(self, "action", None)
        act = mapping.get(action)
        if act:
            return act
        if request.method in SAFE_METHODS:
            return Act.VIEW
        raise PermissionDenied("Không đủ quyền thực hiện thao tác này.")

    def initial(self, request: Request, *args, **kwargs):  # type: ignore[override]
        super().initial(request, *args, **kwargs)
        act = self._get_required_act(request)
        if not rbac.can(request.user, act, None):
            raise PermissionDenied("Không đủ quyền thực hiện thao tác này.")


class WorkflowTransitionViewSet(RBACWorkflowViewSet):
    queryset = WorkflowTransition.objects.all()
    serializer_class = WorkflowTransitionSerializer
    filterset_fields = ["module", "is_active"]
    search_fields = ["from_status", "to_status", "description"]
    ordering_fields = ["module", "from_status", "to_status", "updated_at"]
    ordering = ["module", "from_status"]

    required_act_map = {
        "list": Act.VIEW,
        "retrieve": Act.VIEW,
        "create": Act.CONFIG_WORKFLOW,
        "update": Act.CONFIG_WORKFLOW,
        "partial_update": Act.CONFIG_WORKFLOW,
        "destroy": Act.CONFIG_WORKFLOW,
    }

    def get_queryset(self) -> QuerySet[WorkflowTransition]:
        qs = super().get_queryset()
        return qs.select_related("created_by", "updated_by")

    @doc_list(
        item_serializer=WorkflowTransitionSerializer,
        tag="Cấu hình quy trình",
        operation_id="workflow_transition_list",
        summary="Danh sách cấu hình chuyển trạng thái",
    )
    def list(self, request, *args, **kwargs):
        return super().list(request, *args, **kwargs)

    @doc_retrieve(
        detail_serializer=WorkflowTransitionSerializer,
        tag="Cấu hình quy trình",
        operation_id="workflow_transition_retrieve",
        summary="Chi tiết cấu hình chuyển trạng thái",
    )
    def retrieve(self, request, *args, **kwargs):
        return super().retrieve(request, *args, **kwargs)

    @doc_create(
        request_serializer=WorkflowTransitionSerializer,
        response_serializer=WorkflowTransitionSerializer,
        tag="Cấu hình quy trình",
        operation_id="workflow_transition_create",
        summary="Tạo cấu hình chuyển trạng thái",
    )
    def create(self, request, *args, **kwargs):
        return super().create(request, *args, **kwargs)

    @doc_update(
        request_serializer=WorkflowTransitionSerializer,
        response_serializer=WorkflowTransitionSerializer,
        tag="Cấu hình quy trình",
        operation_id="workflow_transition_update",
        summary="Cập nhật cấu hình chuyển trạng thái",
    )
    def update(self, request, *args, **kwargs):
        return super().update(request, *args, **kwargs)

    @doc_update(
        request_serializer=WorkflowTransitionSerializer,
        response_serializer=WorkflowTransitionSerializer,
        tag="Cấu hình quy trình",
        operation_id="workflow_transition_partial_update",
        summary="Cập nhật nhanh cấu hình chuyển trạng thái",
    )
    def partial_update(self, request, *args, **kwargs):
        return super().partial_update(request, *args, **kwargs)

    @doc_delete(
        tag="Cấu hình quy trình",
        operation_id="workflow_transition_delete",
        summary="Xoá cấu hình chuyển trạng thái",
    )
    def destroy(self, request, *args, **kwargs):
        return super().destroy(request, *args, **kwargs)
