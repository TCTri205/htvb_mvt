from __future__ import annotations

import logging
from typing import Any, Dict, Iterable, Mapping, MutableMapping, Sequence

from rest_framework import status
from rest_framework.exceptions import APIException, ValidationError, NotAuthenticated, AuthenticationFailed, PermissionDenied
from rest_framework.response import Response
from rest_framework.utils.serializer_helpers import ReturnDict, ReturnList
from rest_framework.views import exception_handler as drf_exception_handler

logger = logging.getLogger(__name__)


class ContractAPIException(APIException):
    """
    APIException phù hợp contract: luôn có detail/code và optional field_errors.
    """
    status_code = status.HTTP_400_BAD_REQUEST
    default_detail = "Bad request."
    default_code = "BAD_REQUEST"

    def __init__(
        self,
        detail: Any = None,
        *,
        code: str | None = None,
        field_errors: Mapping[str, Sequence[str]] | None = None,
        status_code: int | None = None,
    ) -> None:
        if status_code is not None:
            self.status_code = status_code
        self.field_errors = _normalise_field_errors(field_errors)
        super().__init__(detail=detail or self.default_detail, code=code or self.default_code)


class ForbiddenError(ContractAPIException):
    status_code = status.HTTP_403_FORBIDDEN
    default_detail = "Bạn không có quyền thực hiện thao tác này."
    default_code = "FORBIDDEN"


class ConflictError(ContractAPIException):
    status_code = status.HTTP_409_CONFLICT
    default_detail = "Trạng thái hiện tại không cho phép thực hiện thao tác."
    default_code = "CONFLICT"


class PreconditionFailedError(ContractAPIException):
    status_code = status.HTTP_412_PRECONDITION_FAILED
    default_detail = "Phiên bản dữ liệu không khớp."
    default_code = "PRECONDITION_FAILED"


class PreconditionRequiredError(ContractAPIException):
    status_code = status.HTTP_428_PRECONDITION_REQUIRED
    default_detail = "Thiếu điều kiện tiên quyết (If-Match)."
    default_code = "PRECONDITION_REQUIRED"


class IdempotencyConflictError(ContractAPIException):
    status_code = status.HTTP_409_CONFLICT
    default_detail = "Idempotency-Key đã được sử dụng với payload khác."
    default_code = "IDEMPOTENCY_CONFLICT"


class CorsForbiddenError(ContractAPIException):
    status_code = status.HTTP_403_FORBIDDEN
    default_detail = "Origin không được phép truy cập API."
    default_code = "CORS_FORBIDDEN"


_STATUS_DEFAULT_CODES: Dict[int, str] = {
    status.HTTP_400_BAD_REQUEST: "BAD_REQUEST",
    status.HTTP_401_UNAUTHORIZED: "UNAUTHORIZED",
    status.HTTP_403_FORBIDDEN: "FORBIDDEN",
    status.HTTP_404_NOT_FOUND: "NOT_FOUND",
    status.HTTP_405_METHOD_NOT_ALLOWED: "METHOD_NOT_ALLOWED",
    status.HTTP_409_CONFLICT: "CONFLICT",
    status.HTTP_412_PRECONDITION_FAILED: "PRECONDITION_FAILED",
    status.HTTP_428_PRECONDITION_REQUIRED: "PRECONDITION_REQUIRED",
    status.HTTP_415_UNSUPPORTED_MEDIA_TYPE: "UNSUPPORTED_MEDIA_TYPE",
    status.HTTP_429_TOO_MANY_REQUESTS: "TOO_MANY_REQUESTS",
    status.HTTP_500_INTERNAL_SERVER_ERROR: "INTERNAL_SERVER_ERROR",
}


def contract_exception_handler(exc: Exception, context: dict[str, Any]) -> Response:
    """
    Chuẩn hoá phản hồi lỗi về {detail, code, field_errors?} theo contract.
    """
    if isinstance(exc, ContractAPIException):
        payload: Dict[str, Any] = {
            "detail": _coerce_string(exc.detail),
            "code": _ensure_code(getattr(exc, "code", exc.default_code)),
        }
        if exc.field_errors:
            payload["field_errors"] = exc.field_errors
        return Response(payload, status=exc.status_code)

    if isinstance(exc, ValidationError):
        payload = _payload_from_validation_detail(exc.detail)
        return Response(payload, status=getattr(exc, "status_code", status.HTTP_400_BAD_REQUEST))

    response = drf_exception_handler(exc, context)
    if response is None:
        logger.exception("Unhandled exception propagated to API layer", exc_info=exc)
        return Response(
            {
                "detail": "Đã xảy ra lỗi không xác định.",
                "code": "INTERNAL_SERVER_ERROR",
            },
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    response.data = _transform_raw_error(
        data=response.data,
        exc=exc,
        status_code=response.status_code,
    )
    return response


# ===========================
# Helpers
# ===========================

def _payload_from_validation_detail(detail: Any) -> Dict[str, Any]:
    field_errors: Dict[str, list[str]] = {}
    message = "Yêu cầu không hợp lệ."

    if isinstance(detail, (list, ReturnList)):
        field_errors["non_field_errors"] = _coerce_list(detail)
    elif isinstance(detail, (dict, ReturnDict)):
        # detail có thể chứa {'detail': '...', 'code': '...'} hoặc field-level
        raw_detail = detail.get("detail")
        raw_code = detail.get("code")
        # Loại bỏ các key đặc biệt để không đưa vào field_errors
        remainder = {k: v for k, v in detail.items() if k not in {"detail", "code", "field_errors"}}
        if remainder:
            for key, value in remainder.items():
                field_errors[key] = _coerce_list(value)
        if isinstance(raw_detail, str):
            message = raw_detail
        elif field_errors:
            first_field = next(iter(field_errors.values()))
            if first_field:
                message = first_field[0]
        elif raw_detail:
            message = _coerce_string(raw_detail)
        code = _ensure_code(raw_code) if raw_code else "VALIDATION_ERROR"
    else:
        message = _coerce_string(detail)
        code = "VALIDATION_ERROR"

    if "code" not in locals():
        code = "VALIDATION_ERROR"

    payload: Dict[str, Any] = {"detail": message, "code": code}
    if field_errors:
        payload["field_errors"] = field_errors
    return payload


def _transform_raw_error(data: Any, *, exc: Exception, status_code: int) -> Dict[str, Any]:
    field_errors: Dict[str, list[str]] = {}
    code_override: str | None = None
    detail_message: str | None = None

    if isinstance(data, (dict, ReturnDict)):
        detail_message = _maybe_pop_detail(data)
        code_override = _pop_code(data)
        # gom phần còn lại làm field_errors
        for key, value in data.items():
            field_errors[key] = _coerce_list(value)
    elif isinstance(data, (list, ReturnList)):
        field_errors["non_field_errors"] = _coerce_list(data)
    else:
        detail_message = _coerce_string(data)

    if detail_message is None:
        if field_errors:
            first_messages = next(iter(field_errors.values()))
            if first_messages:
                detail_message = first_messages[0]
        if detail_message is None:
            detail_message = _default_detail(status_code)

    code = _determine_code(exc, status_code, code_override)

    payload: Dict[str, Any] = {
        "detail": detail_message,
        "code": code,
    }
    if field_errors:
        payload["field_errors"] = field_errors
    return payload


def _determine_code(exc: Exception, status_code: int, code_override: str | None) -> str:
    if code_override:
        return _ensure_code(code_override)
    if isinstance(exc, (NotAuthenticated, AuthenticationFailed)):
        return "UNAUTHORIZED"
    if isinstance(exc, PermissionDenied):
        return "FORBIDDEN"
    if isinstance(exc, APIException):
        code_attr = getattr(exc, "default_code", None)
        if code_attr:
            return _ensure_code(code_attr)
    return _STATUS_DEFAULT_CODES.get(status_code, "ERROR")


def _ensure_code(code: Any) -> str:
    if isinstance(code, str) and code:
        return code.upper()
    return "ERROR"


def _default_detail(status_code: int) -> str:
    mapping = {
        status.HTTP_401_UNAUTHORIZED: "Bạn cần đăng nhập để tiếp tục.",
        status.HTTP_403_FORBIDDEN: "Bạn không có quyền thực hiện thao tác này.",
        status.HTTP_404_NOT_FOUND: "Không tìm thấy tài nguyên yêu cầu.",
        status.HTTP_405_METHOD_NOT_ALLOWED: "Phương thức không được hỗ trợ.",
        status.HTTP_409_CONFLICT: "Trạng thái hiện tại không cho phép thực hiện thao tác.",
        status.HTTP_412_PRECONDITION_FAILED: "Phiên bản dữ liệu không khớp.",
        status.HTTP_428_PRECONDITION_REQUIRED: "Thiếu điều kiện tiên quyết.",
        status.HTTP_429_TOO_MANY_REQUESTS: "Bạn đã gửi quá nhiều yêu cầu. Vui lòng thử lại sau.",
        status.HTTP_500_INTERNAL_SERVER_ERROR: "Đã xảy ra lỗi không xác định.",
    }
    return mapping.get(status_code, "Yêu cầu không hợp lệ.")


def _coerce_string(value: Any) -> str:
    if isinstance(value, str):
        return value
    if isinstance(value, (list, tuple, set)):
        flattened = [ _coerce_string(v) for v in value if v is not None ]
        return "; ".join(v for v in flattened if v)
    if isinstance(value, dict):
        # Sử dụng biểu diễn key:message để debug
        parts = [f"{k}: {_coerce_string(v)}" for k, v in value.items()]
        return "; ".join(parts)
    if value is None:
        return ""
    return str(value)


def _coerce_list(value: Any) -> list[str]:
    if isinstance(value, (list, tuple, set, ReturnList)):
        out = [_coerce_string(v) for v in value]
        return [v for v in out if v]
    return [_coerce_string(value)] if value is not None else []


def _normalise_field_errors(field_errors: Mapping[str, Sequence[str]] | None) -> Dict[str, list[str]]:
    if not field_errors:
        return {}
    normalised: Dict[str, list[str]] = {}
    for key, value in field_errors.items():
        normalised[key] = _coerce_list(value)
    return {k: v for k, v in normalised.items() if v}


def _maybe_pop_detail(data: MutableMapping[str, Any]) -> str | None:
    if "detail" in data:
        detail = data.pop("detail")
        return _coerce_string(detail)
    return None


def _pop_code(data: MutableMapping[str, Any]) -> str | None:
    code = data.pop("code", None)
    if code:
        return _ensure_code(code)
    return None
