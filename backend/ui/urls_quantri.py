from django.shortcuts import redirect
from django.urls import path

from . import views_quantri as v

app_name = "ui_quantri"


def _legacy_html_redirect(role: str):
    def view(request, path):
        name = path.split("/")[-1]
        if not name:
            return redirect(f"/{role}/")
        return redirect(f"/{role}/{name}")
    return view

urlpatterns = [
    path("dashboard.html", v.QuantriDashboardView.as_view()),
    path("dashboard/", v.QuantriDashboardView.as_view(), name="dashboard"),
    path("cauhinh.html", v.QuantriCauHinhView.as_view()),
    path("cauhinh/", v.QuantriCauHinhView.as_view(), name="cauhinh"),
    path("danhmuchethong.html", v.QuantriDanhMucHeThongView.as_view()),
    path("danhmuchethong/", v.QuantriDanhMucHeThongView.as_view(), name="danhmuchethong"),
    path(
        "danhmuchethong-detail/",
        v.QuantriDanhMucHeThongDetailView.as_view(),
        name="danhmuchethong_detail",
    ),
    path("danhmuchethong-detail.html", v.QuantriDanhMucHeThongDetailView.as_view()),
    path("hosoluutru.html", v.QuantriHoSoLuuTruView.as_view()),
    path("hosoluutru/", v.QuantriHoSoLuuTruView.as_view(), name="hosoluutru"),
    path("nguoidung.html", v.QuantriNguoiDungView.as_view()),
    path("nguoidung/", v.QuantriNguoiDungView.as_view(), name="nguoidung"),
    path("nguoidung-detail.html", v.QuantriNguoiDungDetailView.as_view()),
    path("nguoidung-detail/", v.QuantriNguoiDungDetailView.as_view(), name="nguoidung_detail"),
    path("phanquyen.html", v.QuantriPhanQuyenView.as_view()),
    path("phanquyen/", v.QuantriPhanQuyenView.as_view(), name="phanquyen"),
    path("phanquyen-detail.html", v.QuantriPhanQuyenDetailView.as_view()),
    path("phanquyen-detail/", v.QuantriPhanQuyenDetailView.as_view(), name="phanquyen_detail"),
    path("quanlyhethong.html", v.QuantriQuanLyHeThongView.as_view()),
    path("quanlyhethong/", v.QuantriQuanLyHeThongView.as_view(), name="quanlyhethong"),
    path("taikhoan.html", v.QuantriTaiKhoanView.as_view()),
    path("taikhoan/", v.QuantriTaiKhoanView.as_view(), name="taikhoan"),
    path("thongbaonhacviec.html", v.QuantriThongBaoNhacViecView.as_view()),
    path(
        "thongbaonhacviec/",
        v.QuantriThongBaoNhacViecView.as_view(),
        name="thongbaonhacviec",
    ),
    path("thongkebaocao.html", v.QuantriThongKeBaoCaoView.as_view()),
    path("thongkebaocao/", v.QuantriThongKeBaoCaoView.as_view(), name="thongkebaocao"),
    path("quantri/<path:path>.html", _legacy_html_redirect("quantri")),
]
