# chatbot/urls.py
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import ChatbotViewSet, ChatSessionViewSet

router = DefaultRouter()
router.register(r'bot', ChatbotViewSet, basename='chatbot')
router.register(r'sessions', ChatSessionViewSet, basename='chat-session')

urlpatterns = [
    path('', include(router.urls)),
]
