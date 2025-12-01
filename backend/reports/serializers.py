# reports/serializers.py
"""
Serializers for Reports and Exports API.
"""
from __future__ import annotations

from rest_framework import serializers

from .models import ReportDefinition, ReportExport


class ReportDefinitionSerializer(serializers.ModelSerializer):
    created_by_summary = serializers.SerializerMethodField()
    
    class Meta:
        model = ReportDefinition
        fields = (
            "report_id",
            "code",
            "name",
            "config_json",
            "created_by",
            "created_by_summary",
            "created_at",
        )
        read_only_fields = ("report_id", "created_by", "created_at")
    
    def get_created_by_summary(self, obj: ReportDefinition):
        user = getattr(obj, "created_by", None)
        if not user:
            return None
        return {
            "user_id": getattr(user, "user_id", None),
            "full_name": getattr(user, "full_name", None),
            "username": getattr(user, "username", None),
        }


class ReportDefinitionCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReportDefinition
        fields = ("code", "name", "config_json")


class ReportExportSerializer(serializers.ModelSerializer):
    exported_by_summary = serializers.SerializerMethodField()
    report_name = serializers.CharField(source="report.name", read_only=True)
    
    class Meta:
        model = ReportExport
        fields = (
            "export_id",
            "report",
            "report_name",
            "exported_by",
            "exported_by_summary",
            "exported_at",
            "format",
            "params_json",
            "file_path",
        )
        read_only_fields = ("export_id", "exported_by", "exported_at", "file_path")
    
    def get_exported_by_summary(self, obj: ReportExport):
        user = getattr(obj, "exported_by", None)
        if not user:
            return None
        return {
            "user_id": getattr(user, "user_id", None),
            "full_name": getattr(user, "full_name", None),
            "username": getattr(user, "username", None),
        }


class ReportExportCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReportExport
        fields = ("format", "params_json")
