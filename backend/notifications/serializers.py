from __future__ import annotations

from typing import Optional

from rest_framework import serializers
from django.utils import timezone

from .models import Notification, Reminder, Job


class NotificationSerializer(serializers.ModelSerializer):
    user_summary = serializers.SerializerMethodField()

    class Meta:
        model = Notification
        fields = (
            "notification_id",
            "title",
            "body",
            "link",
            "channel",
            "sent_at",
            "read_at",
            "user_summary",
        )

    def get_user_summary(self, obj: Notification) -> dict[str, Optional[str]]:
        user = getattr(obj, "user", None)
        if not user:
            return {}
        return {
            "user_id": getattr(user, "user_id", None),
            "full_name": getattr(user, "full_name", None),
            "username": getattr(user, "username", None),
        }


class ReminderSerializer(serializers.ModelSerializer):
    user_summary = serializers.SerializerMethodField()

    class Meta:
        model = Reminder
        fields = (
            "reminder_id",
            "entity_type",
            "entity_id",
            "user_summary",
            "due_at",
            "status",
            "last_notified_at",
        )

    def get_user_summary(self, obj: Reminder) -> dict[str, Optional[str]]:
        user = getattr(obj, "user", None)
        if not user:
            return {}
        return {
            "user_id": getattr(user, "user_id", None),
            "full_name": getattr(user, "full_name", None),
            "username": getattr(user, "username", None),
        }


class ReminderCreateUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Reminder
        fields = (
            "entity_type",
            "entity_id",
            "due_at",
            "status",
        )
        extra_kwargs = {
            "status": {"required": False},
        }

    def create(self, validated_data):
        # Auto-set user from context
        validated_data["user"] = self.context["request"].user
        # Default status to PENDING
        if "status" not in validated_data:
            validated_data["status"] = Reminder.Status.PENDING
        return super().create(validated_data)


class JobSerializer(serializers.ModelSerializer):
    class Meta:
        model = Job
        fields = (
            "job_id",
            "type",
            "payload_json",
            "run_at",
            "status",
            "attempts",
            "last_error",
        )
        read_only_fields = (
            "job_id",
            "attempts",
            "last_error",
        )


class JobCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Job
        fields = (
            "type",
            "payload_json",
            "run_at",
        )

    def create(self, validated_data):
        # Auto-set status to QUEUED
        validated_data["status"] = Job.Status.QUEUED
        validated_data["attempts"] = 0
        return super().create(validated_data)
