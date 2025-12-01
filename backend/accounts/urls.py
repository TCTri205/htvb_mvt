# accounts/urls.py
from __future__ import annotations

from django.urls import path
from .api import (
    JWTCreateView,
    JWTRefreshView,
    JWTVerifyView,
    MeView,
    ChangePasswordView,
    PasswordResetRequestView,
    PasswordResetConfirmView,
    SessionListView,
    SessionDetailView,
)
from .views_auth import LogoutView

app_name = "accounts"

urlpatterns = [
    # Dùng hậu tố "/" chuẩn DRF; nếu client gọi không có "/", Django sẽ redirect (APPEND_SLASH=True)
    path("auth/jwt/create/", JWTCreateView.as_view(), name="jwt-create"),
    path("auth/login/", JWTCreateView.as_view(), name="auth-login"),
    path("auth/jwt/refresh/", JWTRefreshView.as_view(), name="jwt-refresh"),
    path("auth/refresh/", JWTRefreshView.as_view(), name="auth-refresh"),
    path("auth/jwt/verify/", JWTVerifyView.as_view(), name="jwt-verify"),
    path("auth/me/", MeView.as_view(), name="auth-me"),
    path("auth/logout/", LogoutView.as_view(), name="auth-logout"),
    path("auth/change-password/", ChangePasswordView.as_view(), name="auth-change-password"),
    path("auth/password-reset/request/", PasswordResetRequestView.as_view(), name="auth-password-reset-request"),
    path("auth/password-reset/confirm/", PasswordResetConfirmView.as_view(), name="auth-password-reset-confirm"),
    path("auth/sessions/", SessionListView.as_view(), name="auth-sessions"),
    path("auth/sessions/<uuid:session_id>/", SessionDetailView.as_view(), name="auth-session-detail"),
]
