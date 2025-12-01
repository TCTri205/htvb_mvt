from django.apps import AppConfig


class NotificationsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "notifications"
    
    def ready(self):
        # Import signals to register handlers
        try:
            from . import signals  # noqa: F401
        except ImportError:
            pass
