# analytics/views.py
"""
Analytics API views for KPIs, statistics, and charts.
"""
from __future__ import annotations

from datetime import datetime
import csv
import io

from django.http import HttpResponse
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from drf_spectacular.utils import extend_schema, OpenApiParameter
from drf_spectacular.types import OpenApiTypes

from .services import (
    DashboardService,
    DocumentAnalyticsService,
    PerformanceService,
    ActivityService
)
from .serializers import (
    DashboardKPISerializer,
    DocumentByTypeSerializer,
    DocumentByStatusSerializer,
    DepartmentPerformanceSerializer,
    UserPerformanceSerializer,
    TimelineSerializer,
    PriorityDistributionSerializer,
    ExportRequestSerializer
)


class DashboardKPIView(APIView):
    """Get dashboard KPI metrics."""
    permission_classes = [IsAuthenticated]
    
    @extend_schema(
        tags=["Analytics"],
        operation_id="analytics_dashboard_kpis",
        summary="Dashboard KPIs",
        parameters=[
            OpenApiParameter(name="date_from", type=OpenApiTypes.DATETIME, location=OpenApiParameter.QUERY, required=False),
            OpenApiParameter(name="date_to", type=OpenApiTypes.DATETIME, location=OpenApiParameter.QUERY, required=False),
            OpenApiParameter(name="department_id", type=OpenApiTypes.INT, location=OpenApiParameter.QUERY, required=False),
            OpenApiParameter(name="scope", type=OpenApiTypes.STR, location=OpenApiParameter.QUERY, required=False, description="Scope of data: 'personal' or 'all'"),
        ],
        responses={200: DashboardKPISerializer}
    )
    def get(self, request):
        date_from = request.query_params.get('date_from')
        date_to = request.query_params.get('date_to')
        department_id = request.query_params.get('department_id')
        scope = request.query_params.get('scope')
        
        if date_from:
            date_from = datetime.fromisoformat(date_from.replace('Z', '+00:00'))
            if timezone.is_naive(date_from):
                date_from = timezone.make_aware(date_from)
        if date_to:
            date_to = datetime.fromisoformat(date_to.replace('Z', '+00:00'))
            if timezone.is_naive(date_to):
                date_to = timezone.make_aware(date_to)
        if department_id:
            department_id = int(department_id)
            
        user_id = None
        if scope == 'personal':
            user_id = request.user.pk
        
        data = DashboardService.get_kpis(date_from, date_to, department_id, user_id)
        serializer = DashboardKPISerializer(data)
        
        return Response({"success": True, "data": serializer.data})


class DocumentsByTypeView(APIView):
    """Get document statistics grouped by type."""
    permission_classes = [IsAuthenticated]
    
    @extend_schema(
        tags=["Analytics"],
        operation_id="analytics_documents_by_type",
        summary="Document statistics by type",
        parameters=[
            OpenApiParameter(name="date_from", type=OpenApiTypes.DATETIME, location=OpenApiParameter.QUERY, required=False),
            OpenApiParameter(name="date_to", type=OpenApiTypes.DATETIME, location=OpenApiParameter.QUERY, required=False),
        ],
        responses={200: DocumentByTypeSerializer(many=True)}
    )
    def get(self, request):
        date_from = request.query_params.get('date_from')
        date_to = request.query_params.get('date_to')
        
        if date_from:
            date_from = datetime.fromisoformat(date_from.replace('Z', '+00:00'))
        if date_to:
            date_to = datetime.fromisoformat(date_to.replace('Z', '+00:00'))
        
        scope = request.query_params.get('scope')
        user_id = None
        if scope == 'personal':
            user_id = request.user.pk
            
        data = DocumentAnalyticsService.get_by_type(date_from, date_to, user_id)
        serializer = DocumentByTypeSerializer(data, many=True)
        
        return Response({"success": True, "data": serializer.data})


class DocumentsByStatusView(APIView):
    """Get document statistics grouped by status."""
    permission_classes = [IsAuthenticated]
    
    @extend_schema(
        tags=["Analytics"],
        operation_id="analytics_documents_by_status",
        summary="Document statistics by status",
        parameters=[
            OpenApiParameter(name="date_from", type=OpenApiTypes.DATETIME, location=OpenApiParameter.QUERY, required=False),
            OpenApiParameter(name="date_to", type=OpenApiTypes.DATETIME, location=OpenApiParameter.QUERY, required=False),
            OpenApiParameter(name="scope", type=OpenApiTypes.STR, location=OpenApiParameter.QUERY, required=False, description="Scope of data: 'personal' or 'all'"),
        ],
        responses={200: DocumentByStatusSerializer(many=True)}
    )
    def get(self, request):
        date_from = request.query_params.get('date_from')
        date_to = request.query_params.get('date_to')
        
        if date_from:
            date_from = datetime.fromisoformat(date_from.replace('Z', '+00:00'))
            if timezone.is_naive(date_from):
                date_from = timezone.make_aware(date_from)
        if date_to:
            date_to = datetime.fromisoformat(date_to.replace('Z', '+00:00'))
            if timezone.is_naive(date_to):
                date_to = timezone.make_aware(date_to)
        
        scope = request.query_params.get('scope')
        user_id = None
        if scope == 'personal':
            user_id = request.user.pk
            
        data = DocumentAnalyticsService.get_by_status(date_from, date_to, user_id)
        serializer = DocumentByStatusSerializer(data, many=True)
        
        return Response({"success": True, "data": serializer.data})


class DepartmentPerformanceView(APIView):
    """Get performance metrics by department."""
    permission_classes = [IsAuthenticated]
    
    @extend_schema(
        tags=["Analytics"],
        operation_id="analytics_department_performance",
        summary="Department performance metrics",
        parameters=[
            OpenApiParameter(name="department_id", type=OpenApiTypes.INT, location=OpenApiParameter.QUERY, required=False),
        ],
        responses={200: DepartmentPerformanceSerializer(many=True)}
    )
    def get(self, request):
        department_id = request.query_params.get('department_id')
        if department_id:
            department_id = int(department_id)
            
        data = PerformanceService.get_department_performance(department_id)
        serializer = DepartmentPerformanceSerializer(data, many=True)
        
        return Response({"success": True, "data": serializer.data})


class UserPerformanceView(APIView):
    """Get top user performance rankings."""
    permission_classes = [IsAuthenticated]
    
    @extend_schema(
        tags=["Analytics"],
        operation_id="analytics_user_performance",
        summary="Top user performance",
        parameters=[
            OpenApiParameter(name="limit", type=OpenApiTypes.INT, location=OpenApiParameter.QUERY, required=False, description="Number of top users to return (default: 10)"),
        ],
        responses={200: UserPerformanceSerializer(many=True)}
    )
    def get(self, request):
        limit = int(request.query_params.get('limit', 10))
        data = PerformanceService.get_top_users(limit)
        serializer = UserPerformanceSerializer(data, many=True)
        
        return Response({"success": True, "data": serializer.data})


class ActivityTimelineView(APIView):
    """Get activity timeline for charts."""
    permission_classes = [IsAuthenticated]
    
    @extend_schema(
        tags=["Analytics"],
        operation_id="analytics_activity_timeline",
        summary="Activity timeline",
        parameters=[
            OpenApiParameter(name="period", type=OpenApiTypes.STR, location=OpenApiParameter.QUERY, required=False, description="Time period: day, week, or month"),
            OpenApiParameter(name="metric", type=OpenApiTypes.STR, location=OpenApiParameter.QUERY, required=False, description="Metric type: logins, documents, or meetings"),
        ],
        responses={200: TimelineSerializer}
    )
    def get(self, request):
        period = request.query_params.get('period', 'week')
        metric = request.query_params.get('metric', 'documents')
        scope = request.query_params.get('scope')
        
        user_id = None
        if scope == 'personal':
            user_id = request.user.pk
        
        data = ActivityService.get_timeline(period, metric, user_id)
        serializer = TimelineSerializer(data)
        
        return Response({"success": True, "data": serializer.data})


class PriorityDistributionView(APIView):
    """Get document distribution by priority."""
    permission_classes = [IsAuthenticated]
    
    @extend_schema(
        tags=["Analytics"],
        operation_id="analytics_priority_distribution",
        summary="Priority distribution",
        parameters=[
            OpenApiParameter(name="date_from", type=OpenApiTypes.DATETIME, location=OpenApiParameter.QUERY, required=False),
            OpenApiParameter(name="date_to", type=OpenApiTypes.DATETIME, location=OpenApiParameter.QUERY, required=False),
            OpenApiParameter(name="scope", type=OpenApiTypes.STR, location=OpenApiParameter.QUERY, required=False, description="Scope of data: 'personal' or 'all'"),
        ],
        responses={200: PriorityDistributionSerializer}
    )
    def get(self, request):
        date_from = request.query_params.get('date_from')
        date_to = request.query_params.get('date_to')
        scope = request.query_params.get('scope')
        
        if date_from:
            date_from = datetime.fromisoformat(date_from.replace('Z', '+00:00'))
            if timezone.is_naive(date_from):
                date_from = timezone.make_aware(date_from)
        if date_to:
            date_to = datetime.fromisoformat(date_to.replace('Z', '+00:00'))
            if timezone.is_naive(date_to):
                date_to = timezone.make_aware(date_to)
                
        user_id = None
        if scope == 'personal':
            user_id = request.user.id
            
        data = DocumentAnalyticsService.get_by_priority(date_from, date_to, user_id)
        serializer = PriorityDistributionSerializer(data)
        
        return Response({"success": True, "data": serializer.data})


class ExportReportView(APIView):
    """Generate and export analytics report."""
    permission_classes = [IsAuthenticated]
    
    @extend_schema(
        tags=["Analytics"],
        operation_id="analytics_export_report",
        summary="Export analytics report",
        request=ExportRequestSerializer,
        responses={200: {"type": "object", "properties": {"download_url": {"type": "string"}}}}
    )
    def post(self, request):
        serializer = ExportRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        format_type = serializer.validated_data['format']
        date_from = serializer.validated_data.get('date_from')
        date_to = serializer.validated_data.get('date_to')
        
        # Gather all analytics data
        kpis = DashboardService.get_kpis(date_from, date_to)
        docs_by_type = DocumentAnalyticsService.get_by_type(date_from, date_to)
        dept_perf = PerformanceService.get_department_performance()
        top_users = PerformanceService.get_top_users(20)
        priority = DocumentAnalyticsService.get_by_priority()
        
        if format_type == 'CSV':
            # Generate CSV report
            output = io.StringIO()
            writer = csv.writer(output)
            
            # Header
            writer.writerow(['BÁO CÁO THỐNG KÊ & PHÂN TÍCH'])
            writer.writerow([f'Từ ngày: {date_from or "N/A"} đến {date_to or "N/A"}'])
            writer.writerow([''])
            
            # KPIs Section
            writer.writerow(['=== CHỈ SỐ TỔNG QUAN ==='])
            writer.writerow(['Chỉ số', 'Giá trị', 'Chi tiết'])
            writer.writerow(['Tổng văn bản', kpis['total_documents']['count'], f"{kpis['total_documents']['growth_rate']}% so với kỳ trước"])
            writer.writerow(['Người dùng hoạt động', f"{kpis['active_users']['active']}/{kpis['active_users']['total']}", f"{kpis['active_users']['rate']}%"])
            writer.writerow(['Hiệu suất xử lý', f"{kpis['processing_efficiency']['rate']}%", f"{kpis['processing_efficiency']['completed']}/{kpis['processing_efficiency']['total']} văn bản"])
            writer.writerow(['Tỷ lệ quá hạn', f"{kpis['overdue_rate']['rate']}%", f"{kpis['overdue_rate']['count']} văn bản"])
            writer.writerow([''])
            
            # Documents by Type
            writer.writerow(['=== THỐNG KÊ THEO LOẠI VĂN BẢN ==='])
            writer.writerow(['Loại văn bản', 'Tổng số', 'Đã xử lý', 'Tỷ lệ thành công (%)', 'Thời gian xử lý TB (ngày)'])
            for doc in docs_by_type:
                writer.writerow([doc['type_name'], doc['total'], doc['processed'], doc['success_rate'], doc['avg_processing_days']])
            writer.writerow([''])
            
            # Department Performance
            writer.writerow(['=== HIỆU SUẤT THEO PHÒNG BAN ==='])
            writer.writerow(['Phòng ban', 'Số văn bản', 'Hiệu suất (%)', 'Thời gian TB (ngày)', 'Xếp hạng'])
            for dept in dept_perf:
                writer.writerow([dept['department'], dept['doc_count'], dept['efficiency'], dept['avg_time'], dept['ranking']])
            writer.writerow([''])
            
            # Top Users
            writer.writerow(['=== TOP NGƯỜI DÙNG HIỆU SUẤT CAO ==='])
            writer.writerow(['Người dùng', 'Vai trò', 'Đã xử lý', 'Hiệu suất (%)', 'Thời gian TB (ngày)'])
            for user in top_users:
                writer.writerow([user['user'], user['role'], user['processed_count'], user['efficiency'], user['avg_time']])
            writer.writerow([''])
            
            # Priority Distribution
            writer.writerow(['=== PHÂN BỐ THEO ĐỘ ƯU TIÊN ==='])
            writer.writerow(['Độ ưu tiên', 'Số lượng văn bản'])
            writer.writerow(['Khẩn cấp', priority.get('URGENT', 0)])
            writer.writerow(['Cao', priority.get('HIGH', 0)])
            writer.writerow(['Trung bình', priority.get('MEDIUM', 0)])
            writer.writerow(['Thấp', priority.get('LOW', 0)])
            
            # Create response
            output.seek(0)
            response = HttpResponse(output.getvalue(), content_type='text/csv; charset=utf-8-sig')
            filename = f"analytics_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
            response['Content-Disposition'] = f'attachment; filename="{filename}"'
            return response
            
        elif format_type in ['PDF', 'XLSX']:
            return Response({
                "success": True,
                "data": {
                    "message": f"{format_type} export đang được phát triển. Vui lòng sử dụng CSV export.",
                    "format": format_type,
                    "status": "not_implemented",
                    "csv_available": True
                }
            }, status=status.HTTP_200_OK)
        
        return Response({"success": False, "error": "Unsupported format"}, status=status.HTTP_400_BAD_REQUEST)
