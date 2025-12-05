# chatbot/admin.py
from django.contrib import admin
from .models import ChatSession, ChatMessage, DocumentVectorIndex


@admin.register(ChatSession)
class ChatSessionAdmin(admin.ModelAdmin):
    list_display = ['session_id', 'user', 'title', 'created_at', 'message_count']
    list_filter = ['created_at', 'user']
    search_fields = ['title', 'user__username']
    readonly_fields = ['session_id', 'created_at', 'updated_at']
    date_hierarchy = 'created_at'

    def message_count(self, obj):
        return obj.messages.count()
    message_count.short_description = 'Số tin nhắn'


@admin.register(ChatMessage)
class ChatMessageAdmin(admin.ModelAdmin):
    list_display = ['message_id', 'session', 'sender', 'content_preview', 'created_at']
    list_filter = ['sender', 'created_at']
    search_fields = ['content']
    readonly_fields = ['message_id', 'created_at']
    date_hierarchy = 'created_at'

    def content_preview(self, obj):
        return obj.content[:100] if len(obj.content) > 100 else obj.content
    content_preview.short_description = 'Nội dung'


@admin.register(DocumentVectorIndex)
class DocumentVectorIndexAdmin(admin.ModelAdmin):
    list_display = ['attachment', 'vectorstore_type', 'chunk_count', 'indexed_at', 'is_active']
    list_filter = ['vectorstore_type', 'is_active', 'indexed_at']
    search_fields = ['attachment__file_name']
    readonly_fields = ['indexed_at']
    date_hierarchy = 'indexed_at'
