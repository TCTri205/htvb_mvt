from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from typing import Any, Optional

from django.db import transaction
from django.utils import timezone

from rest_framework.response import Response

from common.models import IdempotencyKey
from core.exceptions import IdempotencyConflictError


@dataclass(slots=True)
class _Context:
    record: IdempotencyKey
    request_hash: str
    is_new: bool


class IdempotencyService:
    """
    Quản lý Idempotency-Key dựa trên DB (IdempotencyKey model).
    """

    HEADER = "Idempotency-Key"

    def __init__(self, request) -> None:
        self.request = request
        self._ctx: Optional[_Context] = None

    def enforce(self, payload: Any) -> Optional[Response]:
        """
        Kiểm tra xem request có Idempotency-Key hay không.
        - Nếu không có header => trả None (không can thiệp).
        - Nếu có và đã từng xử lý => trả Response đã lưu (replay).
        - Nếu có nhưng payload khác => raise IdempotencyConflictError.
        - Nếu có và chưa xử lý => giữ chỗ (lock) để sau khi thành công sẽ ghi lại response.
        """
        key = self._read_header()
        if not key:
            return None

        request_hash = self._hash_payload(payload)
        owner_id = self._owner_id()
        path = self.request.path
        method = (self.request.method or "POST").upper()

        with transaction.atomic():
            record, created = IdempotencyKey.objects.select_for_update().get_or_create(
                key=key,
                owner_id=owner_id,
                path=path,
                method=method,
                defaults={
                    "request_hash": request_hash,
                    "expires_at": timezone.now() + timezone.timedelta(days=1),
                },
            )

            if created:
                self._ctx = _Context(record=record, request_hash=request_hash, is_new=True)
                return None

            # Nếu payload khác => conflict
            if record.request_hash != request_hash:
                raise IdempotencyConflictError()

            if record.response_body is None:
                self._ctx = _Context(record=record, request_hash=request_hash, is_new=False)
                return None

            return Response(record.response_body, status=record.response_status)

    def persist(self, response: Response) -> None:
        """
        Ghi lại phản hồi khi xử lý thành công.
        """
        if not self._ctx:
            return
        try:
            payload = response.data  # type: ignore[attr-defined]
        except Exception:
            payload = None

        with transaction.atomic():
            IdempotencyKey.objects.filter(pk=self._ctx.record.pk).update(
                response_status=response.status_code,
                response_body=payload,
                completed_at=timezone.now(),
                expires_at=self._ctx.record.expires_at or timezone.now() + timezone.timedelta(days=7),
            )
        self._ctx = None

    def clear_on_error(self) -> None:
        """
        Xoá bản ghi giữ chỗ nếu request kết thúc bằng exception (để client gửi lại).
        """
        if not self._ctx:
            return
        with transaction.atomic():
            IdempotencyKey.objects.filter(pk=self._ctx.record.pk, response_body__isnull=True).delete()
        self._ctx = None

    # ------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------
    def _read_header(self) -> str | None:
        meta = getattr(self.request, "META", {}) or {}
        header = meta.get("HTTP_IDEMPOTENCY_KEY")
        if isinstance(header, str) and header.strip():
            return header.strip()
        raw = getattr(self.request, "headers", {}).get(self.HEADER) if hasattr(self.request, "headers") else None
        if isinstance(raw, str) and raw.strip():
            return raw.strip()
        return None

    def _owner_id(self) -> Optional[int]:
        user = getattr(self.request, "user", None)
        if getattr(user, "is_authenticated", False):
            try:
                return int(getattr(user, "pk", None) or getattr(user, "id", None))
            except (TypeError, ValueError):
                return None
        return None

    def _hash_payload(self, payload: Any) -> str:
        if payload is None:
            raw = b"null"
        elif isinstance(payload, (bytes, bytearray, memoryview)):
            raw = bytes(payload)
        else:
            try:
                raw = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str).encode("utf-8")
            except (TypeError, ValueError):
                raw = repr(payload).encode("utf-8")
        return hashlib.sha256(raw).hexdigest()
