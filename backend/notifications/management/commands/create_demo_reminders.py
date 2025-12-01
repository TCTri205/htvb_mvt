"""Create demo reminders for a case and a document to help test deadline notifications."""
from __future__ import annotations

from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from accounts.models import User
from catalog.models import CaseStatus, CaseType, DocumentStatus
from cases.models import Case
from documents.models import Document
from notifications.models import Reminder


class Command(BaseCommand):
    help = "Create demo user/case/document + reminders for approaching-deadline testing."

    def add_arguments(self, parser):
        parser.add_argument(
            "--username",
            default=None,
            help="Username to use for the demo user (created if missing). If omitted, the first active user is used; if none found, a demo user is created.",
        )
        parser.add_argument(
            "--doc-days",
            type=int,
            default=2,
            help="Days until the document reminder is due.",
        )
        parser.add_argument(
            "--case-days",
            type=int,
            default=1,
            help="Days until the case reminder is due.",
        )
        parser.add_argument(
            "--reset-last-notified",
            action="store_true",
            help="Set last_notified_at=None on the reminders so they are ready to resend.",
        )
        parser.add_argument(
            "--all-users",
            action="store_true",
            help="Create reminders for all active users instead of a single user.",
        )

    def handle(self, *args, **options):
        username = options["username"]
        doc_days = options["doc_days"]
        case_days = options["case_days"]
        reset_last = options["reset_last_notified"]
        all_users = options["all_users"]

        now = timezone.now()

        # Resolve target users
        target_users = []
        if all_users:
            target_users = list(User.objects.filter(is_active=True))
            if not target_users:
                self.stdout.write("No active users found; creating notify_demo_user")
        elif username:
            target_users = [
                User.objects.get_or_create(
                    username=username,
                    defaults={
                        "full_name": "Notification Demo User",
                        "email": f"{username}@example.com",
                        "is_active": True,
                    },
                )[0]
            ]
        else:
            # Prefer a conventional CV account if present, else first active, else create demo
            preferred = User.objects.filter(username__iexact="cv01", is_active=True).first()
            if preferred:
                target_users = [preferred]
            else:
                first_active = User.objects.filter(is_active=True).first()
                if first_active:
                    target_users = [first_active]
                else:
                    user = User.objects.create_user(
                        username="notify_demo_user",
                        password="DevPass123!",
                        full_name="Notification Demo User",
                        email="notify_demo@example.com",
                    )
                    target_users = [user]
                    self.stdout.write("Created fallback user notify_demo_user")

        # Ensure passwords for created users
        for user in target_users:
            if not user.has_usable_password():
                user.set_password("DevPass123!")
                user.save(update_fields=["password"])
        self.stdout.write(
            "Using users: " + ", ".join(u.username for u in target_users)
        )

        doc_status, _ = DocumentStatus.objects.get_or_create(status_name="DANG_XU_LY")

        for target_user in target_users:
            doc_title = f"Reminder Demo Document {now.strftime('%Y%m%d%H%M%S')}"
            document, _ = Document.objects.get_or_create(
                title=doc_title,
                created_by=target_user,
                defaults={
                    "doc_direction": Document.Direction.DU_THAO,
                    "document_code": f"REM-{now.strftime('%H%M%S')}",
                    "status": doc_status,
                    "issued_date": now.date(),
                    "updated_at": now,
                },
            )
            self.stdout.write(f"Doc for {target_user.username}: {document.document_id}")

            case_type, _ = CaseType.objects.get_or_create(case_type_name="REMINDER_TEST_TYPE")
            case_status, _ = CaseStatus.objects.get_or_create(case_status_name="REMINDER_TEST_STATUS")
            case_code = f"REM-{target_user.username}-{now.strftime('%Y%m%d%H%M%S')}"
            case, _ = Case.objects.get_or_create(
                case_code=case_code,
                defaults={
                    "title": "Reminder Demo Case",
                    "case_type": case_type,
                    "created_by": target_user,
                    "status": case_status,
                    "due_date": now + timedelta(days=case_days),
                },
            )
            self.stdout.write(f"Case for {target_user.username}: {case.case_id}")

            case_reminder, cr_created = Reminder.objects.get_or_create(
                entity_type=Reminder.Entity.CASE,
                entity_id=case.case_id,
                user=target_user,
                defaults={
                    "due_at": now + timedelta(days=case_days),
                    "status": Reminder.Status.PENDING,
                },
            )
            if not cr_created and reset_last:
                case_reminder.due_at = now + timedelta(days=case_days)
                case_reminder.status = Reminder.Status.PENDING
                case_reminder.last_notified_at = None
                case_reminder.save(update_fields=["due_at", "status", "last_notified_at"])
            self.stdout.write(f"Reminder for case {case.case_id} (id {case_reminder.reminder_id}) ready")

            doc_reminder, dr_created = Reminder.objects.get_or_create(
                entity_type=Reminder.Entity.DOCUMENT,
                entity_id=document.document_id,
                user=target_user,
                defaults={
                    "due_at": now + timedelta(days=doc_days),
                    "status": Reminder.Status.PENDING,
                },
            )
            if not dr_created and reset_last:
                doc_reminder.due_at = now + timedelta(days=doc_days)
                doc_reminder.status = Reminder.Status.PENDING
                doc_reminder.last_notified_at = None
                doc_reminder.save(update_fields=["due_at", "status", "last_notified_at"])
            self.stdout.write(f"Reminder for document {document.document_id} (id {doc_reminder.reminder_id}) ready")
