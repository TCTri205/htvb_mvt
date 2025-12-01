from __future__ import annotations

import hashlib
from datetime import datetime
from typing import Any


def build_etag(instance: Any, *, prefix: str | None = None) -> str:
    """
    Sinh ETag cho instance dựa trên pk + updated_at (fallback created_at).
    """
    if instance is None:
        raise ValueError("Cannot build ETag for None instance.")

    pk = (
        getattr(instance, "pk", None)
        or getattr(instance, "id", None)
        or getattr(instance, "document_id", None)
        or getattr(instance, "case_id", None)
    )
    timestamp = _pick_timestamp(instance)
    base = f"{prefix or instance.__class__.__name__}:{pk}:{timestamp}"
    digest = hashlib.sha256(base.encode("utf-8")).hexdigest()
    return f'W/\"{digest}\"'


def _pick_timestamp(instance: Any) -> str:
    for attr in ("updated_at", "updated_on", "modified_at", "modified"):
        value = getattr(instance, attr, None)
        if value is not None:
            return _format_ts(value)
    fallback = getattr(instance, "created_at", None)
    return _format_ts(fallback)


def _format_ts(value: Any) -> str:
    if hasattr(value, "isoformat"):
        return value.isoformat()
    if isinstance(value, datetime):
        return value.isoformat()
    return str(value)
