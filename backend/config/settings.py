"""
Django settings for config project.

Backend tách biệt FE (HTML/CSS/JS chạy origin khác)
- PostgreSQL + DRF + SimpleJWT + CORS + drf-spectacular (+ sidecar)
- Đọc .env nhưng tránh Pylance lỗi kiểu bằng helper get_bool/get_list
"""

from pathlib import Path
from datetime import timedelta
from typing import List
import os
import json
import environ

# =============================================================================
# Paths
# =============================================================================
BASE_DIR = Path(__file__).resolve().parent.parent

# =============================================================================
# Helpers: tránh cảnh báo Pylance khi đọc env
# =============================================================================
def get_bool(key: str, default: bool = False) -> bool:
    raw = os.getenv(key)
    if raw is None:
        return default
    return str(raw).strip().lower() in ("1", "true", "yes", "on")

def get_list(key: str, default=None) -> List[str]:
    if default is None:
        default = []
    raw = os.getenv(key)
    if not raw:
        return list(default)
    s = raw.strip()
    # Hỗ trợ JSON list: '["http://localhost:5500","http://127.0.0.1:5500"]'
    if s.startswith("["):
        try:
            val = json.loads(s)
            if isinstance(val, list):
                return [str(x).strip() for x in val if str(x).strip()]
        except Exception:
            pass
    # Mặc định: comma-separated
    return [x.strip() for x in s.split(",") if x.strip()]

def get_str(key: str, default: str) -> str:
    v = os.getenv(key)
    return default if v is None else str(v)

# =============================================================================
# .env (dùng django-environ để đọc nếu có)
# =============================================================================
env = environ.Env()
env_file = BASE_DIR / ".env"
if env_file.exists():
    environ.Env.read_env(str(env_file))

# =============================================================================
# Core flags
# =============================================================================
DEBUG: bool = get_bool("DEBUG", False)
SECRET_KEY: str = get_str("SECRET_KEY", "CHANGE_ME_IN_ENV")

# =============================================================================
# Hosts / CORS
# =============================================================================
ALLOWED_HOSTS: List[str] = get_list("ALLOWED_HOSTS", ["127.0.0.1", "localhost"])

# Cho phép CORS theo whitelist (khuyến nghị cho JWT qua header Authorization)
CORS_ALLOWED_ORIGINS: List[str] = get_list(
    "CORS_ALLOWED_ORIGINS",
    [
        "http://127.0.0.1:8000",
        "http://localhost:8000",
        "http://127.0.0.1:5500",
        "http://localhost:5500",
    ],
)  # vd: http://localhost:5500
CORS_ALLOW_ALL_ORIGINS: bool = get_bool("CORS_ALLOW_ALL_ORIGINS", False)
CORS_ALLOW_CREDENTIALS: bool = get_bool("CORS_ALLOW_CREDENTIALS", False)  # JWT header không cần cookie

# Regex cho LAN (tuỳ chọn)
CORS_ALLOWED_ORIGIN_REGEXES = [
    r"^http://192\.168\.\d{1,3}\.\d{1,3}(:\d+)?$",
    r"^http://10\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?$",
]

# CSRF Trusted Origins: bao gồm cả http và https cho mỗi origin dev (phục vụ nếu có view form CSRF)
def _both_schemes(origins: List[str]) -> List[str]:
    out: List[str] = []
    for o in origins:
        o = o.strip().rstrip("/")
        if not o:
            continue
        if o.startswith("http://"):
            out.append(o)
            out.append(o.replace("http://", "https://", 1))
        elif o.startswith("https://"):
            out.append(o)
            out.append(o.replace("https://", "http://", 1))
        else:
            # nếu người dùng đưa vào “localhost:5500” không có scheme → thêm cả 2
            out.append("http://" + o)
            out.append("https://" + o)
    # unique, giữ thứ tự
    return list(dict.fromkeys(out))

CSRF_TRUSTED_ORIGINS = _both_schemes(CORS_ALLOWED_ORIGINS)

# =============================================================================
# Apps
# =============================================================================
INSTALLED_APPS = [
    "corsheaders",

    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "django.contrib.postgres",

    "rest_framework",
    "rest_framework_simplejwt",         # KHÔNG dùng token_blacklist theo yêu cầu
    "django_filters",
    "drf_spectacular",
    "drf_spectacular_sidecar",
    "drf_standardized_errors",

    "accounts",
    "documents",
    "workflow",
    "common",  # chứa migration bật pg_trgm
    "catalog",
    "cases",
    "notifications",
    "reports",
    "audit",
    "systemapps",
    "archive",
    "analytics",  # Analytics & Reports API
    "ui",
    "chatbot",  # Chatbot RAG integration
    "core.apps.CoreConfig",
]

MIDDLEWARE = [
    "core.middleware.ContractCorsMiddleware",
    "corsheaders.middleware.CorsMiddleware",  # đặt sớm để thêm header CORS
    "django.middleware.security.SecurityMiddleware",
    "workflow.middleware.client_ip.ClientIPMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "core.middleware.JwtCookieAuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"

# =============================================================================
# Database (PostgreSQL)
# =============================================================================
# Ưu tiên DATABASE_URL (ví dụ: postgresql://postgres:postgres@127.0.0.1:55432/htvb_MVT)
DATABASE_URL = os.getenv("DATABASE_URL")

if DATABASE_URL:
    DATABASES = {"default": env.db("DATABASE_URL")}
else:
    # Nếu không có DATABASE_URL → đọc bộ biến lẻ DB_HOST/DB_PORT/...
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": env("DB_NAME", default="htvb_MVT"),
            "USER": env("DB_USER", default="postgres"),
            "PASSWORD": env("DB_PASSWORD", default="postgres"),
            "HOST": env("DB_HOST", default="127.0.0.1"),
            "PORT": env.int("DB_PORT", default=5432),
            "OPTIONS": {"connect_timeout": 5},
        }
    }

# =============================================================================
# Password validation
# =============================================================================
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# =============================================================================
# i18n & Time
# =============================================================================
LANGUAGE_CODE = "vi"
TIME_ZONE = "UTC"  # Lưu UTC; FE hiển thị theo VN
USE_I18N = True
USE_TZ = True
LOCALE_PATHS = [BASE_DIR / "locale"]

# =============================================================================
# Static & Media
# =============================================================================
STATIC_URL = get_str("STATIC_URL_PREFIX", "/static/")
STATIC_ROOT = BASE_DIR / "staticfiles"
STATICFILES_DIRS = [BASE_DIR / "static"]

MEDIA_URL = "/media/"
MEDIA_ROOT = (BASE_DIR / get_str("MEDIA_ROOT", "media")).resolve()

# =============================================================================
# Chatbot RAG Settings
# =============================================================================
CHATBOT_VECTORSTORE_TYPE = get_str("CHATBOT_VECTORSTORE_TYPE", "faiss")  # 'faiss' or 'chroma'
CHATBOT_VECTORSTORE_PATH = BASE_DIR / "media" / "chatbot_vectorstore"
CHATBOT_K = int(get_str("CHATBOT_K", "5"))  # Number of documents to retrieve
CHATBOT_SCORE_THRESHOLD = float(get_str("CHATBOT_SCORE_THRESHOLD", "0.2"))  # Similarity threshold
CHATBOT_CHUNK_SIZE = int(get_str("CHATBOT_CHUNK_SIZE", "1200"))  # Chunk size for text splitting
CHATBOT_CHUNK_OVERLAP = int(get_str("CHATBOT_CHUNK_OVERLAP", "200"))  # Overlap between chunks


REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "DEFAULT_PAGINATION_CLASS": "core.pagination.DefaultPageNumberPagination",
    "PAGE_SIZE": 20,

    "DEFAULT_FILTER_BACKENDS": [
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.SearchFilter",
        "rest_framework.filters.OrderingFilter",
    ],

    "EXCEPTION_HANDLER": "core.exceptions.contract_exception_handler",

    "DEFAULT_PARSER_CLASSES": [
        "rest_framework.parsers.JSONParser",
        "rest_framework.parsers.FormParser",
        "rest_framework.parsers.MultiPartParser",
    ],

    "DEFAULT_RENDERER_CLASSES": [
        "rest_framework.renderers.JSONRenderer",
        "rest_framework.renderers.BrowsableAPIRenderer",  # tắt khi lên prod nếu muốn
    ],
}

SPECTACULAR_SETTINGS = {
    "TITLE": "Hệ thống Quản lý Văn Bản & Điều Hành API",
    "DESCRIPTION": "REST API cho quản lý văn bản đến/đi, RBAC, quy trình phê duyệt.",
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
    "SWAGGER_UI_DIST": "SIDECAR",
    "SWAGGER_UI_FAVICON_HREF": "SIDECAR",
    "REDOC_DIST": "SIDECAR",
    "COMPONENT_SPLIT_REQUEST": True,
    "SWAGGER_UI_SETTINGS": {"persistAuthorization": True},

    # Hiển thị 'servers' để FE nắm rõ base URL
    "SERVERS": [
        {"url": "http://localhost:8000", "description": "Local"},
        # {"url": "https://staging.api.your-domain.vn", "description": "Staging"},
        # {"url": "https://api.your-domain.vn", "description": "Production"},
    ],

    # Hậu xử lý schema (hook tự bạn định nghĩa)
    "POSTPROCESSING_HOOKS": [
        "core.schema_hooks.ensure_servers",
    ],

    # Mặc định yêu cầu Bearer, trừ những view đặt AllowAny (vd. /auth/jwt/create)
    "SECURITY": [{"BearerAuth": []}],

    # Khai báo Security Schemes (chuẩn mới)
    "SECURITY_SCHEMES": {
        "BearerAuth": {"type": "http", "scheme": "bearer", "bearerFormat": "JWT"},
    },

    # QUAN TRỌNG: phải là dict (không phải bool). Để trống nếu không cần append gì thêm.
    "APPEND_COMPONENTS": {},
}

# =============================================================================
# JWT (SimpleJWT) - KHÔNG dùng blacklist
# =============================================================================
SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=int(get_str("JWT_ACCESS_MIN", "30"))),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=int(get_str("JWT_REFRESH_DAYS", "7"))),
    "ROTATE_REFRESH_TOKENS": False,
    "BLACKLIST_AFTER_ROTATION": False,
    "ALGORITHM": "HS256",
    "SIGNING_KEY": get_str("JWT_SIGNING_KEY", SECRET_KEY),
    "AUTH_HEADER_TYPES": ("Bearer",),
    "AUTH_HEADER_NAME": "HTTP_AUTHORIZATION",
    "USER_ID_FIELD": "pk",
    "USER_ID_CLAIM": "user_id",
    "UPDATE_LAST_LOGIN": True,
}

# =============================================================================
# Auth model
# =============================================================================
AUTH_USER_MODEL = "accounts.User"

# =============================================================================
# Security (cơ bản; cân nhắc chỉnh khi deploy)
# =============================================================================
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
USE_X_FORWARDED_HOST = True
SESSION_COOKIE_SECURE = not DEBUG
CSRF_COOKIE_SECURE = not DEBUG
SECURE_HSTS_SECONDS = 0 if DEBUG else 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = not DEBUG
SECURE_HSTS_PRELOAD = not DEBUG
SECURE_CONTENT_TYPE_NOSNIFF = True
# (Django 5 đã bỏ SECURE_BROWSER_XSS_FILTER)

# =============================================================================
# Upload limits (demo)
# =============================================================================
DATA_UPLOAD_MAX_MEMORY_SIZE = 10 * 1024 * 1024
FILE_UPLOAD_MAX_MEMORY_SIZE = 10 * 1024 * 1024

# =============================================================================
# Logging
# =============================================================================
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "simple": {"format": "[{levelname}] {asctime} {name}: {message}", "style": "{"},
    },
    "handlers": {"console": {"class": "logging.StreamHandler", "formatter": "simple"}},
    "root": {"handlers": ["console"], "level": "INFO"},
    "loggers": {
        "django.request": {"handlers": ["console"], "level": "WARNING", "propagate": False},
        "django.db.backends": {"handlers": ["console"], "level": "WARNING", "propagate": False},
    },
}

# Bật/tắt phát sự kiện (ví dụ tắt trong test)
EVENTS_PUBLISH_ENABLED = get_bool("EVENTS_PUBLISH_ENABLED", True)

# Ưu tiên URL; nếu không có sẽ ghép REDIS_HOST/PORT/DB
REDIS_URL = get_str("REDIS_URL", "redis://127.0.0.1:6379/0")
# REDIS_HOST = "localhost"
# REDIS_PORT = 6379
# REDIS_DB   = 0

# --- App feature flags / testing toggles ---
TESTING = False
ALLOW_JSON_UPLOAD_FALLBACK = False  # Chỉ cho phép multipart ở môi trường thật

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
