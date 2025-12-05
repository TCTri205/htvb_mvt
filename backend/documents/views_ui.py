from __future__ import annotations

import logging
from typing import Any, Optional

from django.contrib import messages
from django.contrib.auth.mixins import LoginRequiredMixin
from django.http import JsonResponse
from django.shortcuts import redirect
from django.urls import reverse
from django.views.generic import DetailView, TemplateView

from documents.models import Document
from workflow.services import errors as wf_errors
from workflow.services.outbound_service import OutboundService
from workflow.services.rbac import Role, get_single_role_code
from workflow.views_mixins import WorkflowActionFormMixin

logger = logging.getLogger(__name__)


class OutboundDetailView(LoginRequiredMixin, WorkflowActionFormMixin, DetailView):
    model = Document
    context_object_name = "doc"
    pk_url_kwarg = "pk"
    ACTION_HANDLERS = {
        "submit": "_handle_submit",
        "return": "_handle_return",
        "return_from_clerk": "_handle_return_from_clerk",
        "receive_for_final_check": "_handle_receive_for_final_check",
        "finalize_registration": "_handle_finalize_registration",
        "final_check_reject": "_handle_final_check_reject",
        "approve": "_handle_approve",
        "sign": "_handle_sign",
        "publish": "_handle_publish",
        "archive": "_handle_archive",
        "withdraw": "_handle_withdraw",
    }
    ACTION_ALIASES = {
        "cv_submit_draft": "submit",
        "ld_approve_outbound": "approve",
        "ld_request_changes_outbound": "return",
        "ld_request_changes_from_clerk": "return_from_clerk",
        "qt_cancel_issued_outbound": "withdraw",
        "vt_receive_for_final_check": "receive_for_final_check",
        "vt_final_check_ok_outbound": "finalize_registration",
        "vt_register_outbound": "finalize_registration",
        "vt_final_check_reject_outbound": "final_check_reject",
        "vt_issue_outbound": "publish",
        "vt_archive_outbound": "archive",
    }

    def get_object(self, queryset=None):
        """Override to ensure lookup by document_id (primary key)."""
        if queryset is None:
            queryset = self.get_queryset()
        pk = self.kwargs.get(self.pk_url_kwarg)
        if pk is None:
            raise AttributeError(
                "OutboundDetailView must be called with a pk in the URLconf."
            )
        # Look up by document_id (which is the primary key)
        try:
            return queryset.get(document_id=pk)
        except Document.DoesNotExist:
            from django.http import Http404
            raise Http404(f"No {queryset.model._meta.verbose_name} found matching the query")

    def get_queryset(self):
        qs = super().get_queryset()
        # Route này chỉ phục vụ văn bản đi, nên luôn giới hạn theo hướng OUTBOUND
        # thay vì phụ thuộc phân quyền (tránh lọc sai dẫn tới 404 khi đường dẫn đúng).
        return qs.filter(doc_direction__in=(Document.Direction.DI, Document.Direction.DU_THAO))

    def get_template_names(self):
        path = self.request.path or ""
        if path.startswith("/vanthu/"):
            return ["vanthu/vanbandi-detail.html"]
        if path.startswith("/chuyenvien/"):
            return ["chuyenvien/vanbandi-detail.html"]
        if path.startswith("/lanhdao/"):
            return ["lanhdao/vanbandi-detail.html"]
        role_code = get_single_role_code(self.request.user)
        if role_code == Role.VT.value:
            return ["vanthu/vanbandi-detail.html"]
        if role_code == Role.LD.value:
            return ["lanhdao/vanbandi-detail.html"]
        if role_code == Role.CV.value:
            return ["chuyenvien/vanbandi-detail.html"]
        return ["chung/template.html"]

    def post(self, request, *args, **kwargs):
        self.object = self.get_object()
        raw_action = (request.POST.get("action") or "").strip().lower()
        logger.info(f"[OutboundDetailView] POST received: action='{raw_action}', POST data: {dict(request.POST)}")
        canonical_action = self.ACTION_ALIASES.get(raw_action, raw_action)
        logger.info(f"[OutboundDetailView] Canonical action: '{canonical_action}'")
        handler_name = self.ACTION_HANDLERS.get(canonical_action)
        if not handler_name:
            logger.warning(f"[OutboundDetailView] No handler found for action '{canonical_action}'")
            messages.error(request, "Hành động không hợp lệ.")
            return redirect(request.path)

        handler = getattr(self, handler_name, None)
        if handler is None:
            logger.error(f"[OutboundDetailView] Handler method '{handler_name}' not found")
            messages.error(request, "Không tìm thấy xử lý cho hành động.")
            return redirect(request.path)

        try:
            logger.info(f"[OutboundDetailView] Calling handler: {handler_name}")
            handler()
            logger.info(f"[OutboundDetailView] Handler completed successfully")
        except (wf_errors.PermissionDenied, wf_errors.ValidationError, wf_errors.InvalidTransition) as exc:
            logger.warning(f"[OutboundDetailView] Workflow error: {exc}")
            messages.error(request, str(exc))
        except Exception:
            logger.exception("Lỗi khi xử lý hành động outbound %s", canonical_action)
            messages.error(request, "Có lỗi xảy ra. Vui lòng thử lại.")
        return redirect(request.path)

    def get_context_data(self, **kwargs):
        ctx = super().get_context_data(**kwargs)
        role_code = get_single_role_code(self.request.user)
        body_role = "vanthu"
        if role_code == Role.LD.value:
            body_role = "lanhdao"
        elif role_code == Role.CV.value:
            body_role = "chuyenvien"
        ctx.setdefault("body_role", body_role)
        ctx.setdefault("body_page", "vanbandi-detail")
        if self.object:
            ctx.setdefault("doc_id", self.object.document_id)
        return ctx

    @property
    def service(self) -> OutboundService:
        if not hasattr(self, "_outbound_service"):
            self._outbound_service = OutboundService(actor=self.request.user)
        return self._outbound_service

    def _handle_submit(self):
        note = self._get_value("note")
        self.service.submit(self.object, note=note or None)
        messages.success(self.request, "Đã gửi duyệt văn bản.")

    def _handle_return(self):
        reason = self._get_value("reason", required=True, label="lý do trả lại")
        self.service.return_for_fix(self.object, reason=reason)
        messages.success(self.request, "Đã trả lại để chỉnh sửa.")

    def _handle_return_from_clerk(self):
        note = self._get_value("note")
        self.service.leader_request_changes_from_clerk(self.object, note=note or None)
        messages.success(self.request, "Đã gửi phản hồi về văn thư.")

    def _handle_receive_for_final_check(self):
        note = self._get_value("note")
        self.service.receive_for_final_check(self.object, note=note or None)
        messages.success(self.request, "Đã chuyển văn thư kiểm tra cuối.")

    def _handle_finalize_registration(self):
        note = self._get_value("note")
        register_book_id = self._get_int("register_book_id")
        self.service.finalize_registration(
            self.object, 
            note=note or None, 
            register_book_id=register_book_id
        )
        messages.success(self.request, "Đã kiểm tra và vào sổ văn bản đi.")

    def _handle_final_check_reject(self):
        reason = self._get_value("reason")
        self.service.final_check_reject(self.object, reason=reason or None)
        messages.success(self.request, "Đã yêu cầu chỉnh sửa sau kiểm tra.")

    def _handle_approve(self):
        note = self._get_value("note")
        self.service.approve(self.object, note=note or None)
        messages.success(self.request, "Đã duyệt văn bản.")

    def _handle_sign(self):
        signature_hash = self._get_value("signature_hash", required=True, label="hash chữ ký")
        signer_position = self._get_value("signer_position")
        self.service.sign(
            self.object,
            signature_hash=signature_hash,
            signer_position=signer_position or None,
        )
        messages.success(self.request, "Đã ký văn bản.")

    def _handle_publish(self):
        issue_number = self._get_value("issue_number", required=False, label="số hiệu")
        if not issue_number and not self.object.issue_number:
             raise wf_errors.ValidationError("Số hiệu là bắt buộc.")
        issue_number = issue_number or self.object.issue_number
        issued_date = self._parse_date("issued_date", required=True)
        channels = self._parse_list("channels")
        prefix = self._get_value("prefix")
        postfix = self._get_value("postfix")
        year = self._get_int("year")
        self.service.publish(
            self.object,
            issue_number=issue_number or None,
            issued_date=issued_date,
            channels=channels or None,
            prefix=prefix or None,
            postfix=postfix or None,
            year=year,
        )
        messages.success(self.request, "Đã phát hành văn bản.")

    def _handle_archive(self):
        self.service.archive(self.object)
        messages.success(self.request, "Đã lưu trữ văn bản.")

    def _handle_withdraw(self):
        reason = self._get_value("reason", required=True, label="lý do thu hồi")
        self.service.withdraw_publish(self.object, reason=reason)
        messages.success(self.request, "Đã thu hồi văn bản.")


class OutboundDraftView(LoginRequiredMixin, WorkflowActionFormMixin, TemplateView):
    template_name = "chuyenvien/vanbandi-taomoi.html"
    extra_context = {"body_role": "chuyenvien", "body_page": "vanbandi-taomoi"}

    def _is_ajax(self):
        req = self.request
        if req.headers.get("x-requested-with") == "XMLHttpRequest":
            return True
        accept = req.headers.get("accept") or ""
        return "application/json" in accept

    def post(self, request, *args, **kwargs):
        is_ajax = self._is_ajax()
        try:
            document = self._get_or_create_document()
            self.service.touch_draft(document)
        except (wf_errors.PermissionDenied, wf_errors.ValidationError, wf_errors.InvalidTransition) as exc:
            if is_ajax:
                return JsonResponse({"detail": str(exc)}, status=400)
            messages.error(request, str(exc))
            return redirect(request.path)
        except Exception:
            logger.exception("Lỗi lưu dự thảo văn bản đi", exc_info=True)
            if is_ajax:
                return JsonResponse({"detail": "Có lỗi xảy ra. Vui lòng thử lại."}, status=500)
            messages.error(request, "Có lỗi xảy ra. Vui lòng thử lại.")
            return redirect(request.path)

        if is_ajax:
            return JsonResponse({"status": "ok", "document_id": document.document_id})
        messages.success(request, "Đã lưu dự thảo và chuyển sang chi tiết văn bản.")
        return redirect(reverse("ui_chuyenvien:vanbandi_detail", args=[document.document_id]))

    @property
    def service(self) -> OutboundService:
        if not hasattr(self, "_outbound_service"):
            self._outbound_service = OutboundService(actor=self.request.user)
        return self._outbound_service

    def _get_or_create_document(self) -> Document:
        from catalog.models import UrgencyLevel, SecurityLevel, DocumentType, Field as FieldModel, DocumentStatus
        from workflow.services.status_resolver import StatusResolver as SR, OutboundStatus
        
        doc_id = self._get_int("document_id")
        title = self._get_value("title", required=True)
        code = self._get_value("code") or ""  # Not required for draft
        
        # Get DRAFT status_id for new documents
        draft_status_id = SR.doc_status_id(OutboundStatus.DRAFT.value)
        
        # Get optional fields from form
        urgency_name = self._get_value("urgency") or "Thường"
        security_name = self._get_value("security") or "Thường"
        doc_type_name = self._get_value("doc_type")
        field_name = self._get_value("field")
        receivers = self._get_value("receivers")
        abstract = self._get_value("abstract")
        
        # Lookup ForeignKey objects
        urgency_level = None
        if urgency_name:
            urgency_level = UrgencyLevel.objects.filter(name__iexact=urgency_name).first()
            if not urgency_level:
                urgency_level = UrgencyLevel.objects.filter(code__iexact=urgency_name.upper().replace(" ", "_")).first()
        
        security_level = None
        if security_name:
            security_level = SecurityLevel.objects.filter(name__iexact=security_name).first()
            if not security_level:
                security_level = SecurityLevel.objects.filter(code__iexact=security_name.upper().replace(" ", "_")).first()
        
        document_type = None
        if doc_type_name:
            document_type = DocumentType.objects.filter(name__iexact=doc_type_name).first()
        
        field_obj = None
        if field_name:
            field_obj = FieldModel.objects.filter(name__iexact=field_name).first()
        
        if doc_id:
            document = (
                Document.objects.filter(document_id=doc_id, doc_direction=Document.Direction.DU_THAO)
                .first()
            )
            if document is None:
                raise wf_errors.ValidationError("Không tìm thấy dự thảo.")
            # Update all fields
            document.title = title
            document.document_code = code
            # Ensure status is set to DRAFT if not already set
            if not document.status_id:
                document.status_id = draft_status_id
            if urgency_level:
                document.urgency_level = urgency_level
            if security_level:
                document.security_level = security_level
            if document_type:
                document.document_type = document_type
            if field_obj:
                document.field = field_obj
            if receivers:
                document.sender = receivers  # Store receivers in sender field temporarily
            document.save()
            return document

        logger.info(f"[OutboundDraftView] Creating draft for user: {self.request.user.username}, Dept: {self.request.user.department_id} - {self.request.user.department}")
        return Document.objects.create(
            doc_direction=Document.Direction.DU_THAO,
            title=title,
            document_code=code,
            created_by=self.request.user,
            department=self.request.user.department,
            status_id=draft_status_id,  # CRITICAL: Set status to DRAFT for RBAC permission
            urgency_level=urgency_level,
            security_level=security_level,
            document_type=document_type,
            field=field_obj,
            sender=receivers,  # Store receivers in sender field temporarily
        )

