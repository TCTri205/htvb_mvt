from django.urls import path

from django.shortcuts import redirect
from . import views_vanthu as v
from .views_documents_inbound import InboundDetailView, LegacyDocumentDetailPageView
from cases.views_ui import CaseDetailView, VanthuCaseCreateView
from documents.views_ui import OutboundDetailView

app_name = "ui_vanthu"


def _legacy_html_redirect(role: str):
    def view(request, path):
        name = path.split("/")[-1]
        if not name:
            return redirect(f"/{role}/")
        return redirect(f"/{role}/{name}")
    return view

urlpatterns = [
    path("dashboard.html", v.VanthuDashboardView.as_view()),
    path("dashboard/", v.VanthuDashboardView.as_view(), name="dashboard"),
    path("baocaothongke.html", v.VanthuBaoCaoThongKeView.as_view()),
    path("baocaothongke/", v.VanthuBaoCaoThongKeView.as_view(), name="baocaothongke"),
    path("danhmuc.html", v.VanthuDanhMucView.as_view()),
    path("danhmuc/", v.VanthuDanhMucView.as_view(), name="danhmuc"),
    path("hosocongviec.html", v.VanthuHoSoCongViecListView.as_view()),
    path("hosocongviec/", v.VanthuHoSoCongViecListView.as_view(), name="hosocongviec_list"),
    path("hosocongviec-detail.html", v.VanthuHoSoCongViecDetailView.as_view()),
    path("hosocongviec-detail/", v.VanthuHoSoCongViecDetailView.as_view(), name="hosocongviec_detail"),
    path("sodangky.html", v.VanthuSoDangKyView.as_view()),
    path("sodangky/", v.VanthuSoDangKyView.as_view(), name="sodangky"),
    path(
        "sodangky/<int:register_id>/",
        v.VanthuRegisterBookDetailView.as_view(),
        name="sodangky_detail",
    ),
    path("taikhoan.html", v.VanthuTaiKhoanView.as_view()),
    path("taikhoan/", v.VanthuTaiKhoanView.as_view(), name="taikhoan"),
    path("thongbaonhacviec.html", v.VanthuThongBaoNhacViecView.as_view()),
    path("thongbaonhacviec/", v.VanthuThongBaoNhacViecView.as_view(), name="thongbaonhacviec"),
    path("vanbanden.html", v.VanthuVanBanDenListView.as_view()),
    path("vanbanden/", v.VanthuVanBanDenListView.as_view(), name="vanbanden_list"),
    path(
        "vanbanden-detail.html",
        LegacyDocumentDetailPageView.as_view(
            template_name="vanthu/vanbanden-detail.html",
            extra_context={"body_role": "vanthu", "body_page": "vanbanden-detail"},
            detail_url_name="ui_vanthu:vanbanden_detail",
        ),
    ),
    path("vanbanden/<int:pk>/", InboundDetailView.as_view(), name="vanbanden_detail"),
    path("vanbanden-tiepnhan.html", v.VanthuVanBanDenTiepNhanView.as_view()),
    path("vanbanden-tiepnhan/", v.VanthuVanBanDenTiepNhanView.as_view(), name="vanbanden_tiepnhan"),
    path("vanbanden-export.html", v.VanthuVanBanDenExportView.as_view()),
    path("vanbanden-export/", v.VanthuVanBanDenExportView.as_view(), name="vanbanden_export"),
    path("vanbandi.html", v.VanthuVanBanDiListView.as_view()),
    path("vanbandi/", v.VanthuVanBanDiListView.as_view(), name="vanbandi_list"),
    path("vanbandi-detail.html", v.VanthuVanBanDiDetailView.as_view()),
    path("vanbandi/<int:pk>/", OutboundDetailView.as_view(), name="vanbandi_detail"),
    path("vanbandi-taomoi.html", v.VanthuVanBanDiCreateView.as_view()),
    path("vanbandi-taomoi/", v.VanthuVanBanDiCreateView.as_view(), name="vanbandi_create"),
    path("hosocongviec-taomoi.html", VanthuCaseCreateView.as_view()),
    path("hosocongviec-taomoi/", VanthuCaseCreateView.as_view(), name="hosocongviec_create"),
    path("hosocongviec/<int:pk>/", CaseDetailView.as_view(), name="hosocongviec_detail"),
    path("vanthu/<path:path>.html", _legacy_html_redirect("vanthu")),
]
