from functools import lru_cache
from enum import StrEnum
from typing import Any, Dict, Iterable, Optional, Set
import re
import unicodedata
from django.apps import apps


class InboundStatus(StrEnum):
    """Canonical inbound document statuses.
    
    Legacy Vietnamese statuses (TIEP_NHAN, PHAN_CONG, etc.) are handled
    via alias mappings below for backward compatibility with old data.
    """
    RECEIVED = "RECEIVED"
    WAITING_ASSIGNMENT = "WAITING_ASSIGNMENT"
    PROCESSING = "PROCESSING"
    PENDING_LEADER_APPROVAL = "PENDING_LEADER_APPROVAL"
    PENDING_CLERK_CHECK = "PENDING_CLERK_CHECK"
    REGISTERED = "REGISTERED"
    DISPATCHED = "DISPATCHED"
    ARCHIVED = "ARCHIVED"
    THU_HOI = "THU_HOI"


class OutboundStatus(StrEnum):
    """Canonical outbound document statuses.
    
    NOTE: RETURNED and APPROVED have been removed from the workflow.
    - RETURNED is now mapped to DRAFT (status removed)
    - APPROVED is now mapped to PENDING_CLERK_CHECK (workflow changed)
    
    Legacy statuses are handled via alias mappings below for backward compatibility.
    """
    DRAFT = "DRAFT"
    SUBMITTED = "SUBMITTED"
    PENDING_CLERK_CHECK = "PENDING_CLERK_CHECK"
    REGISTERED = "REGISTERED"
    ISSUED = "ISSUED"
    ARCHIVED = "ARCHIVED"
    HUY_PHAT_HANH = "HUY_PHAT_HANH"


# --- Canonical Sets ---
ALL_INBOUND_STATUSES = {
    InboundStatus.RECEIVED.value,
    InboundStatus.WAITING_ASSIGNMENT.value,
    InboundStatus.PROCESSING.value,
    InboundStatus.PENDING_LEADER_APPROVAL.value,
    InboundStatus.PENDING_CLERK_CHECK.value,
    InboundStatus.REGISTERED.value,
    InboundStatus.DISPATCHED.value,
    InboundStatus.ARCHIVED.value,
    InboundStatus.THU_HOI.value,
}

ALL_OUTBOUND_STATUSES = {
    OutboundStatus.DRAFT.value,
    OutboundStatus.SUBMITTED.value,
    OutboundStatus.PENDING_CLERK_CHECK.value,
    OutboundStatus.REGISTERED.value,
    OutboundStatus.ISSUED.value,
    OutboundStatus.ARCHIVED.value,
    OutboundStatus.HUY_PHAT_HANH.value,
}

# Draft-like statuses (editable by creator/assignee)
DRAFT_STATUSES = {
    OutboundStatus.DRAFT.value,
    OutboundStatus.SUBMITTED.value,
}

# Official statuses (processed, immutable content usually)
OFFICIAL_STATUSES = ALL_INBOUND_STATUSES.union({
    OutboundStatus.PENDING_CLERK_CHECK.value,
    OutboundStatus.REGISTERED.value,
    OutboundStatus.ISSUED.value,
    OutboundStatus.ARCHIVED.value,
    OutboundStatus.HUY_PHAT_HANH.value,
})


class StatusResolver:
    """
    Map tên trạng thái -> ID cho Document & Case (FK).
    """

    @staticmethod
    @lru_cache(maxsize=256)
    def doc_status_id(name: str) -> int:
        """
        Trả về catalog.document_statuses.status_id theo status_name.
        """
        Status = apps.get_model('catalog', 'DocumentStatus')
        pk = (
            Status.objects
            .filter(status_name=name)
            .values_list('status_id', flat=True)
            .first()
        )
        if pk is None:
            record = Status.objects.create(status_name=name)
            pk = record.status_id
        return int(pk)

    @staticmethod
    @lru_cache(maxsize=256)
    def case_status_id(name: str) -> int:
        """
        Trả về catalog.case_statuses.case_status_id theo case_status_name.
        """
        Status = apps.get_model('catalog', 'CaseStatus')
        pk = (
            Status.objects
            .filter(case_status_name=name)
            .values_list('case_status_id', flat=True)
            .first()
        )
        if pk is None:
            raise ValueError(f"Không tìm thấy case_statuses.case_status_name = '{name}'")
        return int(pk)


INBOUND_ACTIVE_STATUSES = ALL_INBOUND_STATUSES
OUTBOUND_ACTIVE_STATUSES = ALL_OUTBOUND_STATUSES


_STATUS_KEY_INVALID_RE = re.compile(r"[^A-Z0-9_]+")
_STATUS_KEY_COLLAPSE_RE = re.compile(r"_+")


def _normalize_status_text(raw: Optional[str]) -> str:
    if not raw:
        return ""
    normalized = unicodedata.normalize("NFD", raw.strip())
    stripped = "".join(ch for ch in normalized if unicodedata.category(ch) != "Mn")
    uppered = stripped.upper()
    spaced = re.sub(r"\s+", "_", uppered)
    sanitized = _STATUS_KEY_INVALID_RE.sub("_", spaced)
    collapsed = _STATUS_KEY_COLLAPSE_RE.sub("_", sanitized)
    return collapsed.strip("_")


def _build_alias_map(entries: Iterable[tuple[str, str]]) -> Dict[str, str]:
    out: Dict[str, str] = {}
    for label, target in entries:
        key = _normalize_status_text(label)
        if not key:
            continue
        out[key] = target
    return out


_INBOUND_STATUS_ALIASES = _build_alias_map(
    [(status.value, status.value) for status in InboundStatus]
    + [
        ("Tiếp nhận", InboundStatus.RECEIVED.value),
        ("Chờ phân công", InboundStatus.WAITING_ASSIGNMENT.value),
        ("Đang xử lý", InboundStatus.PROCESSING.value),
        ("Chờ văn thư kiểm tra", InboundStatus.PENDING_CLERK_CHECK.value),
        ("Chờ lãnh đạo phê duyệt", InboundStatus.PENDING_LEADER_APPROVAL.value),
        ("Đã vào sổ", InboundStatus.REGISTERED.value),
        ("Đã phát hành", InboundStatus.DISPATCHED.value),
        ("Đã phát hành kết quả", InboundStatus.DISPATCHED.value),
        ("Đã lưu trữ", InboundStatus.ARCHIVED.value),
        ("Thu hồi", InboundStatus.THU_HOI.value),
        # Legacy Vietnamese status codes (no longer in enum, but still mapped)
        ("TIEP_NHAN", InboundStatus.RECEIVED.value),
        ("PHAN_CONG", InboundStatus.WAITING_ASSIGNMENT.value),
        ("DANG_XU_LY", InboundStatus.PROCESSING.value),
        ("DANG_KY", InboundStatus.REGISTERED.value),
        ("HOAN_TAT", InboundStatus.DISPATCHED.value),
        ("LUU_TRU", InboundStatus.ARCHIVED.value),
    ],
)

_OUTBOUND_STATUS_ALIASES = _build_alias_map(
    [(status.value, status.value) for status in OutboundStatus]
    + [
        ("Đã phát hành", OutboundStatus.ISSUED.value),
        ("Đã phát hành kết quả", OutboundStatus.ISSUED.value),
        ("Đã lưu trữ", OutboundStatus.ARCHIVED.value),
        # Legacy Vietnamese status codes → canonical outbound codes
        ("DU_THAO", OutboundStatus.DRAFT.value),
        ("TRINH_DUYET", OutboundStatus.SUBMITTED.value),
        # Map RETURNED/TRA_LAI → DRAFT (⚠️ status removed from workflow)
        ("RETURNED", OutboundStatus.DRAFT.value),
        ("TRA_LAI", OutboundStatus.DRAFT.value),
        ("BI_TRA_LAI", OutboundStatus.DRAFT.value),
        # Map APPROVED/PHE_DUYET → PENDING_CLERK_CHECK (⚠️ workflow changed)
        ("APPROVED", OutboundStatus.PENDING_CLERK_CHECK.value),
        ("PHE_DUYET", OutboundStatus.PENDING_CLERK_CHECK.value),
        ("KY_SO", OutboundStatus.PENDING_CLERK_CHECK.value),
        ("LD_DA_PHE_DUYET", OutboundStatus.PENDING_CLERK_CHECK.value),
        ("PHAT_HANH", OutboundStatus.ISSUED.value),
        ("LUU_TRU", OutboundStatus.ARCHIVED.value),
        # Additional aliases frequently used in UI/payloads
        ("DA_TRINH", OutboundStatus.SUBMITTED.value),
        ("TRINH_LANH_DAO", OutboundStatus.SUBMITTED.value),
        ("DA_TRINH_LANH_DAO", OutboundStatus.SUBMITTED.value),
        ("TRINH_LD", OutboundStatus.SUBMITTED.value),
        ("DA_TRINH_LD", OutboundStatus.SUBMITTED.value),
        ("CHO_LANH_DAO_PHE_DUYET", OutboundStatus.SUBMITTED.value),
        ("CHO_LD_PHE_DUYET", OutboundStatus.SUBMITTED.value),
        ("DA_PHAT_HANH", OutboundStatus.ISSUED.value),
        ("CHO_VAN_THU_KIEM_TRA", OutboundStatus.PENDING_CLERK_CHECK.value),
        ("CHO_VT_KIEM_TRA", OutboundStatus.PENDING_CLERK_CHECK.value),
    ],
)


def canonical_status_key(name: Optional[str], direction: Optional[str] = None) -> str:
    key = _normalize_status_text(name)
    if not key:
        return ""
    if direction and direction.upper() == "OUTBOUND":
        mapped = _OUTBOUND_STATUS_ALIASES.get(key)
        if mapped:
            return mapped
        # Heuristics để khôngbỏ sót biến thể mới
        if "SUBMIT" in key or "TRINH" in key or "PENDING_LEADER" in key:
            return OutboundStatus.SUBMITTED.value
        # RETURNED/TRA_LAI → DRAFT (status removed, use DRAFT)
        if "RETURN" in key or "TRA_LAI" in key:
            return OutboundStatus.DRAFT.value
        # APPROVED/PHE_DUYET/KY_SO → PENDING_CLERK_CHECK (LD approve goes directly to clerk now)
        if "APPROVE" in key or "PHE_DUYET" in key or "KY_SO" in key:
            return OutboundStatus.PENDING_CLERK_CHECK.value
        if "CLERK" in key or "VAN_THU" in key:
            return OutboundStatus.PENDING_CLERK_CHECK.value
        if "ISSUE" in key or "PHAT_HANH" in key:
            return OutboundStatus.ISSUED.value
        if "ARCHIVE" in key or "LUU_TRU" in key:
            return OutboundStatus.ARCHIVED.value
        if "HUY" in key or "CANCEL" in key:
            return OutboundStatus.HUY_PHAT_HANH.value
        return key
    return _INBOUND_STATUS_ALIASES.get(key, key)


def is_draft(status_key: str) -> bool:
    return status_key in DRAFT_STATUSES


def is_official(status_key: str) -> bool:
    return status_key in OFFICIAL_STATUSES
