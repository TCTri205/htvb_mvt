# systemapps/api.py
"""
System Settings API for administrators.
"""
from __future__ import annotations

from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.api_admin import RoleAccessPermission
from workflow.services.rbac import Role

from .models import SystemSetting


class SystemSettingSerializer(serializers.ModelSerializer):
    class Meta:
        model = SystemSetting
        fields = (
            "setting_key",
            "setting_value",
            "updated_by",
            "updated_at",
        )
        read_only_fields = ("updated_by", "updated_at")


class SystemSettingViewSet(viewsets.ModelViewSet):
    """
    System Settings API for administrators only.
    
    Allows getting and updating system configuration.
    """
    queryset = SystemSetting.objects.all()
    serializer_class = SystemSettingSerializer
    permission_classes = [IsAuthenticated, RoleAccessPermission]
    required_roles = {Role.QT.value}
    lookup_field = "setting_key"
    lookup_value_regex = "[^/]+"  # Allow any characters except /
    
    def perform_create(self, serializer):
        serializer.save(updated_by=self.request.user)
    
    def perform_update(self, serializer):
        serializer.save(updated_by=self.request.user)
    
    @action(detail=False, methods=["get"])
    def all_settings(self, request):
        """
        Get all settings as a dictionary.
        """
        settings_dict = {
            s.setting_key: s.setting_value 
            for s in self.get_queryset()
        }
        return Response(settings_dict)
    
    @action(detail=False, methods=["patch"])
    def bulk_update(self, request):
        """
        Bulk update multiple settings at once.
        
        Request body: {"key1": value1, "key2": value2, ...}
        """
        if not isinstance(request.data, dict):
            return Response(
                {"detail": "Request body must be a dictionary."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        
        updated_keys = []
        for key, value in request.data.items():
            setting, created = SystemSetting.objects.update_or_create(
                setting_key=key,
                defaults={
                    "setting_value": value,
                    "updated_by": request.user,
                },
            )
            updated_keys.append(key)
        
        return Response({
            "updated": updated_keys,
            "count": len(updated_keys),
        })
