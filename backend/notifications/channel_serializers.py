# notifications/channel_serializers.py
"""
Serializers for notification channel management endpoints.
"""
from rest_framework import serializers
from .models import NotificationChannel, AutomationRule, NotificationLog


class NotificationChannelSerializer(serializers.ModelSerializer):
    """Serializer for notification channels."""
    success_rate = serializers.ReadOnlyField()
    channel_type_display = serializers.CharField(source='get_channel_type_display', read_only=True)
    
    class Meta:
        model = NotificationChannel
        fields = [
            'channel_id',
            'channel_type',
            'channel_type_display',
            'is_enabled',
            'config',
            'sent_count',
            'error_count',
            'success_rate',
            'last_used_at',
            'created_at',
            'updated_at'
        ]
        read_only_fields = ['channel_id', 'sent_count', 'error_count', 'last_used_at', 'created_at', 'updated_at']


class ChannelStatsSerializer(serializers.Serializer):
    """Serializer for channel statistics summary."""
    active_channels_count = serializers.IntegerField()
    total_sent_30days = serializers.IntegerField()
    total_errors_30days = serializers.IntegerField()
    automation_rules_active = serializers.IntegerField()


class TestChannelRequestSerializer(serializers.Serializer):
    """Serializer for test channel request."""
    recipient = serializers.EmailField(required=True, help_text="Test recipient email")


class TestChannelResponseSerializer(serializers.Serializer):
    """Serializer for test channel response."""
    success = serializers.BooleanField()
    message = serializers.CharField()
    details = serializers.DictField(required=False)


class AutomationRuleSerializer(serializers.ModelSerializer):
    """Serializer for automation rules."""
    trigger_display = serializers.CharField(source='get_trigger_display', read_only=True)
    
    class Meta:
        model = AutomationRule
        fields = [
            'rule_id',
            'name',
            'trigger',
            'trigger_display',
            'is_enabled',
            'channels',
            'conditions',
            'template',
            'created_at',
            'updated_at'
        ]
        read_only_fields = ['rule_id', 'created_at', 'updated_at']
    
    def validate_channels(self, value):
        """Validate channels list contains valid channel types."""
        valid_channels = ['email', 'push', 'sms']
        if not isinstance(value, list):
            raise serializers.ValidationError("Channels must be a list")
        
        invalid = [ch for ch in value if ch not in valid_channels]
        if invalid:
            raise serializers.ValidationError(f"Invalid channels: {', '.join(invalid)}")
        
        return value


class NotificationLogSerializer(serializers.ModelSerializer):
    """Serializer for notification logs."""
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    rule_name = serializers.CharField(source='rule.name', read_only=True, allow_null=True)
    
    class Meta:
        model = NotificationLog
        fields = [
            'log_id',
            'channel',
            'recipient',
            'title',
            'body',
            'status',
            'status_display',
            'sent_at',
            'error_message',
            'rule',
            'rule_name'
        ]
        read_only_fields = ['log_id', 'sent_at']
