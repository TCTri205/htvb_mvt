from __future__ import annotations

import logging
import uuid
from typing import Optional

from accounts.models import Department
from cases.models import Case
from cases.serializers import CaseSerializer
from catalog.models import CaseType
from django.contrib import messages
from django.contrib.auth import get_user_model
from django.contrib.auth.mixins import LoginRequiredMixin
from django.shortcuts import redirect
from django.urls import reverse
from django.views.generic import DetailView, TemplateView

from workflow.services import errors as wf_errors
from workflow.services.case_service import CaseService
from workflow.services.rbac import Act, Role, get_single_role_code, require_can
from workflow.views_mixins import WorkflowActionFormMixin

logger = logging.getLogger(__name__)
User = get_user_model()


class CaseDetailView(LoginRequiredMixin, WorkflowActionFormMixin, DetailView):
    model = Case
    context_object_name = "case"
    ACTION_HANDLERS = {
        "wait": "_handle_wait",
        "assign": "_handle_assign",
        "start": "_handle_start",
        "pause": "_handle_pause",
        "resume": "_handle_resume",
        "request_close": "_handle_request_close",
        "approve_close": "_handle_approve_close",
        "archive": "_handle_archive",
    }

    def get_template_names(self):
        # Determine template based on URL path (e.g., /lanhdao/hosocongviec/77/)
        # instead of user role to avoid mismatch when user has multiple roles
        path = self.request.path.lower()
        
        if '/vanthu/' in path:
            return ["vanthu/hosocongviec-detail.html"]
        if '/lanhdao/' in path:
            return ["lanhdao/hosocongviec-detail.html"]
        if '/chuyenvien/' in path:
            return ["chuyenvien/hosocongviec-detail.html"]
        
        # Fallback to role-based detection if URL doesn't contain role prefix
        role_code = get_single_role_code(self.request.user)
        if role_code == Role.VT.value:
            return ["vanthu/hosocongviec-detail.html"]
        if role_code == Role.LD.value:
            return ["lanhdao/hosocongviec-detail.html"]
        if role_code == Role.CV.value:
            return ["chuyenvien/hosocongviec-detail.html"]
        
        return ["chung/template.html"]

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["case_json"] = CaseSerializer(self.object).data
        
        # Set body_role and body_page for correct sidebar/navigation rendering
        role_code = get_single_role_code(self.request.user)
        if role_code == Role.VT.value:
            context["body_role"] = "vanthu"
            context["body_page"] = "hosocongviec-detail"
        elif role_code == Role.LD.value:
            context["body_role"] = "lanhdao"
            context["body_page"] = "hosocongviec-detail"
        elif role_code == Role.CV.value:
            context["body_role"] = "chuyenvien"
            context["body_page"] = "hosocongviec-detail"
        
        return context

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
        except Exception:
            logger.exception("Lỗi khi xử lý hành động case %s", action)
            messages.error(request, "Có lỗi xảy ra. Vui lòng thử lại.")
        return redirect(request.path)

    @property
    def service(self) -> CaseService:
        if not hasattr(self, "_case_service"):
            self._case_service = CaseService(actor=self.request.user)
        return self._case_service

    def _handle_wait(self):
        self.service.wait_for_assign(self.object)
        messages.success(self.request, "Đã gửi trạng thái chờ phân công.")

    def _handle_assign(self):
        assignees = self._resolve_assignees()
        if not assignees:
            raise wf_errors.ValidationError("Cần ít nhất một người tham gia.")
        leader = None
        leader_id = self._get_value("leader_id")
        if leader_id:
            leader = User.objects.filter(user_id=leader_id).first()
            if not leader:
                raise wf_errors.ValidationError("Không tìm thấy người làm leader.")
        instruction = self._get_value("instruction")
        due_date = self._parse_datetime("due_date")
        if due_date is None:
            due_date = self._parse_datetime("case_due_date")
        self.service.assign(
            self.object,
            assignees,
            leader=leader,
            instruction=instruction or None,
            due_date=due_date,
        )
        messages.success(self.request, "Đã phân công hồ sơ.")

    def _handle_start(self):
        self.service.start(self.object)
        messages.success(self.request, "Đã bắt đầu hồ sơ.")

    def _handle_pause(self):
        reason = self._get_value("reason")
        self.service.pause(self.object, reason=reason or None)
        messages.success(self.request, "Đã tạm dừng hồ sơ.")

    def _handle_resume(self):
        self.service.resume(self.object)
        messages.success(self.request, "Đã tiếp tục hồ sơ.")

    def _handle_request_close(self):
        note = self._get_value("note")
        self.service.request_close(self.object, note=note or None)
        messages.success(self.request, "Đã gửi yêu cầu đóng hồ sơ.")

    def _handle_approve_close(self):
        self.service.approve_close(self.object)
        messages.success(self.request, "Đã chấp thuận đóng hồ sơ.")

    def _handle_archive(self):
        reason = self._get_value("reason")
        self.service.archive(self.object, reason=reason or None)
        messages.success(self.request, "Đã lưu trữ hồ sơ.")


class CaseCreateView(LoginRequiredMixin, WorkflowActionFormMixin, TemplateView):
    template_name = "lanhdao/hosocongviec-taomoi.html"
    extra_context = {"body_role": "lanhdao", "body_page": "hosocongviec-taomoi"}

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context.setdefault("case_types", CaseType.objects.order_by("case_type_name"))
        context.setdefault("departments", Department.objects.order_by("name"))
        return context

    def post(self, request, *args, **kwargs):
        require_can(self.request.user, Act.CASE_CREATE)
        title = self._get_value("title", required=True)
        case_code = self._get_value("case_code") or f"HS-{uuid.uuid4().hex[:8]}"
        description = self._get_value("description")
        case_type = self._resolve_case_type()
        if not case_type:
            messages.error(request, "Cần chọn loại hồ sơ.")
            return redirect(request.path)
        due_date = self._parse_datetime("due_date")
        priority = self._get_value("priority")
        department = self._resolve_department()

        case = Case(
            case_code=case_code,
            title=title,
            description=description or None,
            case_type=case_type,
            due_date=due_date,
            priority=priority or None,
        )
        if department is not None:
            case.department = department

        try:
            self.service.create(case, description=description or None)
        except (wf_errors.PermissionDenied, wf_errors.ValidationError, wf_errors.InvalidTransition) as exc:
            messages.error(request, str(exc))
            return redirect(request.path)
        except Exception:
            logger.exception("Không thể tạo hồ sơ công việc.", exc_info=True)
            messages.error(request, "Đã xảy ra lỗi trong quá trình tạo hồ sơ.")
            return redirect(request.path)

        messages.success(request, "Đã tạo hồ sơ công việc.")
        return redirect(reverse("ui_lanhdao:hosocongviec_detail", args=[case.case_id]))

    @property
    def service(self) -> CaseService:
        if not hasattr(self, "_case_service"):
            self._case_service = CaseService(actor=self.request.user)
        return self._case_service

    def _resolve_case_type(self) -> Optional[CaseType]:
        raw = self._get_value("case_type")
        if not raw:
            return None
        try:
            type_id = int(raw)
        except ValueError:
            type_id = None
        qs = CaseType.objects
        if type_id is not None:
            candidate = qs.filter(case_type_id=type_id).first()
            if candidate:
                return candidate
        candidate = qs.filter(case_type_name__iexact=raw).first()
        if candidate:
            return candidate
        return qs.first()

    def _resolve_department(self) -> Optional[Department]:
        raw = self._get_value("department")
        if not raw:
            return None
        return Department.objects.filter(name__iexact=raw).first()


class VanthuCaseCreateView(CaseCreateView):
    template_name = "vanthu/hosocongviec-taomoi.html"
    extra_context = {"body_role": "vanthu", "body_page": "hosocongviec-taomoi"}

    def post(self, request, *args, **kwargs):
        require_can(self.request.user, Act.CASE_CREATE)
        title = self._get_value("title", required=True)
        case_code = self._get_value("case_code") or f"HS-{uuid.uuid4().hex[:8]}"
        description = self._get_value("description")
        case_type = self._resolve_case_type()
        if not case_type:
            messages.error(request, "Cần chọn loại hồ sơ.")
            return redirect(request.path)
        due_date = self._parse_datetime("due_date")
        priority = self._get_value("priority")
        department = self._resolve_department()

        case = Case(
            case_code=case_code,
            title=title,
            description=description or None,
            case_type=case_type,
            due_date=due_date,
            priority=priority or None,
        )
        if department is not None:
            case.department = department

        try:
            self.service.create(case, description=description or None)
        except (wf_errors.PermissionDenied, wf_errors.ValidationError, wf_errors.InvalidTransition) as exc:
            messages.error(request, str(exc))
            return redirect(request.path)
        except Exception:
            logger.exception("Không thể tạo hồ sơ công việc.", exc_info=True)
            messages.error(request, "Đã xảy ra lỗi trong quá trình tạo hồ sơ.")
            return redirect(request.path)

        messages.success(request, "Đã tạo hồ sơ công việc.")
        return redirect(reverse("ui_vanthu:hosocongviec_detail", args=[case.case_id]))
