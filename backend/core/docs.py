# core/docs.py
from __future__ import annotations

from typing import Optional, Sequence, Type, Any, Dict, cast
from django.conf import settings
from django.urls import path
from rest_framework import serializers as drf_serializers
from rest_framework.response import Response

# drf-spectacular
from drf_spectacular.utils import (
    extend_schema,
    inline_serializer,
    OpenApiResponse,
    OpenApiExample,
)
from drf_spectacular.views import (
    SpectacularAPIView,
    SpectacularSwaggerView,
    SpectacularRedocView,
)

# Schema components dùng chung (đã đặt tên component ở common/schema.py)
from common.schema import APIError, StatusOnlyResponse, PublishResponse


# ========================================================================
# DEFAULT ERROR RESPONSES (áp dụng rộng rãi để docs thể hiện 401/403/... )
# ========================================================================
DEFAULT_ERROR_RESPONSES: Dict[int, OpenApiResponse] = {
    400: OpenApiResponse(response=APIError, description="Yêu cầu không hợp lệ"),
    401: OpenApiResponse(response=APIError, description="Chưa xác thực (thiếu/invalid Bearer)"),
    403: OpenApiResponse(response=APIError, description="Không đủ quyền"),
    404: OpenApiResponse(response=APIError, description="Không tìm thấy"),
    409: OpenApiResponse(response=APIError, description="Xung đột trạng thái/nghiệp vụ"),
}


# ========================================================================
# Helpers: schema phân trang PageNumberPagination (CACHE THEO TÊN)
# - Ta cache & trả về Serializer CLASS (Type[Serializer]); dùng cast để Pylance hài lòng
# ========================================================================
_PAGE_CACHE: Dict[str, Type[drf_serializers.Serializer]] = {}


def paged_of(name: str, item_serializer: Type[drf_serializers.Serializer]) -> Type[drf_serializers.Serializer]:
    """
    Tạo (và cache) serializer phân trang:
      {
        items: item[],
        total_items: int,
        total_pages: int,
        page: int,
        page_size: int,
      }

    - Cache theo 'name' để mọi nơi gọi cùng tên nhận cùng 1 CLASS,
      tránh cảnh báo 'Encountered 2 components with identical names ...'.
    """
    if name in _PAGE_CACHE:
        return _PAGE_CACHE[name]

    tmp = inline_serializer(
        name=name,
        fields={
            "items": item_serializer(many=True),
            "total_items": drf_serializers.IntegerField(),
            "total_pages": drf_serializers.IntegerField(),
            "page": drf_serializers.IntegerField(),
            "page_size": drf_serializers.IntegerField(),
        },
    )
    ser_cls = cast(Type[drf_serializers.Serializer], tmp)
    _PAGE_CACHE[name] = ser_cls
    return ser_cls


# ========================================================================
# Decorators: List / Retrieve / Create / Update / Delete / Action
# ========================================================================
def doc_list(
    *,
    item_serializer: Type[drf_serializers.Serializer],
    tag: str,
    operation_id: str,
    summary: str,
    examples: Optional[Sequence[OpenApiExample]] = None,
):
    """
    Docs cho list (GET collection) với schema phân trang chuẩn.
    Lưu ý: luôn dùng chung tên 'Page_{ItemName}' để đồng nhất component.
    """
    item_name = getattr(item_serializer, "__name__", "Item")
    base_name = item_name.replace("Serializer", "")
    PageSer = paged_of(f"Page_{base_name}", item_serializer)
    return extend_schema(
        tags=[tag],
        operation_id=operation_id,
        summary=summary,
        responses={200: PageSer, **DEFAULT_ERROR_RESPONSES},
        examples=examples or [],
    )


def doc_retrieve(
    *,
    detail_serializer: Type[drf_serializers.Serializer],
    tag: str,
    operation_id: str,
    summary: str,
    examples: Optional[Sequence[OpenApiExample]] = None,
):
    """Docs cho retrieve (GET detail)."""
    return extend_schema(
        tags=[tag],
        operation_id=operation_id,
        summary=summary,
        responses={200: detail_serializer, **DEFAULT_ERROR_RESPONSES},
        examples=examples or [],
    )


def doc_create(
    *,
    request_serializer: Type[drf_serializers.Serializer],
    response_serializer: Type[drf_serializers.Serializer],
    tag: str,
    operation_id: str,
    summary: str,
    examples: Optional[Sequence[OpenApiExample]] = None,
):
    """Docs cho create (POST collection) – trả 201."""
    return extend_schema(
        tags=[tag],
        operation_id=operation_id,
        summary=summary,
        request=request_serializer,
        responses={201: response_serializer, **DEFAULT_ERROR_RESPONSES},
        examples=examples or [],
    )


def doc_update(
    *,
    request_serializer: Type[drf_serializers.Serializer],
    response_serializer: Type[drf_serializers.Serializer],
    tag: str,
    operation_id: str,
    summary: str,
    examples: Optional[Sequence[OpenApiExample]] = None,
):
    """Docs cho update/partial_update (PUT/PATCH detail) – trả 200."""
    return extend_schema(
        tags=[tag],
        operation_id=operation_id,
        summary=summary,
        request=request_serializer,
        responses={200: response_serializer, **DEFAULT_ERROR_RESPONSES},
        examples=examples or [],
    )


def doc_delete(
    *,
    tag: str,
    operation_id: str,
    summary: str,
    examples: Optional[Sequence[OpenApiExample]] = None,
):
    """Docs cho delete (DELETE detail) – trả 204."""
    return extend_schema(
        tags=[tag],
        operation_id=operation_id,
        summary=summary,
        responses={204: None, **DEFAULT_ERROR_RESPONSES},
        examples=examples or [],
    )


def doc_action_status(
    *,
    request_serializer: Optional[Type[drf_serializers.Serializer]] = None,
    tag: str,
    operation_id: str,
    summary: str,
    examples: Optional[Sequence[OpenApiExample]] = None,
):
    """
    Docs cho action trả về StatusOnlyResponse (200).
    Dùng cho các chuyển trạng thái/phi tác vụ đơn giản (assign/start/complete/...).
    """
    return extend_schema(
        tags=[tag],
        operation_id=operation_id,
        summary=summary,
        request=request_serializer,
        responses={200: StatusOnlyResponse, **DEFAULT_ERROR_RESPONSES},
        examples=examples or [],
    )


def doc_action_publish(
    *,
    request_serializer: Optional[Type[drf_serializers.Serializer]] = None,
    tag: str,
    operation_id: str,
    summary: str,
    examples: Optional[Sequence[OpenApiExample]] = None,
):
    """Docs cho action 'phát hành' trả về PublishResponse (200)."""
    return extend_schema(
        tags=[tag],
        operation_id=operation_id,
        summary=summary,
        request=request_serializer,
        responses={200: PublishResponse, **DEFAULT_ERROR_RESPONSES},
        examples=examples or [],
    )


# ========================================================================
# Schema view: luôn chèn 'servers' (nếu đã cấu hình) vào schema
# ========================================================================
@extend_schema(exclude=True)  # loại khỏi schema-discovery để tránh cảnh báo đoán serializer
class SchemaViewWithServers(SpectacularAPIView):
    """
    Bổ sung 'servers' vào spec nếu đã cấu hình SPECTACULAR_SETTINGS['SERVERS'].
    Can thiệp tại get_schema để chắc chắn xuất hiện trong JSON/YAML.
    """
    schema = None  # tránh renderer cố introspect serializer

    def get_schema(self, request, *args, **kwargs):  # type: ignore[override]
        schema: Any = super().get_schema(request, *args, **kwargs)  # type: ignore[attr-defined]
        try:
            servers = settings.SPECTACULAR_SETTINGS.get("SERVERS")
        except Exception:
            servers = None
        if servers and isinstance(schema, dict):
            schema["servers"] = servers
        return schema

    # Bảo hiểm cho renderer truy cập resp.data
    def get(self, request, *args, **kwargs):
        resp: Response = super().get(request, *args, **kwargs)
        try:
            data = resp.data  # type: ignore[attr-defined]
        except Exception:
            return resp
        try:
            servers = settings.SPECTACULAR_SETTINGS.get("SERVERS")
        except Exception:
            servers = None
        if isinstance(data, dict) and servers:
            data["servers"] = servers
            resp.data = data
        return resp


# ========================================================================
# Urlpatterns để mount Schema + Swagger UI + Redoc
# - Giữ route versioned /api/v1/ (name="schema")
# - Thêm alias legacy /api/... để các test/consumer cũ vẫn dùng được
# ========================================================================
urlpatterns = [
    # Versioned
    path(
        "api/v1/schema/",
        SchemaViewWithServers.as_view(api_version=settings.SPECTACULAR_SETTINGS.get("VERSION", "1.0.0")),
        name="schema",
    ),
    path("api/v1/docs/",  SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-ui"),
    path("api/v1/redoc/", SpectacularRedocView.as_view(url_name="schema"),   name="redoc"),

    # Legacy aliases (đáp ứng tests gọi /api/schema/)
    path(
        "api/schema/",
        SchemaViewWithServers.as_view(api_version=settings.SPECTACULAR_SETTINGS.get("VERSION", "1.0.0")),
        name="schema-legacy",
    ),
    path("api/docs/",  SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-ui-legacy"),
    path("api/redoc/", SpectacularRedocView.as_view(url_name="schema"),   name="redoc-legacy"),
]
