# reports/api.py
"""
Reports and Exports API.
"""
from __future__ import annotations

import os
import logging

from django.conf import settings
from django.http import FileResponse, Http404
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.api_admin import RoleAccessPermission
from workflow.services.rbac import Role

from .models import ReportDefinition, ReportExport
from .serializers import (
    ReportDefinitionSerializer,
    ReportDefinitionCreateSerializer,
    ReportExportSerializer,
    ReportExportCreateSerializer,
)
from .export_service import ExportService

logger = logging.getLogger(__name__)


class ReportDefinitionViewSet(viewsets.ModelViewSet):
    """
    Report Definition API.
    
    - All authenticated users can view report definitions (GET)
    - Only QT, VT, CV, LD can create exports from definitions
    - Only QT can create/update/delete definitions (CRUD)
    """
    queryset = ReportDefinition.objects.select_related("created_by").order_by("code")
    permission_classes = [IsAuthenticated]
    
    def get_serializer_class(self):
        if self.action == "create":
            return ReportDefinitionCreateSerializer
        return ReportDefinitionSerializer
    
    def get_permissions(self):
        # Everyone can list/retrieve
        if self.action in ("list", "retrieve"):
            return [IsAuthenticated()]
        # Only QT can create/update/delete
        return [IsAuthenticated(), RoleAccessPermission()]
    
    @property
    def required_roles(self):
        # Only QT can manage definitions (create/update/delete)
        if self.action not in ("list", "retrieve", "create_export"):
            return {Role.QT.value}
        # No role restriction for create_export - all authenticated users allowed
        return set()
    
    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)
    
    @action(detail=True, methods=["post"], url_path="exports")
    def create_export(self, request, pk=None):
        """
        Create a new export from this report definition.
        
        POST /api/v1/reports/definitions/{id}/exports
        Body: {"format": "PDF|XLSX|CSV", "params_json": {...}}
        """
        report = self.get_object()
        serializer = ReportExportCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        format_type = serializer.validated_data["format"]
        params = serializer.validated_data.get("params_json", {})
        
        try:
            # Generate export file
            export_service = ExportService(report, params)
            file_path = export_service.generate(format_type)
            
            # Save export record
            export = ReportExport.objects.create(
                report=report,
                exported_by=request.user,
                format=format_type,
                params_json=params,
                file_path=file_path,
            )
            
            return Response(
                ReportExportSerializer(export).data,
                status=status.HTTP_201_CREATED,
            )
        except Exception as e:
            logger.error(f"Failed to create export: {e}")
            return Response(
                {"detail": f"Export generation failed: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


class ReportExportViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    """
    Report Export API.
    
    - Users can only see their own exports
    - QT can see all exports
    - Owners and QT can delete exports
    """
    queryset = ReportExport.objects.select_related("report", "exported_by").order_by("-exported_at")
    serializer_class = ReportExportSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        from workflow.services.rbac import get_single_role_code
        role_code = get_single_role_code(self.request.user)
        
        # QT can see all
        if role_code == Role.QT.value:
            return super().get_queryset()
        
        # Others only see their own exports
        return super().get_queryset().filter(exported_by=self.request.user)
    
    def perform_destroy(self, instance):
        from workflow.services.rbac import get_single_role_code
        role_code = get_single_role_code(self.request.user)
        
        # Check ownership
        if role_code != Role.QT.value and instance.exported_by != self.request.user:
            from core.exceptions import ForbiddenError
            raise ForbiddenError("You can only delete your own exports.")
        
        # Delete file if exists
        if instance.file_path:
            try:
                media_root = getattr(settings, "MEDIA_ROOT", "media")
                file_path = os.path.join(media_root, instance.file_path)
                if os.path.exists(file_path):
                    os.remove(file_path)
            except Exception as e:
                logger.warning(f"Failed to delete export file {instance.file_path}: {e}")
        
        instance.delete()
    
    @action(detail=True, methods=["get"], url_path="download")
    def download(self, request, pk=None):
        """
        Download the export file.
        
        GET /api/v1/report-exports/{id}/download
        """
        export = self.get_object()
        
        if not export.file_path:
            raise Http404("Export file not found.")
        
        media_root = getattr(settings, "MEDIA_ROOT", "media")
        file_path = os.path.join(media_root, export.file_path)
        
        if not os.path.exists(file_path):
            raise Http404("Export file not found on disk.")
        
        # Determine filename
        file_name = os.path.basename(export.file_path)
        
        # Return file response
        file_handle = open(file_path, "rb")
        return FileResponse(file_handle, filename=file_name)
