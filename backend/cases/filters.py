# cases/filters.py
from __future__ import annotations

from django.db.models import Q, QuerySet
import django_filters
from typing import Optional

from cases.models import Case


class CaseFilterSet(django_filters.FilterSet):
    """
    Bộ lọc cho /cases:
      - q: tìm kiếm theo mã, tiêu đề, mô tả.
      - status_id, department_id, owner_id, leader_id: lọc theo FK tương ứng.
    """

    q = django_filters.CharFilter(method="filter_q")
    status_id = django_filters.NumberFilter(field_name="status_id")
    department_id = django_filters.NumberFilter(field_name="department_id")
    owner_id = django_filters.UUIDFilter(field_name="owner_id")
    participant_id = django_filters.UUIDFilter(method="filter_participant")
    leader_id = django_filters.UUIDFilter(field_name="leader_id")

    class Meta:
        model = Case
        fields = [
            "q",
            "status_id",
            "department_id",
            "owner_id",
            "leader_id",
            "participant_id",
        ]

    def filter_q(self, qs: QuerySet[Case], name: str, value: str) -> QuerySet[Case]:
        if not value:
            return qs
        value = value.strip()
        if not value:
            return qs
        return qs.filter(
            Q(case_code__icontains=value)
            | Q(title__icontains=value)
            | Q(description__icontains=value)
        )

    def filter_participant(
        self, qs: QuerySet[Case], name: str, value: Optional[str]
    ) -> QuerySet[Case]:
        if not value:
            return qs
        return qs.filter(participants__user_id=value)
