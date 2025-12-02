from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.api_admin import RoleAccessPermission
from workflow.services.rbac import Role

from .models import ArchiveBackupRecord, ArchiveQueueItem, RetentionPolicy
from .serializers import (
    ArchiveBackupSerializer,
    ArchiveQueueSerializer,
    RetentionPolicySerializer,
    RetentionPolicyUpdateSerializer,
)
from .services import ArchiveService


class ArchiveSummaryView(APIView):
    permission_classes = [IsAuthenticated, RoleAccessPermission]
    required_roles = {Role.QT.value}

    def get(self, request):
        ArchiveService.ensure_policies()
        summary = ArchiveService.get_summary()
        return Response({"success": True, "data": summary})


class ArchiveBackupViewSet(viewsets.ModelViewSet):
    queryset = ArchiveBackupRecord.objects.all()
    serializer_class = ArchiveBackupSerializer
    permission_classes = [IsAuthenticated, RoleAccessPermission]
    required_roles = {Role.QT.value}
    http_method_names = ["get", "post", "head"]

    def list(self, request, *args, **kwargs):
        serializer = self.get_serializer(self.get_queryset(), many=True)
        return Response({"success": True, "data": serializer.data})

    def create(self, request, *args, **kwargs):
        method = request.data.get("method", ArchiveBackupRecord.Method.MANUAL)
        title = request.data.get(
            "title",
            f"Sao lưu {timezone.localtime().strftime('%Y-%m-%d %H:%M')}",
        )
        backup = ArchiveService.create_backup(title=title, method=method)
        serializer = self.get_serializer(backup)
        return Response({"success": True, "data": serializer.data}, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    def restore(self, request, pk=None):
        backup = self.get_object()
        ArchiveService.create_restore_job(backup)
        return Response(
            {"success": True, "message": "Yêu cầu khôi phục đang chờ xử lý."},
            status=status.HTTP_200_OK,
        )


class ArchiveQueueViewSet(viewsets.ModelViewSet):
    queryset = ArchiveQueueItem.objects.all()
    serializer_class = ArchiveQueueSerializer
    permission_classes = [IsAuthenticated, RoleAccessPermission]
    required_roles = {Role.QT.value}
    http_method_names = ["get", "post", "head"]

    def list(self, request, *args, **kwargs):
        serializer = self.get_serializer(self.get_queryset(), many=True)
        return Response({"success": True, "data": serializer.data})

    def create(self, request, *args, **kwargs):
        label = request.data.get("label", "Lưu trữ thủ công")
        category = request.data.get("category", "manual")
        job = ArchiveService.queue_archive_job(label=label, category=category)
        serializer = self.get_serializer(job)
        return Response({"success": True, "data": serializer.data}, status=status.HTTP_201_CREATED)


class RetentionPolicyViewSet(viewsets.ModelViewSet):
    queryset = RetentionPolicy.objects.all()
    serializer_class = RetentionPolicySerializer
    permission_classes = [IsAuthenticated, RoleAccessPermission]
    required_roles = {Role.QT.value}
    http_method_names = ["get", "patch", "head", "put"]

    def get_serializer_class(self):
        if self.action in {"update", "partial_update"}:
            return RetentionPolicyUpdateSerializer
        return RetentionPolicySerializer

    def list(self, request, *args, **kwargs):
        serializer = self.get_serializer(self.get_queryset(), many=True)
        return Response({"success": True, "data": serializer.data})

    def update(self, request, *args, **kwargs):
        partial = request.method.lower() == "patch"
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        output = RetentionPolicySerializer(instance).data
        return Response({"success": True, "data": output})

    @action(detail=True, methods=["post"])
    def review(self, request, pk=None):
        instance = self.get_object()
        instance.status = RetentionPolicy.Status.ACTIVE
        instance.next_review_at = request.data.get("next_review_at") or None
        instance.save()
        return Response({"success": True, "data": RetentionPolicySerializer(instance).data})
