from django.contrib import admin
from .models import (
    Document,
    DocumentAttachment,
    RegisterBook,
    NumberingRule,
    DocumentTemplate,
)


@admin.register(Document)
class DocumentAdmin(admin.ModelAdmin):
    # Cột hiển thị: khớp field thực tế của model Document
    list_display = (
        "document_id",
        "title",
        "doc_direction",
        "document_type",
        "status",
        "created_at",
    )
    # Tìm kiếm theo các trường văn bản/mã số phổ biến
    search_fields = (
        "title",
        "document_code",
        "issue_number",
        "sender",
        "received_number",
    )
    # Lọc theo các Field thực sự tồn tại (FK/Char/DateTime)
    list_filter = (
        "doc_direction",
        "document_type",
        "status",
        "department",
        "urgency_level",
        "security_level",
        "issue_level",
        "created_at",
    )
    date_hierarchy = "created_at"
    ordering = ("-created_at",)
    list_select_related = ("document_type", "status", "department")

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        # Tối ưu N+1 cho các FK hay dùng
        return qs.select_related("document_type", "status", "department")


@admin.register(DocumentAttachment)
class DocumentAttachmentAdmin(admin.ModelAdmin):
    list_display = (
        "attachment_id",
        "document",
        "attachment_type",
        "file_name",
        "storage_path",
        "uploaded_by",
        "uploaded_at",
    )
    search_fields = ("file_name", "storage_path")
    list_filter = ("attachment_type", "uploaded_by", "uploaded_at")
    date_hierarchy = "uploaded_at"
    ordering = ("-uploaded_at",)
    list_select_related = ("document", "uploaded_by")


@admin.register(RegisterBook)
class RegisterBookAdmin(admin.ModelAdmin):
    list_display = (
        "register_id",
        "name",
        "direction",
        "year",
        "prefix",
        "suffix",
        "next_sequence",
        "is_active",
    )
    list_filter = ("direction", "year", "is_active", "department")
    search_fields = ("name", "prefix", "suffix")
    ordering = ("-year", "name")
    autocomplete_fields = ("department", "created_by", "updated_by")


@admin.register(NumberingRule)
class NumberingRuleAdmin(admin.ModelAdmin):
    list_display = (
        "rule_id",
        "code",
        "name",
        "target",
        "prefix",
        "suffix",
        "padding",
        "next_sequence",
        "is_active",
    )
    list_filter = ("target", "is_active", "department")
    search_fields = ("code", "name", "prefix", "suffix")
    ordering = ("code",)
    autocomplete_fields = ("department", "created_by", "updated_by")


@admin.register(DocumentTemplate)
class DocumentTemplateAdmin(admin.ModelAdmin):
    list_display = (
        "template_id",
        "name",
        "doc_direction",
        "version",
        "format",
        "is_active",
        "updated_at",
    )
    list_filter = ("doc_direction", "is_active")
    search_fields = ("name", "description")
    ordering = ("name", "-version")
    autocomplete_fields = ("created_by", "updated_by")
