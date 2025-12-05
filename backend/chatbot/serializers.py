# chatbot/serializers.py
from rest_framework import serializers
from .models import ChatSession, ChatMessage


class ChatMessageSerializer(serializers.ModelSerializer):
    """Serializer cho ChatMessage"""

    class Meta:
        model = ChatMessage
        fields = ['message_id', 'sender', 'content', 'document_refs', 'created_at']
        read_only_fields = ['message_id', 'created_at']


class ChatSessionSerializer(serializers.ModelSerializer):
    """Serializer cho ChatSession với messages"""
    messages = ChatMessageSerializer(many=True, read_only=True)
    message_count = serializers.SerializerMethodField()

    class Meta:
        model = ChatSession
        fields = ['session_id', 'title', 'created_at', 'updated_at', 'messages', 'message_count']
        read_only_fields = ['session_id', 'created_at', 'updated_at']

    def get_message_count(self, obj):
        return obj.messages.count()


class ChatSessionListSerializer(serializers.ModelSerializer):
    """Serializer cho list sessions (không include messages để tối ưu performance)"""
    message_count = serializers.SerializerMethodField()
    last_message = serializers.SerializerMethodField()

    class Meta:
        model = ChatSession
        fields = ['session_id', 'title', 'created_at', 'updated_at', 'message_count', 'last_message']
        read_only_fields = ['session_id', 'created_at', 'updated_at']

    def get_message_count(self, obj):
        return obj.messages.count()

    def get_last_message(self, obj):
        last_msg = obj.messages.last()
        if last_msg:
            return {
                'content': last_msg.content[:100],  # Truncate
                'sender': last_msg.sender,
                'created_at': last_msg.created_at
            }
        return None


class ChatQuerySerializer(serializers.Serializer):
    """Serializer cho request hỏi chatbot"""
    session_id = serializers.UUIDField(required=False, allow_null=True)
    message = serializers.CharField(max_length=2000, trim_whitespace=True)

    def validate_message(self, value):
        if not value or len(value.strip()) == 0:
            raise serializers.ValidationError("Câu hỏi không được để trống")
        return value
