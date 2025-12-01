# workflow/services/request_context.py
import contextvars
from typing import Optional

_client_ip_var: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar(
    "client_ip", default=None
)

def set_client_ip(ip: Optional[str]):
    """Set IP vào context và trả về token để reset về sau (ASGI-safe)."""
    return _client_ip_var.set(ip)

def reset_client_ip(token):
    """Khôi phục context cũ (an toàn trong finally)."""
    try:
        _client_ip_var.reset(token)
    except LookupError:
        pass

def get_client_ip() -> Optional[str]:
    """Lấy IP hiện tại từ context (đã bơm bởi middleware)."""
    return _client_ip_var.get()
