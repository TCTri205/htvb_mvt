# notifications/channel_views.py
"""
API views for notification channel management (Demo version).
"""
from datetime import timedelta
from django.utils import timezone
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from drf_spectacular.utils import extend_schema, OpenApiParameter
from drf_spectacular.types import OpenApiTypes

from accounts.api_admin import RoleAccessPermission
from workflow.services.rbac import Role

from .models import NotificationChannel, AutomationRule, NotificationLog
from .channel_serializers import (
    NotificationChannelSerializer,
    ChannelStatsSerializer,
    TestChannelRequestSerializer,
    TestChannelResponseSerializer,
    AutomationRuleSerializer,
    NotificationLogSerializer
)


class ChannelStatsView(APIView):
    """
    Get notification channel statistics.
    QT (Admin) only.
    """
    permission_classes = [IsAuthenticated, RoleAccessPermission]
    required_roles = {Role.QT.value}
    
    @extend_schema(
        tags=["Notifications - Channels"],
        operation_id="notification_channel_stats",
        summary="Channel Statistics",
        responses={200: ChannelStatsSerializer}
    )
    def get(self, request):
        # Calculate stats from 30 days ago
        thirty_days_ago = timezone.now() - timedelta(days=30)
        
        active_channels = NotificationChannel.objects.filter(is_enabled=True).count()
        
        # For demo: use sent_count from channels
        total_sent = sum(ch.sent_count for ch in NotificationChannel.objects.all())
        total_errors = sum(ch.error_count for ch in NotificationChannel.objects.all())
        
        active_rules = AutomationRule.objects.filter(is_enabled=True).count()
        
        data = {
            'active_channels_count': active_channels,
            'total_sent_30days': total_sent,
            'total_errors_30days': total_errors,
            'automation_rules_active': active_rules
        }
        
        serializer = ChannelStatsSerializer(data)
        return Response({
            "success": True,
            "data": serializer.data
        })


class NotificationChannelViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing notification channels.
    QT (Admin) only.
    """
    queryset = NotificationChannel.objects.all()
    serializer_class = NotificationChannelSerializer
    permission_classes = [IsAuthenticated, RoleAccessPermission]
    required_roles = {Role.QT.value}
    lookup_field = 'channel_type'
    lookup_value_regex = '[a-z]+'
    
    @extend_schema(
        tags=["Notifications - Channels"],
        operation_id="notification_channels_list",
        summary="List all notification channels"
    )
    def list(self, request, *args, **kwargs):
        queryset = self.get_queryset()
        serializer = self.get_serializer(queryset, many=True)
        return Response({
            "success": True,
            "data": serializer.data
        })
    
    @extend_schema(
        tags=["Notifications - Channels"],
        operation_id="notification_channel_retrieve",
        summary="Get channel details"
    )
    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        serializer = self.get_serializer(instance)
        return Response({
            "success": True,
            "data": serializer.data
        })
    
    @extend_schema(
        tags=["Notifications - Channels"],
        operation_id="notification_channel_update",
        summary="Update channel configuration"
    )
    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        
        return Response({
            "success": True,
            "data": serializer.data,
            "message": "Channel updated successfully"
        })
    
    @extend_schema(
        tags=["Notifications - Channels"],
        operation_id="notification_channel_partial_update",
        summary="Partially update channel"
    )
    def partial_update(self, request, *args, **kwargs):
        kwargs['partial'] = True
        return self.update(request, *args, **kwargs)
    
    @extend_schema(
        tags=["Notifications - Channels"],
        operation_id="notification_channel_test",
        summary="Test channel connectivity",
        request=TestChannelRequestSerializer,
        responses={200: TestChannelResponseSerializer}
    )
    @action(detail=True, methods=['post'], url_path='test')
    def test_channel(self, request, channel_type=None):
        """
        Test channel (DEMO VERSION - returns mock success).
        """
        channel = self.get_object()
        
        request_serializer = TestChannelRequestSerializer(data=request.data)
        request_serializer.is_valid(raise_exception=True)
        
        recipient = request_serializer.validated_data['recipient']
        
        # DEMO: Just return success without actually sending
        response_data = {
            'success': True,
            'message': f'Test notification sent successfully to {recipient}',
            'details': {
                'channel': channel.channel_type,
                'recipient': recipient,
                'note': 'This is a demo - no actual notification was sent'
            }
        }
        
        response_serializer = TestChannelResponseSerializer(response_data)
        return Response({
            "success": True,
            "data": response_serializer.data
        })


class AutomationRuleViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing automation rules.
    QT (Admin) only.
    """
    queryset = AutomationRule.objects.all()
    serializer_class = AutomationRuleSerializer
    permission_classes = [IsAuthenticated, RoleAccessPermission]
    required_roles = {Role.QT.value}
    
    @extend_schema(
        tags=["Notifications - Rules"],
        operation_id="automation_rules_list",
        summary="List all automation rules"
    )
    def list(self, request, *args, **kwargs):
        queryset = self.get_queryset()
        serializer = self.get_serializer(queryset, many=True)
        return Response({
            "success": True,
            "data": serializer.data
        })
    
    @extend_schema(
        tags=["Notifications - Rules"],
        operation_id="automation_rule_create",
        summary="Create new automation rule"
    )
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        
        return Response({
            "success": True,
            "data": serializer.data,
            "message": "Automation rule created successfully"
        }, status=status.HTTP_201_CREATED)
    
    @extend_schema(
        tags=["Notifications - Rules"],
        operation_id="automation_rule_update",
        summary="Update automation rule"
    )
    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        
        return Response({
            "success": True,
            "data": serializer.data,
            "message": "Automation rule updated successfully"
        })
    
    @extend_schema(
        tags=["Notifications - Rules"],
        operation_id="automation_rule_delete",
        summary="Delete automation rule"
    )
    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        instance.delete()
        
        return Response({
            "success": True,
            "message": "Automation rule deleted successfully"
        }, status=status.HTTP_204_NO_CONTENT)


class NotificationLogViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for viewing notification logs.
    Accessible by QT, VT, CV, LD (admin users).
    """
    queryset = NotificationLog.objects.all()
    serializer_class = NotificationLogSerializer
    permission_classes = [IsAuthenticated, RoleAccessPermission]
    required_roles = {Role.QT.value, Role.VT.value, Role.CV.value, Role.LD.value}
    
    @extend_schema(
        tags=["Notifications - Logs"],
        operation_id="notification_logs_list",
        summary="List notification logs",
        parameters=[
            OpenApiParameter(name='channel', type=OpenApiTypes.STR, location=OpenApiParameter.QUERY, required=False),
            OpenApiParameter(name='status', type=OpenApiTypes.STR, location=OpenApiParameter.QUERY, required=False),
            OpenApiParameter(name='page', type=OpenApiTypes.INT, location=OpenApiParameter.QUERY, required=False),
        ]
    )
    def list(self, request, *args, **kwargs):
        queryset = self.get_queryset()
        
        # Filter by channel
        channel = request.query_params.get('channel')
        if channel:
            queryset = queryset.filter(channel=channel)
        
        # Filter by status
        status_filter = request.query_params.get('status')
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        
        # Pagination
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response({
                "success": True,
                "data": serializer.data
            })
        
        serializer = self.get_serializer(queryset, many=True)
        return Response({
            "success": True,
            "data": serializer.data
        })
