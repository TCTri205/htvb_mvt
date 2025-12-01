import logging
import re

from django.contrib import messages
from django.contrib.auth.mixins import LoginRequiredMixin
from django.shortcuts import redirect
from django.urls import reverse
from django.views.generic import DetailView

from documents.models import Document
from workflow.services import errors as wf_errors, rbac
from workflow.services.inbound_service import InboundService
from workflow.services.rbac import Role

from .mixins import WorkflowActionMixin
from .views_ui import LoginRequiredUIPageView

logger = logging.getLogger(__name__)


class LegacyDocumentDetailPageView(LoginRequiredUIPageView):
    """Render the legacy HTML demo or redirect to the workflow detail when an ID is provided."""

    detail_url_name = ""
    query_param_names = ("id", "document_id", "documentId")

    def get_query_doc_id(self):
        for name in self.query_param_names:
            value = self.request.GET.get(name)
            if value:
                return value.strip()
        return ""

    def get(self, request, *args, **kwargs):
        doc_id = self.get_query_doc_id()
        if doc_id and self.detail_url_name:
            if doc_id.isdigit():
                return redirect(reverse(self.detail_url_name, kwargs={"pk": doc_id}))
        return super().get(request, *args, **kwargs)


class InboundListRoleRedirectMixin(LoginRequiredMixin):
    """Ensure văn bản đến list URLs follow the logged-in role prefix (VT/CV/LD)."""

    ROLE_PREFIX_MAP = {
        Role.VT.value: "vanthu",
        Role.LD.value: "lanhdao",
        Role.CV.value: "chuyenvien",
    }

    def dispatch(self, request, *args, **kwargs):
        role_names = set(rbac._get_user_role_names(request.user) or [])
        current_path = request.path or ""
        # Nếu URL đã có prefix hợp lệ (vanthu/chuyenvien/lanhdao), giữ nguyên
        current_role = self._namespace_role(request) or self._extract_prefix(current_path)
        if current_role:
            return super().dispatch(request, *args, **kwargs)
        # Legacy path không prefix: chọn role theo ưu tiên và chuyển hướng
        resolved_role = self.resolve_role_for_request(request, role_names)
        preferred_prefix = self.ROLE_PREFIX_MAP.get(resolved_role)
        if preferred_prefix:
            expected_prefix = f"/{preferred_prefix}/vanbanden/"
            if not current_path.startswith(expected_prefix):
                try:
                    target = reverse(f"ui_{preferred_prefix}:vanbanden_list")
                except Exception:
                    target = None
                if target and target != current_path:
                    query = request.META.get("QUERY_STRING")
                    if query:
                        target = f"{target}?{query}"
                    return redirect(target)
        return super().dispatch(request, *args, **kwargs)

    @staticmethod
    def _extract_prefix(path: str) -> str:
        match = re.match(r"^/(vanthu|chuyenvien|lanhdao)/", path or "")
        if not match:
            return ""
        prefix = match.group(1)
        prefix_map = {"vanthu": "VT", "chuyenvien": "CV", "lanhdao": "LD"}
        return prefix_map.get(prefix, "")

    @staticmethod
    def _namespace_role(request) -> str:
        namespace = getattr(getattr(request, "resolver_match", None), "namespace", "") or ""
        ns_map = {
          "ui_vanthu": "VT",
          "ui_chuyenvien": "CV",
          "ui_lanhdao": "LD",
        }
        return ns_map.get(namespace, "")

    @staticmethod
    def _select_preferred_role(role_names: set) -> str:
        if not role_names:
            return ""
        priority = ("LD", "CV", "VT", "QT")
        for code in priority:
            if code in role_names:
                return code
        # Fallback: return any deterministic role
        return sorted(role_names)[0]

    @classmethod
    def resolve_role_for_request(cls, request, role_names: set) -> str:
        ns_role = cls._namespace_role(request)
        path_role = cls._extract_prefix(getattr(request, "path", "") or "")
        if ns_role and ns_role in role_names:
            return ns_role
        if path_role and path_role in role_names:
            return path_role
        return cls._select_preferred_role(role_names)


class InboundDetailView(LoginRequiredMixin, WorkflowActionMixin, DetailView):
    """
    MVT detail view that runs the inbound workflow service using POSTed actions.
    """

    model = Document
    context_object_name = "doc"

    ACTION_HANDLERS = {
        "receive": "_handle_receive",
        "register": "_handle_register",
        "assign": "_handle_assign",
        "ld_assign_officer": "_handle_assign",
        "ld_approve_inbound": "_handle_leader_approve",
        "ld_request_changes_inbound": "_handle_leader_request_changes",
        "ld_handle_clerk_rejection": "_handle_handle_clerk_rejection",
        "cv_submit_for_approval": "_handle_complete",
        "cv_request_reassign": "_handle_request_reassign",
        "start": "_handle_start",
        "complete": "_handle_complete",
        "vt_final_check_ok_inbound": "_handle_finalize_registration",
        "vt_final_check_reject_inbound": "_handle_final_check_reject",
        "vt_dispatch_result": "_handle_dispatch_result",
        "vt_archive_inbound": "_handle_archive",
        "archive": "_handle_archive",
        "withdraw": "_handle_withdraw",
        "qt_recall_inbound": "_handle_withdraw",
    }

    ROLE_PREFIX_MAP = {
        Role.VT.value: "vanthu",
        Role.LD.value: "lanhdao",
        Role.CV.value: "chuyenvien",
    }

    def dispatch(self, request, *args, **kwargs):
        """Ensure users land on the detail URL that matches their role prefix (VT/CV/LD)."""
        role_names = set(rbac._get_user_role_names(request.user) or [])
        current_path = request.path or ""
        current_role = InboundListRoleRedirectMixin._namespace_role(request) or InboundListRoleRedirectMixin._extract_prefix(current_path)
        pk = kwargs.get(self.pk_url_kwarg)
        # Nếu URL đã có prefix hợp lệ, không redirect
        if current_role:
            return super().dispatch(request, *args, **kwargs)
        # Legacy path => chọn prefix theo ưu tiên
        resolved_role = InboundListRoleRedirectMixin.resolve_role_for_request(request, role_names)
        preferred_prefix = self.ROLE_PREFIX_MAP.get(resolved_role)
        if preferred_prefix and pk:
            expected_prefix = f"/{preferred_prefix}/vanbanden/"
            if not current_path.startswith(expected_prefix):
                try:
                    target = reverse(f"ui_{preferred_prefix}:vanbanden_detail", kwargs={self.pk_url_kwarg: pk})
                except Exception:
                    target = None
                if target and target != current_path:
                    query = request.META.get("QUERY_STRING")
                    if query:
                        target = f"{target}?{query}"
                    return redirect(target)
        return super().dispatch(request, *args, **kwargs)

    def get_queryset(self):
        return super().get_queryset().filter(doc_direction=Document.Direction.DEN)

    def get_template_names(self):
        role_names = set(rbac._get_user_role_names(self.request.user) or [])
        path = self.request.path or ""
        if path.startswith("/vanthu/"):
            return ["vanthu/vanbanden-detail.html"]
        if path.startswith("/chuyenvien/"):
            return ["chuyenvien/vanbanden-detail.html"]
        if path.startswith("/lanhdao/"):
            return ["lanhdao/vanbanden-detail.html"]
        resolved_role = InboundListRoleRedirectMixin.resolve_role_for_request(self.request, role_names)
        if resolved_role == Role.VT.value:
            return ["vanthu/vanbanden-detail.html"]
        if resolved_role == Role.LD.value:
            return ["lanhdao/vanbanden-detail.html"]
        if resolved_role == Role.CV.value:
            return ["chuyenvien/vanbanden-detail.html"]
        return ["chung/template.html"]

    def get_context_data(self, **kwargs):
        ctx = super().get_context_data(**kwargs)
        role_names = set(rbac._get_user_role_names(self.request.user) or [])
        path = self.request.path or ""
        if path.startswith("/lanhdao/"):
            body_role = "lanhdao"
        elif path.startswith("/chuyenvien/"):
            body_role = "chuyenvien"
        elif path.startswith("/vanthu/"):
            body_role = "vanthu"
        else:
            resolved_role = InboundListRoleRedirectMixin.resolve_role_for_request(self.request, role_names)
            body_role = "vanthu"
            if resolved_role == Role.LD.value:
                body_role = "lanhdao"
            elif resolved_role == Role.CV.value:
                body_role = "chuyenvien"
        ctx.setdefault("body_role", body_role)
        ctx.setdefault("body_page", "vanbanden-detail")
        ctx.setdefault("doc_id", getattr(ctx.get("object"), "document_id", None))
        return ctx

    def post(self, request, *args, **kwargs):
        self.object = self.get_object()
        action = (request.POST.get("action") or "").strip().lower()
        handler_name = self.ACTION_HANDLERS.get(action)
        if not handler_name:
            messages.error(request, "Hành động không hợp lệ.")
            return redirect(request.path)

        handler = getattr(self, handler_name, None)
        if handler is None:
            messages.error(request, "Không tìm thấy xử lý cho hành động.")
            return redirect(request.path)

        try:
            handler()
        except (wf_errors.PermissionDenied, wf_errors.ValidationError, wf_errors.InvalidTransition) as exc:
            messages.error(request, str(exc))
        except Exception as exc:  # pragma: no cover - guard unexpected errors
            logger.exception("Lỗi khi thực thi hành động %s", action)
            messages.error(request, "Có lỗi xảy ra. Vui lòng thử lại.")

        return redirect(request.path)

    @property
    def service(self) -> InboundService:
        if not hasattr(self, "_inbound_service"):
            self._inbound_service = InboundService(actor=self.request.user)
        return self._inbound_service

    def _handle_receive(self):
        note = self._get_value("note")
        self.service.receive_intake(self.object, note=note or None)
        messages.success(self.request, "Văn bản đã được tiếp nhận.")

    def _handle_register(self):
        number = self._get_int("received_number", required=True, label="số đến")
        received_date = self._parse_date("received_date", required=True)
        sender = self._get_value("sender", required=True, label="người gửi")
        self.service.register(
            self.object,
            received_number=number,
            received_date=received_date,
            sender=sender,
        )
        messages.success(self.request, "Đã đăng ký văn bản.")

    def _handle_assign(self):
        assignees = self._resolve_assignees()
        if not assignees:
            raise wf_errors.ValidationError("Phải chọn ít nhất một người được phân công.")
        instruction = self._get_value("instruction")
        due_at = self._parse_datetime("due_at")
        self.service.assign(
            self.object,
            assignees,
            instruction=instruction or None,
            due_at=due_at,
        )
        messages.success(self.request, "Đã phân công văn bản.")

    def _handle_start(self):
        self.service.start_processing(self.object)
        messages.success(self.request, "Đã bắt đầu xử lý văn bản.")

    def _handle_complete(self):
        note = self._get_value("result_note")
        self.service.complete(self.object, result_note=note or None)
        messages.success(self.request, "Đã hoàn tất văn bản.")

    def _handle_leader_approve(self):
        note = self._get_value("note")
        self.service.leader_approve(self.object, note=note or None)
        messages.success(self.request, "Đã phê duyệt kết quả xử lý.")

    def _handle_leader_request_changes(self):
        note = self._get_value("note")
        self.service.leader_request_changes(self.object, note=note or None)
        messages.success(self.request, "Đã gửi yêu cầu chỉnh sửa về chuyên viên.")

    def _handle_handle_clerk_rejection(self):
        note = self._get_value("note")
        self.service.handle_clerk_rejection(self.object, note=note or None)
        messages.success(self.request, "Đã xử lý phản hồi từ văn thư.")

    def _handle_finalize_registration(self):
        note = self._get_value("note")
        register_id = self._get_int("register_book_id")
        self.service.finalize_registration(
            self.object,
            note=note or None,
            register_book_id=register_id,
        )
        messages.success(self.request, "Đã vào sổ văn bản đến.")

    def _handle_final_check_reject(self):
        reason = self._get_value("reason")
        self.service.final_check_reject(self.object, reason=reason or None)
        messages.success(self.request, "Đã gửi yêu cầu kiểm tra lại cho văn thư.")

    def _handle_dispatch_result(self):
        note = self._get_value("note")
        self.service.dispatch_result(self.object, note=note or None)
        messages.success(self.request, "Đã phát hành kết quả xử lý.")

    def _handle_request_reassign(self):
        note = self._get_value("note")
        self.service.request_reassign(self.object, note=note or None)
        messages.success(self.request, "Đã gửi yêu cầu phân công lại.")

    def _handle_archive(self):
        reason = self._get_value("reason")
        self.service.archive(self.object, reason or None)
        messages.success(self.request, "Đã lưu trữ văn bản.")

    def _handle_withdraw(self):
        reason = self._get_value("reason", required=True, label="lý do thu hồi")
        self.service.withdraw(self.object, reason=reason)
        messages.success(self.request, "Đã thu hồi văn bản.")
