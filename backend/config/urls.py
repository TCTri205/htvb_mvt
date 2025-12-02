# config/urls.py
"""
URL configuration for backend (API-only).

- Admin
- Auth (JWT): /api/v1/auth/jwt/create, /api/v1/auth/jwt/refresh, /api/v1/auth/jwt/verify, /api/v1/auth/me
  (giữ redirect tạm thời cho /api/v1/auth/login và /api/v1/auth/refresh)
- OpenAPI/Swagger (drf-spectacular + core.docs):
    /api/v1/schema/  (JSON/YAML, content-negotiated)
    /api/v1/docs/    (Swagger UI)
    /api/v1/redoc/   (ReDoc)
- API v1 (DRF Router):
    /api/v1/documents/...
"""

from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from django.views.generic import RedirectView
from rest_framework.routers import DefaultRouter

from accounts.views_auth import LogoutView
from archive.api import ArchiveSummaryView
from cases.views import CaseTaskDetailView, CommentListCreateView, CommentDetailView

# ===== Schema & Docs (ưu tiên ở đầu để 'schema' trỏ tới SchemaViewWithServers) =====
from core.docs import urlpatterns as docs_urls  # cung cấp /api/v1/schema|docs|redoc

# ===== DRF Router (v1) =====
router_v1 = DefaultRouter()  # trailing slash ON (mặc định)

def _register_v1_routes() -> None:
    """
    Đăng ký ViewSet cho API v1.
    Import bên trong hàm để tránh import nặng ở module-level và hạn chế vòng lặp.
    """
    from accounts.api_admin import (
        DepartmentViewSet,
        ClerkViewSet,
        PermissionViewSet,
        RoleAdminViewSet,
        SpecialistViewSet,
        UserAdminViewSet,
    )
    from documents.views import DocumentViewSet, OrganizationViewSet, DispatchViewSet
    from documents.views_inbound import InboundDocumentViewSet
    from documents.views_config import (
        RegisterBookViewSet,
        NumberingRuleViewSet,
        DocumentTemplateViewSet,
    )
    from workflow.views import WorkflowTransitionViewSet
    from archive.api import ArchiveBackupViewSet, ArchiveQueueViewSet, RetentionPolicyViewSet



    from cases.views import CaseViewSet
    from notifications.api import NotificationViewSet, ReminderViewSet, JobViewSet
    from notifications.channel_views import (
        NotificationChannelViewSet,
        AutomationRuleViewSet,
        NotificationLogViewSet,
    )
    from audit.api import AuditLogViewSet
    from systemapps.api import SystemSettingViewSet
    from reports.api import ReportDefinitionViewSet, ReportExportViewSet

    #  === Domain ===
    router_v1.register(r"documents", DocumentViewSet, basename="document")
    router_v1.register(r"organizations", OrganizationViewSet, basename="organization")
    router_v1.register(r"dispatches", DispatchViewSet, basename="dispatch")
    router_v1.register(r"inbound-docs", InboundDocumentViewSet, basename="inbound-docs")
    router_v1.register(r"register-books", RegisterBookViewSet, basename="register-book")
    router_v1.register(r"numbering-rules", NumberingRuleViewSet, basename="numbering-rule")
    router_v1.register(r"document-templates", DocumentTemplateViewSet, basename="document-template")
    router_v1.register(r"workflow-transitions", WorkflowTransitionViewSet, basename="workflow-transition")

    router_v1.register(r"cases", CaseViewSet, basename="case")
    router_v1.register(r"reports/definitions", ReportDefinitionViewSet, basename="report-definitions")
    router_v1.register(r"report-exports", ReportExportViewSet, basename="report-exports")
    
    # Admin endpoints
    router_v1.register(r"departments", DepartmentViewSet, basename="department")
    router_v1.register(r"clerks", ClerkViewSet, basename="clerk")
    router_v1.register(r"specialists", SpecialistViewSet, basename="specialist")
    router_v1.register(r"admin/users", UserAdminViewSet, basename="admin-user")
    router_v1.register(r"admin/roles", RoleAdminViewSet, basename="admin-role")
    router_v1.register(r"admin/permissions", PermissionViewSet, basename="admin-permission")
    # Legacy aliases to avoid 404 khi FE cũ gọi /api/v1/users|roles|permissions
    router_v1.register(r"users", UserAdminViewSet, basename="legacy-user")
    router_v1.register(r"roles", RoleAdminViewSet, basename="legacy-role")
    router_v1.register(r"permissions", PermissionViewSet, basename="legacy-permission")
    router_v1.register(r"system-settings", SystemSettingViewSet, basename="system-setting")
    
    # Notification channel management
    router_v1.register(r"notifications/channels", NotificationChannelViewSet, basename="notification-channels")
    router_v1.register(r"notifications/automation-rules", AutomationRuleViewSet, basename="automation-rules")
    router_v1.register(r"notifications/logs", NotificationLogViewSet, basename="notification-logs")
    router_v1.register(r"audit-logs", AuditLogViewSet, basename="audit-log")
    router_v1.register(r"archive/backups", ArchiveBackupViewSet, basename="archive-backup")
    router_v1.register(r"archive/queue", ArchiveQueueViewSet, basename="archive-queue")
    router_v1.register(r"archive/policies", RetentionPolicyViewSet, basename="archive-policy")
    
    # Notification user endpoints
    router_v1.register(r"notifications", NotificationViewSet, basename="notification")
    router_v1.register(r"reminders", ReminderViewSet, basename="reminder")
    router_v1.register(r"jobs", JobViewSet, basename="job")

_register_v1_routes()

urlpatterns = [
    # ---- OpenAPI/Swagger/Redoc ----
    *docs_urls,  # /api/v1/schema/ (name="schema"), /api/v1/docs/, /api/v1/redoc/

    # ---- Admin ----
    path("admin/", admin.site.urls),

    # ---- Auth (JWT) ----
    path("auth/logout/", LogoutView.as_view(), name="auth-logout-compat"),

    # ---- API v1 (router first, then auth endpoints)
    path("api/v1/", include(router_v1.urls)),
    path("api/v1/", include("accounts.urls")),
    # Redirect tương thích đường dẫn cũ (tùy chọn; có thể bỏ khi FE đã cập nhật)
    path("api/v1/auth/login",   RedirectView.as_view(url="/api/v1/auth/jwt/create/",  permanent=False)),
    path("api/v1/auth/refresh", RedirectView.as_view(url="/api/v1/auth/jwt/refresh/", permanent=False)),

    # ---- API v1 (domain routers) ----
    path("api/v1/case-tasks/<int:pk>/", CaseTaskDetailView.as_view(), name="case-task-detail"),
    path("api/v1/comments/", CommentListCreateView.as_view(), name="comment-list"),
    path("api/v1/comments/<int:pk>/", CommentDetailView.as_view(), name="comment-detail"),

    # ---- Search ----
    path("api/v1/search", lambda request, *args, **kwargs: __import__("common.search", fromlist=["UnifiedSearchView"]).UnifiedSearchView.as_view()(request, *args, **kwargs), name="unified-search"),

    # ---- Analytics ----
    path("api/v1/analytics/dashboard", lambda request, *args, **kwargs: __import__("analytics.views", fromlist=["DashboardKPIView"]).DashboardKPIView.as_view()(request, *args, **kwargs), name="analytics-dashboard"),
    path("api/v1/analytics/leader-dashboard", lambda request, *args, **kwargs: __import__("analytics.views", fromlist=["LeaderDashboardView"]).LeaderDashboardView.as_view()(request, *args, **kwargs), name="analytics-leader-dashboard"),
    path("api/v1/analytics/documents/by-type", lambda request, *args, **kwargs: __import__("analytics.views", fromlist=["DocumentsByTypeView"]).DocumentsByTypeView.as_view()(request, *args, **kwargs), name="analytics-docs-by-type"),
    path("api/v1/analytics/performance/by-department", lambda request, *args, **kwargs: __import__("analytics.views", fromlist=["DepartmentPerformanceView"]).DepartmentPerformanceView.as_view()(request, *args, **kwargs), name="analytics-dept-performance"),
    path("api/v1/analytics/performance/top-users", lambda request, *args, **kwargs: __import__("analytics.views", fromlist=["UserPerformanceView"]).UserPerformanceView.as_view()(request, *args, **kwargs), name="analytics-user-performance"),
    path("api/v1/analytics/activity/timeline", lambda request, *args, **kwargs: __import__("analytics.views", fromlist=["ActivityTimelineView"]).ActivityTimelineView.as_view()(request, *args, **kwargs), name="analytics-timeline"),
    path("api/v1/analytics/documents/by-priority", lambda request, *args, **kwargs: __import__("analytics.views", fromlist=["PriorityDistributionView"]).PriorityDistributionView.as_view()(request, *args, **kwargs), name="analytics-priority"),
    path("api/v1/analytics/documents/by-status", lambda request, *args, **kwargs: __import__("analytics.views", fromlist=["DocumentsByStatusView"]).DocumentsByStatusView.as_view()(request, *args, **kwargs), name="analytics-docs-by-status"),
    path("api/v1/analytics/export", lambda request, *args, **kwargs: __import__("analytics.views", fromlist=["ExportReportView"]).ExportReportView.as_view()(request, *args, **kwargs), name="analytics-export"),
    path("api/v1/analytics/documents/status-summary", lambda request, *args, **kwargs: __import__("analytics.views", fromlist=["DocumentStatusSummaryView"]).DocumentStatusSummaryView.as_view()(request, *args, **kwargs), name="analytics-docs-status-summary"),
    path("api/v1/archive/summary", ArchiveSummaryView.as_view(), name="archive-summary"),
    path("api/v1/archive/summary/", ArchiveSummaryView.as_view(), name="archive-summary-slash"),
    
    # ---- Notification Channels ----
    path("api/v1/notifications/channels/stats", lambda request, *args, **kwargs: __import__("notifications.channel_views", fromlist=["ChannelStatsView"]).ChannelStatsView.as_view()(request, *args, **kwargs), name="channel-stats"),

    # ---- Emergency Fix ----
    path("api/v1/fix-department/", lambda request, *args, **kwargs: __import__("documents.api_fix", fromlist=["fix_department_assignment"]).fix_department_assignment(request, *args, **kwargs), name="fix-department"),
    path("api/v1/debug-specialists/", lambda request, *args, **kwargs: __import__("documents.api_debug", fromlist=["debug_specialists"]).debug_specialists(request, *args, **kwargs), name="debug-specialists"),

    path("api/v1/catalog/", include(("catalog.urls", "catalog"), namespace="catalog")),

    # ---- UI routes (MVT) ----
    path("", include(("ui.urls_chung", "ui"), namespace="ui")),
    path("quantri/", include(("ui.urls_quantri", "ui_quantri"), namespace="ui_quantri")),
    path("vanthu/", include(("ui.urls_vanthu", "ui_vanthu"), namespace="ui_vanthu")),
    path("lanhdao/", include(("ui.urls_lanhdao", "ui_lanhdao"), namespace="ui_lanhdao")),
    path("chuyenvien/", include(("ui.urls_chuyenvien", "ui_chuyenvien"), namespace="ui_chuyenvien")),
]

# Phục vụ MEDIA/STATIC trong môi trường dev
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)

# (Tuỳ chọn) Debug Toolbar
# if settings.DEBUG and "debug_toolbar" in settings.INSTALLED_APPS:
#     import debug_toolbar
#     urlpatterns += [path("__debug__/", include(debug_toolbar.urls))]
