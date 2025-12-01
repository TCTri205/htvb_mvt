"""Seed an extended demo dataset that exercises documents, cases, catalog lookups, and auxiliary services."""

from __future__ import annotations

import uuid
from datetime import timedelta
from typing import Any, Dict, Iterable, List, Optional

from django.apps import apps
from django.contrib.auth import get_user_model
from django.core.management import BaseCommand, call_command
from django.utils import timezone


def get_model(app_label: str, model_name: str):
    """Safely resolve a model; return None if the app/model is missing."""
    try:
        return apps.get_model(app_label, model_name)
    except LookupError:
        return None


def ensure_lookup_values(model, field_name: str, values: Iterable[str]) -> List[Any]:
    """Ensure the provided values exist for the given model/field."""
    created: List[Any] = []
    if not model:
        return created
    for value in values:
        obj, _ = model.objects.get_or_create(**{field_name: value})
        created.append(obj)
    return created


def find_user(model, candidates: Iterable[str]) -> Optional[Any]:
    """Return the first user matching any of the given usernames (case-insensitive)."""
    for candidate in candidates:
        if not candidate:
            continue
        user = model.objects.filter(username__iexact=candidate).first()
        if user:
            return user
    return model.objects.filter(is_active=True).first()


class Command(BaseCommand):
    help = "Seed catalog/catalogue, documents, cases, and support tables with rich demo data."

    def handle(self, *args, **options):
        tz_now = timezone.now()
        # 1) ensure the base seeds exist
        for command_name in ("seed_accounts", "seed_docs_cases"):
            try:
                call_command(command_name, verbosity=0)
                self.stdout.write(self.style.SUCCESS(f"↪ Ran {command_name}"))
            except Exception as exc:
                self.stdout.write(self.style.WARNING(f"⚠️ {command_name} skipped: {exc}"))

        User = get_user_model()
        Department = get_model("accounts", "Department")

        Document = get_model("documents", "Document")
        DocumentVersion = get_model("documents", "DocumentVersion")
        DocumentAssignment = get_model("documents", "DocumentAssignment")
        DocumentWorkflowLog = get_model("documents", "DocumentWorkflowLog")
        DocumentApproval = get_model("documents", "DocumentApproval")
        DocumentAttachment = get_model("documents", "DocumentAttachment")
        OutgoingNumbering = get_model("documents", "OutgoingNumbering")
        Organization = get_model("documents", "Organization")
        OrgContact = get_model("documents", "OrgContact")
        DispatchOutbox = get_model("documents", "DispatchOutbox")

        Field = get_model("catalog", "Field")
        DocumentType = get_model("catalog", "DocumentType")
        IssueLevel = get_model("catalog", "IssueLevel")
        SecurityLevel = get_model("catalog", "SecurityLevel")
        UrgencyLevel = get_model("catalog", "UrgencyLevel")
        DocumentStatus = get_model("catalog", "DocumentStatus")
        CaseType = get_model("catalog", "CaseType")
        CaseStatus = get_model("catalog", "CaseStatus")
        AttachmentType = get_model("catalog", "AttachmentType")

        Case = get_model("cases", "Case")
        CaseParticipant = get_model("cases", "CaseParticipant")
        CaseTask = get_model("cases", "CaseTask")
        CaseActivityLog = get_model("cases", "CaseActivityLog")
        CaseDocument = get_model("cases", "CaseDocument")
        CaseAttachment = get_model("cases", "CaseAttachment")
        Comment = get_model("cases", "Comment")

        Notification = get_model("notifications", "Notification")
        Reminder = get_model("notifications", "Reminder")
        Job = get_model("notifications", "Job")

        ReportDefinition = get_model("reports", "ReportDefinition")
        ReportExport = get_model("reports", "ReportExport")

        AuditLog = get_model("audit", "AuditLog")
        SystemSetting = get_model("systemapps", "SystemSetting")

        AuthSession = get_model("accounts", "AuthSession")
        PasswordReset = get_model("accounts", "PasswordReset")
        SecurityEvent = get_model("accounts", "SecurityEvent")

        if not Document:
            self.stdout.write(self.style.WARNING("⚠️ documents.Document missing → cannot seed demo data."))
            return

        # 2) seed catalog lookups
        ensure_lookup_values(Field, "field_name", ["Hành chính", "Đầu tư", "Tổng hợp nội bộ"])
        ensure_lookup_values(DocumentType, "type_name", ["Công văn", "Thông báo", "Báo cáo nội bộ"])
        ensure_lookup_values(IssueLevel, "level_name", ["Bình thường", "Quan trọng", "Trung ương"])
        ensure_lookup_values(SecurityLevel, "level_name", ["Bình thường", "Mật", "Tuyệt mật"])
        ensure_lookup_values(UrgencyLevel, "level_name", ["Thường", "Khẩn", "Hỏa tốc"])
        ensure_lookup_values(DocumentStatus, "status_name", ["Nháp", "Trình duyệt", "Đã ký", "Phát hành"])
        ensure_lookup_values(CaseType, "case_type_name", ["Hồ sơ thường", "Dự án đặc thù"])
        ensure_lookup_values(CaseStatus, "case_status_name", ["Chờ phân công", "Đang xử lý", "Hoàn tất"])
        ensure_lookup_values(AttachmentType, "type_name", ["tệp_ban_hanh", "tệp_kèm_theo"])

        doc_status_map: Dict[str, Any] = {}
        if DocumentStatus:
            for status in DocumentStatus.objects.all():
                name = getattr(status, "status_name", None)
                if name:
                    doc_status_map[name.strip().lower()] = status

        case_status_map: Dict[str, Any] = {}
        if CaseStatus:
            for status in CaseStatus.objects.all():
                name = getattr(status, "case_status_name", None)
                if name:
                    case_status_map[name.strip().lower()] = status

        first_field = Field.objects.first() if Field else None
        first_doc_type = DocumentType.objects.first() if DocumentType else None
        first_case_type = CaseType.objects.first() if CaseType else None
        first_case_status = None
        if CaseStatus:
            first_case_status = CaseStatus.objects.first()

        # 3) user pool
        ld_user = find_user(User, ("ld01", "lanhdao", "lanh_đạo"))
        cv_user = find_user(User, ("cv01", "chuyenvien"))
        vt_user = find_user(User, ("vt01", "vt_vanthu"))
        qt_user = find_user(User, ("qt01", "quan_tri"))
        main_user = ld_user or cv_user or vt_user or qt_user or User.objects.filter(is_active=True).first()

        department = Department.objects.first() if Department else None

        docs = list(Document.objects.all().order_by("document_id")[:6])
        inbound_docs = [d for d in docs if getattr(d, "doc_direction", "").lower() == "den"]
        outbound_docs = [d for d in docs if getattr(d, "doc_direction", "").lower() == "di"]

        if not docs:
            self.stdout.write(self.style.WARNING("⚠️ Không có văn bản nào để mở rộng → kết thúc."))
            return

        # 4) Document versions
        if DocumentVersion:
            for doc in docs:
                for version_no in (1, 2):
                    defaults = {
                        "file_name": f"seed_doc_{doc.document_id}_v{version_no}.pdf",
                        "storage_path": f"seed/doc_{doc.document_id}_v{version_no}.pdf",
                        "changed_by": vt_user or main_user,
                        "changed_at": tz_now,
                    }
                    DocumentVersion.objects.get_or_create(document=doc, version_no=version_no, defaults=defaults)

        # 5) Document assignments
        assignment_due = tz_now + timedelta(days=5)
        if DocumentAssignment:
            for doc in docs:
                if vt_user:
                    DocumentAssignment.objects.get_or_create(
                        document=doc,
                        user=vt_user,
                        defaults={
                            "role_on_doc": DocumentAssignment.RoleOnDoc.OWNER,
                            "assigned_by": ld_user or main_user,
                            "assigned_at": tz_now,
                            "due_at": assignment_due,
                            "is_owner": True,
                        },
                    )
                if cv_user:
                    DocumentAssignment.objects.get_or_create(
                        document=doc,
                        user=cv_user,
                        defaults={
                            "role_on_doc": DocumentAssignment.RoleOnDoc.ASSIGNEE,
                            "assigned_by": ld_user or main_user,
                            "assigned_at": tz_now,
                            "due_at": assignment_due,
                            "is_owner": False,
                        },
                    )
                if ld_user:
                    DocumentAssignment.objects.get_or_create(
                        document=doc,
                        user=ld_user,
                        defaults={
                            "role_on_doc": DocumentAssignment.RoleOnDoc.WATCHER,
                            "assigned_by": ld_user,
                            "assigned_at": tz_now,
                            "is_owner": False,
                        },
                    )

        # 6) Document workflow logs
        if DocumentWorkflowLog:
            for doc in docs:
                Received = DocumentWorkflowLog.Action.RECEIVED
                Assigned = DocumentWorkflowLog.Action.ASSIGNED
                DocumentWorkflowLog.objects.get_or_create(
                    document=doc,
                    action=Received,
                    defaults={
                        "acted_by": vt_user or main_user,
                        "acted_at": tz_now,
                        "from_status": doc_status_map.get("nháp"),
                        "to_status": doc_status_map.get("trình duyệt"),
                        "comment": "Seed: document đã được nhận",
                        "meta_json": {"seed": True},
                    },
                )
                DocumentWorkflowLog.objects.get_or_create(
                    document=doc,
                    action=Assigned,
                    defaults={
                        "acted_by": ld_user or main_user,
                        "acted_at": tz_now,
                        "from_status": doc_status_map.get("trình duyệt"),
                        "to_status": doc_status_map.get("đã ký"),
                        "comment": "Seed: phân công chuyên viên",
                        "meta_json": {"seed": True},
                    },
                )

        # 7) Document approvals for outbound
        if DocumentApproval and outbound_docs:
            target = outbound_docs[0]
            DocumentApproval.objects.get_or_create(
                document=target,
                step_no=1,
                defaults={
                    "approver": ld_user or main_user,
                    "decision": DocumentApproval.Decision.APPROVE,
                    "decided_at": tz_now,
                    "sign_hash": uuid.uuid4().hex,
                    "sign_meta": "Seeded first approval step",
                },
            )
            DocumentApproval.objects.get_or_create(
                document=target,
                step_no=2,
                defaults={
                    "approver": qt_user or ld_user or main_user,
                    "decision": DocumentApproval.Decision.PENDING,
                },
            )

        # 8) Outgoing numbering entries
        if OutgoingNumbering and outbound_docs:
            for seq in range(1, 4):
                OutgoingNumbering.objects.get_or_create(
                    year=tz_now.year,
                    seq=seq,
                    defaults={
                        "prefix": "UBND",
                        "postfix": "/VP",
                        "issued_by": vt_user or main_user,
                        "issued_at": tz_now,
                    },
                )

        # 9) Organizations, contacts and dispatch
        org_instance = None
        if Organization:
            org_instance, _ = Organization.objects.get_or_create(
                name="Sở Nội vụ tỉnh",
                defaults={"address": "123 đường Lê Lợi", "email": "vanthu@sonoi.com", "phone": "0241234567", "tax_code": "0101234567"},
            )
        contact = None
        if OrgContact and org_instance:
            contact, _ = OrgContact.objects.get_or_create(
                organization=org_instance,
                full_name="Nguyễn Văn An",
                defaults={"email": "nguyenvanan@sonoi.com", "phone": "0912345678", "position": "Giám đốc"},
            )
        if DispatchOutbox and outbound_docs:
            DispatchOutbox.objects.get_or_create(
                document=outbound_docs[0],
                method=DispatchOutbox.Method.EMAIL,
                defaults={
                    "organization": org_instance,
                    "contact": contact,
                    "status": DispatchOutbox.Status.SENT,
                    "sent_at": tz_now,
                    "tracking_no": "XND-" + str(outbound_docs[0].document_id),
                    "note": "Phát hành đi thử nghiệm",
                },
            )

        # 10) Case + its sub-resources
        case_obj = None
        if Case:
            existing_case = Case.objects.filter(case_code__icontains="seed").first()
            if existing_case:
                case_obj = existing_case
            else:
                case_payload: Dict[str, Any] = {}
                if hasattr(Case, "case_code"):
                    case_payload["case_code"] = f"CASE-SEED-{tz_now:%Y%m%d%H%M%S}"
                if hasattr(Case, "title"):
                    case_payload["title"] = "Hồ sơ seed chi tiết"
                if hasattr(Case, "department") and department:
                    case_payload["department"] = department
                if hasattr(Case, "created_by") and main_user:
                    case_payload["created_by"] = main_user
                if hasattr(Case, "case_type") and first_case_type:
                    case_payload["case_type"] = first_case_type
                if hasattr(Case, "status") and first_case_status:
                    case_payload["status"] = first_case_status
                if hasattr(Case, "leader") and ld_user:
                    case_payload["leader"] = ld_user
                if hasattr(Case, "owner") and cv_user:
                    case_payload["owner"] = cv_user
                case_payload["created_at"] = tz_now
                case_payload["due_date"] = tz_now + timedelta(days=15)
                try:
                    case_obj = Case.objects.create(**case_payload)
                except Exception as exc:
                    self.stdout.write(self.style.WARNING(f"⚠️ Bỏ qua tạo Case mở rộng: {exc}"))

        if case_obj:
            if CaseParticipant:
                participants = [
                    (ld_user or main_user, CaseParticipant.RoleOnCase.OWNER),
                    (cv_user, CaseParticipant.RoleOnCase.COOWNER),
                    (vt_user, CaseParticipant.RoleOnCase.WATCHER),
                ]
                for usr, role in participants:
                    if not usr:
                        continue
                    CaseParticipant.objects.get_or_create(
                        case=case_obj,
                        user=usr,
                        defaults={"role_on_case": role},
                    )
            if CaseTask:
                tasks = []
                if cv_user:
                    tasks.append(cv_user)
                if vt_user:
                    tasks.append(vt_user)
                for idx, assignee in enumerate(tasks, start=1):
                    defaults = {
                        "title": f"Công việc phụ #{idx}",
                        "assignee": assignee,
                        "status": CaseTask.Status.IN_PROGRESS,
                        "due_at": tz_now + timedelta(days=idx * 2),
                        "created_by": ld_user or main_user,
                        "created_at": tz_now,
                        "note": "Seeded SLA task",
                    }
                    if idx == 1:
                        defaults["completed_at"] = tz_now
                    CaseTask.objects.get_or_create(case=case_obj, title=defaults["title"], defaults=defaults)
            if CaseActivityLog:
                CaseActivityLog.objects.get_or_create(
                    case=case_obj,
                    action=CaseActivityLog.Action.CREATE,
                    actor=ld_user or main_user,
                    defaults={"note": "Seeded case creation", "at": tz_now, "meta_json": {"phase": "seed"}},
                )
            if CaseAttachment and vt_user:
                CaseAttachment.objects.get_or_create(
                    case=case_obj,
                    file_name="case_seed_note.pdf",
                    defaults={
                        "attachment_type": "tệp_kèm_theo",
                        "storage_path": "seed/case_seed_note.pdf",
                        "uploaded_by": vt_user,
                        "uploaded_at": tz_now,
                    },
                )
            if CaseDocument and docs:
                for doc in docs[:2]:
                    CaseDocument.objects.get_or_create(case=case_obj, document=doc)

        # 11) Comments referencing doc/case/task
        if Comment:
            sample_doc = docs[0]
            comment_defaults = {
                "entity_type": Comment.Entity.DOCUMENT,
                "entity_id": sample_doc.document_id,
                "user": vt_user or main_user,
                "content": "Bình luận seed cho văn bản",
                "created_at": tz_now,
            }
            Comment.objects.get_or_create(entity_type=comment_defaults["entity_type"], entity_id=comment_defaults["entity_id"], defaults=comment_defaults)
            if case_obj:
                Comment.objects.get_or_create(
                    entity_type=Comment.Entity.CASE,
                    entity_id=case_obj.case_id,
                    defaults={**comment_defaults, "entity_type": Comment.Entity.CASE, "entity_id": case_obj.case_id, "content": "Seed comment cho hồ sơ"},
                )
            if CaseTask:
                task = CaseTask.objects.filter(case=case_obj).first()
                if task:
                    Comment.objects.get_or_create(
                        entity_type=Comment.Entity.TASK,
                        entity_id=task.task_id,
                        defaults={**comment_defaults, "entity_type": Comment.Entity.TASK, "entity_id": task.task_id, "content": "Seed comment cho công việc"},
                    )

        # 12) Notifications, reminders, jobs
        if Notification and ld_user:
            Notification.objects.get_or_create(
                user=ld_user,
                title="Thông báo seed",
                defaults={
                    "body": "Hệ thống seed data đã chạy",
                    "channel": Notification.Channel.APP,
                    "sent_at": tz_now,
                },
            )
        if Reminder and docs:
            Reminder.objects.get_or_create(
                entity_type=Reminder.Entity.DOCUMENT,
                entity_id=docs[0].document_id,
                defaults={
                    "user": cv_user,
                    "due_at": tz_now + timedelta(days=1),
                    "status": Reminder.Status.PENDING,
                },
            )
        if Job:
            Job.objects.get_or_create(
                type=Job.Type.REMINDER,
                payload_json={"entity": "document", "id": docs[0].document_id},
                run_at=tz_now + timedelta(minutes=5),
                defaults={"status": Job.Status.QUEUED, "attempts": 0},
            )

        # 13) Reports
        if ReportDefinition and main_user:
            report, _ = ReportDefinition.objects.get_or_create(
                code="REPORT_SEED_SUMMARY",
                defaults={
                    "name": "Báo cáo seed",
                    "config_json": {"fields": ["title", "status"], "filters": {"status": "Phát hành"}},
                    "created_by": main_user,
                    "created_at": tz_now,
                },
            )
            if ReportExport:
                ReportExport.objects.get_or_create(
                    report=report,
                    format=ReportExport.Format.PDF,
                    defaults={
                        "exported_by": main_user,
                        "exported_at": tz_now,
                        "file_path": "reports/seed_report.pdf",
                    },
                )

        # 14) Audit + system settings
        if AuditLog and docs:
            AuditLog.objects.get_or_create(
                actor=ld_user or main_user,
                action=AuditLog.Action.CREATE,
                entity_type=AuditLog.Entity.DOCUMENT,
                entity_id=str(docs[0].document_id),
                defaults={
                    "at": tz_now,
                    "before_json": {"status": "Nháp"},
                    "after_json": {"status": "Trình duyệt"},
                },
            )
        if SystemSetting:
            SystemSetting.objects.get_or_create(
                setting_key="default_case_status",
                defaults={"setting_value": {"status": "Đang xử lý"}, "updated_at": tz_now},
            )

        # 15) Auth/session/security samples
        if AuthSession and main_user:
            AuthSession.objects.get_or_create(
                user=main_user,
                defaults={
                    "issued_at": tz_now,
                    "expires_at": tz_now + timedelta(hours=3),
                    "ip": "127.0.0.1",
                },
            )
        if PasswordReset and cv_user:
            PasswordReset.objects.get_or_create(
                user=cv_user,
                defaults={
                    "token_hash": uuid.uuid4().hex,
                    "expires_at": tz_now + timedelta(hours=1),
                },
            )
        if SecurityEvent and vt_user:
            SecurityEvent.objects.get_or_create(
                user=vt_user,
                event_type=SecurityEvent.EventType.LOGIN_SUCCESS,
                defaults={"at": tz_now, "ip": "127.0.0.1"},
            )

        self.stdout.write(self.style.SUCCESS("✓ Extended demo data seeded"))
