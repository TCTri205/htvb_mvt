from functools import lru_cache
from typing import Iterable, Optional, Set

from workflow.services.status_resolver import (
    StatusResolver as SR,
    DRAFT_STATUSES,
    OutboundStatus,
)

# Các trạng thái mà Chuyên viên có thể được phân công xử lý (Draft/Return)
# Dựa trên tập DRAFT_STATUSES từ StatusResolver, nhưng có thể filter thêm nếu cần.
# Ở đây ta dùng logic tương tự cũ: Draft + Submitted + Returned.

_CV_ASSIGNABLE_DRAFT_STATUS_NAMES: Set[str] = {
    OutboundStatus.DRAFT.value,
    OutboundStatus.SUBMITTED.value,
    # Legacy mappings (no longer in enum)
    "DU_THAO",
    "TRINH_DUYET",
}

_CV_ASSIGNABLE_RETURN_STATUS_NAMES: Set[str] = {
    # RETURNED status removed from workflow → maps to DRAFT
    "RETURNED",
    "TRA_LAI",
}


def _cv_status_ids(names: Iterable[str]) -> Set[int]:
    ids: Set[int] = set()
    for name in names:
        try:
            ids.add(SR.doc_status_id(name))
        except Exception:
            continue
    return ids


@lru_cache(maxsize=None)
def _cv_draft_status_ids() -> Set[int]:
    # Sử dụng tập hợp con cụ thể hoặc dùng chung DRAFT_STATUSES nếu logic cho phép.
    # Logic cũ: Draft, Submitted, Legacy...
    # Logic mới: DRAFT_STATUSES bao gồm cả Returned, nhưng ở đây ta tách biệt Draft vs Return
    # để phân quyền (UPDATE_DRAFT vs EDIT_AFTER_RETURN).
    
    # Lấy tất cả alias map tới DRAFT/SUBMITTED
    return _cv_status_ids(_CV_ASSIGNABLE_DRAFT_STATUS_NAMES)


@lru_cache(maxsize=None)
def _cv_return_status_ids() -> Set[int]:
    return _cv_status_ids(_CV_ASSIGNABLE_RETURN_STATUS_NAMES)


def cv_assignable_status_kind(status_id: Optional[int]) -> Optional[str]:
    if status_id is None:
        return None
    if status_id in _cv_draft_status_ids():
        return "draft"
    if status_id in _cv_return_status_ids():
        return "return"
    return None
