# workflow/middleware/client_ip.py
from typing import Optional
from django.http import HttpRequest, HttpResponse
from workflow.services.request_context import set_client_ip, reset_client_ip

def _extract_ip(request: HttpRequest) -> Optional[str]:
    """
    Ưu tiên:
      - X-Forwarded-For: lấy IP đầu tiên (left-most)
      - X-Real-IP
      - REMOTE_ADDR
    """
    xff = request.META.get("HTTP_X_FORWARDED_FOR")
    if xff:
        # ví dụ: "203.0.113.5, 10.0.0.1"
        ip = xff.split(",")[0].strip()
        if ip:
            return ip

    xri = request.META.get("HTTP_X_REAL_IP")
    if xri:
        return xri.strip() or None

    return request.META.get("REMOTE_ADDR")

class ClientIPMiddleware:
    """
    Middleware bơm client IP vào contextvars để Service/audit_log lấy ra.
    """
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request: HttpRequest) -> HttpResponse:
        ip = _extract_ip(request)
        # Tránh Pylance báo lỗi thuộc tính động trên HttpRequest
        setattr(request, "client_ip", ip)  # tiện debug / log request-level

        token = set_client_ip(ip)
        try:
            response = self.get_response(request)
        finally:
            reset_client_ip(token)
        return response
