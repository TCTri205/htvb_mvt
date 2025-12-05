from django.shortcuts import redirect
from django.urls import path

from . import views_chuyenvien as v
from .views_documents_inbound import InboundDetailView, LegacyDocumentDetailPageView
from cases.views_ui import CaseDetailView, ChuyenvienCaseCreateView
from documents.views_ui import OutboundDetailView, OutboundDraftView

app_name = "ui_chuyenvien"


def _legacy_html_redirect(role: str):
    def view(request, path):
        name = path.split("/")[-1]
        if not name:
            return redirect(f"/{role}/")
        return redirect(f"/{role}/{name}")
    return view

urlpatterns = [
    path("dashboard.html", v.ChuyenvienDashboardView.as_view()),
    path("dashboard/", v.ChuyenvienDashboardView.as_view(), name="dashboard"),
    path("baocaothongke.html", v.ChuyenvienBaoCaoThongKeView.as_view()),
    path("baocaothongke/", v.ChuyenvienBaoCaoThongKeView.as_view(), name="baocaothongke"),
    path("danhmuc.html", v.ChuyenvienDanhMucView.as_view()),
    path("danhmuc/", v.ChuyenvienDanhMucView.as_view(), name="danhmuc"),
    path("hosocongviec.html", v.ChuyenvienHoSoCongViecListView.as_view()),
    path("hosocongviec/", v.ChuyenvienHoSoCongViecListView.as_view(), name="hosocongviec_list"),
    path(
        "hosocongviec-detail.html",
        LegacyDocumentDetailPageView.as_view(
            template_name="chuyenvien/hosocongviec-detail.html",
            extra_context={"body_role": "chuyenvien", "body_page": "hosocongviec-detail"},
            detail_url_name="ui_chuyenvien:hosocongviec_detail",
        ),
    ),
    path("hosocongviec/<int:pk>/", CaseDetailView.as_view(), name="hosocongviec_detail"),
    path("hosocongviec-taomoi.html", ChuyenvienCaseCreateView.as_view()),
    path("hosocongviec-taomoi/", ChuyenvienCaseCreateView.as_view(), name="hosocongviec_taomoi"),
    path("taikhoan.html", v.ChuyenvienTaiKhoanView.as_view()),
    path("taikhoan/", v.ChuyenvienTaiKhoanView.as_view(), name="taikhoan"),
    path("thongbaonhacviec.html", v.ChuyenvienThongBaoNhacViecView.as_view()),
    path("thongbaonhacviec/", v.ChuyenvienThongBaoNhacViecView.as_view(), name="thongbaonhacviec"),
    path("vanbanden.html", v.ChuyenvienVanBanDenListView.as_view()),
    path("vanbanden/", v.ChuyenvienVanBanDenListView.as_view(), name="vanbanden_list"),
    path(
        "vanbanden-detail.html",
        LegacyDocumentDetailPageView.as_view(
            template_name="chuyenvien/vanbanden-detail.html",
            extra_context={"body_role": "chuyenvien", "body_page": "vanbanden-detail"},
            detail_url_name="ui_chuyenvien:vanbanden_detail",
        ),
    ),
    path("vanbanden/<int:pk>/", InboundDetailView.as_view(), name="vanbanden_detail"),
    path("vanbandi.html", v.ChuyenvienVanBanDiListView.as_view()),
    path("vanbandi/", v.ChuyenvienVanBanDiListView.as_view(), name="vanbandi_list"),
    path("vanbandi-detail.html", v.ChuyenvienVanBanDiDetailView.as_view()),
    path("vanbandi/<int:pk>/", OutboundDetailView.as_view(), name="vanbandi_detail"),
    path("vanbandi-taomoi.html", OutboundDraftView.as_view()),
    path("vanbandi-taomoi/", OutboundDraftView.as_view(), name="vanbandi_taomoi"),
    path("chuyenvien/<path:path>.html", _legacy_html_redirect("chuyenvien")),
]
