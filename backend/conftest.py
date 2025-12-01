# conftest.py (đặt ở thư mục gốc dự án)
from __future__ import annotations
import os
import importlib

def pytest_configure():
    """
    - Nếu TEST_DATABASE_URL có mà DATABASE_URL chưa có, tự map DATABASE_URL=TEST_DATABASE_URL
      để các test đơn lẻ vẫn dùng cùng DB test của bạn.
    - KHÔNG đặt DJANGO_SETTINGS_MODULE ở đây (để pytest-django tự dò do đã set django_find_project=true).
      Tuy nhiên, nếu bạn muốn phòng ngừa môi trường đặc biệt không dò được, có thể bật Fallback list.
    """
    test_db_url = os.getenv("TEST_DATABASE_URL")
    if test_db_url and not os.getenv("DATABASE_URL"):
        os.environ["DATABASE_URL"] = test_db_url

    # Tuỳ chọn fallback SIÊU AN TOÀN (tắt mặc định).
    # Nếu muốn bật, bỏ comment và điền đúng tên module settings của bạn trước tiên trong candidates.
    """
    if not os.getenv("DJANGO_SETTINGS_MODULE"):
        candidates = [
            "config.settings",
            "backend.settings",
            "core.settings",
            "project.settings",
            "settings",
        ]
        for mod in candidates:
            try:
                importlib.import_module(mod)
                os.environ["DJANGO_SETTINGS_MODULE"] = mod
                break
            except Exception:
                continue
    """
