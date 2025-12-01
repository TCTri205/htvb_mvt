# audit/models.py
from django.conf import settings
from django.db import models
from django.db.models import Q
from django.utils import timezone


class AuditLog(models.Model):
    class Action(models.TextChoices):
        CREATE = "CREATE", "CREATE"
        UPDATE = "UPDATE", "UPDATE"
        DELETE = "DELETE", "DELETE"
        LOGIN = "LOGIN", "LOGIN"
        EXPORT = "EXPORT", "EXPORT"
        APPROVE = "APPROVE", "APPROVE"

    class Entity(models.TextChoices):
        DOCUMENT = "document", "document"
        CASE = "case", "case"
        USER = "user", "user"
        OTHER = "other", "other"

    class Meta:
        db_table = "audit_logs"
        indexes = [
            models.Index(fields=["entity_type", "entity_id", "at"]),
        ]
        constraints = [
            # Dùng tuple hằng để tránh Pylance báo "Entity is not defined"
            models.CheckConstraint(
                name="chk_audit_entity_type",
                check=Q(entity_type__in=("document", "case", "user", "other")),
            )
        ]

    audit_id = models.BigAutoField(primary_key=True)
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
    )
    action = models.CharField(max_length=50, choices=Action.choices)
    entity_type = models.CharField(
        max_length=20,
        null=True, blank=True,
        choices=Entity.choices,
    )
    entity_id = models.CharField(max_length=64, null=True, blank=True)
    at = models.DateTimeField(default=timezone.now)
    ip = models.CharField(max_length=45, null=True, blank=True)
    before_json = models.JSONField(null=True, blank=True)
    after_json = models.JSONField(null=True, blank=True)
