# tests/django_settings_pg.py
from __future__ import annotations
import os
from urllib.parse import urlparse

# ============================================================
# 1) ÉP ENV RẤT SỚM (trước khi import config.settings)
# ============================================================
_DEFAULT_URL = (
    os.environ.get("TEST_DATABASE_URL")
    or os.environ.get("DATABASE_URL")
    or "postgresql://postgres:postgres@127.0.0.1:5432/htvb"
)

# Luôn ép 2 biến URL về cùng một giá trị để tránh lệch
os.environ["TEST_DATABASE_URL"] = _DEFAULT_URL
os.environ["DATABASE_URL"] = _DEFAULT_URL

# Ép PG* cho psycopg (đề phòng libpq dùng env khác)
_p = urlparse(_DEFAULT_URL)
os.environ["PGHOST"] = _p.hostname or "127.0.0.1"
os.environ["PGPORT"] = str(_p.port or 5432)
os.environ["PGUSER"] = _p.username or "postgres"
os.environ["PGPASSWORD"] = _p.password or "postgres"

# ============================================================
# 2) Import settings gốc sau khi ENV đã chuẩn
# ============================================================
from config.settings import *  # noqa: F401,F403

DEBUG = True
SECRET_KEY = os.environ.get("SECRET_KEY", "test-secret-key")
ALLOWED_HOSTS = ["*"]

# Bảo đảm django_filters có mặt (để FilterSet hoạt động trong test)
INSTALLED_APPS = list(globals().get("INSTALLED_APPS", []))
if "django_filters" not in INSTALLED_APPS:
    INSTALLED_APPS.append("django_filters")

# ============================================================
# 3) CHỐT DATABASES (ghi đè hoàn toàn) & TEST.NAME
# ============================================================
def _parse_db(url: str) -> dict:
    p = urlparse(url)
    return {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": (p.path[1:] or "htvb"),
        "USER": p.username or "postgres",
        "PASSWORD": p.password or "postgres",
        "HOST": p.hostname or "127.0.0.1",
        "PORT": str(p.port or 5432),
        # Không giữ kết nối lâu để vòng đời test sạch
        "CONN_MAX_AGE": 0,
        "ATOMIC_REQUESTS": False,
        "OPTIONS": {
            # Tránh lỗi "SSL negotiation packet" khi cổng sai / không cần SSL
            "sslmode": "disable",
            "connect_timeout": 5,
        },
    }

_DB_URL = os.environ["TEST_DATABASE_URL"]
DATABASES = {"default": _parse_db(_DB_URL)}

# Bắt buộc dùng chính DB hiện tại làm DB test (tên giống nhau)
DATABASES["default"]["TEST"] = {"NAME": DATABASES["default"]["NAME"]}

# Ép lại lần nữa cho chắc
for alias, cfg in DATABASES.items():
    cfg["HOST"] = cfg.get("HOST") or "127.0.0.1"
    cfg["PORT"] = str(cfg.get("PORT") or "5432")
    cfg["CONN_MAX_AGE"] = 0
    opts = dict(cfg.get("OPTIONS") or {})
    opts.setdefault("sslmode", "disable")
    opts.setdefault("connect_timeout", 5)
    cfg["OPTIONS"] = opts

# ============================================================
# 4) DRF / Spectacular — KHÔNG ghi đè toàn bộ, chỉ cập nhật cần thiết
# ============================================================
REST_FRAMEWORK = dict(globals().get("REST_FRAMEWORK", {}))
REST_FRAMEWORK.update({
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    "TEST_REQUEST_DEFAULT_FORMAT": "json",
})
# Bảo đảm có filter backends cho ?q=...&status=...&ordering=...
REST_FRAMEWORK.setdefault(
    "DEFAULT_FILTER_BACKENDS",
    [
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.SearchFilter",
        "rest_framework.filters.OrderingFilter",
    ],
)

SPECTACULAR_SETTINGS = {
    "TITLE": "HTVB API",
    "DESCRIPTION": "API schema for tests",
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
}

# ============================================================
# 5) Tối ưu test & tránh phụ thuộc ngoài
# ============================================================
# Cache dùng locmem cho chắc (phòng khi settings gốc dùng Redis/Memcached)
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
        "LOCATION": "htvb-tests",
    }
}

PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]
EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"

# Tắt logging để output test gọn
LOGGING = {"version": 1, "disable_existing_loggers": True}

# Bật cờ test & JSON upload fallback cho test fixtures
TESTING = True
ALLOW_JSON_UPLOAD_FALLBACK = True
