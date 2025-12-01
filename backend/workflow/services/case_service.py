# workflow/services/case_service.py
from dataclasses import dataclass
from typing import Any, Iterable, Optional
from django.apps import apps
from django.db import transaction
from django.utils import timezone

from .errors import PermissionDenied, InvalidTransition, ValidationError
from .rbac import can, Act
from .status_resolver import StatusResolver as SR
from .audit import audit_log
from .events import emit

def _case_models():
    Case = apps.get_model('cases', 'Case')
    Part = apps.get_model('cases', 'CaseParticipant')
    CLog = apps.get_model('cases', 'CaseActivityLog')
    return Case, Part, CLog

def _status_id(case) -> int:
    sid = getattr(case, "status_id", None)
    if not sid:
        raise ValidationError("Case.status_id trống.")
    return sid

def _log(case, *, actor, action: str, note=None, meta=None):
    _, _, CLog = _case_models()
    CLog.objects.create(
        case_id=case.case_id,
        actor_id=actor.user_id,
        action=action,
        at=timezone.now(),
        note=note,
        meta_json=meta,
    )

@dataclass
class CaseService:
    actor: Any

    def create(self, case: Any, *, description: Optional[str]=None):
        if not can(self.actor, Act.CASE_CREATE, obj=case):
            raise PermissionDenied("Không có quyền tạo hồ sơ.")
        moi_tao = SR.case_status_id("MOI_TAO")
        if getattr(case, "status_id", None) != moi_tao:
            case.status_id = moi_tao
        if description and hasattr(case, "description"):
            case.description = description
        if not getattr(case, "created_by_id", None):
            case.created_by_id = self.actor.user_id
        case.save()
        _log(case, actor=self.actor, action="CREATE", note=description)
        audit_log(actor=self.actor, action="CASE.CREATE", entity_type="case", entity_id=case.case_id)

    def wait_for_assign(self, case: Any):
        if not can(self.actor, Act.CASE_WAIT_ASSIGN, obj=case):
            raise PermissionDenied("Không có quyền đưa vào chờ phân công.")
        from_id = _status_id(case)
        to_id = SR.case_status_id("CHO_PHAN_CONG")
        with transaction.atomic():
            case.status_id = to_id
            case.save(update_fields=["status_id"])
            _log(case, actor=self.actor, action="WAIT_ASSIGN")
            audit_log(actor=self.actor, action="CASE.WAIT_ASSIGN", entity_type="case", entity_id=case.case_id,
                      before={"status_id":from_id}, after={"status_id":to_id})

    def assign(self, case: Any, assignees: Iterable[Any], *, leader: Optional[Any]=None, instruction: Optional[str]=None, due_date=None):
        """Chỉ LD (đã enforce trong RBAC)."""
        required = Act.CASE_ASSIGN if _status_id(case) == SR.case_status_id("CHO_PHAN_CONG") else Act.CASE_REASSIGN
        if not can(self.actor, required, obj=case):
            raise PermissionDenied("Chỉ Lãnh đạo được phân công/tái phân công.")
        from_id = _status_id(case)
        to_id = SR.case_status_id("DA_PHAN_CONG")
        Case, Part, _ = _case_models()
        with transaction.atomic():
            Case.objects.filter(pk=case.pk).update(status_id=to_id)
            # ghi participants
            now = timezone.now()
            # clear assignee cũ nếu tái phân công? tuỳ quy chế:
            Part.objects.filter(case_id=case.case_id, role_on_case='assignee').delete()
            rows = []
            for u in assignees:
                rows.append(Part(case_id=case.case_id, user_id=u.user_id, role_on_case='assignee'))
            if rows:
                Part.objects.bulk_create(rows, ignore_conflicts=True)

            if leader and hasattr(case, "leader_id"):
                case.leader_id = leader.user_id
            if due_date and hasattr(case, "due_date"):
                case.due_date = due_date
            case.save(update_fields=["leader_id","due_date","status_id"])

            _log(case, actor=self.actor, action="ASSIGN", note=instruction, meta={"assignees":[str(u.user_id) for u in assignees],"due_date":str(due_date) if due_date else None})
            audit_log(actor=self.actor, action="CASE.ASSIGN", entity_type="case", entity_id=case.case_id,
                      before={"status_id":from_id}, after={"status_id":to_id,"assignees":[str(u.user_id) for u in assignees]})

        emit("case.assigned", {"case_id": case.case_id, "assignees":[str(u.user_id) for u in assignees]})

    def start(self, case: Any):
        if not can(self.actor, Act.CASE_START, obj=case):
            raise PermissionDenied("Chỉ người được giao mới bắt đầu.")
        from_id = _status_id(case)
        to_id = SR.case_status_id("DANG_THUC_HIEN")
        with transaction.atomic():
            case.status_id = to_id
            case.save(update_fields=["status_id"])
            _log(case, actor=self.actor, action="START")
            audit_log(actor=self.actor, action="CASE.START", entity_type="case", entity_id=case.case_id,
                      before={"status_id":from_id}, after={"status_id":to_id})

    def pause(self, case: Any, reason: Optional[str]=None):
        if not can(self.actor, Act.CASE_PAUSE, obj=case):
            raise PermissionDenied("Không có quyền tạm dừng.")
        from_id = _status_id(case)
        to_id = SR.case_status_id("TAM_DUNG")
        with transaction.atomic():
            case.status_id = to_id
            case.save(update_fields=["status_id"])
            _log(case, actor=self.actor, action="PAUSE", note=reason)
            audit_log(actor=self.actor, action="CASE.PAUSE", entity_type="case", entity_id=case.case_id,
                      before={"status_id":from_id}, after={"status_id":to_id})

    def resume(self, case: Any):
        if not can(self.actor, Act.CASE_RESUME, obj=case):
            raise PermissionDenied("Không có quyền tiếp tục.")
        from_id = _status_id(case)
        to_id = SR.case_status_id("DANG_THUC_HIEN")
        with transaction.atomic():
            case.status_id = to_id
            case.save(update_fields=["status_id"])
            _log(case, actor=self.actor, action="RESUME")
            audit_log(actor=self.actor, action="CASE.RESUME", entity_type="case", entity_id=case.case_id,
                      before={"status_id":from_id}, after={"status_id":to_id})

    def request_close(self, case: Any, note: Optional[str]=None):
        if not can(self.actor, Act.CASE_REQUEST_CLOSE, obj=case):
            raise PermissionDenied("Không có quyền đề nghị đóng.")
        from_id = _status_id(case)
        to_id = SR.case_status_id("CHO_DUYET_DONG")
        with transaction.atomic():
            case.status_id = to_id
            case.save(update_fields=["status_id"])
            _log(case, actor=self.actor, action="REQUEST_CLOSE", note=note)
            audit_log(actor=self.actor, action="CASE.REQUEST_CLOSE", entity_type="case", entity_id=case.case_id,
                      before={"status_id":from_id}, after={"status_id":to_id})

    def approve_close(self, case: Any):
        if not can(self.actor, Act.CASE_APPROVE_CLOSE, obj=case):
            raise PermissionDenied("Chỉ Lãnh đạo được duyệt đóng.")
        from_id = _status_id(case)
        to_id = SR.case_status_id("DONG")
        with transaction.atomic():
            case.status_id = to_id
            case.save(update_fields=["status_id"])
            _log(case, actor=self.actor, action="APPROVE_CLOSE")
            audit_log(actor=self.actor, action="CASE.APPROVE_CLOSE", entity_type="case", entity_id=case.case_id,
                      before={"status_id":from_id}, after={"status_id":to_id})

    def archive(self, case: Any):
        if not can(self.actor, Act.CASE_ARCHIVE, obj=case):
            raise PermissionDenied("Không có quyền lưu trữ.")
        from_id = _status_id(case)
        to_id = SR.case_status_id("LUU_TRU")
        with transaction.atomic():
            case.status_id = to_id
            case.save(update_fields=["status_id"])
            _log(case, actor=self.actor, action="ARCHIVE")
            audit_log(actor=self.actor, action="CASE.ARCHIVE", entity_type="case", entity_id=case.case_id,
                      before={"status_id":from_id}, after={"status_id":to_id})
