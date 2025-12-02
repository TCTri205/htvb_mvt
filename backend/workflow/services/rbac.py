# workflow/services/rbac.py
from enum import StrEnum
from typing import Any, Iterable, Optional
import string
import unicodedata
import logging
from django.apps import apps

from .errors import PermissionDenied

logger = logging.getLogger(__name__)

# ===== Vai trò cốt lõi =====
class Role(StrEnum):
    QT = "QT"  # Quản trị hệ thống
    VT = "VT"  # Văn thư
    CV = "CV"  # Chuyên viên
    LD = "LD"  # Lãnh đạo

# ===== Hành động tầng Service (map được sang permission code nếu dùng DB) =====
class Act(StrEnum):
    VIEW = "VIEW"
    REPORT_EXPORT = "REPORT_EXPORT"

    # VB đến (Inbound)
    VT_CREATE_INBOUND = "VT_CREATE_INBOUND"
    IN_RECEIVE = VT_CREATE_INBOUND
    VT_UPDATE_METADATA = "VT_UPDATE_METADATA"
    IN_EDIT_NOTE = VT_UPDATE_METADATA
    VT_REGISTER_INBOUND = "VT_REGISTER_INBOUND"
    IN_REGISTER = VT_REGISTER_INBOUND
    LD_ASSIGN_OFFICER = "LD_ASSIGN_OFFICER"
    IN_ASSIGN = LD_ASSIGN_OFFICER
    CV_START_PROCESSING = "CV_START_PROCESSING"
    IN_START = CV_START_PROCESSING
    CV_SUBMIT_FOR_APPROVAL = "CV_SUBMIT_FOR_APPROVAL"
    IN_COMPLETE = CV_SUBMIT_FOR_APPROVAL
    CV_REQUEST_REASSIGN = "CV_REQUEST_REASSIGN"
    LD_APPROVE_INBOUND = "LD_APPROVE_INBOUND"
    LD_REQUEST_CHANGES_INBOUND = "LD_REQUEST_CHANGES_INBOUND"
    VT_FINAL_CHECK_REJECT_INBOUND = "VT_FINAL_CHECK_REJECT_INBOUND"
    LD_HANDLE_CLERK_REJECTION = "LD_HANDLE_CLERK_REJECTION"
    VT_FINAL_CHECK_OK_INBOUND = "VT_FINAL_CHECK_OK_INBOUND"
    VT_DISPATCH_RESULT = "VT_DISPATCH_RESULT"
    VT_ARCHIVE_INBOUND = "VT_ARCHIVE_INBOUND"
    IN_ARCHIVE = VT_ARCHIVE_INBOUND
    QT_RECALL_INBOUND = "QT_RECALL_INBOUND"
    IN_WITHDRAW = QT_RECALL_INBOUND
    IN_LINK = "IN_LINK"
    IN_IMPORT_EXPORT = "IN_IMPORT_EXPORT"

    # VB đi / Dự thảo (Outbound)
    CV_CREATE_DRAFT = "CV_CREATE_DRAFT"
    OUT_DRAFT_CREATE = CV_CREATE_DRAFT
    CV_UPDATE_DRAFT = "CV_UPDATE_DRAFT"
    OUT_DRAFT_EDIT = CV_UPDATE_DRAFT
    CV_SUBMIT_DRAFT = "CV_SUBMIT_DRAFT"
    OUT_SUBMIT = CV_SUBMIT_DRAFT
    LD_REQUEST_CHANGES_OUTBOUND = "LD_REQUEST_CHANGES_OUTBOUND"
    OUT_RETURN = LD_REQUEST_CHANGES_OUTBOUND
    LD_APPROVE_OUTBOUND = "LD_APPROVE_OUTBOUND"
    OUT_APPROVE = LD_APPROVE_OUTBOUND
    LD_REQUEST_CHANGES_FROM_CLERK = "LD_REQUEST_CHANGES_FROM_CLERK"
    VT_RECEIVE_FOR_FINAL_CHECK = "VT_RECEIVE_FOR_FINAL_CHECK"
    VT_FINAL_CHECK_OK_OUTBOUND = "VT_FINAL_CHECK_OK_OUTBOUND"
    VT_FINAL_CHECK_REJECT_OUTBOUND = "VT_FINAL_CHECK_REJECT_OUTBOUND"
    VT_REGISTER_OUTBOUND = "VT_REGISTER_OUTBOUND"
    VT_ISSUE_OUTBOUND = "VT_ISSUE_OUTBOUND"
    OUT_ISSUE_NO = VT_ISSUE_OUTBOUND
    OUT_PUBLISH = VT_ISSUE_OUTBOUND
    OUT_SIGN = LD_APPROVE_OUTBOUND
    VT_ARCHIVE_OUTBOUND = "VT_ARCHIVE_OUTBOUND"
    OUT_ARCHIVE = VT_ARCHIVE_OUTBOUND
    QT_CANCEL_ISSUED_OUTBOUND = "QT_CANCEL_ISSUED_OUTBOUND"
    OUT_WITHDRAW = QT_CANCEL_ISSUED_OUTBOUND
    QT_FIX_STATE_MANUALLY = "QT_FIX_STATE_MANUALLY"

    # Hồ sơ
    CASE_CREATE = "CASE_CREATE"
    CASE_WAIT_ASSIGN = "CASE_WAIT_ASSIGN"
    CASE_ASSIGN = "CASE_ASSIGN"            # chỉ LD
    CASE_REASSIGN = "CASE_REASSIGN"        # chỉ LD
    CASE_START = "CASE_START"
    CASE_PAUSE = "CASE_PAUSE"
    CASE_RESUME = "CASE_RESUME"
    CASE_REQUEST_CLOSE = "CASE_REQUEST_CLOSE"
    CASE_APPROVE_CLOSE = "CASE_APPROVE_CLOSE"  # chỉ LD
    CASE_ARCHIVE = "CASE_ARCHIVE"
    CASE_DELETE = "CASE_DELETE"

    # Cấu hình/Hệ thống
    CONFIG_REGISTER_BOOK = "CONFIG_REGISTER_BOOK"
    CONFIG_NUMBERING_RULE = "CONFIG_NUMBERING_RULE"
    CONFIG_TEMPLATE = "CONFIG_TEMPLATE"
    CONFIG_WORKFLOW = "CONFIG_WORKFLOW"

# ===== Map hành động -> permission code (nếu kiểm DB) =====
PERM_CODE = {
# VB đến
    Act.VT_CREATE_INBOUND: "DOC.IN.RECEIVE",
    Act.VT_UPDATE_METADATA: "DOC.IN.EDIT_NOTE",
    Act.VT_REGISTER_INBOUND: "DOC.IN.REGISTER",
    Act.LD_ASSIGN_OFFICER: "DOC.IN.ASSIGN",
    Act.CV_START_PROCESSING: "DOC.IN.START",
    Act.CV_SUBMIT_FOR_APPROVAL: "DOC.IN.COMPLETE",
    Act.VT_ARCHIVE_INBOUND: "DOC.IN.ARCHIVE",
    Act.QT_RECALL_INBOUND: "DOC.IN.WITHDRAW",
    Act.IN_LINK: "DOC.LINK",
    Act.IN_IMPORT_EXPORT: "DOC.IN.IMPORT_EXPORT",

    # VB đi
    Act.CV_CREATE_DRAFT: "DOC.OUT.DRAFT_CREATE",
    Act.CV_UPDATE_DRAFT: "DOC.OUT.DRAFT_EDIT",
    Act.CV_SUBMIT_DRAFT: "DOC.OUT.SUBMIT",
    Act.LD_REQUEST_CHANGES_OUTBOUND: "DOC.OUT.RETURN",
    Act.LD_APPROVE_OUTBOUND: "DOC.OUT.APPROVE",
    Act.VT_ISSUE_OUTBOUND: "DOC.OUT.PUBLISH",
    Act.VT_REGISTER_OUTBOUND: "DOC.OUT.REGISTER",
    Act.QT_CANCEL_ISSUED_OUTBOUND: "DOC.OUT.WITHDRAW",
    Act.VT_ARCHIVE_OUTBOUND: "DOC.OUT.ARCHIVE",

    # CASE
    Act.CASE_CREATE: "CASE.CREATE",
    Act.CASE_WAIT_ASSIGN: "CASE.WAIT_ASSIGN",
    Act.CASE_ASSIGN: "CASE.ASSIGN",
    Act.CASE_REASSIGN: "CASE.REASSIGN",
    Act.CASE_START: "CASE.START",
    Act.CASE_PAUSE: "CASE.PAUSE",
    Act.CASE_RESUME: "CASE.RESUME",
    Act.CASE_REQUEST_CLOSE: "CASE.REQUEST_CLOSE",
    Act.CASE_APPROVE_CLOSE: "CASE.APPROVE_CLOSE",
    Act.CASE_ARCHIVE: "CASE.ARCHIVE",
    Act.CASE_DELETE: "CASE.DELETE",

    # Config
    Act.CONFIG_REGISTER_BOOK: "CONFIG.REGISTER_BOOK",
    Act.CONFIG_NUMBERING_RULE: "CONFIG.NUMBERING_RULE",
    Act.CONFIG_TEMPLATE: "CONFIG.TEMPLATE",
    Act.CONFIG_WORKFLOW: "CONFIG.WORKFLOW",

    # Chung
    Act.VIEW: "COMMON.VIEW",
    Act.REPORT_EXPORT: "COMMON.REPORT_EXPORT",
}

# Column definitions for the admin matrix
ACT_COLUMN_MAP: dict[Act, list[str]] = {
    Act.VIEW: ["view"],
    Act.REPORT_EXPORT: ["export"],
    Act.VT_CREATE_INBOUND: ["create"],
    Act.VT_UPDATE_METADATA: ["edit"],
    Act.VT_REGISTER_INBOUND: ["create"],
    Act.LD_ASSIGN_OFFICER: ["approve"],
    Act.CV_START_PROCESSING: ["edit"],
    Act.CV_SUBMIT_FOR_APPROVAL: ["approve"],
    Act.CV_REQUEST_REASSIGN: ["approve"],
    Act.LD_APPROVE_INBOUND: ["approve"],
    Act.LD_REQUEST_CHANGES_INBOUND: ["approve"],
    Act.VT_FINAL_CHECK_REJECT_INBOUND: ["approve"],
    Act.LD_HANDLE_CLERK_REJECTION: ["approve"],
    Act.VT_FINAL_CHECK_OK_INBOUND: ["approve"],
    Act.VT_DISPATCH_RESULT: ["send"],
    Act.VT_ARCHIVE_INBOUND: ["archive"],
    Act.QT_RECALL_INBOUND: ["delete"],
    Act.IN_LINK: ["send"],
    Act.IN_IMPORT_EXPORT: ["export"],
    Act.CV_CREATE_DRAFT: ["create"],
    Act.CV_UPDATE_DRAFT: ["edit"],
    Act.CV_SUBMIT_DRAFT: ["approve"],
    Act.LD_REQUEST_CHANGES_OUTBOUND: ["approve"],
    Act.LD_APPROVE_OUTBOUND: ["approve"],
    Act.LD_REQUEST_CHANGES_FROM_CLERK: ["approve"],
    Act.VT_RECEIVE_FOR_FINAL_CHECK: ["edit"],
    Act.VT_FINAL_CHECK_OK_OUTBOUND: ["approve"],
    Act.VT_FINAL_CHECK_REJECT_OUTBOUND: ["approve"],
    Act.VT_REGISTER_OUTBOUND: ["create"],
    Act.VT_ISSUE_OUTBOUND: ["send"],
    Act.VT_ARCHIVE_OUTBOUND: ["archive"],
    Act.QT_CANCEL_ISSUED_OUTBOUND: ["delete"],
    Act.QT_FIX_STATE_MANUALLY: ["edit"],
    Act.CASE_CREATE: ["create"],
    Act.CASE_WAIT_ASSIGN: ["view"],
    Act.CASE_ASSIGN: ["approve"],
    Act.CASE_REASSIGN: ["approve"],
    Act.CASE_START: ["edit"],
    Act.CASE_PAUSE: ["edit"],
    Act.CASE_RESUME: ["edit"],
    Act.CASE_REQUEST_CLOSE: ["approve"],
    Act.CASE_APPROVE_CLOSE: ["approve"],
    Act.CASE_ARCHIVE: ["archive"],
    Act.CASE_DELETE: ["delete"],
    Act.CONFIG_REGISTER_BOOK: ["config"],
    Act.CONFIG_NUMBERING_RULE: ["config"],
    Act.CONFIG_TEMPLATE: ["config"],
    Act.CONFIG_WORKFLOW: ["backup"],
}

PERMISSION_COLUMN_MAP: dict[str, list[str]] = {}
for act, code in PERM_CODE.items():
    if not code:
        continue
    columns = ACT_COLUMN_MAP.get(act, [])
    if columns:
        PERMISSION_COLUMN_MAP[code] = columns[:]

# ===== Quyền tĩnh mặc định theo vai trò =====
ROLE_ACTIONS = {
    Role.QT: {
        Act.VIEW, Act.REPORT_EXPORT,
        Act.QT_RECALL_INBOUND, Act.QT_CANCEL_ISSUED_OUTBOUND, Act.QT_FIX_STATE_MANUALLY,
        Act.CASE_ARCHIVE,
        # Allow QT to perform VT actions for testing/operation
        Act.VT_CREATE_INBOUND, Act.VT_UPDATE_METADATA, Act.VT_REGISTER_INBOUND,
    },
    Role.VT: {
        Act.VIEW, Act.REPORT_EXPORT,
        Act.VT_CREATE_INBOUND, Act.VT_UPDATE_METADATA, Act.VT_REGISTER_INBOUND,
        Act.VT_FINAL_CHECK_OK_INBOUND, Act.VT_FINAL_CHECK_REJECT_INBOUND,
        Act.VT_DISPATCH_RESULT, Act.VT_ARCHIVE_INBOUND,
        Act.VT_RECEIVE_FOR_FINAL_CHECK, Act.VT_FINAL_CHECK_OK_OUTBOUND,
        Act.VT_FINAL_CHECK_REJECT_OUTBOUND, Act.VT_REGISTER_OUTBOUND,
        Act.VT_ISSUE_OUTBOUND, Act.VT_ARCHIVE_OUTBOUND,
        Act.IN_LINK, Act.IN_IMPORT_EXPORT,
        Act.CASE_CREATE, Act.CASE_WAIT_ASSIGN,
        Act.CASE_ARCHIVE, Act.CASE_REQUEST_CLOSE,
        Act.CONFIG_REGISTER_BOOK, Act.CONFIG_NUMBERING_RULE, Act.CONFIG_TEMPLATE,
    },
    Role.CV: {
        Act.VIEW, Act.REPORT_EXPORT,
        Act.CV_START_PROCESSING, Act.CV_SUBMIT_FOR_APPROVAL, Act.CV_REQUEST_REASSIGN,
        Act.CV_CREATE_DRAFT, Act.CV_UPDATE_DRAFT, Act.CV_SUBMIT_DRAFT,
        Act.IN_LINK,
        Act.CASE_CREATE, Act.CASE_WAIT_ASSIGN, Act.CASE_START,
        Act.CASE_PAUSE, Act.CASE_RESUME, Act.CASE_REQUEST_CLOSE,
    },
    Role.LD: {
        Act.VIEW, Act.REPORT_EXPORT,
        Act.LD_ASSIGN_OFFICER, Act.LD_APPROVE_INBOUND, Act.LD_REQUEST_CHANGES_INBOUND,
        Act.LD_HANDLE_CLERK_REJECTION,
        Act.LD_REQUEST_CHANGES_OUTBOUND, Act.LD_APPROVE_OUTBOUND, Act.LD_REQUEST_CHANGES_FROM_CLERK,
        Act.VT_REGISTER_OUTBOUND, # Allow LD to register outbound documents
        Act.QT_CANCEL_ISSUED_OUTBOUND,
        Act.IN_LINK,
        Act.CASE_CREATE, Act.CASE_WAIT_ASSIGN, Act.CASE_ASSIGN, Act.CASE_REASSIGN,
        Act.CASE_START, Act.CASE_PAUSE, Act.CASE_RESUME, Act.CASE_REQUEST_CLOSE, Act.CASE_APPROVE_CLOSE,
    },
}

# Cho phép mapping tên role trong DB (QUAN_TRI, VAN_THU, ...) về code QT/VT/...
ROLE_NAME_ALIASES = {
    "QUAN_TRI": Role.QT.value,
    "QT": Role.QT.value,
    "VAN_THU": Role.VT.value,
    "VT": Role.VT.value,
    "CHUYEN_VIEN": Role.CV.value,
    "CV": Role.CV.value,
    "LANH_DAO": Role.LD.value,
    "LD": Role.LD.value,
}

ROLE_LABELS = {
    Role.QT.value: "Quản trị hệ thống",
    Role.VT.value: "Văn thư",
    Role.CV.value: "Chuyên viên",
    Role.LD.value: "Lãnh đạo",
}

_ROLE_NORMALIZE_CHARS = set(string.ascii_uppercase + string.digits + "_")


def _normalize_role_name(raw: str) -> str:
    text = str(raw or "").strip()
    if not text:
        return ""
    normalized = unicodedata.normalize("NFKD", text)
    stripped = "".join(ch for ch in normalized if not unicodedata.combining(ch))
    upper = stripped.upper()
    for sep in (" ", "-", "."):
        upper = upper.replace(sep, "_")
    cleaned = "".join(ch for ch in upper if ch in _ROLE_NORMALIZE_CHARS)
    collapsed = []
    prev_char = None
    for ch in cleaned:
        if ch == "_" and prev_char == "_":
            continue
        collapsed.append(ch)
        prev_char = ch
    collapsed_str = "".join(collapsed)
    return collapsed_str.strip("_")


def canonical_role_value(raw: Optional[str]) -> str:
    normalized = _normalize_role_name(raw)
    if not normalized:
        return ""
    return ROLE_NAME_ALIASES.get(normalized, normalized)


def get_role_display_name(role_name: Optional[str]) -> str:
    canonical = canonical_role_value(role_name)
    if not canonical:
        return ""
    return ROLE_LABELS.get(canonical, canonical)


def get_permission_columns(permission_code: Optional[str]) -> list[str]:
    if not permission_code:
        return []
    return PERMISSION_COLUMN_MAP.get(permission_code) or []

# QT (system admin) thường cần đầy đủ quyền cấu hình — mở rộng thêm
ROLE_ACTIONS[Role.QT].update({
    Act.CONFIG_REGISTER_BOOK,
    Act.CONFIG_NUMBERING_RULE,
    Act.CONFIG_TEMPLATE,
    Act.CONFIG_WORKFLOW,
})

# ===== Helpers lấy Role/Permission từ DB — dùng values_list để tránh cảnh báo Pylance =====
def _get_model(app_label: str, model_name: str):
    try:
        return apps.get_model(app_label, model_name)
    except LookupError:
        return None

def _get_user_role_names(user) -> Iterable[str]:
    """
    Trả về danh sách tên role (UPPER) từ users.role_id (nếu có) và bảng user_roles (nếu có).
    """
    RoleModel = _get_model('accounts', 'Role')
    if RoleModel is None:
        return []

    names = []

    # 1) users.role_id (vai trò chính) — nếu schema có cột này
    rid = getattr(user, "role_id", None)
    if rid:
        name = RoleModel.objects.filter(role_id=rid).values_list("name", flat=True).first()
        if name:
            names.append(name)

    # 2) user_roles (đa vai) — nếu có model
    UserRole = _get_model('accounts', 'UserRole')
    if UserRole is not None:
        role_ids = list(
            UserRole.objects.filter(user_id=getattr(user, "user_id", None)).values_list("role_id", flat=True)
        )
        if role_ids:
            extra = list(RoleModel.objects.filter(role_id__in=role_ids).values_list("name", flat=True))
            names.extend(extra)

    if hasattr(user, "groups"):
        try:
            group_names = user.groups.values_list("name", flat=True)
            names.extend([g for g in group_names if g])
        except Exception:
            pass

    # Chuẩn hoá UPPER & alias
    normalized = []
    for raw in dict.fromkeys(names):
        if not raw:
            continue
        upper = raw.upper()
        candidates = [upper]
        cleaned = _normalize_role_name(raw)
        if cleaned and cleaned not in candidates:
            candidates.append(cleaned)
        for candidate in candidates:
            normalized.append(candidate)
            alias = ROLE_NAME_ALIASES.get(candidate)
            if alias:
                normalized.append(alias)

    return list(dict.fromkeys(normalized))

def _has_permission_db(user, act: Act) -> Optional[bool]:
    """
    Kiểm tra quyền dựa vào bảng permissions/role_permissions nếu có.
    Trả None nếu không thể xác định (chưa cấu hình code hoặc bảng không tồn tại) để fallback sang ROLE_ACTIONS.
    """
    Permission = _get_model('accounts', 'Permission')
    RolePermission = _get_model('accounts', 'RolePermission')
    RoleModel = _get_model('accounts', 'Role')
    if Permission is None or RolePermission is None or RoleModel is None:
        return None

    code = PERM_CODE.get(act)
    if not code:
        return None

    perm_id = Permission.objects.filter(code=code).values_list("permission_id", flat=True).first()
    if perm_id is None:
        return None  # chưa cấu hình permission code trong DB

    role_names = _get_user_role_names(user)
    if not role_names:
        return False

    role_ids = list(RoleModel.objects.filter(name__in=role_names).values_list("role_id", flat=True))
    if not role_ids:
        return False

    return RolePermission.objects.filter(role_id__in=role_ids, permission_id=perm_id).exists()

def get_single_role_code(user) -> Optional[str]:
    """
    Suy ra mã QT/VT/CV/LD từ tên role (ưu tiên users.role_id).
    Fallback: is_superuser => QT.
    """
    names = _get_user_role_names(user)
    for r in (Role.QT, Role.VT, Role.CV, Role.LD):
        if r.value in names:
            return r.value
    if getattr(user, "is_superuser", False):
        return Role.QT.value
    return None

# ===== Quy tắc động mức đối tượng (assignee) =====
def _is_doc_assignee(user, doc) -> bool:
    Assign = _get_model('documents', 'DocumentAssignment')
    if Assign is None or doc is None:
        return False
    role_values = {"assignee", "owner"}
    return Assign.objects.filter(
        document_id=getattr(doc, "document_id", None),
        user_id=getattr(user, "user_id", None),
        role_on_doc__in=role_values,
    ).exists()

def _is_case_assignee(user, case) -> bool:
    Part = _get_model('cases', 'CaseParticipant')
    if Part is None or case is None:
        return False
    return Part.objects.filter(case_id=getattr(case, "case_id", None),
                               user_id=getattr(user, "user_id", None),
                               role_on_case='assignee').exists()


def _is_case_watcher(user, case) -> bool:
    Part = _get_model('cases', 'CaseParticipant')
    if Part is None or case is None:
        return False
    return Part.objects.filter(case_id=getattr(case, "case_id", None),
                               user_id=getattr(user, "user_id", None),
                               role_on_case='watcher').exists()


def _is_case_owner(user, case) -> bool:
    if case is None:
        return False
    return getattr(case, "owner_id", None) == getattr(user, "user_id", None)


def _is_case_leader(user, case) -> bool:
    if case is None:
        return False
    return getattr(case, "leader_id", None) == getattr(user, "user_id", None)

# ===== Entry chính: kiểm quyền =====
def can(user, act: Act, obj=None) -> bool:
    # 0) Quy tắc then chốt: chỉ LD được CASE_ASSIGN/REASSIGN/APPROVE_CLOSE
    role_code = get_single_role_code(user)
    if act in (Act.CASE_ASSIGN, Act.CASE_REASSIGN, Act.CASE_APPROVE_CLOSE):
        return role_code == Role.LD.value

    db_has = _has_permission_db(user, act)
    db_checked = db_has is not None

    # 1) Quy tắc riêng cho hành động dự thảo (CV) — không khóa cứng bởi bảng permission
    cv_draft_actions = {Act.CV_CREATE_DRAFT, Act.CV_UPDATE_DRAFT, Act.CV_SUBMIT_DRAFT}
    if act in cv_draft_actions:
        # Nếu DB cấp quyền rõ ràng thì chấp nhận ngay
        if db_has is True:
            return True

        # Chỉ CV (hoặc superuser) mới được dùng nhánh fallback này
        if role_code not in (Role.CV.value, Role.QT.value) and not getattr(user, "is_superuser", False):
            return False

        if act == Act.CV_CREATE_DRAFT:
            return True

        # Update/Submit: Allow CV to edit/submit ANY draft document for collaboration
        if obj is None:
            logger.info(f"[RBAC] {act}: No document object, allowing based on CV role")
            return True

        from .status_resolver import StatusResolver as SR, OutboundStatus
        draft_status_id = SR.doc_status_id(OutboundStatus.DRAFT.value)
        doc_status_id = getattr(obj, "status_id", None)
        doc_id = getattr(obj, "document_id", "N/A")
        user_id = getattr(user, "user_id", None)
        doc_created_by_id = getattr(obj, "created_by_id", None)
        
        logger.info(
            f"[RBAC] {act} check: doc_status_id={doc_status_id}, draft_status_id={draft_status_id}, "
            f"doc_id={doc_id}, user_id={user_id}, created_by_id={doc_created_by_id}"
        )

        # CRITICAL FIX: CV can submit/edit ANY DRAFT document (collaborative workflow)
        if doc_status_id == draft_status_id:
            logger.info(f"[RBAC] {act}: Document is DRAFT (status_id={doc_status_id}), allowing CV to proceed - ALLOWED")
            return True

        # For non-DRAFT documents, check creator or assignee
        logger.info(f"[RBAC] {act}: Non-DRAFT document (status_id={doc_status_id}), checking creator/assignee")

        if doc_created_by_id and doc_created_by_id == user_id:
            logger.info(f"[RBAC] {act}: User is creator - ALLOWED")
            return True

        is_assignee = _is_doc_assignee(user, obj)
        logger.info(f"[RBAC] {act}: is_assignee={is_assignee}")
        
        if not is_assignee and db_has is False:
            logger.warning(f"[RBAC] {act}: Not creator, not assignee, DB denied - REJECTED")
            return False
        
        return is_assignee

    # 2) Ưu tiên kết quả DB cho các hành động khác
    if db_checked:
        return bool(db_has)

    # 3) Fallback ma trận tĩnh
    if not role_code:
        return False
    allowed = ROLE_ACTIONS.get(Role(role_code), set())
    if act not in allowed:
        return False

    # 4) Quy tắc động theo đối tượng
    # Inbound: CV must be assignee
    if act == Act.CV_START_PROCESSING:
        return _is_doc_assignee(user, obj)
    if act == Act.CV_SUBMIT_FOR_APPROVAL:
        # CV phải là assignee; LD được phép chỉ đạo hoàn tất
        return _is_doc_assignee(user, obj) or role_code == Role.LD.value
    
    # Case actions
    if act in (Act.CASE_START, Act.CASE_PAUSE, Act.CASE_RESUME, Act.CASE_REQUEST_CLOSE):
        is_assignee = _is_case_assignee(user, obj)
        is_owner = _is_case_owner(user, obj)
        is_leader = _is_case_leader(user, obj)
        if act == Act.CASE_START:
            return is_assignee or is_owner
        if act in (Act.CASE_PAUSE, Act.CASE_RESUME):
            return is_assignee or is_owner or (role_code == Role.LD.value and is_leader)
        if act == Act.CASE_REQUEST_CLOSE:
            is_watcher = _is_case_watcher(user, obj)
            return is_assignee or is_owner or is_watcher or (role_code == Role.LD.value and is_leader)
            
    # Fallback for VT_REGISTER_OUTBOUND if not caught by DB or ROLE_ACTIONS
    if act == Act.VT_REGISTER_OUTBOUND:
        # If DB said NO explicitly, return False
        if db_checked and db_has is False:
            return False
        # Otherwise, if role is VT or LD (added for flexibility), allow it
        if role_code in (Role.VT.value, Role.LD.value):
            return True

    return True


def require_can(user, act: Act, obj=None) -> None:
    if not can(user, act, obj):
        raise PermissionDenied("Không có quyền thực hiện hành động.")
