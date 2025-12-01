from django.apps import AppConfig


class CoreConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "core"
    verbose_name = "Core Utilities"
    def ready(self):
        # Đăng ký OpenAPI auth extension
        try:
            import core.schema_ext  # noqa: F401
        except Exception:
            # Không chặn startup vì extension là tiện ích tài liệu
            pass
