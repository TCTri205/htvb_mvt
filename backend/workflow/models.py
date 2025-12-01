from django.conf import settings
from django.db import models
from django.utils import timezone


class WorkflowTransition(models.Model):
    class Module(models.TextChoices):
        DOC_IN = "doc_in", "Văn bản đến"
        DOC_OUT = "doc_out", "Văn bản đi"
        CASE = "case", "Hồ sơ công việc"

    class Meta:
        db_table = "workflow_transitions"
        constraints = [
            models.UniqueConstraint(
                fields=["module", "from_status", "to_status"],
                name="uq_workflow_transition_unique",
            )
        ]
        indexes = [
            models.Index(fields=["module", "is_active"]),
        ]

    transition_id = models.BigAutoField(primary_key=True)
    module = models.CharField(max_length=20, choices=Module.choices)
    from_status = models.CharField(max_length=50)
    to_status = models.CharField(max_length=50)
    allowed_roles = models.JSONField(default=list, blank=True)
    allowed_permissions = models.JSONField(default=list, blank=True)
    is_active = models.BooleanField(default=True)
    config = models.JSONField(default=dict, blank=True)
    description = models.CharField(max_length=250, null=True, blank=True)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="workflow_transitions_created",
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="workflow_transitions_updated",
    )
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:  # pragma: no cover - admin/debug helper
        return f"{self.module}: {self.from_status} -> {self.to_status}"
