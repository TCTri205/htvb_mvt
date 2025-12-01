from __future__ import annotations

from typing import Iterable, List
from django.contrib import admin
from django.apps import apps


def model_has_field(model, name: str) -> bool:
    if not model:
        return False
    return name in {f.name for f in model._meta.get_fields()}


def pick_existing(model, candidates: Iterable[str]) -> List[str]:
    return [n for n in candidates if model_has_field(model, n)]


# ----- Case -----
Case = None
try:
    Case = apps.get_model("workflow", "Case")
except Exception:
    Case = None

if Case:
    class CaseAdmin(admin.ModelAdmin):
        """
        Admin cho Case — động theo field đang có:
        - Ưu tiên hiển thị: case_id/id, title, department, status|status_code, deadline, created_at
        - Lọc: department, status|status_code, deadline, created_at
        - Tìm kiếm: title, instruction, goal (nếu có)
        """
        def get_list_display(self, request):
            base = []
            # PK ưu tiên
            if model_has_field(self.model, "case_id"):
                base.append("case_id")
            elif model_has_field(self.model, "id"):
                base.append("id")
            # các cột còn lại theo khả dụng
            base += pick_existing(self.model, [
                "title",
                "department",
                "status",          # FK
                "status_code",     # CharField
                "deadline",
                "created_at",
                "updated_at",
            ])
            return tuple(base)

        def get_list_filter(self, request):
            return tuple(pick_existing(self.model, [
                "department",
                "status",
                "status_code",
                "deadline",
                "created_at",
            ]))

        def get_search_fields(self, request):
            return tuple(pick_existing(self.model, [
                "title",
                "instruction",
                "goal",
            ]))

        def get_queryset(self, request):
            qs = super().get_queryset(request)
            # Tối ưu select_related nếu các FK tồn tại
            sel = []
            for fk in ("department", "status", "leader", "lead_user"):
                if model_has_field(self.model, fk):
                    sel.append(fk)
            if sel:
                qs = qs.select_related(*sel)
            return qs

        ordering = ("-created_at",)

    admin.site.register(Case, CaseAdmin)


# ----- Status -----
Status = None
try:
    Status = apps.get_model("workflow", "Status")
except Exception:
    Status = None

if Status:
    class StatusAdmin(admin.ModelAdmin):
        """
        Admin cho Status — linh hoạt theo các field có thật: scope, code, name, created_at...
        """
        def get_list_display(self, request):
            base = []
            if model_has_field(self.model, "status_id"):
                base.append("status_id")
            elif model_has_field(self.model, "id"):
                base.append("id")
            base += pick_existing(self.model, ["scope", "code", "name", "created_at"])
            return tuple(base)

        def get_list_filter(self, request):
            return tuple(pick_existing(self.model, ["scope", "created_at"]))

        def get_search_fields(self, request):
            return tuple(pick_existing(self.model, ["code", "name"]))

        ordering = ("scope", "code")

    admin.site.register(Status, StatusAdmin)


# ----- WorkflowLog (nếu có) -----
WorkflowLog = None
try:
    WorkflowLog = apps.get_model("workflow", "WorkflowLog")
except Exception:
    WorkflowLog = None

if WorkflowLog:
    class WorkflowLogAdmin(admin.ModelAdmin):
        """
        Admin cho WorkflowLog — thường có: object (document/case), old_status, new_status, actor, action, created_at...
        """
        def get_list_display(self, request):
            base = []
            if model_has_field(self.model, "log_id"):
                base.append("log_id")
            elif model_has_field(self.model, "id"):
                base.append("id")
            base += pick_existing(self.model, [
                "document",
                "case",
                "old_status",
                "new_status",
                "actor",
                "action",
                "created_at",
            ])
            return tuple(base)

        def get_list_filter(self, request):
            return tuple(pick_existing(self.model, [
                "actor",
                "old_status",
                "new_status",
                "created_at",
            ]))

        def get_search_fields(self, request):
            return tuple(pick_existing(self.model, [
                "action",
            ]))

        def get_queryset(self, request):
            qs = super().get_queryset(request)
            sel = []
            for fk in ("document", "case", "actor", "old_status", "new_status"):
                if model_has_field(self.model, fk):
                    sel.append(fk)
            if sel:
                qs = qs.select_related(*sel)
            return qs

        ordering = ("-created_at",)

    admin.site.register(WorkflowLog, WorkflowLogAdmin)


# ----- WorkflowTransition -----
WorkflowTransition = None
try:
    WorkflowTransition = apps.get_model("workflow", "WorkflowTransition")
except Exception:
    WorkflowTransition = None

if WorkflowTransition:
    @admin.register(WorkflowTransition)
    class WorkflowTransitionAdmin(admin.ModelAdmin):
        list_display = (
            "transition_id",
            "module",
            "from_status",
            "to_status",
            "is_active",
            "updated_at",
        )
        list_filter = ("module", "is_active")
        search_fields = ("from_status", "to_status", "description")
        ordering = ("module", "from_status", "to_status")
        autocomplete_fields = ("created_by", "updated_by")
