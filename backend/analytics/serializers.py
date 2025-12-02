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


class PendingDocumentSerializer(serializers.Serializer):
    document_id = serializers.IntegerField(required=False)
    title = serializers.CharField()
    code = serializers.CharField()
    direction = serializers.CharField()
    status = serializers.CharField(allow_null=True, required=False)
    status_key = serializers.CharField(allow_blank=True, required=False)
    due_at = serializers.DateTimeField(allow_null=True, required=False)
    updated_at = serializers.DateTimeField(allow_null=True, required=False)
    department = serializers.CharField(allow_null=True, required=False)
    is_overdue = serializers.BooleanField()


class PendingCountsSerializer(serializers.Serializer):
    approval = serializers.IntegerField()
    sign = serializers.IntegerField()


class ApprovalStepSerializer(serializers.Serializer):
    log_id = serializers.IntegerField(required=False)
    document_id = serializers.IntegerField(allow_null=True, required=False)
    code = serializers.CharField(allow_blank=True)
    title = serializers.CharField(allow_null=True, required=False)
    action = serializers.CharField()
    status = serializers.CharField(allow_null=True, required=False)
    actor = serializers.CharField(allow_null=True, required=False)
    timestamp = serializers.DateTimeField(allow_null=True, required=False)
    note = serializers.CharField(allow_null=True, required=False)


class TaskItemSerializer(serializers.Serializer):
    task_id = serializers.IntegerField(required=False)
    title = serializers.CharField()
    status = serializers.CharField()
    due_at = serializers.DateTimeField(allow_null=True, required=False)
    assignee = serializers.CharField(allow_null=True, required=False)
    case_title = serializers.CharField(allow_null=True, required=False)
    case_code = serializers.CharField(allow_null=True, required=False)


class TaskSummarySerializer(serializers.Serializer):
    total = serializers.IntegerField()
    completed = serializers.IntegerField()
    late = serializers.IntegerField()
    items = TaskItemSerializer(many=True)


class NotificationItemSerializer(serializers.Serializer):
    notification_id = serializers.IntegerField(required=False)
    title = serializers.CharField()
    body = serializers.CharField(allow_null=True, required=False)
    sent_at = serializers.DateTimeField(allow_null=True, required=False)
    read = serializers.BooleanField()
    link = serializers.CharField(allow_null=True, required=False)


class LeaderDashboardSerializer(serializers.Serializer):
    kpis = DashboardKPISerializer()
    pending_documents = PendingDocumentSerializer(many=True)
    pending_counts = PendingCountsSerializer()
    approval_timeline = ApprovalStepSerializer(many=True)
    task_progress = TaskSummarySerializer()
    notifications = NotificationItemSerializer(many=True)
