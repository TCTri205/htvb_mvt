from django.shortcuts import redirect
from django.urls import path

from . import views_lanhdao as v
from .views_documents_inbound import InboundDetailView, LegacyDocumentDetailPageView
from cases.views_ui import CaseCreateView, CaseDetailView
from documents.views_ui import OutboundDetailView

app_name = "ui_lanhdao"


def _legacy_html_redirect(role: str):
    def view(request, path):
        name = path.split("/")[-1]
        if not name:
            return redirect(f"/{role}/")
        return redirect(f"/{role}/{name}")
    return view

urlpatterns = [
    path("dashboard.html", v.LanhdaoDashboardView.as_view()),
    path("dashboard/", v.LanhdaoDashboardView.as_view(), name="dashboard"),
    path("baocaothongke.html", v.LanhdaoBaoCaoThongKeView.as_view()),
    path("baocaothongke/", v.LanhdaoBaoCaoThongKeView.as_view(), name="baocaothongke"),
    path("danhmuc.html", v.LanhdaoDanhMucView.as_view()),
    path("danhmuc/", v.LanhdaoDanhMucView.as_view(), name="danhmuc"),
    path("hosocongviec.html", v.LanhdaoHoSoCongViecListView.as_view()),
    path("hosocongviec/", v.LanhdaoHoSoCongViecListView.as_view(), name="hosocongviec_list"),
    path(
        "hosocongviec-detail/",
        v.LanhdaoHoSoCongViecDetailView.as_view(),
        name="hosocongviec_detail",
    ),
    path("hosocongviec-detail.html", v.LanhdaoHoSoCongViecDetailView.as_view()),
    path(
        "hosocongviec-taomoi/",
        CaseCreateView.as_view(),
        name="hosocongviec_taomoi",
    ),
    path("hosocongviec-taomoi.html", CaseCreateView.as_view()),
    path("taikhoan.html", v.LanhdaoTaiKhoanView.as_view()),
    path("taikhoan/", v.LanhdaoTaiKhoanView.as_view(), name="taikhoan"),
    path("thongbaonhacviec.html", v.LanhdaoThongBaoNhacViecView.as_view()),
    path("thongbaonhacviec/", v.LanhdaoThongBaoNhacViecView.as_view(), name="thongbaonhacviec"),
    path("vanbanden.html", v.LanhdaoVanBanDenListView.as_view()),
    path("vanbanden/", v.LanhdaoVanBanDenListView.as_view(), name="vanbanden_list"),
    path(
        "vanbanden-detail.html",
        LegacyDocumentDetailPageView.as_view(
            template_name="lanhdao/vanbanden-detail.html",
            extra_context={"body_role": "lanhdao", "body_page": "vanbanden-detail"},
            detail_url_name="ui_lanhdao:vanbanden_detail",
        ),
    ),
    path("vanbanden/<int:pk>/", InboundDetailView.as_view(), name="vanbanden_detail"),
    path("vanbandi.html", v.LanhdaoVanBanDiListView.as_view()),
    path("vanbandi/", v.LanhdaoVanBanDiListView.as_view(), name="vanbandi_list"),
    path("vanbandi-detail.html", v.LanhdaoVanBanDiDetailView.as_view()),
    path("vanbandi/<int:pk>/", OutboundDetailView.as_view(), name="vanbandi_detail"),
    path("hosocongviec/<int:pk>/", CaseDetailView.as_view(), name="hosocongviec_detail"),
    path("lanhdao/<path:path>.html", _legacy_html_redirect("lanhdao")),
]
