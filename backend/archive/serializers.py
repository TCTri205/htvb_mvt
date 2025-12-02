from rest_framework import serializers

from .models import ArchiveBackupRecord, ArchiveQueueItem, RetentionPolicy


class ArchiveBackupSerializer(serializers.ModelSerializer):
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    method_label = serializers.CharField(source="get_method_display", read_only=True)

    class Meta:
        model = ArchiveBackupRecord
        fields = [
            "backup_id",
            "title",
            "method",
            "method_label",
            "size_bytes",
            "duration_seconds",
            "status",
            "status_label",
            "notes",
            "created_at",
        ]
        read_only_fields = [
            "backup_id",
            "status",
            "method_label",
            "status_label",
            "created_at",
        ]


class ArchiveQueueSerializer(serializers.ModelSerializer):
    status_label = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model = ArchiveQueueItem
        fields = [
            "queue_id",
            "label",
            "category",
            "size_bytes",
            "progress",
            "status",
            "status_label",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class RetentionPolicySerializer(serializers.ModelSerializer):
    status_label = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model = RetentionPolicy
        fields = [
            "policy_id",
            "name",
            "category",
            "description",
            "retention_years",
            "quantity",
            "status",
            "status_label",
            "next_review_at",
            "updated_at",
        ]


class RetentionPolicyUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = RetentionPolicy
        fields = ["name", "category", "description", "retention_years", "quantity", "status", "next_review_at"]
