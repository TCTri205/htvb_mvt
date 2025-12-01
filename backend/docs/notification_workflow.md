# Notification Workflow
## Event-based alerts
The `notifications/signals.py` module wires the key business events to the shared `create_notification` helper:

- `on_case_participant_created` (line 78) notifies any user who is newly assigned to a case.
- `on_document_assignment_created` (line 99) notifies assignees/watchers for both inbound and outbound documents.
- `on_case_status_changed` (line 132) fires when a case hits one of the `CHO_DUYET_DONG`, `DANG_THUC_HIEN`, `TAM_DUNG`, or `DONG` codes, pushing an update to all participants.
- `on_document_status_changed` (line 165) now normalizes the document status key before comparing it to `notify_statuses`, so transitions such as `DANG_XU_LY`, `HOAN_THANH`, `TRA_LAI`, `PHE_DUYET`, `TU_CHOI`, `PHAT_HANH`, and `DA_KY` reliably send notifications to every assignment.

All signals call `create_notification`, which accepts a `channel` argument and emits the realtime `notification.created` event, so the same notification can be shared across “app”, “email”, or “sms” channels.

## Approaching-deadline notifications
The new management command `notifications/management/commands/notify_deadlines.py` can be scheduled from cron/worker systems to scan the `Reminder` table for pending deadlines. It:

1. Filters `Reminder` rows with status `PENDING` whose `due_at` sits between “now” and `window_days` (default 3).
2. Respects `--entity-type` (case/document/all) and `--channel` to control which reminders it touches.
3. Enforces `--min-hours-between` (default 24h) unless `--force` is supplied, so the same reminder is not re-notified too frequently.
4. For each selected reminder, it calls `notify_approaching_deadline` with the user list, the derived `days_left`, and the requested channel, then records `last_notified_at`.

Example:

```bash
python manage.py notify_deadlines --window-days 5 --channel push --entity-type document
```

The command will print how many reminders it evaluated, how many notifications were sent, and how many reminders were skipped because of recent notifications or missing users.

## Reminder creation paths
Reminders are still created manually, either:

- via the `/api/v1/reminders/` API exposed by `notifications.api.ReminderViewSet`/`ReminderCreateUpdateSerializer`, where the authenticated user becomes `reminder.user`, or
- via internal seed/job code such as `core/management/commands/seed_demo_data.py` that performs `Reminder.objects.create`.

If in the future a deadline-driven background job needs to issue reminders, it can call `notify_approaching_deadline` directly (same helper the management command uses) or reuse the `notify_deadlines` command.

## Scheduling the deadline job
Schedule the command in your cron/worker system so reminder notifications run automatically. Adjust the `DATABASE_URL`/`.env` loading for your host:

```bash
# every 30 minutes (example)
cd /path/to/backend
source .env
python manage.py notify_deadlines --window-days 3 --channel push --entity-type all >> /var/log/notify_deadlines.log 2>&1
```

Keeping the job under an admin-managed cron ensures the `last_notified_at` guard prevents repeated pings while the `--window-days` flag limits the scan to the upcoming horizon.

## Manual verification
To validate the workflow locally you can create sample reminders and run the new command:

1. Create a test user (`notify_demo_user`), a fresh document/case, and reminders pointing at those entities (the helper script used during this check created reminders with due dates 1 and 2 days ahead). You can now run `python manage.py create_demo_reminders --doc-days 2 --case-days 1 --reset-last-notified` to repeat that setup without shell scripts and ensure the reminders are fresh before rerunning notifications.
2. Run e.g. `python manage.py notify_deadlines --window-days 5 --channel app --entity-type all`. The log showed `Approaching deadlines scanned: 3; sent=3, skipped_recent=0` and emitted notifications with titles `Hồ sơ sắp đến hạn (1 ngày)` and `Văn bản sắp đến hạn (2 ngày)` (IDs 2–4).
3. Query `Notification.objects.filter(user__username="notify_demo_user")` to ensure the messages exist on the requested channel and carry the correct titles/due dates.
