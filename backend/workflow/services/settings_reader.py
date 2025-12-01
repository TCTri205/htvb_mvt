# workflow/services/settings_reader.py
from functools import lru_cache
from typing import Optional
from django.apps import apps


def _get_model():
    """
    Tìm model SystemSetting ở các app thường gặp.
    Ưu tiên 'systemapps' (theo migration bạn đang dùng), sau đó các app khác.
    """
    for app_label in ("systemapps", "system", "settings", "core", "catalog"):
        try:
            return apps.get_model(app_label, "SystemSetting")
        except LookupError:
            continue
    return None


@lru_cache(maxsize=256)
def get_setting_raw(key: str) -> Optional[str]:
    Model = _get_model()
    if Model is None:
        return None
    return (
        Model.objects
        .filter(setting_key=key)
        .values_list("setting_value", flat=True)
        .first()
    )


def get_setting_bool(key: str, default: bool = False) -> bool:
    raw = get_setting_raw(key)
    if raw is None:
        return default
    val = str(raw).strip().lower()
    return val in ("1", "true", "yes", "y", "on")
