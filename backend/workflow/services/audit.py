# workflow/services/audit.py
from typing import Any, Optional, Mapping
from django.apps import apps
from django.utils import timezone
from workflow.services.request_context import get_client_ip


def audit_log(
    *,
    actor: Any,
    action: str,
    entity_type: Optional[str] = None,
    entity_id: Optional[Any] = None,
    before: Optional[Mapping[str, Any]] = None,
    after: Optional[Mapping[str, Any]] = None,
    ip: Optional[str] = None,
):
    """
    Ghi vào audit.audit_logs theo ERD.
    Tự động lấy IP từ middleware (contextvars) nếu ip=None.
    Chỉ set các trường tồn tại trong model để tránh lệch schema.
    """
    AuditLog = apps.get_model("audit", "AuditLog")
    field_names = {getattr(f, "name", None) for f in AuditLog._meta.get_fields()}
    field_names.discard(None)

    # Chuẩn hoá giá trị
    resolved_ip = ip or get_client_ip()
    entity_id_str = str(entity_id) if entity_id is not None else None

    data = {}

    # Các trường chung
    if "action" in field_names:
        data["action"] = action
    if "entity_type" in field_names:
        data["entity_type"] = entity_type
    if "entity_id" in field_names:
        data["entity_id"] = entity_id_str
    if "at" in field_names:
        data["at"] = timezone.now()
    if "ip" in field_names:
        data["ip"] = resolved_ip
    if "before_json" in field_names:
        data["before_json"] = dict(before) if isinstance(before, Mapping) else before
    if "after_json" in field_names:
        data["after_json"] = dict(after) if isinstance(after, Mapping) else after

    # Hỗ trợ cả hai biến thể schema: 'actor' (FK) và/hoặc 'actor_id'
    if "actor" in field_names:
        data["actor"] = actor if getattr(actor, "pk", None) else None
    if "actor_id" in field_names:
        aid = getattr(actor, "user_id", None)
        if aid is None:
            aid = getattr(actor, "pk", None)
        data["actor_id"] = aid

    AuditLog.objects.create(**data)
