from __future__ import annotations

from typing import Optional

from django.utils import timezone
from rest_framework import mixins, serializers, viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.api_admin import RoleAccessPermission
from workflow.services.rbac import Role
from core.exceptions import ForbiddenError

from .models import Notification, Reminder, Job
from .serializers import (
    NotificationSerializer,
    ReminderSerializer,
    ReminderCreateUpdateSerializer,
    JobSerializer,
    JobCreateSerializer,
)


class NotificationViewSet(
    mixins.ListModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    """
    Notification API for authenticated users.
    Users can only see and mark their own notifications as read.
    """
    queryset = Notification.objects.select_related("user").order_by("-sent_at")
    serializer_class = NotificationSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ["channel", "read_at"]

    def get_queryset(self):
        # Filter to current user's notifications only
        return super().get_queryset().filter(user=self.request.user)

    @action(detail=True, methods=["post"], url_path="read")
    def mark_as_read(self, request, pk=None):
        """Mark a single notification as read."""
        notification = self.get_object()
        if notification.read_at is None:
            notification.read_at = timezone.now()
            notification.save(update_fields=["read_at"])
        return Response(NotificationSerializer(notification).data)

    @action(detail=False, methods=["post"], url_path="read-all")
    def mark_all_as_read(self, request):
        """Mark all unread notifications for current user as read."""
        updated_count = Notification.objects.filter(
            user=request.user,
            read_at__isnull=True,
        ).update(read_at=timezone.now())
        return Response({"updated": updated_count}, status=status.HTTP_200_OK)


class ReminderViewSet(viewsets.ModelViewSet):
    """
    Reminder API for authenticated users.
    Users can only manage their own reminders.
    """
    queryset = Reminder.objects.select_related("user").order_by("-due_at")
    permission_classes = [IsAuthenticated]
    filterset_fields = ["status", "entity_type"]

    def get_serializer_class(self):
        if self.action in ("create", "update", "partial_update"):
            return ReminderCreateUpdateSerializer
        return ReminderSerializer

    def get_queryset(self):
        # Filter to current user's reminders only
        return super().get_queryset().filter(user=self.request.user)

    def perform_create(self, serializer):
        # User is set in serializer's create method via context
        serializer.save()

    def perform_update(self, serializer):
        # Only allow updating certain fields
        serializer.save()


class JobViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    viewsets.GenericViewSet,
):
    """
    Job management API for administrators only.
    Allows viewing scheduled jobs and creating manual jobs.
    """
    queryset = Job.objects.order_by("-run_at")
    permission_classes = [IsAuthenticated, RoleAccessPermission]
    required_roles = {Role.QT.value}
    filterset_fields = ["type", "status"]

    def get_serializer_class(self):
        if self.action == "create":
            return JobCreateSerializer
        return JobSerializer
