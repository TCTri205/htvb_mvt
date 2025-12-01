# cases/models.py
import uuid
from django.conf import settings
from django.db import models
from django.db.models import Q
from django.utils import timezone
from accounts.models import Department
from catalog.models import CaseType, CaseStatus
from documents.models import Document


class Case(models.Model):
    class Meta:
        db_table = "cases"
        indexes = [
            models.Index(fields=["department"]),
            models.Index(fields=["status"]),
            models.Index(fields=["owner"]),
            models.Index(fields=["leader"]),
        ]

    case_id = models.BigAutoField(primary_key=True)
    case_code = models.CharField(max_length=50, unique=True)
    title = models.CharField(max_length=250)
    description = models.CharField(max_length=250, null=True, blank=True)
    case_type = models.ForeignKey(CaseType, on_delete=models.PROTECT)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="cases_created",
    )
    department = models.ForeignKey(
        Department, null=True, blank=True, on_delete=models.SET_NULL
    )
    leader = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="cases_leading",
    )
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="cases_owning",
    )
    status = models.ForeignKey(CaseStatus, on_delete=models.PROTECT)
    priority = models.CharField(max_length=20, null=True, blank=True)  # Low/Med/High
    due_date = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)


class CaseParticipant(models.Model):
    class RoleOnCase(models.TextChoices):
        OWNER = "owner", "owner"
        COOWNER = "coowner", "coowner"
        ASSIGNEE = "assignee", "assignee"
        WATCHER = "watcher", "watcher"

    class Meta:
        db_table = "case_participants"
        constraints = [
            models.UniqueConstraint(fields=["case", "user"], name="uq_case_user")
        ]

    id = models.BigAutoField(primary_key=True)
    case = models.ForeignKey(
        Case, on_delete=models.CASCADE, related_name="participants"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="case_participations",
    )
    role_on_case = models.CharField(max_length=30, choices=RoleOnCase.choices)


class CaseTask(models.Model):
    class Status(models.TextChoices):
        OPEN = "OPEN", "OPEN"
        IN_PROGRESS = "IN_PROGRESS", "IN_PROGRESS"
        DONE = "DONE", "DONE"
        CANCELLED = "CANCELLED", "CANCELLED"

    class Meta:
        db_table = "case_tasks"
        indexes = [
            models.Index(fields=["case", "status"]),
            models.Index(fields=["due_at"]),
        ]

    task_id = models.BigAutoField(primary_key=True)
    case = models.ForeignKey(Case, on_delete=models.CASCADE, related_name="tasks")
    title = models.CharField(max_length=200)
    assignee = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="case_tasks",
    )
    status = models.CharField(
        max_length=20, default=Status.OPEN, choices=Status.choices
    )
    due_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="case_tasks_created",
    )
    created_at = models.DateTimeField(default=timezone.now)
    completed_at = models.DateTimeField(null=True, blank=True)
    note = models.CharField(max_length=500, null=True, blank=True)


class CaseActivityLog(models.Model):
    class Action(models.TextChoices):
        CREATE = "CREATE", "CREATE"
        UPDATE = "UPDATE", "UPDATE"
        CLOSE = "CLOSE", "CLOSE"
        REOPEN = "REOPEN", "REOPEN"
        ASSIGN = "ASSIGN", "ASSIGN"

    class Meta:
        db_table = "case_activity_logs"
        indexes = [models.Index(fields=["case", "at"])]

    log_id = models.BigAutoField(primary_key=True)
    case = models.ForeignKey(
        Case, on_delete=models.CASCADE, related_name="activity_logs"
    )
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    action = models.CharField(max_length=50, choices=Action.choices)
    at = models.DateTimeField(default=timezone.now)
    note = models.CharField(max_length=500, null=True, blank=True)
    meta_json = models.JSONField(null=True, blank=True)


class Comment(models.Model):
    class Entity(models.TextChoices):
        DOCUMENT = "document", "document"
        CASE = "case", "case"
        TASK = "task", "task"

    class Meta:
        db_table = "comments"
        indexes = [
            models.Index(fields=["entity_type", "entity_id", "created_at"]),
        ]
        constraints = [
            # Tránh tham chiếu nội bộ tới Comment.Entity trong lúc định nghĩa class
            models.CheckConstraint(
                name="chk_comment_entity_type",
                check=Q(entity_type__in=("document", "case", "task")),
            )
        ]

    comment_id = models.BigAutoField(primary_key=True)
    entity_type = models.CharField(max_length=20, choices=Entity.choices)
    entity_id = models.BigIntegerField()
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    content = models.CharField(max_length=1000)
    created_at = models.DateTimeField(default=timezone.now)


class CaseDocument(models.Model):
    class Meta:
        db_table = "case_documents"
        constraints = [
            models.UniqueConstraint(fields=["case", "document"], name="uq_case_document")
        ]
        indexes = [models.Index(fields=["document", "case"])]

    id = models.BigAutoField(primary_key=True)
    case = models.ForeignKey(
        Case, on_delete=models.CASCADE, related_name="case_documents"
    )
    document = models.ForeignKey(
        Document, on_delete=models.CASCADE, related_name="case_documents"
    )


class CaseAttachment(models.Model):
    class Meta:
        db_table = "case_attachments"
        indexes = [models.Index(fields=["case", "uploaded_at"])]

    attachment_id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    case = models.ForeignKey(Case, on_delete=models.CASCADE, related_name="attachments")
    attachment_type = models.CharField(max_length=20)
    file_name = models.CharField(max_length=200)
    storage_path = models.CharField(max_length=500)
    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    uploaded_at = models.DateTimeField(default=timezone.now)
