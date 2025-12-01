from .views_documents_inbound import LegacyDocumentDetailPageView, InboundListRoleRedirectMixin
from .views_ui import LoginRequiredUIPageView


class LanhdaoDashboardView(LoginRequiredUIPageView):
    template_name = "lanhdao/dashboard.html"
    extra_context = {"body_role": "lanhdao", "body_page": "dashboard"}


class LanhdaoBaoCaoThongKeView(LoginRequiredUIPageView):
    template_name = "lanhdao/baocaothongke.html"
    extra_context = {"body_role": "lanhdao", "body_page": "baocaothongke"}


class LanhdaoDanhMucView(LoginRequiredUIPageView):
    template_name = "lanhdao/danhmuc.html"
    extra_context = {"body_role": "lanhdao", "body_page": "danhmuc"}


class LanhdaoHoSoCongViecListView(LoginRequiredUIPageView):
    template_name = "lanhdao/hosocongviec.html"
    extra_context = {"body_role": "lanhdao", "body_page": "hosocongviec"}


class LanhdaoHoSoCongViecDetailView(LoginRequiredUIPageView):
    template_name = "lanhdao/hosocongviec-detail.html"
    extra_context = {"body_role": "lanhdao", "body_page": "hosocongviec-detail"}


class LanhdaoTaiKhoanView(LoginRequiredUIPageView):
    template_name = "lanhdao/taikhoan.html"
    extra_context = {"body_role": "lanhdao", "body_page": "taikhoan"}


class LanhdaoThongBaoNhacViecView(LoginRequiredUIPageView):
    template_name = "lanhdao/thongbaonhacviec.html"
    extra_context = {"body_role": "lanhdao", "body_page": "thongbaonhacviec"}


class LanhdaoVanBanDenListView(InboundListRoleRedirectMixin, LoginRequiredUIPageView):
    template_name = "lanhdao/vanbanden.html"
    extra_context = {"body_role": "lanhdao", "body_page": "vanbanden"}


class LanhdaoVanBanDiListView(LoginRequiredUIPageView):
    template_name = "lanhdao/vanbandi.html"
    extra_context = {"body_role": "lanhdao", "body_page": "vanbandi"}


class LanhdaoVanBanDiDetailView(LegacyDocumentDetailPageView):
    template_name = "lanhdao/vanbandi-detail.html"
    extra_context = {"body_role": "lanhdao", "body_page": "vanbandi-detail"}
    detail_url_name = "ui_lanhdao:vanbandi_detail"
