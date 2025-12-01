# apps/reports/models.py
from django.conf import settings
from django.db import models
from django.utils import timezone


class ReportDefinition(models.Model):
    class Meta:
        db_table = "report_definitions"

    report_id = models.BigAutoField(primary_key=True)
    code = models.CharField(max_length=50, unique=True)
    name = models.CharField(max_length=200)
    config_json = models.JSONField()
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    created_at = models.DateTimeField(default=timezone.now)


class ReportExport(models.Model):
    class Format(models.TextChoices):
        PDF = "PDF", "PDF"
        XLSX = "XLSX", "XLSX"
        CSV = "CSV", "CSV"

    class Meta:
        db_table = "report_exports"

    export_id = models.BigAutoField(primary_key=True)
    report = models.ForeignKey(ReportDefinition, on_delete=models.CASCADE, related_name="exports")
    exported_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    exported_at = models.DateTimeField(default=timezone.now)
    format = models.CharField(max_length=10, choices=Format.choices)
    params_json = models.JSONField(null=True, blank=True)
    file_path = models.CharField(max_length=500)
