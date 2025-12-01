# # tests/urls_stub.py
# from django.urls import path
# from django.http import HttpResponse

# def ok(_):
#     return HttpResponse("OK")

# urlpatterns = [path("", ok)]

# tests/urls_stub.py
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from drf_spectacular.views import SpectacularAPIView

from documents.views_outbound import OutboundDocumentViewSet
from documents.views_inbound import InboundDocumentViewSet

router = DefaultRouter()
router.register(r"outbound-docs", OutboundDocumentViewSet, basename="outbound-docs")
router.register(r"inbound-docs", InboundDocumentViewSet, basename="inbound-docs")

urlpatterns = [
    path("api/v1/", include(router.urls)),
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
]
