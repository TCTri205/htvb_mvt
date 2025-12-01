"""Catalog helpers for the lookup API."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Tuple

from django.db import models
from rest_framework.exceptions import NotFound

from .models import (
    AttachmentType,
    CaseStatus,
    CaseType,
    DocumentStatus,
    DocumentType,
    Field,
    IssueLevel,
    SecurityLevel,
    UrgencyLevel,
)


@dataclass(frozen=True)
class CatalogSpec:
    slug: str
    model: type[models.Model]
    name_field: str
    verbose_name: str

    def get_name_value(self, instance: models.Model) -> str | None:
        value = getattr(instance, self.name_field, None)
        return value.strip() if isinstance(value, str) else value


CATALOG_REGISTRY: Dict[str, CatalogSpec] = {
    "fields": CatalogSpec(
        slug="fields",
        model=Field,
        name_field="field_name",
        verbose_name="Lĩnh vực",
    ),
    "document-types": CatalogSpec(
        slug="document-types",
        model=DocumentType,
        name_field="type_name",
        verbose_name="Loại văn bản",
    ),
    "issue-levels": CatalogSpec(
        slug="issue-levels",
        model=IssueLevel,
        name_field="level_name",
        verbose_name="Mức độ quan trọng",
    ),
    "security-levels": CatalogSpec(
        slug="security-levels",
        model=SecurityLevel,
        name_field="level_name",
        verbose_name="Mức độ bảo mật",
    ),
    "urgency-levels": CatalogSpec(
        slug="urgency-levels",
        model=UrgencyLevel,
        name_field="level_name",
        verbose_name="Mức độ khẩn",
    ),
    "document-statuses": CatalogSpec(
        slug="document-statuses",
        model=DocumentStatus,
        name_field="status_name",
        verbose_name="Trạng thái văn bản",
    ),
    "case-types": CatalogSpec(
        slug="case-types",
        model=CaseType,
        name_field="case_type_name",
        verbose_name="Loại hồ sơ",
    ),
    "case-statuses": CatalogSpec(
        slug="case-statuses",
        model=CaseStatus,
        name_field="case_status_name",
        verbose_name="Trạng thái hồ sơ",
    ),
    "attachment-types": CatalogSpec(
        slug="attachment-types",
        model=AttachmentType,
        name_field="type_name",
        verbose_name="Loại tệp",
    ),
}


def get_catalog_spec(name: str) -> CatalogSpec:
    spec = CATALOG_REGISTRY.get(name)
    if spec is None:
        raise NotFound(detail=f"Danh mục '{name}' không tồn tại.")
    return spec


def catalog_choices() -> Tuple[str, ...]:
    return tuple(CATALOG_REGISTRY.keys())
