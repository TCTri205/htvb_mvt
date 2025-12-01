# workflow/services/errors.py
from typing import Any, Dict, Mapping, Optional


class ServiceError(Exception):
    def __init__(
        self,
        message: str,
        *,
        code: Optional[str] = None,
        extra: Optional[Mapping[str, Any]] = None,
    ):
        self.message: str = message
        self.code: Optional[str] = code
        self.extra: Optional[Mapping[str, Any]] = extra
        super().__init__(message)

    def __str__(self) -> str:  # giúp log/error hiển thị gọn
        return self.message

    def to_dict(self) -> Dict[str, Any]:
        # Khai báo kiểu rõ ràng để Pylance hiểu value có thể là Any (str | dict | ...)
        data: Dict[str, Any] = {"detail": self.message}
        if self.code is not None:
            data["code"] = self.code
        if self.extra is not None:
            # ép về dict để đảm bảo JSON-serializable (nếu extra là Mapping)
            data["extra"] = dict(self.extra)
        return data


class PermissionDenied(ServiceError):
    def __init__(
        self,
        message: str = "Không có quyền thực hiện hành động này.",
        *,
        code: str = "PERMISSION_DENIED",
        extra: Optional[Mapping[str, Any]] = None,
    ):
        super().__init__(message, code=code, extra=extra)


class InvalidTransition(ServiceError):
    def __init__(
        self,
        message: str = "Chuyển trạng thái không hợp lệ.",
        *,
        code: str = "INVALID_TRANSITION",
        extra: Optional[Mapping[str, Any]] = None,
    ):
        super().__init__(message, code=code, extra=extra)


class ValidationError(ServiceError):
    def __init__(
        self,
        message: str = "Dữ liệu không hợp lệ.",
        *,
        code: str = "VALIDATION_ERROR",
        extra: Optional[Mapping[str, Any]] = None,
    ):
        super().__init__(message, code=code, extra=extra)
