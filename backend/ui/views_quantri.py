from .views_ui import LoginRequiredUIPageView


class QuantriDashboardView(LoginRequiredUIPageView):
    template_name = "quantri/dashboard.html"
    extra_context = {"body_role": "quantri", "body_page": "dashboard"}


class QuantriCauHinhView(LoginRequiredUIPageView):
    template_name = "quantri/cauhinh.html"
    extra_context = {"body_role": "quantri", "body_page": "cauhinh"}


class QuantriDanhMucHeThongView(LoginRequiredUIPageView):
    template_name = "quantri/danhmuchethong.html"
    extra_context = {"body_role": "quantri", "body_page": "danhmuchethong"}


class QuantriDanhMucHeThongDetailView(LoginRequiredUIPageView):
    template_name = "quantri/danhmuchethong-detail.html"
    extra_context = {"body_role": "quantri", "body_page": "danhmuc-detail"}


class QuantriHoSoLuuTruView(LoginRequiredUIPageView):
    template_name = "quantri/hosoluutru.html"
    extra_context = {"body_role": "quantri", "body_page": "hosoluutru"}


class QuantriNguoiDungView(LoginRequiredUIPageView):
    template_name = "quantri/nguoidung.html"
    extra_context = {"body_role": "quantri", "body_page": "nguoidung"}


class QuantriNguoiDungDetailView(LoginRequiredUIPageView):
    template_name = "quantri/nguoidung-detail.html"
    extra_context = {"body_role": "quantri", "body_page": "nguoidung-detail"}


class QuantriPhanQuyenView(LoginRequiredUIPageView):
    template_name = "quantri/phanquyen.html"
    extra_context = {"body_role": "quantri", "body_page": "phanquyen"}


class QuantriPhanQuyenDetailView(LoginRequiredUIPageView):
    template_name = "quantri/phanquyen-detail.html"
    extra_context = {"body_role": "quantri", "body_page": "phanquyen-detail"}


class QuantriQuanLyHeThongView(LoginRequiredUIPageView):
    template_name = "quantri/quanlyhethong.html"
    extra_context = {"body_role": "quantri", "body_page": "quanlyhethong"}


class QuantriTaiKhoanView(LoginRequiredUIPageView):
    template_name = "quantri/taikhoan.html"
    extra_context = {"body_role": "quantri", "body_page": "taikhoan"}


class QuantriThongBaoNhacViecView(LoginRequiredUIPageView):
    template_name = "quantri/thongbaonhacviec.html"
    extra_context = {"body_role": "quantri", "body_page": "thongbaonhacviec"}


class QuantriThongKeBaoCaoView(LoginRequiredUIPageView):
    template_name = "quantri/thongkebaocao.html"
    extra_context = {"body_role": "quantri", "body_page": "thongkebaocao"}
