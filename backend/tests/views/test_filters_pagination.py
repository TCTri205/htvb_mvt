# tests/views/test_filters_pagination.py
from __future__ import annotations

import datetime as dt
from typing import Optional

import pytest
from django.urls import reverse
from django.utils import timezone
from django.contrib.auth import get_user_model

from documents import models as doc_models


@pytest.mark.django_db
def test_list_filtering_combined(auth_client):
    """
    Verify list endpoint accepts combined filters:
    ?q=...&status=...&department=...&date_from=...&date_to=...&ordering=-created_at
    and returns 200 with a sensible, filtered payload.
    """
    User = get_user_model()
    creator = User.objects.create_user(username="creator1", password="x")

    # --- Optional relateds (status, department) ---
    status_obj = _ensure_related(doc_models, "status", code="PUBLISHED", name="Published")
    dept_obj = _ensure_related(doc_models, "department", code="HCTH", name="Hành chính - Tổng hợp")

    base_date = dt.date.today()
    # create 8 outbound documents along a date range; all match q="Report"
    for i in range(8):
        issued_date = base_date - dt.timedelta(days=i)
        doc_models.Document.objects.create(
            title=f"Monthly Report #{i}",
            doc_direction="di",
            issue_number=f"VB-{1000+i}",
            issued_date=issued_date,
            created_by=creator,
            **(_fk_kwargs("status", status_obj)),
            **(_fk_kwargs("department", dept_obj)),
        )

    # add one extra that will be filtered out by q (title doesn't contain 'Report')
    doc_models.Document.objects.create(
        title="Meeting Minutes",
        doc_direction="di",
        issue_number="VB-9999",
        issued_date=base_date,
        created_by=creator,
        **(_fk_kwargs("status", status_obj)),
        **(_fk_kwargs("department", dept_obj)),
    )

    url = reverse("outbound-docs-list")
    params: dict[str, str] = {
        # hỗ trợ cả hai con đường: FilterSet(q) và SearchFilter(search)
        "q": "Report",
        "search": "Report",
        "date_from": (base_date - dt.timedelta(days=7)).isoformat(),
        "date_to": base_date.isoformat(),
        "ordering": "-created_at",
    }

    # include status & department filters if we managed to create them
    if status_obj is not None:
        # Prefer id, fall back to code; force str for query params
        status_val = getattr(status_obj, "id", None) or getattr(status_obj, "code", "PUBLISHED")
        params["status"] = _as_str(status_val)
    if dept_obj is not None:
        dept_id = getattr(dept_obj, "id", None)
        if dept_id is not None:
            params["department"] = _as_str(dept_id)

    resp = auth_client.get(url, params)
    assert resp.status_code == 200

    data = resp.json()
    # Envelope chuẩn: items + metadata
    required_keys = {"items", "total_items", "total_pages", "page", "page_size"}
    assert required_keys.issubset(data), f"Pagination envelope thiếu khóa: {required_keys - set(data)}"
    results = data["items"]

    # Expect only the 8 "Report ..." docs are returned (page size default is 20)
    titles = [item.get("title") for item in results]
    # Không được chứa "Meeting Minutes"
    assert "Meeting Minutes" not in (t or "" for t in titles)
    # Tối thiểu phải có bản ghi chứa "Report"
    assert any("Report" in (t or "") for t in titles)
    # Số lượng đúng theo tạo dữ liệu
    assert len(results) == 8

    # Ensure ordering param accepted: created_at descending (nếu có field này)
    created_list = [item.get("created_at") for item in results if item.get("created_at") is not None]
    if len(created_list) >= 2:
        assert created_list == sorted(created_list, reverse=True)


@pytest.mark.django_db
def test_pagination_page_2(auth_client):
    """
    Verify pagination with ?page=2&page_size=5 returns 5 items and correct shape.
    Accepts both DRF default (next/previous) and custom (page/page_size).
    """
    User = get_user_model()
    creator = User.objects.create_user(username="creator2", password="x")

    now = timezone.now()
    for i in range(12):
        doc_models.Document.objects.create(
            title=f"Paginated Item {i}",
            doc_direction="di",
            issue_number=f"PG-{i}",
            issued_date=(now - dt.timedelta(days=i)).date(),
            created_by=creator,
        )

    url = reverse("outbound-docs-list")
    resp = auth_client.get(url, {"page": "2", "page_size": "5", "ordering": "-created_at"})
    assert resp.status_code == 200

    data = resp.json()
    keys = set(data.keys())
    required_keys = {"items", "total_items", "total_pages", "page", "page_size"}
    assert required_keys.issubset(keys)

    assert isinstance(data["items"], list)
    assert len(data["items"]) == 5
    assert data["page"] == 2
    assert data["page_size"] == 5
    assert data["total_items"] >= 12  # at least what we created


# --------------------------- helpers ---------------------------

def _as_str(v: object) -> str:
    return "" if v is None else str(v)


def _fk_kwargs(prefix: str, obj: Optional[object]) -> dict:
    """
    Build kwargs for a ForeignKey field if related object exists.
    Example: prefix="status" -> {"status": obj} else {}
    """
    return {prefix: obj} if obj is not None else {}


def _ensure_related(models_module, rel_name: str, **attrs) -> Optional[object]:
    """
    Best-effort creation of related objects used in filters (status, department).
    If the FK model is not present in the project schema, return None gracefully.
    """
    candidates = {
        "status": ["DocumentStatus", "Status"],
        "department": ["Department", "OrgUnit"],
    }.get(rel_name, [])

    # 1) try explicit candidates on known apps
    for cls_name in candidates:
        obj = _try_create(getattr_safe(models_module, cls_name), **attrs)
        if obj:
            return obj

    # 2) derive from Document FK if exists
    try:
        fk = models_module.Document._meta.get_field(rel_name)  # type: ignore[attr-defined]
        rel_model = getattr(fk, "remote_field").model  # type: ignore[attr-defined]
        obj = _try_create(rel_model, **attrs)
        if obj:
            return obj
    except Exception:
        pass

    # 3) Last resort: try "catalog.models"
    try:
        from catalog import models as catalog_models  # type: ignore
        for cls_name in candidates:
            obj = _try_create(getattr_safe(catalog_models, cls_name), **attrs)
            if obj:
                return obj
    except Exception:
        pass

    return None


def _try_create(model_cls, **attrs) -> Optional[object]:
    if not model_cls:
        return None
    try:
        # Fill minimal required fields heuristically
        payload = dict(attrs)
        for f in model_cls._meta.concrete_fields:  # type: ignore[attr-defined]
            if getattr(f, "primary_key", False):
                continue
            name = f.name
            if name in payload:
                continue
            # Provide fallback for common simple fields
            from django.db.models import CharField, IntegerField
            if getattr(f, "null", True):
                continue
            if isinstance(f, CharField):
                payload[name] = f"{model_cls.__name__}-{name}"
            elif isinstance(f, IntegerField):
                payload[name] = 1
        return model_cls.objects.create(**payload)
    except Exception:
        return None


def getattr_safe(obj, name: str):
    try:
        return getattr(obj, name)
    except Exception:
        return None
