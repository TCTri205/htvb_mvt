# apps/notifications/models.py
from django.conf import settings
from django.db import models
from django.utils import timezone


class Notification(models.Model):
    class Channel(models.TextChoices):
        APP = "app", "app"
        EMAIL = "email", "email"
        SMS = "sms", "sms"

    class Meta:
        db_table = "notifications"
        indexes = [models.Index(fields=["user", "read_at"])]

    notification_id = models.BigAutoField(primary_key=True)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    title = models.CharField(max_length=200)
    body = models.CharField(max_length=1000, null=True, blank=True)
    link = models.CharField(max_length=500, null=True, blank=True)
    channel = models.CharField(max_length=20, default=Channel.APP, choices=Channel.choices)
    sent_at = models.DateTimeField(null=True, blank=True)
    read_at = models.DateTimeField(null=True, blank=True)


class Reminder(models.Model):
    class Entity(models.TextChoices):
        DOCUMENT = "document", "document"
        CASE = "case", "case"
        TASK = "task", "task"

    class Status(models.TextChoices):
        PENDING = "PENDING", "PENDING"
        SENT = "SENT", "SENT"
        CLEARED = "CLEARED", "CLEARED"

    class Meta:
        db_table = "reminders"
        indexes = [
            models.Index(fields=["due_at", "status"]),
        ]

    reminder_id = models.BigAutoField(primary_key=True)
    entity_type = models.CharField(max_length=20, choices=Entity.choices)
    entity_id = models.BigIntegerField()
    user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    due_at = models.DateTimeField()
    status = models.CharField(max_length=20, default=Status.PENDING, choices=Status.choices)
    last_notified_at = models.DateTimeField(null=True, blank=True)


class Job(models.Model):
    class Type(models.TextChoices):
        REMINDER = "REMINDER", "REMINDER"
        REPORT_EXPORT = "REPORT_EXPORT", "REPORT_EXPORT"
        SYNC_MAIL = "SYNC_MAIL", "SYNC_MAIL"

    class Status(models.TextChoices):
        QUEUED = "QUEUED", "QUEUED"
        RUNNING = "RUNNING", "RUNNING"
        DONE = "DONE", "DONE"
        FAILED = "FAILED", "FAILED"

    class Meta:
        db_table = "jobs"
        indexes = [models.Index(fields=["run_at", "status"])]

    job_id = models.BigAutoField(primary_key=True)
    type = models.CharField(max_length=50, choices=Type.choices)
    payload_json = models.JSONField()
    run_at = models.DateTimeField()
    status = models.CharField(max_length=20, default=Status.QUEUED, choices=Status.choices)
    attempts = models.IntegerField(default=0)
    last_error = models.CharField(max_length=500, null=True, blank=True)


class NotificationChannel(models.Model):
    """
    Configuration for notification channels (Email, Push, SMS).
    Demo version - no real sending, just UI management.
    """
    class ChannelType(models.TextChoices):
        EMAIL = 'email', 'Email'
        PUSH = 'push', 'Push Notification'
        SMS = 'sms', 'SMS'
    
    class Meta:
        db_table = 'notification_channels'
        indexes = [models.Index(fields=['channel_type'])]
    
    channel_id = models.BigAutoField(primary_key=True)
    channel_type = models.CharField(
        max_length=20,
        choices=ChannelType.choices,
        unique=True,
        help_text="Type of notification channel"
    )
    is_enabled = models.BooleanField(
        default=True,
        help_text="Whether this channel is active"
    )
    config = models.JSONField(
        default=dict,
        help_text="Channel configuration (SMTP settings, API keys, etc.) - plain JSON for demo"
    )
    sent_count = models.IntegerField(
        default=0,
        help_text="Total notifications sent via this channel"
    )
    error_count = models.IntegerField(
        default=0,
        help_text="Total failed notifications"
    )
    last_used_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Last time this channel was used"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    def __str__(self):
        return f"{self.get_channel_type_display()} ({'Enabled' if self.is_enabled else 'Disabled'})"
    
    @property
    def success_rate(self):
        """Calculate success rate percentage."""
        total = self.sent_count + self.error_count
        if total == 0:
            return 0.0
        return round((self.sent_count / total) * 100, 1)


class AutomationRule(models.Model):
    """
    Automation rules for triggering notifications.
    Demo version - rules are displayed but not actually executed.
    """
    class Trigger(models.TextChoices):
        ASSIGNMENT = 'assignment', 'Khi phân công'
        STATUS_CHANGE = 'status_change', 'Khi đổi trạng thái'
        DEADLINE = 'deadline', 'Gần hạn deadline'
    
    class Meta:
        db_table = 'automation_rules'
        indexes = [models.Index(fields=['trigger', 'is_enabled'])]
        ordering = ['-created_at']
    
    rule_id = models.BigAutoField(primary_key=True)
    name = models.CharField(
        max_length=200,
        help_text="Tên quy tắc tự động"
    )
    trigger = models.CharField(
        max_length=50,
        choices=Trigger.choices,
        help_text="Sự kiện kích hoạt"
    )
    is_enabled = models.BooleanField(
        default=True,
        help_text="Quy tắc có đang hoạt động không"
    )
    channels = models.JSONField(
        default=list,
        help_text="Danh sách kênh gửi thông báo: ['email', 'push', 'sms']"
    )
    conditions = models.JSONField(
        default=dict,
        help_text="Điều kiện kích hoạt (vd: hours_before, priority, etc.)"
    )
    template = models.TextField(
        blank=True,
        default='',
        help_text="Mẫu nội dung thông báo"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    def __str__(self):
        return self.name


class NotificationLog(models.Model):
    """
    Log of all notifications sent (demo data).
    Used for displaying notification history in admin UI.
    """
    class Status(models.TextChoices):
        SENT = 'sent', 'Đã gửi'
        FAILED = 'failed', 'Thất bại'
        PENDING = 'pending', 'Đang chờ'
    
    class Meta:
        db_table = 'notification_logs'
        indexes = [
            models.Index(fields=['channel', 'status']),
            models.Index(fields=['sent_at']),
        ]
        ordering = ['-sent_at']
    
    log_id = models.BigAutoField(primary_key=True)
    channel = models.CharField(
        max_length=20,
        help_text="Kênh gửi: email, push, sms"
    )
    recipient = models.CharField(
        max_length=255,
        help_text="Người nhận (email hoặc user_id)"
    )
    title = models.CharField(
        max_length=500,
        help_text="Tiêu đề thông báo"
    )
    body = models.TextField(
        blank=True,
        default='',
        help_text="Nội dung thông báo"
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING,
        help_text="Trạng thái gửi"
    )
    sent_at = models.DateTimeField(
        auto_now_add=True,
        help_text="Thời gian gửi"
    )
    error_message = models.TextField(
        null=True,
        blank=True,
        help_text="Thông báo lỗi nếu gửi thất bại"
    )
    rule = models.ForeignKey(
        AutomationRule,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        help_text="Quy tắc tự động kích hoạt (nếu có)"
    )
    
    def __str__(self):
        return f"{self.channel} - {self.title} ({self.get_status_display()})"
