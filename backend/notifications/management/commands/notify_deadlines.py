"""Management command to notify users when reminders approach their due dates."""
from __future__ import annotations

from datetime import timedelta
from django.core.management.base import BaseCommand
from django.utils import timezone

from notifications.models import Notification, Reminder
from notifications.signals import notify_approaching_deadline


class Command(BaseCommand):
    help = "Send approaching-deadline notifications for reminders (case/document)."

    def add_arguments(self, parser):
        channel_choices = [choice.value for choice in Notification.Channel]
        entity_choices = [Reminder.Entity.CASE, Reminder.Entity.DOCUMENT, "all"]
        parser.add_argument(
            "--window-days",
            type=int,
            default=3,
            help="Look ahead this many days when scanning reminders.",
        )
        parser.add_argument(
            "--entity-type",
            choices=entity_choices,
            default="all",
            help="Limit notifications to a specific entity type ('case' or 'document').",
        )
        parser.add_argument(
            "--channel",
            choices=channel_choices,
            default=Notification.Channel.APP,
            help="Notification channel to use when creating messages.",
        )
        parser.add_argument(
            "--min-hours-between",
            type=int,
            default=24,
            help="Minimum hours to wait before re-notifying the same reminder.",
        )
        parser.add_argument(
            "--force",
            action="store_true",
            help="Ignore the min-hours-between delay when sending again.",
        )

    def handle(self, *args, **options):
        window_days = options["window_days"]
        entity_type = options["entity_type"]
        channel = options["channel"]
        min_hours_between = options["min_hours_between"]
        force = options["force"]

        now = timezone.now()
        window_end = now + timedelta(days=window_days)

        reminders = Reminder.objects.filter(
            status=Reminder.Status.PENDING,
            due_at__gte=now,
            due_at__lte=window_end,
        ).order_by("due_at")

        if entity_type != "all":
            reminders = reminders.filter(entity_type=entity_type)

        candidates = list(reminders)
        if not candidates:
            self.stdout.write("No due reminders found in the specified window.")
            return

        sent = 0
        skipped_recent = 0
        skipped_missing_user = 0

        for reminder in candidates:
            if not reminder.user:
                skipped_missing_user += 1
                continue

            if not force and reminder.last_notified_at:
                elapsed = now - reminder.last_notified_at
                if elapsed < timedelta(hours=min_hours_between):
                    skipped_recent += 1
                    continue

            days_left = max(0, (reminder.due_at.date() - now.date()).days)

            notify_approaching_deadline(
                reminder.entity_type,
                reminder.entity_id,
                [reminder.user],
                days_left,
                channel=channel,
            )

            reminder.last_notified_at = now
            reminder.save(update_fields=["last_notified_at"])
            sent += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"Approaching deadlines scanned: {len(candidates)}; "
                f"sent={sent}, skipped_recent={skipped_recent}, skipped_missing_user={skipped_missing_user}"
            )
        )
