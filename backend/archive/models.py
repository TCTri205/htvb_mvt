import uuid

from django.db import models


class RetentionPolicy(models.Model):
    class Status(models.TextChoices):
        ACTIVE = "active", "Đang áp dụng"
        REVIEW = "review", "Cần rà soát"
        ARCHIVED = "archived", "Đã lưu trữ"

    policy_id = models.BigAutoField(primary_key=True)
    name = models.CharField(max_length=200)
    category = models.CharField(max_length=150)
    description = models.TextField(blank=True)
    retention_years = models.PositiveSmallIntegerField(default=5)
    quantity = models.PositiveIntegerField(default=0)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ACTIVE)
    next_review_at = models.DateField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "archive_retention_policies"
        ordering = ["-updated_at"]

    def __str__(self):
        return self.name


class ArchiveBackupRecord(models.Model):
    class Method(models.TextChoices):
        AUTO = "auto", "Tự động"
        MANUAL = "manual", "Thủ công"

    class Status(models.TextChoices):
        PENDING = "pending", "Đang xử lý"
        SUCCESS = "success", "Thành công"
        FAILED = "failed", "Thất bại"

    backup_id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=255)
    method = models.CharField(max_length=20, choices=Method.choices, default=Method.AUTO)
    size_bytes = models.BigIntegerField(default=0)
    duration_seconds = models.PositiveIntegerField(default=0)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    notes = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "archive_backups"
        ordering = ["-created_at"]

    def __str__(self):
        return self.title


class ArchiveQueueItem(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Đang chờ"
        PROCESSING = "processing", "Đang xử lý"
        COMPLETED = "completed", "Hoàn thành"
        FAILED = "failed", "Thất bại"

    queue_id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    label = models.CharField(max_length=255)
    category = models.CharField(max_length=120)
    size_bytes = models.BigIntegerField(default=0)
    progress = models.PositiveSmallIntegerField(default=0)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "archive_queue_items"
        ordering = ["-created_at"]

    def __str__(self):
        return self.label
