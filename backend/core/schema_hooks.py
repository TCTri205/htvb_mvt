# # core/schema_hooks.py
# from __future__ import annotations
# from typing import Any, Dict
# from django.conf import settings

# def ensure_servers(result: Dict[str, Any], generator, request, public):
#     """
#     Đảm bảo 'servers' có mặt trong spec trả về từ /schema/
#     nếu đã cấu hình SPECTACULAR_SETTINGS['SERVERS'].
#     """
#     try:
#         servers = settings.SPECTACULAR_SETTINGS.get("SERVERS")
#     except Exception:
#         servers = None

#     if servers and not result.get("servers"):
#         result["servers"] = servers
#     return result

# core/schema_hooks.py
from __future__ import annotations
from typing import Any, Dict, List
from django.conf import settings

def ensure_servers(result: Dict[str, Any], generator: Any, request: Any, public: bool) -> Dict[str, Any]:
    """
    DRF Spectacular post-processing hook.
    Đảm bảo khóa 'servers' luôn có mặt trong OpenAPI output nếu đã cấu hình
    SPECTACULAR_SETTINGS['SERVERS'].
    - Áp dụng cho cả JSON & YAML.
    - Idempotent (chạy nhiều lần vẫn cho cùng kết quả).
    """
    try:
        servers_cfg = settings.SPECTACULAR_SETTINGS.get("SERVERS")  # type: ignore[attr-defined]
    except Exception:
        servers_cfg = None

    if isinstance(result, dict) and servers_cfg:
        # Nếu chưa có 'servers' hoặc đang rỗng -> set theo cấu hình
        if not isinstance(result.get("servers"), list) or not result.get("servers"):
            result["servers"] = servers_cfg  # dạng: [{"url": "...", "description": "..."}]
    return result
