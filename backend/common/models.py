from django.conf import settings
from django.db import models
from django.utils import timezone


class IdempotencyKey(models.Model):
    """
    Lưu vết phản hồi cho các request mang Idempotency-Key.
    Khóa duy nhất theo (key, owner, path, method) để phân biệt user và endpoint.
    """
    key = models.CharField(max_length=255)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="idempotency_keys",
    )
    path = models.CharField(max_length=255)
    method = models.CharField(max_length=10)
    request_hash = models.CharField(max_length=64)
    response_status = models.PositiveSmallIntegerField(null=True, blank=True)
    response_body = models.JSONField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)
    completed_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "idempotency_keys"
        unique_together = ("key", "owner", "path", "method")
        indexes = [
            models.Index(fields=["key", "owner", "path", "method"]),
            models.Index(fields=["expires_at"]),
        ]

    def __str__(self) -> str:
        owner = getattr(self.owner, "pk", None)
        return f"{self.key}::{self.method} {self.path} (owner={owner})"
