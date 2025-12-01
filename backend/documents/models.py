# apps/documents/models.py
import uuid
from django.conf import settings
from django.db import models
from django.db.models import Q
from django.utils import timezone
from django.contrib.postgres.indexes import GinIndex
from django.contrib.postgres.search import SearchVector
from accounts.models import Department
from catalog.models import (
    Field,
    DocumentType,
    UrgencyLevel,
    SecurityLevel,
    IssueLevel,
    DocumentStatus,
)



class Document(models.Model):
    class Direction(models.TextChoices):
        DEN = "den", "den"
        DI = "di", "di"
        DU_THAO = "du_thao", "du_thao"

    class Meta:
        db_table = "documents"
        indexes = [
            models.Index(fields=["doc_direction", "status"]),
            models.Index(fields=["department"]),
            models.Index(fields=["issued_date"]),
            models.Index(fields=["created_at"]),
            GinIndex(
                SearchVector("title", "sender", config="simple"),
                name="doc_title_sender_fts",
            ),
        ]
        constraints = [
            # doc_direction='di' => issue_number & issued_date NOT NULL
            models.CheckConstraint(
                name="chk_doc_di_require_issue",
                check=Q(doc_direction="di", issue_number__isnull=False, issued_date__isnull=False) | ~Q(doc_direction="di"),
            ),
            # doc_direction='den' => received_number, received_date, sender NOT NULL
            models.CheckConstraint(
                name="chk_doc_den_require_recv",
                check=Q(doc_direction="den",
                        received_number__isnull=False,
                        received_date__isnull=False,
                        sender__isnull=False) | ~Q(doc_direction="den"),
            ),
            # doc_direction='du_thao' => document_code NOT NULL
            models.CheckConstraint(
                name="chk_doc_duthao_require_code",
                check=Q(doc_direction="du_thao", document_code__isnull=False) | ~Q(doc_direction="du_thao"),
            ),
            # Partial unique: issue_number duy nhất trong từng năm khi 'di'
            models.UniqueConstraint(
                fields=["issue_year", "issue_number"],
                name="uq_issue_number_year_di_only",
                condition=Q(doc_direction="di"),
            ),
        ]

    document_id = models.BigAutoField(primary_key=True)
    doc_direction = models.CharField(max_length=20, choices=Direction.choices)
    document_code = models.CharField(max_length=50, null=True, blank=True)  # du_thao
    issue_number = models.CharField(max_length=50, null=True, blank=True)   # di
    issue_year = models.IntegerField(null=True, blank=True)
    title = models.CharField(max_length=500)

    field = models.ForeignKey(Field, null=True, blank=True, on_delete=models.PROTECT)
    document_type = models.ForeignKey(DocumentType, null=True, blank=True, on_delete=models.PROTECT)
    urgency_level = models.ForeignKey(UrgencyLevel, null=True, blank=True, on_delete=models.PROTECT)
    security_level = models.ForeignKey(SecurityLevel, null=True, blank=True, on_delete=models.PROTECT)
    issue_level = models.ForeignKey(IssueLevel, null=True, blank=True, on_delete=models.PROTECT)

    is_legal_doc = models.BooleanField(default=False)
    signing_method = models.CharField(max_length=50, null=True, blank=True)
    signed_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="signed_documents")
    signer_position = models.CharField(max_length=200, null=True, blank=True)

    issued_date = models.DateField(null=True, blank=True)
    received_number = models.CharField(max_length=50, null=True, blank=True)
    received_date = models.DateField(null=True, blank=True)
    sender = models.CharField(max_length=250, null=True, blank=True)
    received_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="received_documents")

    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="created_documents")
    department = models.ForeignKey(Department, null=True, blank=True, on_delete=models.SET_NULL)
    status = models.ForeignKey(DocumentStatus, null=True, blank=True, on_delete=models.PROTECT)

    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"[{self.doc_direction}] {self.title}"

    def save(self, *args, **kwargs):
        if self.doc_direction == Document.Direction.DI and self.issued_date:
            self.issue_year = self.issued_date.year
        elif self.doc_direction == Document.Direction.DU_THAO and self.issued_date:
            self.issue_year = self.issued_date.year
        return super().save(*args, **kwargs)


class DocumentVersion(models.Model):
    class Meta:
        db_table = "document_versions"
        constraints = [
            models.UniqueConstraint(fields=["document", "version_no"], name="uq_document_version_no")
        ]

    version_id = models.BigAutoField(primary_key=True)
    document = models.ForeignKey(Document, on_delete=models.CASCADE, related_name="versions")
    version_no = models.IntegerField()
    file_name = models.CharField(max_length=200, null=True, blank=True)
    storage_path = models.CharField(max_length=500, null=True, blank=True)
    changed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    changed_at = models.DateTimeField(default=timezone.now)


class DocumentAssignment(models.Model):
    class RoleOnDoc(models.TextChoices):
        OWNER = "owner", "owner"
        ASSIGNEE = "assignee", "assignee"
        WATCHER = "watcher", "watcher"

    class Meta:
        db_table = "document_assignments"
        indexes = [
            models.Index(fields=["user"]),
            models.Index(fields=["due_at"]),
        ]
        constraints = [
            models.UniqueConstraint(fields=["document", "user"], name="uq_document_user")
        ]

    id = models.BigAutoField(primary_key=True)
    document = models.ForeignKey(Document, on_delete=models.CASCADE, related_name="assignments")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="doc_assignments")
    role_on_doc = models.CharField(max_length=30, choices=RoleOnDoc.choices)
    assigned_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="doc_assigned_by")
    assigned_at = models.DateTimeField(default=timezone.now)
    due_at = models.DateTimeField(null=True, blank=True)
    instruction = models.TextField(null=True, blank=True)
    is_owner = models.BooleanField(default=False)


class DocumentWorkflowLog(models.Model):
    class Action(models.TextChoices):
        # Legacy transitions
        RECEIVED = "RECEIVED", "RECEIVED"
        ASSIGNED = "ASSIGNED", "ASSIGNED"
        SUBMITTED = "SUBMITTED", "SUBMITTED"
        APPROVED = "APPROVED", "APPROVED"
        REJECTED = "REJECTED", "REJECTED"
        SIGNED = "SIGNED", "SIGNED"
        PUBLISHED = "PUBLISHED", "PUBLISHED"

        # Inbound refinements
        VT_CREATE_INBOUND = "VT_CREATE_INBOUND", "VT_CREATE_INBOUND"
        VT_UPDATE_METADATA = "VT_UPDATE_METADATA", "VT_UPDATE_METADATA"
        LD_ASSIGN_OFFICER = "LD_ASSIGN_OFFICER", "LD_ASSIGN_OFFICER"
        CV_START_PROCESSING = "CV_START_PROCESSING", "CV_START_PROCESSING"
        CV_SUBMIT_FOR_APPROVAL = "CV_SUBMIT_FOR_APPROVAL", "CV_SUBMIT_FOR_APPROVAL"
        LD_APPROVE_INBOUND = "LD_APPROVE_INBOUND", "LD_APPROVE_INBOUND"
        LD_REQUEST_CHANGES_INBOUND = "LD_REQUEST_CHANGES_INBOUND", "LD_REQUEST_CHANGES_INBOUND"
        LD_HANDLE_CLERK_REJECTION = "LD_HANDLE_CLERK_REJECTION", "LD_HANDLE_CLERK_REJECTION"
        VT_FINAL_CHECK_REJECT_INBOUND = "VT_FINAL_CHECK_REJECT_INBOUND", "VT_FINAL_CHECK_REJECT_INBOUND"
        VT_FINAL_CHECK_OK_INBOUND = "VT_FINAL_CHECK_OK_INBOUND", "VT_FINAL_CHECK_OK_INBOUND"
        VT_REGISTER_INBOUND = "VT_REGISTER_INBOUND", "VT_REGISTER_INBOUND"
        VT_DISPATCH_RESULT = "VT_DISPATCH_RESULT", "VT_DISPATCH_RESULT"
        VT_ARCHIVE_INBOUND = "VT_ARCHIVE_INBOUND", "VT_ARCHIVE_INBOUND"
        CV_REQUEST_REASSIGN = "CV_REQUEST_REASSIGN", "CV_REQUEST_REASSIGN"
        QT_RECALL_INBOUND = "QT_RECALL_INBOUND", "QT_RECALL_INBOUND"

        # Outbound refinements
        CV_CREATE_DRAFT = "CV_CREATE_DRAFT", "CV_CREATE_DRAFT"
        CV_UPDATE_DRAFT = "CV_UPDATE_DRAFT", "CV_UPDATE_DRAFT"
        CV_SUBMIT_DRAFT = "CV_SUBMIT_DRAFT", "CV_SUBMIT_DRAFT"
        LD_REQUEST_CHANGES_OUTBOUND = "LD_REQUEST_CHANGES_OUTBOUND", "LD_REQUEST_CHANGES_OUTBOUND"
        LD_APPROVE_OUTBOUND = "LD_APPROVE_OUTBOUND", "LD_APPROVE_OUTBOUND"
        LD_REQUEST_CHANGES_FROM_CLERK = "LD_REQUEST_CHANGES_FROM_CLERK", "LD_REQUEST_CHANGES_FROM_CLERK"
        VT_RECEIVE_FOR_FINAL_CHECK = "VT_RECEIVE_FOR_FINAL_CHECK", "VT_RECEIVE_FOR_FINAL_CHECK"
        VT_FINAL_CHECK_OK_OUTBOUND = "VT_FINAL_CHECK_OK_OUTBOUND", "VT_FINAL_CHECK_OK_OUTBOUND"
        VT_REGISTER_OUTBOUND = "VT_REGISTER_OUTBOUND", "VT_REGISTER_OUTBOUND"
        VT_FINAL_CHECK_REJECT_OUTBOUND = "VT_FINAL_CHECK_REJECT_OUTBOUND", "VT_FINAL_CHECK_REJECT_OUTBOUND"
        VT_ISSUE_OUTBOUND = "VT_ISSUE_OUTBOUND", "VT_ISSUE_OUTBOUND"
        VT_ARCHIVE_OUTBOUND = "VT_ARCHIVE_OUTBOUND", "VT_ARCHIVE_OUTBOUND"
        QT_CANCEL_ISSUED_OUTBOUND = "QT_CANCEL_ISSUED_OUTBOUND", "QT_CANCEL_ISSUED_OUTBOUND"
        QT_FIX_STATE_MANUALLY = "QT_FIX_STATE_MANUALLY", "QT_FIX_STATE_MANUALLY"
        MANUAL_LOG = "MANUAL_LOG", "MANUAL_LOG"

    log_id = models.BigAutoField(primary_key=True)
    document = models.ForeignKey(Document, on_delete=models.CASCADE, related_name="workflow_logs")
    action = models.CharField(max_length=50, choices=Action.choices)
    from_status = models.ForeignKey(DocumentStatus, null=True, blank=True, on_delete=models.SET_NULL, related_name="logs_from")
    to_status = models.ForeignKey(DocumentStatus, null=True, blank=True, on_delete=models.SET_NULL, related_name="logs_to")
    acted_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    acted_at = models.DateTimeField(default=timezone.now)
    comment = models.CharField(max_length=500, null=True, blank=True)
    meta_json = models.JSONField(null=True, blank=True)


class DocumentApproval(models.Model):
    class Decision(models.TextChoices):
        APPROVE = "APPROVE", "APPROVE"
        REJECT = "REJECT", "REJECT"
        PENDING = "PENDING", "PENDING"

    class Meta:
        db_table = "document_approvals"
        constraints = [
            models.UniqueConstraint(fields=["document", "step_no"], name="uq_document_step")
        ]

    approval_id = models.BigAutoField(primary_key=True)
    document = models.ForeignKey(Document, on_delete=models.CASCADE, related_name="approvals")
    step_no = models.IntegerField()
    approver = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    decision = models.CharField(max_length=20, choices=Decision.choices, null=True, blank=True)
    decided_at = models.DateTimeField(null=True, blank=True)
    sign_hash = models.CharField(max_length=200, null=True, blank=True)
    sign_meta = models.CharField(max_length=500, null=True, blank=True)


class OutgoingNumbering(models.Model):
    class Meta:
        db_table = "outgoing_numbering"
        constraints = [
            models.UniqueConstraint(fields=["year", "seq"], name="uq_year_seq"),
        ]
        indexes = [models.Index(fields=["issued_at"])]

    id = models.BigAutoField(primary_key=True)
    year = models.IntegerField()
    seq = models.IntegerField()
    prefix = models.CharField(max_length=20, null=True, blank=True)
    postfix = models.CharField(max_length=20, null=True, blank=True)
    issued_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    issued_at = models.DateTimeField(default=timezone.now)
    # Nếu muốn gắn trực tiếp 1–1 với Document: thêm
    # document = models.OneToOneField(Document, null=True, blank=True, on_delete=models.SET_NULL)


class Organization(models.Model):
    class Meta:
        db_table = "organizations"

    organization_id = models.BigAutoField(primary_key=True)
    name = models.CharField(max_length=200)
    address = models.CharField(max_length=250, null=True, blank=True)
    email = models.CharField(max_length=200, null=True, blank=True)
    phone = models.CharField(max_length=30, null=True, blank=True)
    tax_code = models.CharField(max_length=50, null=True, blank=True)
    is_active = models.BooleanField(default=True)


class OrgContact(models.Model):
    class Meta:
        db_table = "org_contacts"
        indexes = [models.Index(fields=["organization"])]

    contact_id = models.BigAutoField(primary_key=True)
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name="contacts")
    full_name = models.CharField(max_length=200)
    email = models.CharField(max_length=200, null=True, blank=True)
    phone = models.CharField(max_length=30, null=True, blank=True)
    position = models.CharField(max_length=100, null=True, blank=True)


class DispatchOutbox(models.Model):
    class Method(models.TextChoices):
        POST = "buu_chinh", "bưu chính"
        EMAIL = "email", "email"
        DVC = "cong_dvc", "cổng DVC"

    class Status(models.TextChoices):
        PENDING = "PENDING", "PENDING"
        SENT = "SENT", "SENT"
        FAILED = "FAILED", "FAILED"

    class Meta:
        db_table = "dispatch_outbox"
        indexes = [
            models.Index(fields=["document", "status"]),
            models.Index(fields=["sent_at"]),
        ]

    dispatch_id = models.BigAutoField(primary_key=True)
    document = models.ForeignKey(Document, on_delete=models.CASCADE, related_name="dispatches")
    organization = models.ForeignKey(Organization, null=True, blank=True, on_delete=models.SET_NULL)
    contact = models.ForeignKey(OrgContact, null=True, blank=True, on_delete=models.SET_NULL)
    method = models.CharField(max_length=30, choices=Method.choices)
    sent_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=20, default=Status.PENDING, choices=Status.choices)
    tracking_no = models.CharField(max_length=100, null=True, blank=True)
    note = models.CharField(max_length=250, null=True, blank=True)


class DocumentAttachment(models.Model):
    class Meta:
        db_table = "document_attachments"
        indexes = [models.Index(fields=["document", "uploaded_at"])]

    attachment_id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    document = models.ForeignKey(Document, on_delete=models.CASCADE, related_name="attachments")
    attachment_type = models.CharField(max_length=20)  # hoặc FK -> AttachmentType nếu muốn
    file_name = models.CharField(max_length=200)
    storage_path = models.CharField(max_length=500)
    note = models.CharField(max_length=250, null=True, blank=True)
    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    uploaded_at = models.DateTimeField(default=timezone.now)


class RegisterBook(models.Model):
    class Direction(models.TextChoices):
        INCOMING = "den", "Văn bản đến"
        OUTGOING = "di", "Văn bản đi"

    class ResetPolicy(models.TextChoices):
        YEARLY = "yearly", "Reset mỗi năm"
        QUARTERLY = "quarterly", "Reset mỗi quý"
        MONTHLY = "monthly", "Reset mỗi tháng"
        NEVER = "never", "Không tự reset"

    class Meta:
        db_table = "register_books"
        indexes = [
            models.Index(fields=["direction", "year"]),
            models.Index(fields=["is_active"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["direction", "year", "name"],
                name="uq_register_book_direction_year_name",
            )
        ]

    register_id = models.BigAutoField(primary_key=True)
    name = models.CharField(max_length=200)
    direction = models.CharField(max_length=10, choices=Direction.choices)
    year = models.PositiveIntegerField()
    prefix = models.CharField(max_length=20, null=True, blank=True)
    suffix = models.CharField(max_length=20, null=True, blank=True)
    padding = models.PositiveSmallIntegerField(default=4)
    next_sequence = models.PositiveIntegerField(default=1)
    reset_policy = models.CharField(
        max_length=20, choices=ResetPolicy.choices, default=ResetPolicy.YEARLY
    )
    description = models.CharField(max_length=250, null=True, blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    is_active = models.BooleanField(default=True)
    department = models.ForeignKey(
        Department, null=True, blank=True, on_delete=models.SET_NULL
    )

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="register_books_created",
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="register_books_updated",
    )
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return f"{self.name} ({self.year})"


class NumberingRule(models.Model):
    class Target(models.TextChoices):
        INCOMING = "incoming", "Văn bản đến"
        OUTGOING = "outgoing", "Văn bản đi"

    class ResetPolicy(models.TextChoices):
        YEARLY = "yearly", "Reset mỗi năm"
        MONTHLY = "monthly", "Reset mỗi tháng"
        MANUAL = "manual", "Tự reset thủ công"

    class Meta:
        db_table = "numbering_rules"
        constraints = [
            models.UniqueConstraint(fields=["code"], name="uq_numbering_rule_code"),
        ]
        indexes = [
            models.Index(fields=["target", "is_active"]),
            models.Index(fields=["department"]),
        ]

    rule_id = models.BigAutoField(primary_key=True)
    code = models.CharField(max_length=50, unique=True)
    name = models.CharField(max_length=200)
    target = models.CharField(max_length=20, choices=Target.choices)
    prefix = models.CharField(max_length=20, null=True, blank=True)
    suffix = models.CharField(max_length=20, null=True, blank=True)
    padding = models.PositiveSmallIntegerField(default=4)
    start_sequence = models.PositiveIntegerField(default=1)
    next_sequence = models.PositiveIntegerField(default=1)
    reset_policy = models.CharField(
        max_length=20, choices=ResetPolicy.choices, default=ResetPolicy.YEARLY
    )
    description = models.CharField(max_length=250, null=True, blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    is_active = models.BooleanField(default=True)
    department = models.ForeignKey(
        Department, null=True, blank=True, on_delete=models.SET_NULL
    )

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="numbering_rules_created",
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="numbering_rules_updated",
    )
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return f"{self.code} ({self.target})"


class DocumentTemplate(models.Model):
    class Meta:
        db_table = "document_templates"
        constraints = [
            models.UniqueConstraint(
                fields=["name", "doc_direction"], name="uq_template_name_direction"
            )
        ]
        indexes = [
            models.Index(fields=["doc_direction", "is_active"]),
        ]

    template_id = models.BigAutoField(primary_key=True)
    name = models.CharField(max_length=200)
    doc_direction = models.CharField(
        max_length=20,
        choices=Document.Direction.choices,
        default=Document.Direction.DU_THAO,
    )
    version = models.PositiveIntegerField(default=1)
    description = models.CharField(max_length=250, null=True, blank=True)
    content = models.TextField()
    format = models.CharField(
        max_length=20,
        default="html",
        help_text="Định dạng nội dung (html, docx, ...)",
    )
    tags = models.JSONField(default=list, blank=True)
    is_active = models.BooleanField(default=True)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="document_templates_created",
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="document_templates_updated",
    )
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return f"{self.name} v{self.version}"
