# apps/systemapps/models.py
from django.conf import settings
from django.db import models
from django.utils import timezone


class SystemSetting(models.Model):
    class Meta:
        db_table = "system_settings"

    setting_key = models.CharField(primary_key=True, max_length=100)
    setting_value = models.JSONField()  # linh hoạt
    updated_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    updated_at = models.DateTimeField(default=timezone.now)
