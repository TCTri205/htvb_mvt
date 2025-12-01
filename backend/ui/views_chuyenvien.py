from .views_documents_inbound import LegacyDocumentDetailPageView, InboundListRoleRedirectMixin
from .views_ui import LoginRequiredUIPageView


class ChuyenvienDashboardView(LoginRequiredUIPageView):
    template_name = "chuyenvien/dashboard.html"
    extra_context = {"body_role": "chuyenvien", "body_page": "dashboard-chuyenvien"}


class ChuyenvienBaoCaoThongKeView(LoginRequiredUIPageView):
    template_name = "chuyenvien/baocaothongke.html"
    extra_context = {"body_role": "chuyenvien", "body_page": "baocaothongke"}


class ChuyenvienDanhMucView(LoginRequiredUIPageView):
    template_name = "chuyenvien/danhmuc.html"
    extra_context = {"body_role": "chuyenvien", "body_page": "danhmuc"}


class ChuyenvienHoSoCongViecListView(LoginRequiredUIPageView):
    template_name = "chuyenvien/hosocongviec.html"
    extra_context = {"body_role": "chuyenvien", "body_page": "hosocongviec"}


class ChuyenvienHoSoCongViecDetailView(LoginRequiredUIPageView):
    template_name = "chuyenvien/hosocongviec-detail.html"
    extra_context = {"body_role": "chuyenvien", "body_page": "hosocongviec-detail"}


class ChuyenvienTaiKhoanView(LoginRequiredUIPageView):
    template_name = "chuyenvien/taikhoan.html"
    extra_context = {"body_role": "chuyenvien", "body_page": "taikhoan"}


class ChuyenvienThongBaoNhacViecView(LoginRequiredUIPageView):
    template_name = "chuyenvien/thongbaonhacviec.html"
    extra_context = {"body_role": "chuyenvien", "body_page": "thongbaonhacviec"}


class ChuyenvienVanBanDenListView(InboundListRoleRedirectMixin, LoginRequiredUIPageView):
    template_name = "chuyenvien/vanbanden.html"
    extra_context = {"body_role": "chuyenvien", "body_page": "vanbanden"}


class ChuyenvienVanBanDiListView(LoginRequiredUIPageView):
    template_name = "chuyenvien/vanbandi.html"
    extra_context = {"body_role": "chuyenvien", "body_page": "vanbandi"}


class ChuyenvienVanBanDiDetailView(LegacyDocumentDetailPageView):
    template_name = "chuyenvien/vanbandi-detail.html"
    extra_context = {"body_role": "chuyenvien", "body_page": "vanbandi-detail"}
    detail_url_name = "ui_chuyenvien:vanbandi_detail"
