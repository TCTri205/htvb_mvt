# workflow/services/inbound_service.py
from dataclasses import dataclass
from typing import Any, Iterable, Optional
from django.apps import apps
from django.db import transaction
from django.utils import timezone

from .errors import PermissionDenied, InvalidTransition, ValidationError
from .rbac import can, Act
from .status_resolver import StatusResolver as SR, InboundStatus, canonical_status_key
from .audit import audit_log
from .events import emit

def _doc_models():
    Doc = apps.get_model('documents', 'Document')
    DLog = apps.get_model('documents', 'DocumentWorkflowLog')
    Assign = apps.get_model('documents', 'DocumentAssignment')
    return Doc, DLog, Assign

def _status_id(doc) -> int:
    sid = getattr(doc, "status_id", None)
    if not sid:
        raise ValidationError("Document.status_id trống.")
    return sid

def _resolve_status(status_id):
    if not status_id:
        return None
    Status = apps.get_model("catalog", "DocumentStatus")
    try:
        return Status.objects.get(pk=status_id)
    except Status.DoesNotExist:
        return None

def _status_ids(*names: str) -> set[int]:
    return {SR.doc_status_id(name) for name in names}


def _insert_wf_log(doc, *, action: str, from_status_id: Optional[int], to_status_id: Optional[int], actor, comment=None, meta=None):
    _, DLog, _ = _doc_models()
    DLog.objects.create(
        document_id=doc.document_id,
        action=action,
        from_status=_resolve_status(from_status_id),
        to_status=_resolve_status(to_status_id),
        acted_by=actor,
        acted_at=timezone.now(),
        comment=comment,
        meta_json=meta,
    )

@dataclass
class InboundService:
    actor: Any  # accounts.User

    # ===== Tiếp nhận (đưa về CHỜ PHÂN CÔNG ngay) =====
    def receive_intake(self, doc: Any, note: Optional[str]=None):
        if not can(self.actor, Act.IN_RECEIVE, obj=doc):
            raise PermissionDenied("Không có quyền tiếp nhận/scan/nhập.")
        waiting_status = SR.doc_status_id(InboundStatus.WAITING_ASSIGNMENT.value)
        if getattr(doc, "status_id", None) != waiting_status:
            from_id = getattr(doc, "status_id", None)
            doc.status_id = waiting_status
            doc.save(update_fields=["status_id"])
            _insert_wf_log(doc, action=Act.VT_CREATE_INBOUND.value, from_status_id=from_id, to_status_id=waiting_status, actor=self.actor, comment=note)
            audit_log(actor=self.actor, action="DOC.IN.RECEIVED", entity_type="document", entity_id=doc.document_id, after={"to":InboundStatus.WAITING_ASSIGNMENT.value,"note":note})

    # ===== Đăng ký (TIEP_NHAN -> DANG_KY) =====
    def register(self, doc: Any, *, received_number: int, received_date, sender: str):
        if not can(self.actor, Act.IN_REGISTER, obj=doc):
            raise PermissionDenied("Không có quyền gán số đến/đăng ký.")
        if doc.doc_direction != 'den':
            raise ValidationError("Chỉ văn bản 'den' mới đăng ký số đến.")
        from_id = _status_id(doc)
        waiting_status = SR.doc_status_id(InboundStatus.WAITING_ASSIGNMENT.value)

        with transaction.atomic():
            doc.received_number = received_number
            doc.received_date = received_date
            doc.sender = sender
            doc.status_id = waiting_status
            doc.received_by = self.actor
            doc.save()

            _insert_wf_log(doc, action=Act.VT_UPDATE_METADATA.value, from_status_id=from_id, to_status_id=waiting_status, actor=self.actor)
            audit_log(actor=self.actor, action="DOC.IN.REGISTER", entity_type="document", entity_id=doc.document_id,
                      before={"status_id":from_id}, after={"status_id":waiting_status,"received_number":received_number,"state":InboundStatus.WAITING_ASSIGNMENT.value})

    # ===== Phân công (DANG_KY -> PHAN_CONG) =====
    def assign(self, doc: Any, assignees: Iterable[Any], *, instruction: Optional[str]=None, due_at=None):
        if not can(self.actor, Act.IN_ASSIGN, obj=doc):
            raise PermissionDenied("Không có quyền phân luồng/chuyển xử lý VB đến.")
        from_id = _status_id(doc)
        processing_status = SR.doc_status_id(InboundStatus.PROCESSING.value)

        Doc, _, Assign = _doc_models()
        with transaction.atomic():
            doc = Doc.objects.select_for_update().get(pk=doc.pk)
            # chuyển trạng thái
            doc.status_id = processing_status
            doc.save(update_fields=["status_id"])
            # ghi phân công
            now = timezone.now()
            for u in assignees:
                Assign.objects.update_or_create(
                    document_id=doc.document_id,
                    user_id=u.user_id,
                    defaults={
                        "role_on_doc": "assignee",
                        "assigned_by": self.actor.user_id,
                        "assigned_at": now,
                        "due_at": due_at,
                        "instruction": instruction,
                        "is_owner": False,
                    },
                )

            _insert_wf_log(doc, action=Act.LD_ASSIGN_OFFICER.value, from_status_id=from_id, to_status_id=processing_status,
                           actor=self.actor, comment=instruction, meta={"assignees":[str(u.user_id) for u in assignees], "due_at": str(due_at) if due_at else None})
            audit_log(actor=self.actor, action="DOC.IN.ASSIGN", entity_type="document", entity_id=doc.document_id,
                      after={"to":InboundStatus.PROCESSING.value,"assignees":[str(u.user_id) for u in assignees],"due_at": str(due_at) if due_at else None})

        doc.refresh_from_db()
        emit("doc_in.assigned", {"document_id": doc.document_id, "assignees":[str(u.user_id) for u in assignees]})

    # ===== Bắt đầu xử lý (PHAN_CONG -> DANG_XU_LY) =====
    def start_processing(self, doc: Any):
        if not can(self.actor, Act.IN_START, obj=doc):
            raise PermissionDenied("Chỉ người được giao mới được bắt đầu xử lý.")
        from_id = _status_id(doc)
        processing_status = SR.doc_status_id(InboundStatus.PROCESSING.value)
        Doc, _, _ = _doc_models()

        with transaction.atomic():
            Doc.objects.filter(pk=doc.pk).update(status_id=processing_status)
            _insert_wf_log(doc, action=Act.CV_START_PROCESSING.value, from_status_id=from_id, to_status_id=processing_status, actor=self.actor)
            audit_log(actor=self.actor, action="DOC.IN.START", entity_type="document", entity_id=doc.document_id,
                      before={"status_id":from_id}, after={"status_id":processing_status})
            doc.status_id = processing_status

    def request_reassign(self, doc: Any, *, note: Optional[str]=None):
        if not can(self.actor, Act.CV_REQUEST_REASSIGN, obj=doc):
            raise PermissionDenied("Không có quyền đề xuất phân công lại.")
        from_id = _status_id(doc)
        Doc, _, _ = _doc_models()
        with transaction.atomic():
            _insert_wf_log(
                doc,
                action=Act.CV_REQUEST_REASSIGN.value,
                from_status_id=from_id,
                to_status_id=from_id,
                actor=self.actor,
                comment=note,
            )
            audit_log(
                actor=self.actor,
                action="DOC.IN.REQUEST_REASSIGN",
                entity_type="document",
                entity_id=doc.document_id,
                before={"status_id": from_id},
                after={"status_id": from_id, "state": doc.status, "note": note},
            )
        emit("doc_in.start", {"document_id": doc.document_id, "by": str(self.actor.user_id)})

    # ===== Hoàn tất (DANG_XU_LY -> HOAN_TAT) =====
    def complete(self, doc: Any, result_note: Optional[str]=None):
        if not can(self.actor, Act.IN_COMPLETE, obj=doc):
            raise PermissionDenied("Không có quyền hoàn tất.")
        from_id = _status_id(doc)
        pending_leader = SR.doc_status_id(InboundStatus.PENDING_LEADER_APPROVAL.value)
        Doc, _, _ = _doc_models()

        with transaction.atomic():
            Doc.objects.filter(pk=doc.pk).update(status_id=pending_leader)
            _insert_wf_log(doc, action=Act.CV_SUBMIT_FOR_APPROVAL.value, from_status_id=from_id, to_status_id=pending_leader, actor=self.actor, comment=result_note)
            audit_log(actor=self.actor, action="DOC.IN.COMPLETE", entity_type="document", entity_id=doc.document_id,
                      before={"status_id":from_id}, after={"status_id":pending_leader,"note":result_note,"state":InboundStatus.PENDING_LEADER_APPROVAL.value})
            doc.status_id = pending_leader
        emit("doc_in.completed", {"document_id": doc.document_id})

    def leader_approve(self, doc: Any, *, note: Optional[str]=None):
        if not can(self.actor, Act.LD_APPROVE_INBOUND, obj=doc):
            raise PermissionDenied("Không có quyền phê duyệt.")
        from_id = _status_id(doc)
        valid_from = _status_ids(
            InboundStatus.PENDING_LEADER_APPROVAL.value,
            InboundStatus.LEGACY_HOAN_TAT.value,
        )
        if from_id not in valid_from:
            raise InvalidTransition("Chỉ được phê duyệt khi đang chờ lãnh đạo.")
        pending_clerk = SR.doc_status_id(InboundStatus.PENDING_CLERK_CHECK.value)
        Doc, _, _ = _doc_models()
        with transaction.atomic():
            Doc.objects.filter(pk=doc.pk).update(status_id=pending_clerk)
            _insert_wf_log(
                doc,
                action=Act.LD_APPROVE_INBOUND.value,
                from_status_id=from_id,
                to_status_id=pending_clerk,
                actor=self.actor,
                comment=note,
            )
            audit_log(
                actor=self.actor,
                action="DOC.IN.LEADER_APPROVE",
                entity_type="document",
                entity_id=doc.document_id,
                before={"status_id": from_id},
                after={"status_id": pending_clerk, "state": InboundStatus.PENDING_CLERK_CHECK.value, "note": note},
            )
            doc.status_id = pending_clerk
        emit("doc_in.leader_approved", {"document_id": doc.document_id})

    def leader_request_changes(self, doc: Any, *, note: Optional[str]=None):
        if not can(self.actor, Act.LD_REQUEST_CHANGES_INBOUND, obj=doc):
            raise PermissionDenied("Không có quyền trả lại.")
        from_id = _status_id(doc)
        valid_from = _status_ids(
            InboundStatus.PENDING_LEADER_APPROVAL.value,
        )
        if from_id not in valid_from:
            raise InvalidTransition("Chỉ được trả lại khi đang chờ lãnh đạo.")
        processing_status = SR.doc_status_id(InboundStatus.PROCESSING.value)
        Doc, _, _ = _doc_models()
        with transaction.atomic():
            Doc.objects.filter(pk=doc.pk).update(status_id=processing_status)
            _insert_wf_log(
                doc,
                action=Act.LD_REQUEST_CHANGES_INBOUND.value,
                from_status_id=from_id,
                to_status_id=processing_status,
                actor=self.actor,
                comment=note,
            )
            audit_log(
                actor=self.actor,
                action="DOC.IN.LEADER_REQUEST_CHANGES",
                entity_type="document",
                entity_id=doc.document_id,
                before={"status_id": from_id},
                after={"status_id": processing_status, "state": InboundStatus.PROCESSING.value, "note": note},
            )
            doc.status_id = processing_status
        emit("doc_in.leader_requested_changes", {"document_id": doc.document_id})

    def handle_clerk_rejection(self, doc: Any, *, note: Optional[str]=None):
        if not can(self.actor, Act.LD_HANDLE_CLERK_REJECTION, obj=doc):
            raise PermissionDenied("Không có quyền xử lý phản hồi VT.")
        from_id = _status_id(doc)
        pending_clerk = SR.doc_status_id(InboundStatus.PENDING_CLERK_CHECK.value)
        if from_id != pending_clerk:
            raise InvalidTransition("Chỉ xử lý phản hồi khi đang chờ VT kiểm tra.")
        processing_status = SR.doc_status_id(InboundStatus.PROCESSING.value)
        Doc, _, _ = _doc_models()
        with transaction.atomic():
            Doc.objects.filter(pk=doc.pk).update(status_id=processing_status)
            _insert_wf_log(
                doc,
                action=Act.LD_HANDLE_CLERK_REJECTION.value,
                from_status_id=from_id,
                to_status_id=processing_status,
                actor=self.actor,
                comment=note,
            )
            audit_log(
                actor=self.actor,
                action="DOC.IN.HANDLE_CLERK_REJECTION",
                entity_type="document",
                entity_id=doc.document_id,
                before={"status_id": from_id},
                after={"status_id": processing_status, "state": InboundStatus.PROCESSING.value, "note": note},
            )
            doc.status_id = processing_status
        emit("doc_in.clerk_rejection_handled", {"document_id": doc.document_id})

    def final_check_reject(self, doc: Any, *, reason: Optional[str]=None):
        if not can(self.actor, Act.VT_FINAL_CHECK_REJECT_INBOUND, obj=doc):
            raise PermissionDenied("Không có quyền từ chối kiểm tra cuối.")
        from_id = _status_id(doc)
        pending_clerk = SR.doc_status_id(InboundStatus.PENDING_CLERK_CHECK.value)
        if from_id != pending_clerk:
            raise InvalidTransition("Chỉ được từ chối khi đang chờ VT kiểm tra.")
        _insert_wf_log(
            doc,
            action=Act.VT_FINAL_CHECK_REJECT_INBOUND.value,
            from_status_id=from_id,
            to_status_id=from_id,
            actor=self.actor,
            comment=reason,
        )
        audit_log(
            actor=self.actor,
            action="DOC.IN.CLERK_CHECK_REJECT",
            entity_type="document",
            entity_id=doc.document_id,
            before={"status_id": from_id},
            after={"status_id": from_id, "reason": reason},
        )
        emit("doc_in.final_check_rejected", {"document_id": doc.document_id})

    def finalize_registration(self, doc: Any, *, note: Optional[str]=None, register_book_id: Optional[int]=None):
        if not can(self.actor, Act.VT_REGISTER_INBOUND, obj=doc):
            raise PermissionDenied("Không có quyền đăng ký vào sổ cuối.")
        from_id = _status_id(doc)
        pending_clerk = SR.doc_status_id(InboundStatus.PENDING_CLERK_CHECK.value)
        if from_id != pending_clerk:
            raise InvalidTransition("Chỉ đăng ký khi VT đang kiểm tra cuối.")
        registered_status = SR.doc_status_id(InboundStatus.REGISTERED.value)
        Doc, _, _ = _doc_models()
        meta = {"register_book_id": register_book_id} if register_book_id else None
        with transaction.atomic():
            Doc.objects.filter(pk=doc.pk).update(status_id=registered_status)
            _insert_wf_log(
                doc,
                action=Act.VT_FINAL_CHECK_OK_INBOUND.value,
                from_status_id=from_id,
                to_status_id=from_id,
                actor=self.actor,
                comment=note,
                meta=meta,
            )
            _insert_wf_log(
                doc,
                action=Act.VT_REGISTER_INBOUND.value,
                from_status_id=from_id,
                to_status_id=registered_status,
                actor=self.actor,
                comment=note,
                meta=meta,
            )
            audit_log(
                actor=self.actor,
                action="DOC.IN.REGISTER",
                entity_type="document",
                entity_id=doc.document_id,
                before={"status_id": from_id},
                after={
                    "status_id": registered_status,
                    "state": InboundStatus.REGISTERED.value,
                    "note": note,
                    **({"register_book_id": register_book_id} if register_book_id else {}),
                },
            )
            doc.status_id = registered_status
        emit("doc_in.registered", {"document_id": doc.document_id})

    def dispatch_result(self, doc: Any, *, note: Optional[str]=None):
        if not can(self.actor, Act.VT_DISPATCH_RESULT, obj=doc):
            raise PermissionDenied("Không có quyền phát hành kết quả xử lý.")
        from_id = _status_id(doc)
        current_status = _resolve_status(from_id)
        current_key = canonical_status_key(getattr(current_status, "status_name", None), direction="INBOUND")
        if current_key != InboundStatus.REGISTERED.value:
            raise InvalidTransition("Chỉ phát hành sau khi đã vào sổ.")
        dispatched = SR.doc_status_id(InboundStatus.DISPATCHED.value)
        Doc, _, _ = _doc_models()
        with transaction.atomic():
            Doc.objects.filter(pk=doc.pk).update(status_id=dispatched)
            _insert_wf_log(
                doc,
                action=Act.VT_DISPATCH_RESULT.value,
                from_status_id=from_id,
                to_status_id=dispatched,
                actor=self.actor,
                comment=note,
            )
            audit_log(
                actor=self.actor,
                action="DOC.IN.DISPATCH",
                entity_type="document",
                entity_id=doc.document_id,
                before={"status_id": from_id},
                after={"status_id": dispatched, "state": InboundStatus.DISPATCHED.value, "note": note},
            )
            doc.status_id = dispatched
        emit("doc_in.dispatched", {"document_id": doc.document_id})

    # ===== Lưu trữ (HOAN_TAT -> LUU_TRU) =====
    def archive(self, doc: Any, reason: Optional[str]=None):
        if not can(self.actor, Act.IN_ARCHIVE, obj=doc):
            raise PermissionDenied("Không có quyền lưu trữ.")
        from_id = _status_id(doc)
        archived_status = SR.doc_status_id(InboundStatus.ARCHIVED.value)
        Doc, _, _ = _doc_models()
        with transaction.atomic():
            Doc.objects.filter(pk=doc.pk).update(status_id=archived_status)
            _insert_wf_log(doc, action=Act.VT_ARCHIVE_INBOUND.value, from_status_id=from_id, to_status_id=archived_status, actor=self.actor, comment=reason)
            audit_log(actor=self.actor, action="DOC.IN.ARCHIVE", entity_type="document", entity_id=doc.document_id,
                      before={"status_id":from_id}, after={"status_id":archived_status,"reason":reason,"state":InboundStatus.ARCHIVED.value})
            doc.status_id = archived_status

    # ===== Thu hồi (DANG_KY|PHAN_CONG|DANG_XU_LY -> THU_HOI) =====
    def withdraw(self, doc: Any, reason: str):
        if not can(self.actor, Act.QT_RECALL_INBOUND, obj=doc):
            raise PermissionDenied("Không có quyền thu hồi.")
        from_id = _status_id(doc)
        thu_hoi = SR.doc_status_id("THU_HOI")
        valid_from = _status_ids(
            InboundStatus.LEGACY_TIEP_NHAN.value, InboundStatus.LEGACY_DANG_KY.value, InboundStatus.LEGACY_PHAN_CONG.value,
            InboundStatus.LEGACY_DANG_XU_LY.value, InboundStatus.LEGACY_HOAN_TAT.value,
            InboundStatus.RECEIVED.value, InboundStatus.WAITING_ASSIGNMENT.value, InboundStatus.PROCESSING.value,
            InboundStatus.PENDING_LEADER_APPROVAL.value, InboundStatus.PENDING_CLERK_CHECK.value,
            InboundStatus.REGISTERED.value, InboundStatus.DISPATCHED.value,
        )
        if from_id not in valid_from:
            raise InvalidTransition("Chỉ thu hồi khi đang ở DANG_KY/PHAN_CONG/DANG_XU_LY.")
        Doc, _, _ = _doc_models()
        with transaction.atomic():
            Doc.objects.filter(pk=doc.pk).update(status_id=thu_hoi)
            _insert_wf_log(
                doc,
                action=Act.QT_RECALL_INBOUND.value,
                from_status_id=from_id,
                to_status_id=thu_hoi,
                actor=self.actor,
                comment=reason,
            )
            audit_log(actor=self.actor, action="DOC.IN.WITHDRAW", entity_type="document", entity_id=doc.document_id,
                      before={"status_id":from_id}, after={"status_id":thu_hoi,"reason":reason,"state":InboundStatus.THU_HOI.value})
            doc.status_id = thu_hoi
