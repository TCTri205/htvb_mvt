from django.contrib import admin
from django.db.models import Count
from .models import DocumentType


@admin.register(DocumentType)
class DocumentTypeAdmin(admin.ModelAdmin):
    # Hiển thị PK, tên loại và số văn bản tham chiếu
    list_display = ("document_type_id", "type_name", "documents_count")
    search_fields = ("type_name",)
    ordering = ("type_name",)
    list_per_page = 50

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        # Annotate số lượng văn bản liên quan qua quan hệ ngược "document"
        # (đúng theo danh sách field bạn dump ra: có reverse name là "document")
        try:
            return qs.annotate(_documents_count=Count("document"))
        except Exception:
            # Nếu vì lý do nào đó reverse name khác, vẫn trả QS gốc để tránh lỗi
            return qs

    def documents_count(self, obj):
        # Ưu tiên dùng giá trị annotate (nếu có)
        val = getattr(obj, "_documents_count", None)
        if val is not None:
            return val
        # Fallback: đếm trực tiếp từ related manager "document"
        rel = getattr(obj, "document", None)
        try:
            return rel.count() if rel is not None else 0
        except Exception:
            return 0

    documents_count.short_description = "Số văn bản"
    documents_count.admin_order_field = "_documents_count"
