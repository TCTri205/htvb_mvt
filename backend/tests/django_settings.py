# tests/django_settings.py
import os
from typing import Any, Dict, cast

SECRET_KEY = "test-secret-key"
DEBUG = True

# Chỉnh lại theo dự án của bạn nếu khác
TIME_ZONE = "Asia/Ho_Chi_Minh"
USE_TZ = True

INSTALLED_APPS = [
    # Django deps
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.admin",
    "django.contrib.staticfiles",
    "django_filters",

    # 3rd party
    "rest_framework",
    "drf_spectacular",

    # Project apps
    "accounts",
    "documents",
    "workflow",
    "common",
    "catalog",
    "cases",
    "systemapps",
]

# Nếu bạn dùng custom user model, CHẮC CHẮN phải khớp app.model
AUTH_USER_MODEL = "accounts.User"

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": ":memory:",  # không tạo file, cực nhanh
    }
}

# TẮT migrations cho các app nội bộ (silence Pylance bằng cast -> Any)
MIGRATION_MODULES: Dict[str, Any] = cast(Dict[str, Any], {
    "accounts": None,
    "audit": None,
    "cases": None,
    "catalog": None,
    "common": None,
    "core": None,
    "documents": None,
    "notifications": None,
    "reports": None,
    "systemapps": None,
    "workflow": None,
})

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
]

ROOT_URLCONF = "tests.urls_stub"  # stub router cho test

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {"context_processors": [
            "django.template.context_processors.debug",
            "django.template.context_processors.request",
            "django.contrib.auth.context_processors.auth",
            "django.contrib.messages.context_processors.messages",
        ]},
    },
]

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework.authentication.SessionAuthentication",
        "rest_framework.authentication.BasicAuthentication",
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "DEFAULT_FILTER_BACKENDS": ["django_filters.rest_framework.DjangoFilterBackend"],
}

SPECTACULAR_SETTINGS = {
    "TITLE": "Test API",
    "VERSION": "v1",
    "SERVE_INCLUDE_SCHEMA": False,
}

# Tắt phát sự kiện khi chạy test
EVENTS_PUBLISH_ENABLED = False
