from __future__ import annotations

import re
from typing import Iterable
from urllib.parse import urlparse

from django.http import JsonResponse

from corsheaders.conf import conf as cors_conf
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import AuthenticationFailed, InvalidToken


class ContractCorsMiddleware:
    """
    Chặn Origin không nằm trong whitelist và trả về JSON 403 với code chuẩn.
    Đặt middleware này trước CorsMiddleware để fail-fast.
    """

    def __init__(self, get_response):
        self.get_response = get_response
        self._regexes = tuple(self._compile_regexes(cors_conf.CORS_ALLOWED_ORIGIN_REGEXES))

    def __call__(self, request):
        origin = request.META.get("HTTP_ORIGIN")
        if not origin:
            return self.get_response(request)

        if self._is_same_origin(request, origin) or self._is_allowed(origin):
            return self.get_response(request)

        path = request.path or ""
        if path.startswith("/api/"):
            data = {
                "detail": "Origin không được phép truy cập API.",
                "code": "CORS_FORBIDDEN",
            }
            return JsonResponse(data, status=403)

        return self.get_response(request)

    def _is_same_origin(self, request, origin: str) -> bool:
        host_value = request.get_host()
        if not host_value:
            return False
        scheme = getattr(request, "scheme", "http")
        expected = f"{scheme}://{host_value}".rstrip("/")
        if origin.rstrip("/") == expected:
            return True
        return self._is_loopback_alias(origin, scheme, host_value)

    def _is_allowed(self, origin: str) -> bool:
        if cors_conf.CORS_ALLOW_ALL_ORIGINS:
            return True
        if origin in cors_conf.CORS_ALLOWED_ORIGINS:
            return True
        clean_origin = origin.rstrip("/")
        if clean_origin in cors_conf.CORS_ALLOWED_ORIGINS:
            return True
        for regex in self._regexes:
            if regex.match(origin):
                return True
        return False

    @staticmethod
    def _compile_regexes(patterns: Iterable[object]):
        out = []
        for pattern in patterns:
            if hasattr(pattern, "match"):
                out.append(pattern)
            elif isinstance(pattern, str):
                try:
                    out.append(re.compile(pattern))
                except re.error:
                    continue
        return out

    _loopback_aliases = {"127.0.0.1", "localhost"}

    def _is_loopback_alias(self, origin: str, scheme: str, host_value: str) -> bool:
        parsed = urlparse(origin)
        origin_scheme = parsed.scheme or scheme
        origin_host = parsed.hostname
        if not origin_host:
            return False
        origin_port = parsed.port or self._default_port(origin_scheme)
        req_host, req_port = self._split_host(host_value, scheme)
        if req_host is None or req_port is None:
            return False
        if origin_scheme != scheme or origin_port != req_port:
            return False
        return (
            origin_host.lower() in self._loopback_aliases
            and req_host.lower() in self._loopback_aliases
        )

    @staticmethod
    def _split_host(host_value: str, scheme: str) -> tuple[str | None, int | None]:
        if not host_value:
            return None, None
        parts = host_value.rsplit(":", 1)
        if len(parts) == 2 and parts[1].isdigit():
            return parts[0], int(parts[1])
        return host_value, ContractCorsMiddleware._default_port(scheme)

    @staticmethod
    def _default_port(scheme: str) -> int:
        return 443 if scheme.lower() == "https" else 80


class JwtCookieAuthenticationMiddleware:
    cookie_name = "htvb_access"

    def __init__(self, get_response):
        self.get_response = get_response
        self.jwt_auth = JWTAuthentication()

    def __call__(self, request):
        self._authenticate_from_cookie(request)
        return self.get_response(request)

    def _authenticate_from_cookie(self, request):
        if getattr(request, "user", None) and getattr(request.user, "is_authenticated", False):
            return
        token = request.COOKIES.get(self.cookie_name)
        if not token:
            return
        if request.META.get("HTTP_AUTHORIZATION"):
            return
        request.META["HTTP_AUTHORIZATION"] = f"Bearer {token}"
        try:
            auth_tuple = self.jwt_auth.authenticate(request)
        except (AuthenticationFailed, InvalidToken):
            return
        finally:
            request.META.pop("HTTP_AUTHORIZATION", None)
        if not auth_tuple:
            return
        user, _ = auth_tuple
        if user:
            request.user = user
            request._cached_user = user
