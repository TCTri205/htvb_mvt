# accounts/api.py
from __future__ import annotations

import hashlib
import logging
import secrets
from datetime import timedelta
from typing import Any
from uuid import UUID

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
    TokenVerifyView,
)
from drf_spectacular.utils import extend_schema, OpenApiResponse

from .models import AuthSession, PasswordReset
from .serializers import (
    TokenObtainPairWithProfileSerializer,
    UserSlimSerializer,
)
from .session import SESSION_COOKIE_NAME, SESSION_COOKIE_PATH, revoke_session_for_request

logger = logging.getLogger(__name__)

User = get_user_model()

_RESET_TOKEN_HOURS = int(getattr(settings, "PASSWORD_RESET_TOKEN_HOURS", 1))
PASSWORD_RESET_TOKEN_LIFETIME = getattr(settings, "PASSWORD_RESET_TOKEN_LIFETIME", timedelta(hours=_RESET_TOKEN_HOURS))


def _hash_reset_token(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _generate_reset_token() -> str:
    return secrets.token_urlsafe(32)


def _get_client_ip(request):
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


def _get_refresh_token_lifetime() -> timedelta:
    jwt_config = getattr(settings, "SIMPLE_JWT", {})
    lifetime = jwt_config.get("REFRESH_TOKEN_LIFETIME")
    if isinstance(lifetime, timedelta):
        return lifetime
    return timedelta(days=int(getattr(settings, "JWT_REFRESH_DAYS", 7)))


class UserProfileUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ("full_name", "email", "phone")

    def validate_email(self, value):
        if not value:
            return value
        qs = User.objects.filter(email__iexact=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("Email đã được sử dụng.")
        return value


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True)
    new_password_confirm = serializers.CharField(write_only=True)

    def validate_current_password(self, value):
        user = self.context["request"].user
        if not user.check_password(value):
            raise serializers.ValidationError("Mật khẩu hiện tại không chính xác.")
        return value

    def validate(self, attrs):
        if attrs["new_password"] != attrs["new_password_confirm"]:
            raise serializers.ValidationError({"new_password_confirm": "Xác nhận mật khẩu không khớp."})
        validate_password(attrs["new_password"], user=self.context["request"].user)
        return attrs


class PasswordResetRequestSerializer(serializers.Serializer):
    username = serializers.CharField(required=False, allow_blank=True, trim_whitespace=True)
    email = serializers.EmailField(required=False, allow_blank=True)

    def validate(self, attrs):
        username = (attrs.get("username") or "").strip()
        email = (attrs.get("email") or "").strip()
        if not username and not email:
            raise serializers.ValidationError("Cần cung cấp username hoặc email để đặt lại mật khẩu.")
        return {"username": username or None, "email": email or None}


class PasswordResetConfirmSerializer(serializers.Serializer):
    token = serializers.CharField()
    new_password = serializers.CharField(write_only=True)
    new_password_confirm = serializers.CharField(write_only=True)

    def validate(self, attrs):
        if attrs["new_password"] != attrs["new_password_confirm"]:
            raise serializers.ValidationError({"new_password_confirm": "Xác nhận mật khẩu không khớp."})
        user = self.context["request"].user if self.context.get("request") else None
        validate_password(attrs["new_password"], user=user)
        return attrs


class AuthSessionSerializer(serializers.ModelSerializer):
    session_id = serializers.UUIDField(read_only=True)

    class Meta:
        model = AuthSession
        fields = ("session_id", "issued_at", "expires_at", "ip", "user_agent", "revoked")




class JWTCreateView(TokenObtainPairView):
    """
    Phát hành access/refresh token.
    Không dùng blacklist theo yêu cầu; logout = xoá token phía client.
    """
    permission_classes = [AllowAny]
    serializer_class = TokenObtainPairWithProfileSerializer

    @extend_schema(
        tags=["Auth"],
        operation_id="auth_jwt_create",
        request=TokenObtainPairWithProfileSerializer,
        responses={
            200: OpenApiResponse(
                description="JWT issued (access/refresh) + user info",
                response=TokenObtainPairWithProfileSerializer,
            ),
            401: OpenApiResponse(description="Invalid credentials"),
        },
    )
    def _create_auth_session(self, request, user):
        now = timezone.now()
        lifetime = _get_refresh_token_lifetime()
        expires_at = now + lifetime
        session = AuthSession.objects.create(
            user=user,
            issued_at=now,
            expires_at=expires_at,
            ip=_get_client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT"),
        )
        return session, lifetime

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        session, lifetime = self._create_auth_session(request, serializer.user)
        response = Response(serializer.validated_data, status=status.HTTP_200_OK)
        response.data["session_id"] = str(session.session_id)
        max_age = int(lifetime.total_seconds())
        response.set_cookie(
            SESSION_COOKIE_NAME,
            str(session.session_id),
            httponly=True,
            max_age=max_age,
            path=SESSION_COOKIE_PATH,
        )
        return response


class JWTRefreshView(TokenRefreshView):
    permission_classes = [AllowAny]

    @extend_schema(
        tags=["Auth"],
        operation_id="auth_jwt_refresh",
        responses={200: OpenApiResponse(description="New access token issued")},
    )
    def post(self, request, *args, **kwargs):
        return super().post(request, *args, **kwargs)


class JWTVerifyView(TokenVerifyView):
    permission_classes = [AllowAny]

    @extend_schema(
        tags=["Auth"],
        operation_id="auth_jwt_verify",
        responses={200: OpenApiResponse(description="Token is valid")},
    )
    def post(self, request, *args, **kwargs):
        return super().post(request, *args, **kwargs)


class MeView(APIView):
    """
    Trả thông tin user tối thiểu cho UI (đã đăng nhập).
    - Thiếu/invalid token => 401 do IsAuthenticated.
    - Không đụng tới Service/RBAC; chỉ trả profile cơ bản.
    """
    permission_classes = [IsAuthenticated]

    @extend_schema(
        tags=["Auth"],
        operation_id="auth_me",
        responses={200: UserSlimSerializer},
    )
    def get(self, request, *args: Any, **kwargs: Any) -> Response:
        return Response(UserSlimSerializer(request.user).data, status=status.HTTP_200_OK)

    @extend_schema(
        tags=["Auth"],
        operation_id="auth_me_patch",
        request=UserProfileUpdateSerializer,
        responses={200: UserSlimSerializer},
    )
    def patch(self, request, *args: Any, **kwargs: Any) -> Response:
        serializer = UserProfileUpdateSerializer(request.user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        logger.debug(
            "Profile updated via API for user=%s: %s",
            request.user.username,
            serializer.validated_data,
        )
        return Response(UserSlimSerializer(request.user).data, status=status.HTTP_200_OK)


class ChangePasswordView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        tags=["Auth"],
        operation_id="auth_change_password",
        request=ChangePasswordSerializer,
        responses={204: OpenApiResponse(description="Password changed")},
    )
    def post(self, request, *args: Any, **kwargs: Any) -> Response:
        serializer = ChangePasswordSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        user = request.user
        logger.debug("Password change requested for user=%s", user.username)
        user.set_password(serializer.validated_data["new_password"])
        user.save(update_fields=["password"])
        revoke_session_for_request(request, user)
        return Response(status=status.HTTP_204_NO_CONTENT)


class PasswordResetRequestView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(
        tags=["Auth"],
        operation_id="auth_password_reset_request",
        request=PasswordResetRequestSerializer,
        responses={
            200: OpenApiResponse(description="Password reset requested"),
            400: OpenApiResponse(description="Missing identifier"),
        },
    )
    def post(self, request, *args: Any, **kwargs: Any) -> Response:
        serializer = PasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        username = serializer.validated_data.get("username")
        email = serializer.validated_data.get("email")
        qs = User.objects.all()
        if username:
            qs = qs.filter(username__iexact=username)
        if email:
            qs = qs.filter(email__iexact=email)
        user = qs.first()
        if not user:
            return Response(
                {"detail": "Nếu tài khoản tồn tại, hướng dẫn sẽ được gửi về email đã đăng ký."},
                status=status.HTTP_200_OK,
            )
        raw_token = _generate_reset_token()
        reset = PasswordReset.objects.create(
            user=user,
            token_hash=_hash_reset_token(raw_token),
            expires_at=timezone.now() + PASSWORD_RESET_TOKEN_LIFETIME,
        )
        # TODO: Send raw_token via email in production
        return Response(
            {
                "token": raw_token,
                "reset_id": str(reset.id),
                "expires_at": reset.expires_at,
            },
            status=status.HTTP_200_OK,
        )


class PasswordResetConfirmView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(
        tags=["Auth"],
        operation_id="auth_password_reset_confirm",
        request=PasswordResetConfirmSerializer,
        responses={
            204: OpenApiResponse(description="Password reset, can log in"),
            400: OpenApiResponse(description="Invalid token or password"),
        },
    )
    def post(self, request, *args: Any, **kwargs: Any) -> Response:
        serializer = PasswordResetConfirmSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        hashed_token = _hash_reset_token(serializer.validated_data["token"])
        reset = (
            PasswordReset.objects.select_related("user")
            .filter(token_hash=hashed_token, used_at__isnull=True, expires_at__gt=timezone.now())
            .first()
        )
        if not reset:
            raise serializers.ValidationError({"token": "Token không hợp lệ hoặc đã hết hạn."})
        user = reset.user
        user.set_password(serializer.validated_data["new_password"])
        user.save(update_fields=["password"])
        reset.used_at = timezone.now()
        reset.save(update_fields=["used_at"])
        AuthSession.objects.filter(user=user, revoked=False).update(revoked=True)
        return Response(status=status.HTTP_204_NO_CONTENT)


class SessionListView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        tags=["Auth"],
        operation_id="auth_sessions_list",
        responses={200: AuthSessionSerializer(many=True)},
    )
    def get(self, request, *args: Any, **kwargs: Any) -> Response:
        sessions = AuthSession.objects.filter(user=request.user).order_by("-issued_at")
        serializer = AuthSessionSerializer(sessions, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


class SessionDetailView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        tags=["Auth"],
        operation_id="auth_sessions_revoke",
        responses={204: OpenApiResponse(description="Session revoked")},
    )
    def delete(self, request, session_id: UUID, *args: Any, **kwargs: Any) -> Response:
        session = get_object_or_404(AuthSession, session_id=session_id, user=request.user)
        if not session.revoked:
            session.revoked = True
            session.save(update_fields=["revoked"])
        return Response(status=status.HTTP_204_NO_CONTENT)
