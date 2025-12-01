from django.shortcuts import get_object_or_404

from .views_documents_inbound import LegacyDocumentDetailPageView, InboundListRoleRedirectMixin
from documents.models import DocumentWorkflowLog, RegisterBook
from documents.views_ui import OutboundDraftView
from workflow.services.rbac import Act
from .views_ui import LoginRequiredUIPageView


class VanthuDashboardView(LoginRequiredUIPageView):
    template_name = "vanthu/dashboard.html"
    extra_context = {"body_role": "vanthu", "body_page": "dashboard"}


class VanthuBaoCaoThongKeView(LoginRequiredUIPageView):
    template_name = "vanthu/baocaothongke.html"
    extra_context = {"body_role": "vanthu", "body_page": "baocaothongke"}


class VanthuDanhMucView(LoginRequiredUIPageView):
    template_name = "vanthu/danhmuc.html"
    extra_context = {"body_role": "vanthu", "body_page": "danhmuc"}


class VanthuHoSoCongViecListView(LoginRequiredUIPageView):
    template_name = "vanthu/hosocongviec.html"
    extra_context = {"body_role": "vanthu", "body_page": "hosocongviec"}


class VanthuHoSoCongViecDetailView(LoginRequiredUIPageView):
    template_name = "vanthu/hosocongviec-detail.html"
    extra_context = {"body_role": "vanthu", "body_page": "hosocongviec-detail"}


class VanthuSoDangKyView(LoginRequiredUIPageView):
    template_name = "vanthu/sodangky.html"
    extra_context = {"body_role": "vanthu", "body_page": "sodangky"}


class VanthuTaiKhoanView(LoginRequiredUIPageView):
    template_name = "vanthu/taikhoan.html"
    extra_context = {"body_role": "vanthu", "body_page": "taikhoan"}


class VanthuThongBaoNhacViecView(LoginRequiredUIPageView):
    template_name = "vanthu/thongbaonhacviec.html"
    extra_context = {"body_role": "vanthu", "body_page": "thongbaonhacviec"}


class VanthuVanBanDenListView(InboundListRoleRedirectMixin, LoginRequiredUIPageView):
    template_name = "vanthu/vanbanden.html"
    extra_context = {"body_role": "vanthu", "body_page": "vanbanden"}

class VanthuVanBanDenTiepNhanView(LoginRequiredUIPageView):
    template_name = "vanthu/vanbanden-tiepnhan.html"
    extra_context = {"body_role": "vanthu", "body_page": "vanbanden-tiepnhan"}


class VanthuVanBanDenExportView(LoginRequiredUIPageView):
    template_name = "vanthu/vanbanden-export.html"
    extra_context = {"body_role": "vanthu", "body_page": "vanbanden-export"}


class VanthuVanBanDiListView(LoginRequiredUIPageView):
    template_name = "vanthu/vanbandi.html"
    extra_context = {"body_role": "vanthu", "body_page": "vanbandi"}


class VanthuVanBanDiCreateView(OutboundDraftView):
    template_name = "vanthu/vanbandi-taomoi.html"
    extra_context = {"body_role": "vanthu", "body_page": "vanbandi-taomoi"}


class VanthuVanBanDiDetailView(LegacyDocumentDetailPageView):
    template_name = "vanthu/vanbandi-detail.html"
    extra_context = {"body_role": "vanthu", "body_page": "vanbandi-detail"}
    detail_url_name = "ui_vanthu:vanbandi_detail"


class VanthuRegisterBookDetailView(LoginRequiredUIPageView):
    template_name = "vanthu/register-book-detail.html"
    extra_context = {"body_role": "vanthu", "body_page": "sodangky-detail"}

    direction_labels = {"den": "Văn bản đến", "di": "Văn bản đi"}
    reset_labels = {
        "yearly": "Hằng năm",
        "quarterly": "Theo quý",
        "monthly": "Hằng tháng",
        "never": "Không reset",
    }

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        register_id = kwargs.get("register_id")
        register = get_object_or_404(RegisterBook, register_id=register_id)
        logs = (
            DocumentWorkflowLog.objects.filter(
                action=Act.VT_REGISTER_INBOUND.value,
                meta_json__register_book_id=register_id,
            )
            .select_related("document", "document__status", "document__department", "acted_by")
            .order_by("-acted_at")[:200]
        )
        seen = set()
        documents = []
        for log in logs:
            doc = log.document
            if not doc:
                continue
            doc_id = getattr(doc, "document_id", None) or getattr(doc, "pk", None)
            if not doc_id or doc_id in seen:
                continue
            seen.add(doc_id)
            actor_name = (
                getattr(log.acted_by, "full_name", None)
                or getattr(log.acted_by, "name", None)
                or getattr(log.acted_by, "username", None)
                or ""
            )
            department_label = (
                getattr(doc.department, "name", None)
                or getattr(doc, "main_department_name", None)
                or "—"
            )
            status_label = (
                getattr(doc.status, "status_name", None)
                or getattr(doc, "status_name", None)
                or ""
            )
            documents.append(
                {
                    "document": doc,
                    "registered_at": log.acted_at,
                    "note": log.comment,
                    "actor_name": actor_name,
                    "department_label": department_label,
                    "status_label": status_label,
                }
            )

        context["register"] = register
        context["register_direction_label"] = self.direction_labels.get(
            register.direction, register.get_direction_display() if register.direction else ""
        )
        context["register_reset_label"] = self.reset_labels.get(
            register.reset_policy, register.reset_policy or ""
        )
        context["register_status_label"] = "Đang hoạt động" if register.is_active else "Đã khóa"
        context["register_documents"] = documents
        context["register_documents_count"] = len(documents)
        return context
