# audit/api.py
"""
Audit Log API for viewing system audit logs.
"""
from __future__ import annotations

from rest_framework import mixins, serializers, viewsets
from rest_framework.permissions import IsAuthenticated

from accounts.api_admin import RoleAccessPermission
from workflow.services.rbac import Role

from .models import AuditLog


class AuditLogSerializer(serializers.ModelSerializer):
    actor_summary = serializers.SerializerMethodField()
    
    class Meta:
        model = AuditLog
        fields = (
            "audit_id",
            "actor_summary",
            "action",
            "entity_type",
            "entity_id",
            "at",
            "ip",
            "before_json",
            "after_json",
        )
    
    def get_actor_summary(self, obj: AuditLog):
        actor = getattr(obj, "actor", None)
        if not actor:
            return None
        return {
            "user_id": getattr(actor, "user_id", None),
            "full_name": getattr(actor, "full_name", None),
            "username": getattr(actor, "username", None),
        }


class AuditLogViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    """
    Audit Log API for administrators and authorized users.
    
    QT (Admin) can see all logs.
    VT, CV, LD can see limited logs (their own actions).
    """
    queryset = AuditLog.objects.select_related("actor").order_by("-at")
    serializer_class = AuditLogSerializer
    permission_classes = [IsAuthenticated, RoleAccessPermission]
    required_roles = {Role.QT.value, Role.VT.value, Role.CV.value, Role.LD.value}
    filterset_fields = ["action", "entity_type", "entity_id", "actor"]
    
    def get_queryset(self):
        # QT can see all
        from workflow.services.rbac import get_single_role_code
        role_code = get_single_role_code(self.request.user)
        
        if role_code == Role.QT.value:
            return super().get_queryset()
        
        # Other roles only see their own actions
        return super().get_queryset().filter(actor=self.request.user)
