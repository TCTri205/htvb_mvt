# accounts/views_auth.py
from typing import Optional

from django.contrib.auth.models import AnonymousUser
from rest_framework import serializers as drf_serializers
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from drf_spectacular.utils import extend_schema, OpenApiExample, OpenApiResponse
from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
    TokenVerifyView,
)
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from common.schema import APIError

from .session import SESSION_COOKIE_NAME, revoke_session_for_request


# =========================
# Serializers cho tài liệu
# =========================

class JWTCreateRequestSerializer(drf_serializers.Serializer):
    username = drf_serializers.CharField()
    password = drf_serializers.CharField()


class JWTCreateResponseSerializer(drf_serializers.Serializer):
    access = drf_serializers.CharField()
    refresh = drf_serializers.CharField()


class JWTRefreshRequestSerializer(drf_serializers.Serializer):
    refresh = drf_serializers.CharField()


class JWTRefreshResponseSerializer(drf_serializers.Serializer):
    access = drf_serializers.CharField()


class JWTVerifyRequestSerializer(drf_serializers.Serializer):
    token = drf_serializers.CharField()


ROLE_REDIRECT = {
    "CHUYEN_VIEN": "chuyenvien/dashboard",
    "CV": "chuyenvien/dashboard",
    "LANH_DAO": "lanhdao/dashboard",
    "LD": "lanhdao/dashboard",
    "VAN_THU": "vanthu/dashboard",
    "VT": "vanthu/dashboard",
    "QUAN_TRI": "quantri/dashboard",
    "QT": "quantri/dashboard",
}


def _normalize_role(raw: Optional[str]) -> Optional[str]:
    if not raw:
        return None
    key = str(raw).strip().upper()
    return key if key in ROLE_REDIRECT else None


class MeSerializer(drf_serializers.Serializer):
    id = drf_serializers.IntegerField()
    username = drf_serializers.CharField(allow_null=True)
    full_name = drf_serializers.CharField(allow_null=True, required=False)
    role = drf_serializers.CharField(allow_null=True, required=False)
    default_redirect = drf_serializers.CharField(allow_null=True, required=False)


# =======================================
# TokenObtainPair với claim bổ sung nhẹ
# =======================================

class TokenObtainPairWithProfileSerializer(TokenObtainPairSerializer):
    """
    Gắn thêm claim nhẹ vào access token: username, full_name
    (không thay đổi response body: vẫn {access, refresh})
    """
    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)

        full_name: Optional[str] = None
        if hasattr(user, "full_name") and getattr(user, "full_name"):
            full_name = getattr(user, "full_name")
        elif hasattr(user, "get_full_name"):
            try:
                _fn = user.get_full_name()
                full_name = _fn if _fn else None
            except Exception:
                full_name = None

        token["username"] = getattr(user, "username", None)
        token["full_name"] = full_name
        return token


# ===========
# Auth Views
# ===========

class JWTCreateView(TokenObtainPairView):
    """
    POST /api/v1/auth/jwt/create
    """
    permission_classes = [AllowAny]
    serializer_class = TokenObtainPairWithProfileSerializer

    @extend_schema(
        tags=["Auth"],
        operation_id="auth_jwt_create",
        summary="Lấy access/refresh token",
        request=JWTCreateRequestSerializer,
        responses={
            200: JWTCreateResponseSerializer,
            400: OpenApiResponse(APIError, description="Yêu cầu không hợp lệ"),
            401: OpenApiResponse(APIError, description="Sai thông tin đăng nhập"),
        },
        examples=[
            OpenApiExample(
                "Đăng nhập mẫu",
                value={"username": "cv01", "password": "secret"},
                request_only=True,
            )
        ],
    )
    def post(self, request, *args, **kwargs):
        return super().post(request, *args, **kwargs)


class JWTRefreshView(TokenRefreshView):
    """
    POST /api/v1/auth/jwt/refresh
    """
    permission_classes = [AllowAny]

    @extend_schema(
        tags=["Auth"],
        operation_id="auth_jwt_refresh",
        summary="Đổi access token bằng refresh",
        request=JWTRefreshRequestSerializer,
        responses={
            200: JWTRefreshResponseSerializer,
            400: OpenApiResponse(APIError, description="Thiếu/format refresh token không hợp lệ"),
            401: OpenApiResponse(APIError, description="Refresh token hết hạn/không hợp lệ"),
        },
    )
    def post(self, request, *args, **kwargs):
        return super().post(request, *args, **kwargs)


class JWTVerifyView(TokenVerifyView):
    """
    POST /api/v1/auth/jwt/verify
    """
    permission_classes = [AllowAny]

    @extend_schema(
        tags=["Auth"],
        operation_id="auth_jwt_verify",
        summary="Kiểm tra token hợp lệ",
        request=JWTVerifyRequestSerializer,
        responses={
            200: None,
            401: OpenApiResponse(APIError, description="Token không hợp lệ/hết hạn"),
        },
    )
    def post(self, request, *args, **kwargs):
        return super().post(request, *args, **kwargs)


class MeView(APIView):
    """
    GET /api/v1/auth/me
    Trả thông tin người dùng tối thiểu cho UI.
    """
    permission_classes = [IsAuthenticated]

    @extend_schema(
        tags=["Auth"],
        operation_id="auth_me",
        summary="Thông tin người dùng hiện tại",
        responses={
            200: MeSerializer,
            401: OpenApiResponse(APIError, description="Chưa xác thực"),
        },
    )
    def get(self, request):
        user = request.user
        if isinstance(user, AnonymousUser):
            # Trường hợp phòng vệ (dù IsAuthenticated đã chặn)
            return Response({"detail": "Chưa xác thực"}, status=401)

        # Suy luận full_name an toàn
        full_name: Optional[str] = None
        if hasattr(user, "full_name") and getattr(user, "full_name"):
            full_name = getattr(user, "full_name")
        elif hasattr(user, "get_full_name"):
            try:
                _fn = user.get_full_name()
                full_name = _fn if _fn else None
            except Exception:
                full_name = None

        # Suy luận role: ưu tiên thuộc tính 'role', sau đó nhóm đầu tiên (nếu có)
        role: Optional[str] = getattr(user, "role", None)
        if not role:
            try:
                grp = user.groups.first()
                if grp:
                    role = grp.name
            except Exception:
                role = None

        normalized_role = _normalize_role(role) or "CHUYEN_VIEN"
        data = {
            "id": user.id,
            "username": getattr(user, "username", None),
            "full_name": full_name,
            "role": normalized_role,
            "default_redirect": ROLE_REDIRECT.get(normalized_role),
        }
        return Response(data)


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        tags=["Auth"],
        operation_id="auth_logout",
        summary="Đăng xuất giao diện",
        responses={204: None},
    )
    def post(self, request):
        revoke_session_for_request(request, request.user)
        response = Response(status=204)
        response.delete_cookie("htvb_access", path="/")
        response.delete_cookie(SESSION_COOKIE_NAME, path="/")
        return response
