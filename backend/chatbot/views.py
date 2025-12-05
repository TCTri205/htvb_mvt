# chatbot/views.py
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.authentication import SessionAuthentication
from rest_framework_simplejwt.authentication import JWTAuthentication
from django.conf import settings
import logging

from .models import ChatSession, ChatMessage
from .serializers import (
    ChatSessionSerializer,
    ChatSessionListSerializer,
    ChatMessageSerializer,
    ChatQuerySerializer
)
from .services.rag_service import ask_rag, is_initialized, initialize_rag
from .services.pdf_loader import get_pdf_count

logger = logging.getLogger(__name__)


class ChatbotViewSet(viewsets.ViewSet):
    """
    ViewSet cho chatbot RAG operations
    Support both JWT and Session authentication
    """
    authentication_classes = [SessionAuthentication, JWTAuthentication]
    permission_classes = [IsAuthenticated]
    
    @action(detail=False, methods=['get'])
    def status(self, request):
        """
        GET /api/v1/chatbot/bot/status/
        Kiểm tra trạng thái RAG system
        """
        pdf_count = get_pdf_count()
        initialized = is_initialized()
        
        # Auto-initialize if PDFs exist but system not initialized
        if pdf_count > 0 and not initialized:
            logger.info(f"Found {pdf_count} PDFs but RAG not initialized. Auto-initializing...")
            try:
                initialize_rag()
                initialized = True
                logger.info("✓ Auto-initialization successful")
            except Exception as e:
                logger.error(f"Failed to auto-initialize RAG: {e}")
                # Don't fail the request - just report status
                return Response({
                    'initialized': False,
                    'vectorstore_type': getattr(settings, 'CHATBOT_VECTORSTORE_TYPE', 'faiss'),
                    'pdf_count': pdf_count,
                    'k': getattr(settings, 'CHATBOT_K', 5),
                    'score_threshold': getattr(settings, 'CHATBOT_SCORE_THRESHOLD', 0.2),
                    'auto_init_failed': True,
                    'error': str(e)
                })
        
        return Response({
            'initialized': initialized,
            'vectorstore_type': getattr(settings, 'CHATBOT_VECTORSTORE_TYPE', 'faiss'),
            'pdf_count': pdf_count,
            'k': getattr(settings, 'CHATBOT_K', 5),
            'score_threshold': getattr(settings, 'CHATBOT_SCORE_THRESHOLD', 0.2)
        })
    
    @action(detail=False, methods=['post'])
    def chat(self, request):
        """
        POST /api/v1/chatbot/bot/chat/
        Chat với RAG system
        
        Body:
            {
                "session_id": "uuid" (optional),
                "message": "câu hỏi"
            }
        """
        serializer = ChatQuerySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        # Lấy hoặc tạo session
        session_id = serializer.validated_data.get('session_id')
        if session_id:
            try:
                session = ChatSession.objects.get(session_id=session_id, user=request.user)
            except ChatSession.DoesNotExist:
                return Response(
                    {'error': 'Session không tồn tại hoặc không thuộc về bạn'},
                    status=status.HTTP_404_NOT_FOUND
                )
        else:
            # NEW: Capture user context when creating new session
            from .utils import get_user_context
            user_ctx = get_user_context(request.user)
            
            session = ChatSession.objects.create(
                user=request.user,
                user_context=user_ctx
            )
            logger.info(f"Created new chat session: {session.session_id} for user {request.user.username} with context: {user_ctx}")
        
        # Lưu message user
        user_message = ChatMessage.objects.create(
            session=session,
            sender='user',
            content=serializer.validated_data['message']
        )
        
        # Gọi RAG (đã được khởi tạo sẵn khi server start)
        try:
            # Check if RAG is ready (should be initialized on server startup)
            if not is_initialized():
                logger.error("RAG system not initialized")
                return Response(
                    {
                        'error': 'Hệ thống chatbot chưa sẵn sàng. Vui lòng thử lại sau hoặc liên hệ quản trị viên.',
                        'detail': 'RAG system not initialized on startup'
                    },
                    status=status.HTTP_503_SERVICE_UNAVAILABLE
                )
            
            bot_reply = ask_rag(
                serializer.validated_data['message'],
                user_context=session.user_context,
                user=request.user
            )
            
            # Lưu reply bot
            bot_message = ChatMessage.objects.create(
                session=session,
                sender='bot',
                content=bot_reply
            )
            
            return Response({
                'session_id': str(session.session_id),
                'user_message': ChatMessageSerializer(user_message).data,
                'bot_message': ChatMessageSerializer(bot_message).data,
                'status': 'success'
            })
        
        except Exception as e:
            logger.error(f"Error in chat endpoint: {str(e)}", exc_info=True)
            return Response(
                {'error': str(e), 'status': 'error'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=False, methods=['post'])
    def initialize(self, request):
        """
        POST /api/v1/chatbot/bot/initialize/
        Khởi tạo lại RAG system (admin only)
        """
        if not request.user.is_staff:
            return Response(
                {'error': 'Permission denied. Admin only.'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        try:
            logger.info(f"Initializing RAG system requested by {request.user.username}")
            initialize_rag()
            pdf_count = get_pdf_count()
            
            return Response({
                'status': 'success',
                'message': f'RAG system initialized với {pdf_count} PDFs',
                'pdf_count': pdf_count
            })
        except Exception as e:
            logger.error(f"Error initializing RAG: {str(e)}", exc_info=True)
            return Response(
                {'error': str(e), 'status': 'error'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

class ChatSessionViewSet(viewsets.ModelViewSet):
    """
    ViewSet để quản lý chat sessions
    Support both JWT and Session authentication
    """
    authentication_classes = [SessionAuthentication, JWTAuthentication]
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        return ChatSession.objects.filter(user=self.request.user).prefetch_related('messages')
    
    def get_serializer_class(self):
        if self.action == 'list':
            return ChatSessionListSerializer
        return ChatSessionSerializer
    
    def perform_create(self, serializer):
        serializer.save(user=self.request.user)
    
    @action(detail=True, methods=['delete'])
    def clear_messages(self, request, pk=None):
        """
        DELETE /api/v1/chatbot/sessions/{id}/clear_messages/
        Xóa tất cả messages trong session
        """
        session = self.get_object()
        count = session.messages.count()
        session.messages.all().delete()
        
        logger.info(f"Cleared {count} messages from session {session.session_id}")
        
        return Response({
            'status': 'success',
            'message': f'Đã xóa {count} tin nhắn',
            'deleted_count': count
        })
