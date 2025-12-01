from django.urls import path
from rest_framework.routers import DefaultRouter
from .views import CaseViewSet, CommentListCreateView, CommentDetailView

router = DefaultRouter()
router.register(r"cases", CaseViewSet, basename="case")

urlpatterns = router.urls + [
    path("comments/", CommentListCreateView.as_view(), name="comment-list-create"),
    path("comments/<int:pk>/", CommentDetailView.as_view(), name="comment-detail"),
]
