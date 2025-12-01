from __future__ import annotations

from typing import Any, Dict, List

from rest_framework import serializers

from common.serializers import TrimmedCharField, CompactUserSerializer
from workflow.models import WorkflowTransition


class WorkflowTransitionSerializer(serializers.ModelSerializer):
    allowed_roles = serializers.ListField(
        child=TrimmedCharField(), required=False, allow_empty=True
    )
    allowed_permissions = serializers.ListField(
        child=TrimmedCharField(), required=False, allow_empty=True
    )
    created_by = CompactUserSerializer(read_only=True)
    updated_by = CompactUserSerializer(read_only=True)

    class Meta:
        model = WorkflowTransition
        fields = (
            "transition_id",
            "module",
            "from_status",
            "to_status",
            "allowed_roles",
            "allowed_permissions",
            "is_active",
            "config",
            "description",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        )
        read_only_fields = (
            "transition_id",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        )

    from_status = TrimmedCharField()
    to_status = TrimmedCharField()
    description = TrimmedCharField(required=False, allow_null=True, allow_blank=True)

    def _current_user(self):
        request = self.context.get("request") if isinstance(self.context, dict) else None
        user = getattr(request, "user", None)
        if user is not None and getattr(user, "is_authenticated", False):
            return user
        return None

    def validate_allowed_roles(self, value: List[str]) -> List[str]:
        cleaned: List[str] = []
        for item in value or []:
            if not item:
                continue
            cleaned.append(item.strip().upper())
        return cleaned

    def validate_allowed_permissions(self, value: List[str]) -> List[str]:
        cleaned: List[str] = []
        for item in value or []:
            if not item:
                continue
            cleaned.append(item.strip().upper())
        return cleaned

    def create(self, validated_data: Dict[str, Any]) -> WorkflowTransition:
        user = self._current_user()
        if user:
            validated_data.setdefault("created_by", user)
            validated_data.setdefault("updated_by", user)
        return super().create(validated_data)

    def update(
        self, instance: WorkflowTransition, validated_data: Dict[str, Any]
    ) -> WorkflowTransition:
        user = self._current_user()
        if user:
            validated_data.setdefault("updated_by", user)
        return super().update(instance, validated_data)
