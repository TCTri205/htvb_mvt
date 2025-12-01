from __future__ import annotations

from datetime import datetime, time
from typing import Any, Iterable, List, Optional

from django.contrib.auth import get_user_model
from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime

from workflow.services import errors as wf_errors


class WorkflowActionFormMixin:
    def _get_value(self, name: str, required: bool = False, label: Optional[str] = None) -> str:
        value = (self.request.POST.get(name) or "").strip()
        if required and not value:
            raise wf_errors.ValidationError(f"Trường {label or name} không được để trống.")
        return value

    def _get_int(self, name: str, required: bool = False, label: Optional[str] = None) -> Optional[int]:
        value = self._get_value(name, required=required, label=label)
        if not value:
            return None
        try:
            return int(value)
        except ValueError:
            raise wf_errors.ValidationError(f"Giá trị của {label or name} phải là số.")

    def _parse_date(self, name: str, required: bool = False) -> Optional[Any]:
        raw = self._get_value(name, required=required)
        if not raw:
            return None
        parsed = parse_date(raw)
        if parsed is None:
            raise wf_errors.ValidationError("Định dạng ngày không hợp lệ (YYYY-MM-DD).")
        return parsed

    def _parse_datetime(self, name: str, required: bool = False) -> Optional[Any]:
        raw = self._get_value(name, required=required)
        if not raw:
            return None
        parsed = parse_datetime(raw)
        if parsed is None:
            date_part = parse_date(raw)
            if date_part:
                parsed = datetime.combine(date_part, time())
        if parsed is None:
            raise wf_errors.ValidationError("Định dạng thời gian không hợp lệ.")
        if timezone.is_naive(parsed):
            parsed = timezone.make_aware(parsed)
        return parsed

    def _parse_list(self, name: str, *, required: bool = False, label: Optional[str] = None) -> List[str]:
        raw = self._get_value(name, required=required, label=label)
        if not raw:
            return []
        parts = [part.strip() for part in raw.replace(",", " ").split() if part.strip()]
        return parts

    def _resolve_assignees(self, field_name: str = "assignees", alt_field: str = "assignee_ids") -> List[Any]:
        raw = self._get_value(field_name) or self._get_value(alt_field)
        if not raw:
            return []
        ids = [part.strip() for part in raw.replace(",", " ").split() if part.strip()]
        if not ids:
            return []
        User = get_user_model()
        return list(User.objects.filter(user_id__in=ids))
