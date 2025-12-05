# chatbot/models.py
from django.db import models
from django.conf import settings
import uuid


class ChatSession(models.Model):
    """Lưu session chat của người dùng"""
    session_id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='chat_sessions'
    )
    title = models.CharField(max_length=200, null=True, blank=True)
    
    # NEW: User context snapshot (captured at session creation)
    user_context = models.JSONField(
        null=True, 
        blank=True,
        help_text="Snapshot of user info: {username, full_name, role, department_name, department_code}"
    )
    
    # NEW: Preferences
    include_user_docs = models.BooleanField(
        default=True,
        help_text="If True, chatbot can search user's documents"
    )
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'chatbot_sessions'
        ordering = ['-updated_at']
        indexes = [
            models.Index(fields=['user', '-updated_at']),
        ]

    def __str__(self):
        return f"Session {self.session_id} - {self.user.username}"


class ChatMessage(models.Model):
    """Lưu tin nhắn chat"""
    SENDER_CHOICES = [
        ('user', 'User'),
        ('bot', 'Bot'),
    ]

    message_id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    session = models.ForeignKey(
        ChatSession,
        on_delete=models.CASCADE,
        related_name='messages'
    )
    sender = models.CharField(max_length=10, choices=SENDER_CHOICES)
    content = models.TextField()
    document_refs = models.JSONField(null=True, blank=True)  # References đến documents
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'chatbot_messages'
        ordering = ['created_at']
        indexes = [
            models.Index(fields=['session', 'created_at']),
        ]

    def __str__(self):
        return f"{self.sender}: {self.content[:50]}"


class DocumentVectorIndex(models.Model):
    """Track các document đã được index vào vectorstore"""
    VECTORSTORE_CHOICES = [
        ('faiss', 'FAISS'),
        ('chroma', 'ChromaDB'),
    ]

    attachment = models.OneToOneField(
        'documents.DocumentAttachment',
        on_delete=models.CASCADE,
        related_name='vector_index'
    )
    indexed_at = models.DateTimeField(auto_now_add=True)
    vectorstore_type = models.CharField(
        max_length=20,
        choices=VECTORSTORE_CHOICES,
        default='faiss'
    )
    chunk_count = models.IntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'chatbot_vector_indexes'
        indexes = [
            models.Index(fields=['is_active', 'indexed_at']),
        ]

    def __str__(self):
        return f"Index: {self.attachment.file_name}"
