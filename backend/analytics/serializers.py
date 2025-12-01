# analytics/serializers.py
"""
Serializers for analytics API responses.
"""
from rest_framework import serializers


class KPIMetricSerializer(serializers.Serializer):
    """Serializer for individual KPI metrics."""
    count = serializers.IntegerField(required=False)
    total = serializers.IntegerField(required=False)
    active = serializers.IntegerField(required=False)
    rate = serializers.FloatField(required=False)
    growth_rate = serializers.FloatField(required=False)
    completed = serializers.IntegerField(required=False)
    period = serializers.CharField(required=False)
    trend = serializers.CharField(required=False)


class DocumentCountsSerializer(serializers.Serializer):
    """Serializer for inbound/outbound counts."""
    inbound = serializers.IntegerField()
    outbound = serializers.IntegerField()


class DashboardKPISerializer(serializers.Serializer):
    """Serializer for dashboard KPIs response."""
    total_documents = KPIMetricSerializer()
    active_users = KPIMetricSerializer()
    processing_efficiency = KPIMetricSerializer()
    overdue_rate = KPIMetricSerializer()
    document_counts = DocumentCountsSerializer(required=False)


class DocumentByTypeSerializer(serializers.Serializer):
    """Serializer for document statistics by type."""
    type_name = serializers.CharField()
    total = serializers.IntegerField()
    processed = serializers.IntegerField()
    success_rate = serializers.FloatField()
    avg_processing_days = serializers.FloatField()


class DocumentByStatusSerializer(serializers.Serializer):
    """Serializer for document statistics by status."""
    status = serializers.CharField()
    count = serializers.IntegerField()


class DepartmentPerformanceSerializer(serializers.Serializer):
    """Serializer for department performance metrics."""
    department = serializers.CharField()
    doc_count = serializers.IntegerField()
    efficiency = serializers.FloatField()
    avg_time = serializers.FloatField()
    ranking = serializers.IntegerField()


class UserPerformanceSerializer(serializers.Serializer):
    """Serializer for user performance metrics."""
    user = serializers.CharField()
    role = serializers.CharField()
    processed_count = serializers.IntegerField()
    efficiency = serializers.FloatField()
    avg_time = serializers.FloatField()
    rank = serializers.IntegerField()


class DatasetSerializer(serializers.Serializer):
    """Serializer for chart dataset."""
    label = serializers.CharField()
    data = serializers.ListField(child=serializers.IntegerField())


class TimelineSerializer(serializers.Serializer):
    """Serializer for activity timeline chart data."""
    labels = serializers.ListField(child=serializers.CharField())
    datasets = DatasetSerializer(many=True)


class PriorityDistributionSerializer(serializers.Serializer):
    """Serializer for priority distribution data."""
    URGENT = serializers.IntegerField()
    HIGH = serializers.IntegerField()
    MEDIUM = serializers.IntegerField()
    LOW = serializers.IntegerField()


class ExportRequestSerializer(serializers.Serializer):
    """Serializer for export request."""
    format = serializers.ChoiceField(choices=['PDF', 'XLSX', 'CSV'])
    filters = serializers.JSONField(required=False)
    date_from = serializers.DateTimeField(required=False)
    date_to = serializers.DateTimeField(required=False)
