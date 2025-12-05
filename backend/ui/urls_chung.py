from django.urls import path

from . import views_chung as v
from . import views

app_name = "ui"

urlpatterns = [
    path("", v.IndexView.as_view(), name="index"),
    path("index/", v.IndexView.as_view()),
    path("login/", v.LoginView.as_view(), name="login"),
    path("template/", v.TemplateSampleView.as_view(), name="template"),
    path("chatbot/", views.chatbot_ui, name="chatbot"),  # Chatbot RAG UI
]
