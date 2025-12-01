# notifications/signals.py
"""
Signal handlers for creating notifications on business events.
"""
from __future__ import annotations

import logging
import unicodedata
from typing import Optional

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.utils import timezone

from cases.models import CaseParticipant, Case
from documents.models import DocumentAssignment
from workflow.services.events import emit

from .models import Notification

logger = logging.getLogger(__name__)
User = get_user_model()


def _normalize_status_key(value: Optional[str]) -> str:
    """Normalize status labels so accents and casing match internal codes."""
    if not value:
        return ""
    normalized = unicodedata.normalize("NFKD", value)
    ascii_only = "".join(ch for ch in normalized if not unicodedata.combining(ch))
    return ascii_only.replace(" ", "_").upper()


def create_notification(
    user,
    title: str,
    body: Optional[str] = None,
    link: Optional[str] = None,
    channel: str = "app",
    emit_event: bool = True,
) -> Optional[Notification]:
    """
    Helper to create a notification and optionally publish realtime event.
    
    Args:
        user: User to notify
        title: Notification title
        body: Notification body (optional)
        link: Link to related entity (optional)
        channel: Notification channel (default: 'app')
        emit_event: Whether to publish realtime event via Redis (default: True)
    
    Returns:
        The created Notification object, or None if failed
    """
    try:
        notification = Notification.objects.create(
            user=user,
            title=title,
            body=body or "",
            link=link or "",
            channel=channel,
            sent_at=timezone.now(),
        )
        
        # Emit realtime event if enabled
        if emit_event:
            emit(
                "notification.created",
                {
                    "notification_id": notification.notification_id,
                    "user_id": getattr(user, "user_id", None),
                    "title": title,
                },
                audience={"user_ids": [str(getattr(user, "user_id", None))]},
            )
        
        logger.info(f"Created notification {notification.notification_id} for user {user.username}")
        return notification
    except Exception as e:
        logger.error(f"Failed to create notification for user {user.username}: {e}")
        return None


@receiver(post_save, sender=CaseParticipant)
def on_case_participant_created(sender, instance: CaseParticipant, created, **kwargs):
    """
    Notify user when they are added to a case.
    """
    if not created:
        return
    
    user = instance.user
    case = instance.case
    role = instance.role_on_case
    
    if not user or not case:
        return
    
    # Build notification
    title = f"Bạn được phân công vào hồ sơ: {case.title or f'HS#{case.case_id}'}"
    body = f"Vai trò: {role}"
    link = f"/hosocongviec/{case.case_id}"
    
    create_notification(user, title, body, link)


@receiver(post_save, sender=DocumentAssignment)
def on_document_assignment_created(sender, instance: DocumentAssignment, created, **kwargs):
    """
    Notify user when they are assigned to a document.
    """
    if not created:
        return
    
    user = instance.user
    document = instance.document
    role = instance.role_on_doc
    
    if not user or not document:
        return
    
    # Build notification
    doc_number = getattr(document, "doc_number", None) or f"VB#{document.document_id}"
    title = f"Bạn được phân công xử lý văn bản: {doc_number}"
    body = f"Vai trò: {role}"
    
    # Determine link based on document direction
    direction = getattr(document, "doc_direction", "").lower()
    if direction == "den":
        link = f"/vanbanden/{document.document_id}"
    elif direction in ("di", "du_thao"):
        link = f"/vanbandi/{document.document_id}"
    else:
        link = f"/vanban/{document.document_id}"
    
    create_notification(user, title, body, link)


@receiver(post_save, sender=Case)
def on_case_status_changed(sender, instance: Case, created, **kwargs):
    """
    Notify participants when case status changes to specific states.
    """
    if created:
        return  # Don't notify on creation
    
    # Only notify on specific status codes
    status_code = getattr(instance.status, "code", None) if instance.status else None

    notify_statuses = {
        "CHO_DUYET_DONG": "Hồ sơ đang chờ duyệt đóng",
        "DONG": "Hồ sơ đã được đóng",
        "TAM_DUNG": "Hồ sơ đã tạm dừng",
        "DANG_THUC_HIEN": "Hồ sơ đang thực hiện",
    }
    
    if status_code not in notify_statuses:
        return
    title = notify_statuses[status_code]
    
    # Get participants to notify
    participants = CaseParticipant.objects.filter(case=instance).select_related("user")
    
    body = f"Hồ sơ: {instance.title or f'HS#{instance.case_id}'}"
    link = f"/hosocongviec/{instance.case_id}"
    
    for participant in participants:
        if participant.user:
            create_notification(participant.user, title, body, link)


@receiver(post_save, sender="documents.Document")
def on_document_status_changed(sender, instance, created, **kwargs):
    """
    Notify assignees when document status changes to specific states.
    
    This handles both inbound and outbound document status changes:
    - Approved, Rejected, Published, Returned, etc.
    """
    if created:
        return  # Don't notify on creation
    
    # Import here to avoid circular imports
    from documents.models import DocumentAssignment
    
    # Get status info
    status = getattr(instance, "status", None)
    if not status:
        return
    
    status_code = getattr(status, "code", None) or getattr(status, "status_code", None)
    status_name = getattr(status, "name", None) or getattr(status, "status_name", None)
    status_key_source = status_code or status_name
    status_key = _normalize_status_key(status_key_source)
    if not status_key:
        return

    # Define which status changes should trigger notifications
    # Customize based on your DocumentStatus model structure
    notify_statuses = {
        # Inbound document statuses
        "DANG_XU_LY": "Văn bản đang được xử lý",
        "HOAN_THANH": "Văn bản đã hoàn thành",
        "TRA_LAI": "Văn bản bị trả lại",
        # Outbound document statuses  
        "PHE_DUYET": "Văn bản đã được phê duyệt",
        "TU_CHOI": "Văn bản bị từ chối",
        "PHAT_HANH": "Văn bản đã phát hành",
        "DA_KY": "Văn bản đã ký",
    }
    
    title = notify_statuses.get(status_key)
    if not title:
        return
    
    # Get assignees to notify
    assignees = DocumentAssignment.objects.filter(document=instance).select_related("user")
    
    if not assignees.exists():
        return
    
    # Build notification
    doc_number = getattr(instance, "doc_number", None) or f"VB#{instance.document_id}"
    body = f"Văn bản: {doc_number}"
    
    # Determine link based on document direction
    direction = getattr(instance, "doc_direction", "").lower()
    if direction == "den":
        link = f"/vanbanden/{instance.document_id}"
    elif direction in ("di", "du_thao"):
        link = f"/vanbandi/{instance.document_id}"
    else:
        link = f"/vanban/{instance.document_id}"
    
    # Notify all assignees
    for assignment in assignees:
        if assignment.user:
            create_notification(assignment.user, title, body, link)


def notify_approaching_deadline(
    entity_type: str,
    entity_id: int,
    users,
    days_left: int,
    channel: str = Notification.Channel.APP,
):
    """
    Notify users about approaching deadline.
    Called from management command or scheduled job.
    
    Args:
        entity_type: 'case' or 'document'
        entity_id: ID of the entity
        users: List of users to notify
        days_left: Number of days until deadline
        channel: Notification channel to use when creating the message
    """
    if entity_type == "case":
        try:
            from cases.models import Case
            case = Case.objects.get(case_id=entity_id)
            title = f"Hồ sơ sắp đến hạn ({days_left} ngày)"
            body = f"Hồ sơ: {case.title or f'HS#{case.case_id}'}"
            link = f"/hosocongviec/{case.case_id}"
        except Case.DoesNotExist:
            return
    elif entity_type == "document":
        try:
            from documents.models import Document
            doc = Document.objects.get(document_id=entity_id)
            doc_number = getattr(doc, "doc_number", None) or f"VB#{doc.document_id}"
            title = f"Văn bản sắp đến hạn ({days_left} ngày)"
            body = f"Văn bản: {doc_number}"
            link = f"/vanban/{doc.document_id}"
        except:
            return
    else:
        return
    
    for user in users:
        create_notification(user, title, body, link, channel=channel)
