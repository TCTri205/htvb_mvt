# workflow/services/outbound_service.py
from dataclasses import dataclass
from typing import Any, Optional, List
from django.apps import apps
from django.db import transaction, IntegrityError
from django.db.models import Max
from django.utils import timezone
from .errors import PermissionDenied, InvalidTransition, ValidationError
from .rbac import can, Act
from .status_resolver import StatusResolver as SR, OutboundStatus
from .audit import audit_log
from .events import emit

def _doc_models():
    Doc = apps.get_model('documents', 'Document')
    DLog = apps.get_model('documents', 'DocumentWorkflowLog')
    Appro = apps.get_model('documents', 'DocumentApproval')
    Numbering = apps.get_model('documents', 'OutgoingNumbering')
    return Doc, DLog, Appro, Numbering

def _status_id(doc) -> int:
    sid = getattr(doc, "status_id", None)
    if not sid:
        raise ValidationError("Document.status_id trống.")
    return sid

def _fetch_status(status_id: Optional[int]):
    if not status_id:
        return None
    Status = apps.get_model("catalog", "DocumentStatus")
    if Status is None:
        return None
    return Status.objects.filter(pk=status_id).first()


def _insert_wf_log(doc, *, action: str, from_status_id: Optional[int], to_status_id: Optional[int], actor, comment=None, meta=None):
    _, DLog, _, _ = _doc_models()
    DLog.objects.create(
        document_id=doc.document_id,
        action=action,
        from_status=_fetch_status(from_status_id),
        to_status=_fetch_status(to_status_id),
        acted_by=actor,
        acted_at=timezone.now(),
        comment=comment,
        meta_json=meta,
    )

@dataclass
class OutboundService:
    actor: Any

    # ===== Khởi tạo dự thảo (đặt status DU_THAO) =====
    def touch_draft(self, doc: Any):
        if not can(self.actor, Act.OUT_DRAFT_CREATE, obj=doc):
            raise PermissionDenied("Không có quyền tạo/sửa dự thảo.")
        draft_status = SR.doc_status_id(OutboundStatus.DRAFT.value)
        if getattr(doc, "status_id", None) != draft_status:
            from_id = getattr(doc, "status_id", None)
            doc.status_id = draft_status
            doc.doc_direction = 'du_thao'
            doc.save(update_fields=["status_id", "doc_direction"])
            _insert_wf_log(doc, action=Act.CV_CREATE_DRAFT.value, from_status_id=from_id, to_status_id=draft_status, actor=self.actor)
            audit_log(actor=self.actor, action="DOC.OUT.DRAFT_CREATE", entity_type="document", entity_id=doc.document_id,
                      before={"status_id": from_id}, after={"status_id": draft_status, "state": OutboundStatus.DRAFT.value})

    # ===== Trình duyệt (DU_THAO -> TRINH_DUYET) =====
    def submit(self, doc: Any, note: Optional[str]=None):
        if not can(self.actor, Act.OUT_SUBMIT, obj=doc):
            raise PermissionDenied("Không có quyền trình duyệt.")
        
        # Validate current status is DRAFT
        from_id = _status_id(doc)
        draft_status = SR.doc_status_id(OutboundStatus.DRAFT.value)
        
        if from_id != draft_status:
            from_status = _fetch_status(from_id)
            from_status_name = getattr(from_status, 'status_name', None) or getattr(from_status, 'name', 'Unknown')
            raise InvalidTransition(
                f"Chỉ có thể trình duyệt văn bản ở trạng thái Dự thảo. "
                f"Trạng thái hiện tại: {from_status_name}"
            )
        
        submitted_status = SR.doc_status_id(OutboundStatus.SUBMITTED.value)
        with transaction.atomic():
            doc.status_id = submitted_status
            doc.save(update_fields=["status_id"])
            _insert_wf_log(doc, action=Act.CV_SUBMIT_DRAFT.value, from_status_id=from_id, to_status_id=submitted_status, actor=self.actor, comment=note)
            audit_log(actor=self.actor, action="DOC.OUT.SUBMIT", entity_type="document", entity_id=doc.document_id,
                      before={"status_id":from_id}, after={"status_id":submitted_status,"note":note,"state":OutboundStatus.SUBMITTED.value})
        emit("doc_out.submitted", {"document_id": doc.document_id})

    # ===== Trả lại (TRINH_DUYET -> DRAFT) =====
    def return_for_fix(self, doc: Any, reason: str):
        if not can(self.actor, Act.OUT_RETURN, obj=doc):
            raise PermissionDenied("Không có quyền trả lại.")
        from_id = _status_id(doc)
        draft_status = SR.doc_status_id(OutboundStatus.DRAFT.value)
        with transaction.atomic():
            doc.status_id = draft_status
            doc.doc_direction = 'du_thao'
            doc.save(update_fields=["status_id", "doc_direction"])
            _insert_wf_log(doc, action=Act.LD_REQUEST_CHANGES_OUTBOUND.value, from_status_id=from_id, to_status_id=draft_status, actor=self.actor, comment=reason)
            audit_log(actor=self.actor, action="DOC.OUT.RETURN", entity_type="document", entity_id=doc.document_id,
                      before={"status_id":from_id}, after={"status_id":draft_status,"reason":reason,"state":OutboundStatus.DRAFT.value})

    # ===== Phê duyệt (TRINH_DUYET -> PENDING_CLERK_CHECK) =====
    def approve(self, doc: Any, note: Optional[str]=None):
        if not can(self.actor, Act.OUT_APPROVE, obj=doc):
            raise PermissionDenied("Không có quyền phê duyệt.")
        from_id = _status_id(doc)
        pending_clerk = SR.doc_status_id(OutboundStatus.PENDING_CLERK_CHECK.value)
        with transaction.atomic():
            doc.status_id = pending_clerk
            doc.save(update_fields=["status_id"])
            _insert_wf_log(doc, action=Act.LD_APPROVE_OUTBOUND.value, from_status_id=from_id, to_status_id=pending_clerk, actor=self.actor, comment=note)
            audit_log(actor=self.actor, action="DOC.OUT.APPROVE", entity_type="document", entity_id=doc.document_id,
                      before={"status_id":from_id}, after={"status_id":pending_clerk,"state":OutboundStatus.PENDING_CLERK_CHECK.value})
        emit("doc_out.approved", {"document_id": doc.document_id})

    # ===== Ký số (PENDING_CLERK_CHECK -> PENDING_CLERK_CHECK) =====
    def sign(self, doc: Any, signature_hash: Optional[str]=None, signer_position: Optional[str]=None):
        if not can(self.actor, Act.OUT_SIGN, obj=doc):
            raise PermissionDenied("Không có quyền ký.")
        from_id = _status_id(doc)
        pending_clerk = SR.doc_status_id(OutboundStatus.PENDING_CLERK_CHECK.value)
        if from_id != pending_clerk:
            raise InvalidTransition("Chỉ ký khi đang chờ văn thư kiểm tra.")
        with transaction.atomic():
            doc.status_id = pending_clerk
            doc.signed_by = self.actor
            if signer_position:
                doc.signer_position = signer_position
            doc.signing_method = "ky_so"  # tuỳ cấu hình
            doc.save(update_fields=["status_id","signed_by","signer_position","signing_method"])

            _insert_wf_log(
                doc,
                action="SIGNED",
                from_status_id=from_id,
                to_status_id=pending_clerk,
                actor=self.actor,
                comment=None,
                meta={"sign_hash": signature_hash},
            )
            audit_log(actor=self.actor, action="DOC.OUT.SIGN", entity_type="document", entity_id=doc.document_id,
                      before={"status_id":from_id}, after={"status_id":pending_clerk,"signature_hash":signature_hash})

    def receive_for_final_check(self, doc: Any, *, note: Optional[str]=None):
        """
        DEPRECATED: Phương thức này không còn cần thiết vì approve() giờ chuyển thẳng sang PENDING_CLERK_CHECK.
        Giữ lại để tương thích ngược với code cũ, nhưng chỉ log lại và không thay đổi status.
        """
        if not can(self.actor, Act.VT_RECEIVE_FOR_FINAL_CHECK, obj=doc):
            raise PermissionDenied("Không có quyền nhận hồ sơ để kiểm tra thể thức.")
        from_id = _status_id(doc)
        pending_clerk = SR.doc_status_id(OutboundStatus.PENDING_CLERK_CHECK.value)
        # Nếu đã ở PENDING_CLERK_CHECK rồi, chỉ log lại
        if from_id == pending_clerk:
            _insert_wf_log(
                doc,
                action=Act.VT_RECEIVE_FOR_FINAL_CHECK.value,
                from_status_id=from_id,
                to_status_id=pending_clerk,
                actor=self.actor,
                comment=note,
            )
            return
        # Nếu không, raise error
        raise InvalidTransition("Văn bản đã tự động chuyển sang PENDING_CLERK_CHECK khi lãnh đạo phê duyệt.")

    def final_check_reject(self, doc: Any, *, reason: Optional[str]=None):
        if not can(self.actor, Act.VT_FINAL_CHECK_REJECT_OUTBOUND, obj=doc):
            raise PermissionDenied("Không có quyền từ chối kiểm tra cuối.")
        from_id = _status_id(doc)
        pending_clerk = SR.doc_status_id(OutboundStatus.PENDING_CLERK_CHECK.value)
        if from_id != pending_clerk:
            raise InvalidTransition("Chỉ từ chối khi đang chờ kiểm tra.")
        _insert_wf_log(
            doc,
            action=Act.VT_FINAL_CHECK_REJECT_OUTBOUND.value,
            from_status_id=from_id,
            to_status_id=from_id,
            actor=self.actor,
            comment=reason,
        )
        audit_log(
            actor=self.actor,
            action="DOC.OUT.CLERK_CHECK_REJECT",
            entity_type="document",
            entity_id=doc.document_id,
            before={"status_id": from_id},
            after={"status_id": from_id, "reason": reason},
        )
        emit("doc_out.final_check_rejected", {"document_id": doc.document_id})

    def leader_request_changes_from_clerk(self, doc: Any, *, note: Optional[str]=None):
        """LD xử lý phản hồi từ VT (VT báo lỗi) -> chuyển về DRAFT"""
        if not can(self.actor, Act.LD_REQUEST_CHANGES_FROM_CLERK, obj=doc):
            raise PermissionDenied("Không có quyền xử lý phản hồi từ văn thư.")
        from_id = _status_id(doc)
        pending_clerk = SR.doc_status_id(OutboundStatus.PENDING_CLERK_CHECK.value)
        if from_id != pending_clerk:
            raise InvalidTransition("Chỉ xử lý phản hồi khi đang chờ văn thư kiểm tra.")
        draft_status = SR.doc_status_id(OutboundStatus.DRAFT.value)
        with transaction.atomic():
            doc.status_id = draft_status
            doc.doc_direction = 'du_thao'
            doc.save(update_fields=["status_id", "doc_direction"])
            _insert_wf_log(
                doc,
                action=Act.LD_REQUEST_CHANGES_FROM_CLERK.value,
                from_status_id=from_id,
                to_status_id=draft_status,
                actor=self.actor,
                comment=note,
            )
            audit_log(
                actor=self.actor,
                action="DOC.OUT.LD_HANDLE_CLERK_REJECT",
                entity_type="document",
                entity_id=doc.document_id,
                before={"status_id": from_id},
                after={"status_id": draft_status, "note": note, "state": OutboundStatus.DRAFT.value},
            )
        emit("doc_out.returned_from_clerk", {"document_id": doc.document_id})

    def finalize_registration(self, doc: Any, *, note: Optional[str]=None, register_book_id: Optional[int]=None):
        if not can(self.actor, Act.VT_REGISTER_OUTBOUND, obj=doc):
            raise PermissionDenied("Không có quyền vào sổ văn bản đi sau kiểm tra.")
        if not register_book_id:
            raise ValidationError("Phải chọn sổ đăng ký để vào sổ văn bản đi.")
        
        from_id = _status_id(doc)
        pending_clerk = SR.doc_status_id(OutboundStatus.PENDING_CLERK_CHECK.value)
        if from_id != pending_clerk:
            raise InvalidTransition("Chỉ vào sổ khi đang chờ kiểm tra cuối.")
        registered_status = SR.doc_status_id(OutboundStatus.REGISTERED.value)
        Doc, _, _, _ = _doc_models()
        RegisterBook = apps.get_model('documents', 'RegisterBook')
        
        with transaction.atomic():
            # Get and lock register book
            try:
                book = RegisterBook.objects.select_for_update().get(
                    pk=register_book_id, 
                    direction='di', 
                    is_active=True
                )
            except RegisterBook.DoesNotExist:
                raise ValidationError("Sổ đăng ký không tồn tại hoặc không hoạt động.")
            
            # Generate issue number: Prefix + PaddedNum + Suffix
            num_str = str(book.next_sequence).zfill(book.padding)
            issue_number = f"{book.prefix or ''}{num_str}{book.suffix or ''}"
            
            #  CRITICAL: Update fields in correct order to avoid constraint violations
            # Step 1: Set issue_number and issue_year first
            doc.issue_number = issue_number
            doc.issue_year = book.year
            doc.issued_date = timezone.now().date()
            
            # Step 2: Then change doc_direction to 'di' (now constraints will be satisfied)
            doc.doc_direction = 'di'
            
            # Step 3: Update status
            doc.status_id = registered_status
            
            # Step 4: Save with all updated fields
            # Don't use update_fields to allow model.save() to handle all logic
            doc.save()
            
            # Update book sequence
            book.next_sequence += 1
            book.save()
            
            # Prepare metadata
            meta = {
                "register_book_id": register_book_id,
                "issue_number": issue_number,
                "issue_year": book.year,
            }

            _insert_wf_log(
                doc,
                action=Act.VT_FINAL_CHECK_OK_OUTBOUND.value,
                from_status_id=from_id,
                to_status_id=from_id,
                actor=self.actor,
                comment=note,
                meta=meta,
            )
            _insert_wf_log(
                doc,
                action=Act.VT_REGISTER_OUTBOUND.value,
                from_status_id=from_id,
                to_status_id=registered_status,
                actor=self.actor,
                comment=note,
                meta=meta,
            )
            audit_log(
                actor=self.actor,
                action="DOC.OUT.REGISTER",
                entity_type="document",
                entity_id=doc.document_id,
                before={"status_id": from_id},
                after={
                    "status_id": registered_status,
                    "state": OutboundStatus.REGISTERED.value,
                    "note": note,
                    **meta,
                },
            )
        emit("doc_out.registered", {"document_id": doc.document_id})
    # ===== Phát hành + CẤP SỐ ĐI (issue_number + issued_date) =====
    # def publish(self, doc: Any, *, issue_number: Optional[str]=None, issued_date=None, channels: Optional[List[str]]=None):
    #     if not can(self.actor, Act.OUT_PUBLISH, obj=doc):
    #         raise PermissionDenied("Không có quyền phát hành.")
    #     if doc.doc_direction not in ('di','du_thao'):
    #         raise ValidationError("Chỉ văn bản đi/dự thảo đã duyệt mới phát hành.")
    #     from_id = _status_id(doc)
    #     to_id = SR.doc_status_id("PHAT_HANH")

    #     # Sau publish, văn bản phải thoả ràng buộc 'di' ⇒ luôn đảm bảo có số/ngày
    #     if not issue_number:
    #         issue_number = self._allocate_issue_number()
    #     if not issued_date:
    #         issued_date = timezone.now().date()

    #     with transaction.atomic():
    #         doc.status_id = to_id
    #         doc.issue_number = issue_number
    #         doc.issued_date = issued_date
    #         if doc.doc_direction == 'du_thao':
    #             doc.doc_direction = 'di'
    #         doc.save(update_fields=["status_id","issue_number","issued_date","doc_direction"])

    #         _insert_wf_log(
    #             doc,
    #             action="PUBLISHED",
    #             from_status_id=from_id,
    #             to_status_id=to_id,
    #             actor=self.actor,
    #             meta={"channels": channels or [], "issue_number": issue_number}
    #         )
    #         audit_log(
    #             actor=self.actor,
    #             action="DOC.OUT.PUBLISH",
    #             entity_type="document",
    #             entity_id=doc.document_id,
    #             before={"status_id":from_id},
    #             after={"status_id":to_id,"issue_number":issue_number}
    #         )

    #     emit("doc_out.published", {"document_id": doc.document_id, "channels": channels or []})

# ... đầu file đã có: from django.db import transaction, IntegrityError
    def publish(
        self,
        doc: Any,
        *,
        issue_number: Optional[str] = None,
        issued_date=None,
        channels: Optional[List[str]] = None,
        prefix: Optional[str] = None,
        postfix: Optional[str] = None,
        year: Optional[int] = None,
    ):
        if not can(self.actor, Act.OUT_PUBLISH, obj=doc):
            raise PermissionDenied("Không có quyền phát hành.")
        if doc.doc_direction not in ('di','du_thao'):
            raise ValidationError("Chỉ văn bản đi/dự thảo đã duyệt mới phát hành.", code="WRONG_DIRECTION")

        from_id = _status_id(doc)
        registered_status = SR.doc_status_id(OutboundStatus.REGISTERED.value)
        if from_id != registered_status:
            raise InvalidTransition("Chỉ phát hành khi đã vào sổ văn bản đi.")
        issued_status = SR.doc_status_id(OutboundStatus.ISSUED.value)

        if not issued_date:
            issued_date = timezone.now().date()
        issue_year = year or getattr(issued_date, "year", None) or timezone.now().year
        numbering_entry = None
        if not issue_number:
            issue_number, numbering_entry = self._allocate_issue_number(
                year=issue_year,
                prefix=prefix,
                postfix=postfix,
            )

        try:
            with transaction.atomic():
                doc.status_id = issued_status
                doc.issue_number = issue_number
                doc.issue_year = issue_year
                doc.issued_date = issued_date
                if doc.doc_direction == 'du_thao':
                    doc.doc_direction = 'di'
                doc.save(update_fields=["status_id","issue_number","issue_year","issued_date","doc_direction"])

                _insert_wf_log(
                    doc,
                    action=Act.VT_ISSUE_OUTBOUND.value,
                    from_status_id=from_id,
                    to_status_id=issued_status,
                    actor=self.actor,
                    meta={"channels": channels or [], "issue_number": issue_number}
                )
                audit_log(
                    actor=self.actor,
                    action="DOC.OUT.PUBLISH",
                    entity_type="document",
                    entity_id=doc.document_id,
                    before={"status_id":from_id},
                    after={"status_id":issued_status,"issue_number":issue_number,"state":OutboundStatus.ISSUED.value}
                )
        except IntegrityError as e:
            # Vi phạm unique filtered issue_number khi doc_direction='di'
            raise ValidationError("Số văn bản đi đã tồn tại.", code="DUPLICATE_ISSUE_NUMBER") from e

        emit("doc_out.published", {"document_id": doc.document_id, "channels": channels or []})
        return doc, numbering_entry

    def _allocate_issue_number(self, *, year: Optional[int] = None, prefix: Optional[str] = None, postfix: Optional[str] = None):
        """
        Cấp số đi theo bảng outgoing_numbering (UNIQUE(year, seq)).
        Dùng aggregate để tránh cảnh báo Pylance và retry nếu đụng race-condition.
        """
        _, _, _, Numbering = _doc_models()
        now = timezone.now()
        target_year = year or now.year

        # Vòng lặp nhỏ để an toàn khi nhiều request phát hành song song
        while True:
            max_seq = Numbering.objects.filter(year=target_year).aggregate(m=Max("seq"))["m"] or 0
            next_seq = int(max_seq) + 1
            try:
                entry = Numbering.objects.create(
                    year=target_year,
                    seq=next_seq,
                    prefix=prefix,
                    postfix=postfix,
                    issued_by=self.actor,   # FK User (GUID)
                    issued_at=now,
                )
                issue_number = str(next_seq)
                if prefix:
                    issue_number = f"{issue_number}/{prefix}"
                if postfix:
                    issue_number = f"{issue_number}{postfix}"
                return issue_number, entry
            except IntegrityError:
                # Một tiến trình khác vừa chiếm seq này, thử lại
                continue

    # ===== Lưu trữ (ISSUED -> ARCHIVED) =====
    def archive(self, doc: Any):
        if not can(self.actor, Act.OUT_ARCHIVE, obj=doc):
            raise PermissionDenied("Không có quyền lưu trữ.")
        from_id = _status_id(doc)
        issued_status = SR.doc_status_id(OutboundStatus.ISSUED.value)
        if from_id != issued_status:
            raise InvalidTransition("Chỉ lưu trữ khi văn bản đã phát hành.")
        archived_status = SR.doc_status_id(OutboundStatus.ARCHIVED.value)
        with transaction.atomic():
            doc.status_id = archived_status
            doc.save(update_fields=["status_id"])
            _insert_wf_log(doc, action=Act.VT_ARCHIVE_OUTBOUND.value, from_status_id=from_id, to_status_id=archived_status, actor=self.actor)
            audit_log(actor=self.actor, action="DOC.OUT.ARCHIVE", entity_type="document", entity_id=doc.document_id,
                      before={"status_id":from_id}, after={"status_id":archived_status,"state":OutboundStatus.ARCHIVED.value})

    # ===== Huỷ phát hành (ISSUED -> HUY_PHAT_HANH) =====
    def withdraw_publish(self, doc: Any, reason: str):
        if not can(self.actor, Act.OUT_WITHDRAW, obj=doc):
            raise PermissionDenied("Không có quyền huỷ phát hành.")
        if not reason or not str(reason).strip():
            raise ValidationError("Phải cung cấp lý do thu hồi văn bản.")
        from_id = _status_id(doc)
        issued_status = SR.doc_status_id(OutboundStatus.ISSUED.value)
        archived_status = SR.doc_status_id(OutboundStatus.ARCHIVED.value)
        
        if from_id not in (issued_status, archived_status):
            raise InvalidTransition("Chỉ huỷ khi văn bản đã phát hành hoặc lưu trữ.")
        canceled_status = SR.doc_status_id(OutboundStatus.HUY_PHAT_HANH.value)
        with transaction.atomic():
            doc.status_id = canceled_status
            doc.save(update_fields=["status_id"])
            _insert_wf_log(
                doc,
                action=Act.QT_CANCEL_ISSUED_OUTBOUND.value,
                from_status_id=from_id,
                to_status_id=canceled_status,
                actor=self.actor,
                comment=reason,
            )
            audit_log(actor=self.actor, action="DOC.OUT.WITHDRAW", entity_type="document", entity_id=doc.document_id,
                      before={"status_id":from_id}, after={"status_id":canceled_status,"reason":reason,"state":OutboundStatus.HUY_PHAT_HANH.value})
