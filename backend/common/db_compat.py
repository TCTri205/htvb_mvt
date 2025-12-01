# common/db_compat.py
from __future__ import annotations
from django import VERSION as DJANGO_VERSION
from django.db import models

def CheckConstraintCompat(*, predicate, name: str, **kwargs):
    """
    Django 5.x: dùng check= ...
    Django 6.0+: dùng condition= ...
    """
    if DJANGO_VERSION >= (6, 0):
        # type: ignore[call-arg] để Pylance không phàn nàn khi chạy trên stub 5.x
        return models.CheckConstraint(condition=predicate, name=name, **kwargs)  # type: ignore[call-arg]
    else:
        return models.CheckConstraint(check=predicate, name=name, **kwargs)
