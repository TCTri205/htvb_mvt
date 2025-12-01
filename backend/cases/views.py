# cases/views.py
from __future__ import annotations

import logging
from typing import List, Optional
from uuid import uuid4

from django.core.files.storage import default_storage
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.contrib.auth import get_user_model
from django.db.models import ForeignKey, ManyToManyRel, ManyToManyField
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.exceptions import MethodNotAllowed, ValidationError

# drf-spectacular
from drf_spectacular.utils import OpenApiParameter, extend_schema
from drf_spectacular.types import OpenApiTypes

from catalog.models import CaseStatus
from core.exceptions import ForbiddenError

from cases.models import Case, CaseParticipant, CaseTask, CaseAttachment, CaseDocument, Comment, CaseActivityLog
from cases.serializers import (
    CaseSerializer,
    CaseActivityLogSerializer,
    CaseParticipantSerializer,
    CaseParticipantUpsertSerializer,
    CaseTaskSerializer,
    CaseTaskCreateSerializer,
    CaseTaskUpdateSerializer,
    CaseAttachmentSerializer,
    CaseAttachmentUploadSerializer,
    CaseDocumentSerializer,
    CaseDocumentLinkSerializer,
    CommentSerializer,
    AssignCaseActionSerializer,
    CommentCreateSerializer,
)
from cases.filters import CaseFilterSet
from workflow.services import rbac
from workflow.services.rbac import Role

# Components dùng chung (đã được đặt tên qua common.schema)
from common.schema import APIError as APIErrorSchema, StatusOnlyResponse as StatusOnlyResponseSchema

# Helpers docs: đồng bộ 401/403/404/409..., paged schema, v.v.
from core.docs import (
    DEFAULT_ERROR_RESPONSES,
    doc_list,
)

logger = logging.getLogger(__name__)

User = get_user_model()
TAG = "Hồ sơ"
ALLOWED_CASE_ROLE_CODES = {Role.CV.value, Role.LD.value, Role.VT.value, Role.QT.value}
USER_PK_FIELD = getattr(User._meta.pk, "attname", "id")


def _require_case_role(user) -> str:
    code = rbac.get_single_role_code(user)
    if code not in ALLOWED_CASE_ROLE_CODES:
        raise ForbiddenError(code="RBAC_FORBIDDEN")
    return code


def _can_act_as_case_leader(user, case: Case) -> bool:
    """
    Lãnh đạo được phân công (hoặc QT/superuser) mới được phép phân công/tái phân công.
    Nếu case chưa có leader, cho phép LD đầu tiên xử lý.
    """
    code = rbac.get_single_role_code(user)
    if getattr(user, "is_superuser", False):
        return True
    if code != Role.LD.value:
        return False
    leader_id = getattr(case, "leader_id", None)
    uid = getattr(user, "user_id", None)
    if leader_id is None:
        # Nếu hồ sơ chưa có lãnh đạo, bất kỳ lãnh đạo LD đều có thể bắt đầu phân công
        return code == Role.LD.value
    # Chỉ lãnh đạo đang được phân công mới có quyền điều phối.
    return leader_id == uid


def _ensure_case_access(user, case: Case) -> str:
    """
    Bảo vệ sub-resource theo ma trận vai trò: chỉ CV/LD/VT/QT được thao tác.
    Trả về role_code để tái sử dụng cho logic nhánh.
    """
    return _require_case_role(user)


# -------- Helpers an toàn theo schema --------
def _case_has_field(field_name: str) -> bool:
    try:
        Case._meta.get_field(field_name)  # type: ignore[attr-defined]
        return True
    except Exception:
        return False


def _case_has_attr_or_related(name: str) -> bool:
    if hasattr(Case, name):
        return True
    try:
        Case._meta.get_field(name)  # type: ignore[attr-defined]
        return True
    except Exception:
        return False


def _safe_select_related_fields() -> List[str]:
    out: List[str] = []
    for fname in ("status", "case_type", "department", "leader", "created_by"):
        try:
            f = Case._meta.get_field(fname)
            if isinstance(f, ForeignKey):
                out.append(fname)
        except Exception:
            continue
    return out


def _safe_prefetch_related_fields() -> List[str]:
    """
    Trả về danh sách related-name an toàn để prefetch.
    """
    out: List[str] = []
    if _case_has_attr_or_related("assignees"):
        out.append("assignees")
        return out
    try:
        for f in Case._meta.get_fields():
            if isinstance(f, (ManyToManyField, ManyToManyRel)):
                out.append(f.name)
                break
    except Exception:
        pass
    return out


class CaseViewSet(viewsets.ModelViewSet):
    """
    /api/v1/cases/...
    REST chỉ phục vụ danh sách + sub-resource; các bước workflow chuyển sang MVT.
    """
    permission_classes = [IsAuthenticated]
    serializer_class = CaseSerializer
    queryset = Case.objects.all()
    filterset_class = CaseFilterSet

    def get_serializer_class(self):
        if self.action == "activity_logs":
            return CaseActivityLogSerializer
        return super().get_serializer_class()

    def _disabled_rest_workflow(self, method: str):
        raise MethodNotAllowed(method)

    # ====== List (chỉ API duy nhất cho Case) ======

    def get_queryset(self):
        qs = super().get_queryset()
        sel = _safe_select_related_fields()
        if sel:
            qs = qs.select_related(*sel)
        pre = _safe_prefetch_related_fields()
        if pre:
            try:
                qs = qs.prefetch_related(*pre)
            except Exception:
                pass
        # ordering an toàn để tránh UnorderedObjectListWarning
        try:
            Case._meta.get_field("created_at")  # type: ignore[attr-defined]
            return qs.order_by("-created_at")
        except Exception:
            return qs.order_by("-pk")

    @doc_list(
        item_serializer=CaseSerializer,
        tag=TAG,
        operation_id="case_list",
        summary="Danh sách hồ sơ (phân trang)",
    )
    def list(self, request, *args, **kwargs):
        _require_case_role(request.user)
        return super().list(request, *args, **kwargs)

    @extend_schema(exclude=True)
    def create(self, request, *args, **kwargs):
        self._disabled_rest_workflow("POST")

    @extend_schema(exclude=True)
    def retrieve(self, request, *args, **kwargs):
        _require_case_role(request.user)
        return super().retrieve(request, *args, **kwargs)

    @extend_schema(exclude=True)
    def update(self, request, *args, **kwargs):
        self._disabled_rest_workflow("PUT")

    @extend_schema(exclude=True)
    def partial_update(self, request, *args, **kwargs):
        case = self.get_object()
        role_code = _ensure_case_access(request.user, case)
        # Chỉ LD hoặc Owner mới được sửa meta
        is_owner = case.owner_id == getattr(request.user, "user_id", None)
        is_leader = _can_act_as_case_leader(request.user, case)
        
        if not (is_owner or is_leader):
             raise ForbiddenError(code="RBAC_FORBIDDEN")

        # Block edits if case is closed or waiting for close approval
        if case.status.code in ["CHO_DUYET_DONG", "DONG"]:
             raise ForbiddenError(code="RBAC_FORBIDDEN", message="Không thể chỉnh sửa hồ sơ khi đang chờ duyệt đóng hoặc đã đóng.")
             
        # Chỉ cho phép sửa một số trường meta nhất định
        allowed_fields = {"title", "description", "priority", "due_date"}
        data = {k: v for k, v in request.data.items() if k in allowed_fields}
        
        serializer = self.get_serializer(case, data=data, partial=True)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)

        if getattr(case, '_prefetched_objects_cache', None):
            # If 'prefetch_related' has been applied to a queryset, we need to
            # forcibly invalidate the prefetch cache on the instance.
            case._prefetched_objects_cache = {}

        return Response(serializer.data)

    def destroy(self, request, *args, **kwargs):
        self._disabled_rest_workflow("DELETE")

    # ====== Sub-resources ======
    @action(detail=True, methods=["get", "put"], url_path="participants")
    def participants(self, request, pk=None):
        case = self.get_object()
        _ensure_case_access(request.user, case)
        if request.method == "GET":
            qs = CaseParticipant.objects.filter(case=case).select_related("user")
            return Response(CaseParticipantSerializer(qs, many=True).data)

        if not _can_act_as_case_leader(request.user, case):
            raise ForbiddenError(code="RBAC_FORBIDDEN")
            
        # Block participant changes if case is closed or waiting for close approval
        if case.status.code in ["CHO_DUYET_DONG", "DONG"]:
             raise ForbiddenError(code="RBAC_FORBIDDEN", message="Không thể thay đổi thành viên khi hồ sơ đang chờ duyệt đóng hoặc đã đóng.")
        payload = request.data
        if isinstance(payload, list):
            payload = {"participants": payload}
        serializer = CaseParticipantUpsertSerializer(data=payload)
        serializer.is_valid(raise_exception=True)
        CaseParticipant.objects.filter(case=case).delete()
        rows = [
            CaseParticipant(
                case=case,
                user_id=item["user_id"],
                role_on_case=item["role_on_case"],
            )
            for item in serializer.validated_data.get("participants", [])
        ]
        if rows:
            CaseParticipant.objects.bulk_create(rows, ignore_conflicts=True)
        qs = CaseParticipant.objects.filter(case=case).select_related("user")
        return Response(CaseParticipantSerializer(qs, many=True).data)

    @extend_schema(
        tags=[TAG],
        operation_id="case_watch",
        summary="Theo dõi hồ sơ",
        responses={200: CaseParticipantSerializer, **DEFAULT_ERROR_RESPONSES},
    )
    @action(detail=True, methods=["post"], url_path="watch")
    def watch(self, request, pk=None):
        case = self.get_object()
        _ensure_case_access(request.user, case)
        participant, created = CaseParticipant.objects.get_or_create(
            case=case,
            user=request.user,
            defaults={"role_on_case": CaseParticipant.RoleOnCase.WATCHER},
        )
        if not created and participant.role_on_case != CaseParticipant.RoleOnCase.WATCHER:
            return Response(CaseParticipantSerializer(participant).data)
        serializer = CaseParticipantSerializer(participant)
        return Response(serializer.data)

    @extend_schema(
        tags=[TAG],
        operation_id="case_unwatch",
        summary="Bỏ theo dõi hồ sơ",
        responses={204: None, **DEFAULT_ERROR_RESPONSES},
    )
    @action(detail=True, methods=["delete"], url_path="watch")
    def unwatch(self, request, pk=None):
        case = self.get_object()
        _ensure_case_access(request.user, case)
        CaseParticipant.objects.filter(
            case=case,
            user=request.user,
            role_on_case=CaseParticipant.RoleOnCase.WATCHER,
        ).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @extend_schema(
        operation_id="case_activity_logs",
        summary="Nhật ký hoạt động hồ sơ",
        responses={200: CaseActivityLogSerializer(many=True), 404: APIErrorSchema},
    )
    @action(detail=True, methods=["get"], url_path="activity-logs")
    def activity_logs(self, request, pk=None):
        case = self.get_object()
        _ensure_case_access(request.user, case)
        logs = (
            CaseActivityLog.objects.filter(case=case)
            .select_related("actor")
            .order_by("-at")
        )
        return Response(CaseActivityLogSerializer(logs, many=True).data)

    @action(detail=True, methods=["get", "post"], url_path="tasks")
    def tasks(self, request, pk=None):
        case = self.get_object()
        role_code = _ensure_case_access(request.user, case)
        if request.method == "GET":
            qs = (
                CaseTask.objects.filter(case=case)
                .select_related("assignee", "created_by")
                .order_by("-created_at")
            )
            return Response(CaseTaskSerializer(qs, many=True).data)

        if role_code not in (Role.CV.value, Role.LD.value):
            raise ForbiddenError(code="RBAC_FORBIDDEN")

        serializer = CaseTaskCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        assignee = None
        assignee_id = data.get("assignee_id")
        if assignee_id is not None:
            if not _can_act_as_case_leader(request.user, case):
                raise ForbiddenError(code="RBAC_FORBIDDEN")
            assignee = User.objects.filter(**{USER_PK_FIELD: assignee_id}).first()
            if assignee is None:
                return Response({"detail": "Người được giao không hợp lệ."}, status=status.HTTP_400_BAD_REQUEST)
        elif role_code == Role.CV.value:
            assignee = request.user

        task = CaseTask.objects.create(
            case=case,
            title=data["title"],
            assignee=assignee,
            due_at=data.get("due_at"),
            note=data.get("note"),
            created_by=request.user,
        )
        return Response(CaseTaskSerializer(task).data, status=status.HTTP_201_CREATED)

    @extend_schema(
        tags=[TAG],
        operation_id="case_request_close",
        summary="Đề nghị đóng hồ sơ",
        responses={200: CaseSerializer, **DEFAULT_ERROR_RESPONSES},
    )
    @action(detail=True, methods=["post"], url_path="request_close")
    def request_close(self, request, pk=None):
        case = self.get_object()
        _ensure_case_access(request.user, case)
        
        # Chỉ cho phép khi đang thực hiện
        if case.status.code != "DANG_THUC_HIEN":
             return Response({"detail": "Hồ sơ không ở trạng thái đang thực hiện."}, status=status.HTTP_400_BAD_REQUEST)

        # Người được giao hoặc Owner (hoặc người tạo nếu policy cho phép - ở đây chốt Assignee/Owner)
        # Check tasks assignee? Hay check case owner?
        # Prompt: "DANG_THUC_HIEN -> CHO_DUYET_DONG: đề nghị đóng (thường bởi CV/owner)."
        # Logic: Nếu user là owner hoặc có task đang open/in_progress? 
        # Đơn giản nhất: User là Owner hoặc User là người được giao việc chính (nếu có concept này).
        # Tạm thời: Owner hoặc bất kỳ ai có tham gia với vai trò Assignee/Coowner.
        
        is_owner = case.owner_id == getattr(request.user, "user_id", None)
        is_participant_assignee = CaseParticipant.objects.filter(
            case=case, 
            user=request.user, 
            role_on_case__in=[CaseParticipant.RoleOnCase.ASSIGNEE, CaseParticipant.RoleOnCase.COOWNER]
        ).exists()
        
        if not (is_owner or is_participant_assignee):
            raise ForbiddenError(code="RBAC_FORBIDDEN", message="Bạn không có quyền đề nghị đóng.")

        # Transition
        try:
            stt_cho_duyet = CaseStatus.objects.get(case_status_name="CHO_DUYET_DONG")
        except CaseStatus.DoesNotExist:
             return Response({"detail": "Trạng thái CHO_DUYET_DONG chưa được cấu hình."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
             
        case.status = stt_cho_duyet
        case.save()
        
        CaseActivityLog.objects.create(
            case=case,
            actor=request.user,
            action=CaseActivityLog.Action.UPDATE,
            note="Đề nghị đóng hồ sơ"
        )
        
        return Response(CaseSerializer(case).data)

    @extend_schema(
        tags=[TAG],
        operation_id="case_approve_close",
        summary="Phê duyệt đóng hồ sơ",
        responses={200: CaseSerializer, **DEFAULT_ERROR_RESPONSES},
    )
    @action(detail=True, methods=["post"], url_path="approve_close")
    def approve_close(self, request, pk=None):
        case = self.get_object()
        _ensure_case_access(request.user, case)
        
        # Chỉ LD mới được duyệt đóng
        if not _can_act_as_case_leader(request.user, case):
             raise ForbiddenError(code="RBAC_FORBIDDEN")

        if case.status.code != "CHO_DUYET_DONG":
             return Response({"detail": "Hồ sơ không ở trạng thái chờ duyệt đóng."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            stt_dong = CaseStatus.objects.get(case_status_name="DONG")
        except CaseStatus.DoesNotExist:
             return Response({"detail": "Trạng thái DONG chưa được cấu hình."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        case.status = stt_dong
        case.save()
        
        CaseActivityLog.objects.create(
            case=case,
            actor=request.user,
            action=CaseActivityLog.Action.CLOSE,
            note="Phê duyệt đóng hồ sơ"
        )
        
        return Response(CaseSerializer(case).data)

    @extend_schema(
        tags=[TAG],
        operation_id="case_submit",
        summary="Trình lãnh đạo (Gửi chờ phân công)",
        responses={200: CaseSerializer, **DEFAULT_ERROR_RESPONSES},
    )
    @action(detail=True, methods=["post"], url_path="submit")
    def submit(self, request, pk=None):
        case = self.get_object()
        _ensure_case_access(request.user, case)
        
        if case.status.code != "MOI_TAO":
             return Response({"detail": "Hồ sơ không ở trạng thái mới tạo."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            stt_cho_phan_cong = CaseStatus.objects.get(case_status_name="CHO_PHAN_CONG")
        except CaseStatus.DoesNotExist:
             return Response({"detail": "Trạng thái CHO_PHAN_CONG chưa được cấu hình."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        case.status = stt_cho_phan_cong
        case.save()
        
        # Use note from request if provided, otherwise use default
        note = request.data.get("note", "Trình lãnh đạo (Chờ phân công)")
        
        CaseActivityLog.objects.create(
            case=case,
            actor=request.user,
            action=CaseActivityLog.Action.UPDATE,
            note=note
        )
        return Response(CaseSerializer(case).data)

    @extend_schema(
        tags=[TAG],
        operation_id="case_assign",
        summary="Phân công hồ sơ",
        responses={200: CaseSerializer, **DEFAULT_ERROR_RESPONSES},
    )
    @action(detail=True, methods=["post"], url_path="assign")
    def assign(self, request, pk=None):
        case = self.get_object()
        _ensure_case_access(request.user, case)
        
        if not _can_act_as_case_leader(request.user, case):
             raise ForbiddenError(code="RBAC_FORBIDDEN")

        if case.status.code != "CHO_PHAN_CONG":
             return Response({"detail": "Hồ sơ không ở trạng thái chờ phân công."}, status=status.HTTP_400_BAD_REQUEST)
        
        # Validate request data
        serializer = AssignCaseActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        validated_data = serializer.validated_data
        
        # Get assignees from participants (already set via PUT /participants)
        # Or use assignees from request if provided
        assignees = validated_data.get("assignees", [])
        
        try:
            # WORKFLOW CHANGE: Now transition directly to DANG_THUC_HIEN instead of DA_PHAN_CONG
            stt_dang_thuc_hien = CaseStatus.objects.get(case_status_name="DANG_THUC_HIEN")
        except CaseStatus.DoesNotExist:
             return Response({"detail": "Trạng thái DANG_THUC_HIEN chưa được cấu hình."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        # Update case status and due_date if provided
        update_fields = ["status"]
        if validated_data.get("due_date"):
            case.due_date = validated_data["due_date"]
            update_fields.append("due_date")
        
        case.status = stt_dang_thuc_hien
        case.save(update_fields=update_fields)
        
        # Create activity log with instruction if provided
        instruction = validated_data.get("instruction") or "Đã phân công hồ sơ"
        CaseActivityLog.objects.create(
            case=case,
            actor=request.user,
            action=CaseActivityLog.Action.ASSIGN,
            note=instruction
        )
        
        return Response(CaseSerializer(case).data)

    @extend_schema(
        tags=[TAG],
        operation_id="case_start",
        summary="Bắt đầu thực hiện",
        responses={200: CaseSerializer, **DEFAULT_ERROR_RESPONSES},
    )
    @action(detail=True, methods=["post"], url_path="start")
    def start(self, request, pk=None):
        case = self.get_object()
        _ensure_case_access(request.user, case)
        
        # Allow Owner or Assignee to start
        is_owner = case.owner_id == getattr(request.user, "user_id", None)
        is_participant = CaseParticipant.objects.filter(case=case, user=request.user).exists()
        
        if not (is_owner or is_participant):
             raise ForbiddenError(code="RBAC_FORBIDDEN")

        # BACKWARD COMPATIBILITY: Accept both CHO_PHAN_CONG and DA_PHAN_CONG
        # NOTE: This endpoint may be deprecated as workflow now goes directly to DANG_THUC_HIEN after assign
        if case.status.code not in ["DA_PHAN_CONG", "CHO_PHAN_CONG"]:
             return Response({"detail": "Hồ sơ không ở trạng thái chờ phân công hoặc đã phân công."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            stt_dang_thuc_hien = CaseStatus.objects.get(case_status_name="DANG_THUC_HIEN")
        except CaseStatus.DoesNotExist:
             return Response({"detail": "Trạng thái DANG_THUC_HIEN chưa được cấu hình."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        case.status = stt_dang_thuc_hien
        case.save()
        
        CaseActivityLog.objects.create(
            case=case,
            actor=request.user,
            action=CaseActivityLog.Action.UPDATE,
            note="Bắt đầu thực hiện hồ sơ"
        )
        return Response(CaseSerializer(case).data)

    @extend_schema(
        tags=[TAG],
        operation_id="case_pause",
        summary="Tạm dừng hồ sơ",
        responses={200: CaseSerializer, **DEFAULT_ERROR_RESPONSES},
    )
    @action(detail=True, methods=["post"], url_path="pause")
    def pause(self, request, pk=None):
        case = self.get_object()
        _ensure_case_access(request.user, case)
        
        # Leader only can pause (User request: chỉ có lãnh đạo mới có quyền Tạm dừng)
        is_leader = _can_act_as_case_leader(request.user, case)
        
        if not is_leader:
             raise ForbiddenError(code="RBAC_FORBIDDEN")

        if case.status.code != "DANG_THUC_HIEN":
             return Response({"detail": "Hồ sơ không ở trạng thái đang thực hiện."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            stt_tam_dung = CaseStatus.objects.get(case_status_name="TAM_DUNG")
        except CaseStatus.DoesNotExist:
             return Response({"detail": "Trạng thái TAM_DUNG chưa được cấu hình."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        case.status = stt_tam_dung
        case.save()
        
        # Use note from request if provided, otherwise use default
        note = request.data.get("note", "Tạm dừng hồ sơ")
        
        CaseActivityLog.objects.create(
            case=case,
            actor=request.user,
            action=CaseActivityLog.Action.UPDATE,
            note=note
        )
        return Response(CaseSerializer(case).data)

    @extend_schema(
        tags=[TAG],
        operation_id="case_resume",
        summary="Tiếp tục hồ sơ",
        responses={200: CaseSerializer, **DEFAULT_ERROR_RESPONSES},
    )
    @action(detail=True, methods=["post"], url_path="resume")
    def resume(self, request, pk=None):
        case = self.get_object()
        _ensure_case_access(request.user, case)
        
        # Leader only can resume
        is_leader = _can_act_as_case_leader(request.user, case)
        
        if not is_leader:
             raise ForbiddenError(code="RBAC_FORBIDDEN")

        if case.status.code != "TAM_DUNG":
             return Response({"detail": "Hồ sơ không ở trạng thái tạm dừng."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            stt_dang_thuc_hien = CaseStatus.objects.get(case_status_name="DANG_THUC_HIEN")
        except CaseStatus.DoesNotExist:
             return Response({"detail": "Trạng thái DANG_THUC_HIEN chưa được cấu hình."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        case.status = stt_dang_thuc_hien
        case.save()
        
        # Use note from request if provided, otherwise use default
        note = request.data.get("note", "Tiếp tục thực hiện hồ sơ")
        
        CaseActivityLog.objects.create(
            case=case,
            actor=request.user,
            action=CaseActivityLog.Action.UPDATE,
            note=note
        )
        return Response(CaseSerializer(case).data)

    @extend_schema(
        tags=[TAG],
        operation_id="case_reject_close",
        summary="Từ chối đóng hồ sơ (Mở lại)",
        responses={200: CaseSerializer, **DEFAULT_ERROR_RESPONSES},
    )
    @action(detail=True, methods=["post"], url_path="reject_close")
    def reject_close(self, request, pk=None):
        case = self.get_object()
        _ensure_case_access(request.user, case)
        
        # Only Leader can reject close
        if not _can_act_as_case_leader(request.user, case):
             raise ForbiddenError(code="RBAC_FORBIDDEN")

        if case.status.code != "CHO_DUYET_DONG":
             return Response({"detail": "Hồ sơ không ở trạng thái chờ duyệt đóng."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            stt_dang_thuc_hien = CaseStatus.objects.get(case_status_name="DANG_THUC_HIEN")
        except CaseStatus.DoesNotExist:
             return Response({"detail": "Trạng thái DANG_THUC_HIEN chưa được cấu hình."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        case.status = stt_dang_thuc_hien
        case.save()
        
        CaseActivityLog.objects.create(
            case=case,
            actor=request.user,
            action=CaseActivityLog.Action.REOPEN,
            note="Từ chối đóng hồ sơ (Yêu cầu xử lý tiếp)"
        )
        return Response(CaseSerializer(case).data)

    @action(detail=True, methods=["get", "post"], url_path="attachments")
    def attachments(self, request, pk=None):
        case = self.get_object()
        _ensure_case_access(request.user, case)
        if request.method == "GET":
            qs = (
                CaseAttachment.objects.filter(case=case)
                .select_related("uploaded_by")
                .order_by("-uploaded_at")
            )
            return Response(CaseAttachmentSerializer(qs, many=True).data)

        upload = request.FILES.get("file")
        if upload is None:
            return Response({"detail": "Thiếu tệp 'file'."}, status=status.HTTP_400_BAD_REQUEST)
        meta_serializer = CaseAttachmentUploadSerializer(data=request.data)
        meta_serializer.is_valid(raise_exception=True)
        file_name = getattr(upload, "name", "attachment")
        storage_path = default_storage.save(
            f"case-attachments/{uuid4()}_{file_name}",
            upload,
        )
        attachment = CaseAttachment.objects.create(
            case=case,
            attachment_type=meta_serializer.validated_data.get("attachment_type") or "tep_kem_theo",
            file_name=file_name,
            storage_path=storage_path,
            uploaded_by=request.user,
        )
        return Response(CaseAttachmentSerializer(attachment).data, status=status.HTTP_201_CREATED)

    @action(
        detail=True,
        methods=["delete"],
        url_path=r"attachments/(?P<attachment_id>[^/]+)",
    )
    def delete_attachment(self, request, attachment_id: str, pk=None):
        case = self.get_object()
        _ensure_case_access(request.user, case)
        attachment = get_object_or_404(CaseAttachment, pk=attachment_id, case=case)
        attachment.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["get", "put"], url_path="documents")
    def documents_link(self, request, pk=None):
        case = self.get_object()
        role_code = _ensure_case_access(request.user, case)
        if request.method == "GET":
            qs = CaseDocument.objects.filter(case=case)
            return Response(CaseDocumentSerializer(qs, many=True).data)

        if role_code not in (Role.CV.value, Role.LD.value):
            raise ForbiddenError(code="RBAC_FORBIDDEN")

        serializer = CaseDocumentLinkSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        CaseDocument.objects.filter(case=case).delete()
        docs = serializer.validated_data.get("document_ids", [])
        rows = [CaseDocument(case=case, document_id=doc_id) for doc_id in docs]
        if rows:
            CaseDocument.objects.bulk_create(rows, ignore_conflicts=True)
        qs = CaseDocument.objects.filter(case=case)
        return Response(CaseDocumentSerializer(qs, many=True).data)


class CaseTaskDetailView(APIView):
    permission_classes = [IsAuthenticated]
    serializer_class = CaseTaskSerializer

    @extend_schema(
        request=CaseTaskUpdateSerializer,
        responses={
            200: CaseTaskSerializer,
            400: APIErrorSchema,
            403: APIErrorSchema,
            404: APIErrorSchema,
        },
    )
    def patch(self, request, pk):
        task = get_object_or_404(CaseTask, pk=pk)
        case = task.case
        role_code = _ensure_case_access(request.user, case)
        is_leader = _can_act_as_case_leader(request.user, case)
        is_assignee = task.assignee_id == getattr(request.user, "user_id", None)
        serializer = CaseTaskUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        assignee_id = data.get("assignee_id")
        if assignee_id is not None:
            if not is_leader:
                raise ForbiddenError(code="RBAC_FORBIDDEN")
            assignee = User.objects.filter(**{USER_PK_FIELD: assignee_id}).first()
            if assignee is None:
                return Response({"detail": "Người được giao không hợp lệ."}, status=status.HTTP_400_BAD_REQUEST)
            task.assignee = assignee

        if not (is_assignee or is_leader):
            raise ForbiddenError(code="RBAC_FORBIDDEN")

        for field in ("title", "status", "due_at", "note"):
            if field in data:
                setattr(task, field, data[field])

        if data.get("status") == CaseTask.Status.DONE and not task.completed_at:
            task.completed_at = timezone.now()
        task.save()
        return Response(CaseTaskSerializer(task).data)

    @extend_schema(
        responses={
            204: None,
            403: APIErrorSchema,
            404: APIErrorSchema,
        },
    )
    def delete(self, request, pk):
        """Delete a task. Only leader or admin can delete tasks."""
        task = get_object_or_404(CaseTask, pk=pk)
        case = task.case
        role_code = _ensure_case_access(request.user, case)
        is_leader = _can_act_as_case_leader(request.user, case)

        if not is_leader:
            raise ForbiddenError(code="RBAC_FORBIDDEN")

        task.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class CommentDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, pk):
        try:
            comment = Comment.objects.get(pk=pk)
        except Comment.DoesNotExist:
            raise NotFound("Bình luận không tồn tại")

        # Check permission: Owner or Admin
        is_owner = comment.user_id == request.user.id
        is_admin = rbac.is_admin(request.user)

        if not (is_owner or is_admin):
            raise PermissionDenied("Bạn không có quyền xóa bình luận này")

        comment.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class CommentListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        parameters=[
            OpenApiParameter(
                name="entity_type",
                location=OpenApiParameter.QUERY,
                required=True,
                type=OpenApiTypes.STR,
            ),
            OpenApiParameter(
                name="entity_id",
                location=OpenApiParameter.QUERY,
                required=True,
                type=OpenApiTypes.INT,
            ),
        ],
        responses={200: CommentSerializer(many=True), 400: APIErrorSchema},
    )
    def get(self, request):
        entity_type = request.query_params.get("entity_type")
        entity_id = request.query_params.get("entity_id")
        if not entity_type or not entity_id:
            return Response({"detail": "Thiếu entity_type hoặc entity_id."}, status=status.HTTP_400_BAD_REQUEST)
        qs = Comment.objects.filter(
            entity_type=entity_type,
            entity_id=entity_id,
        ).order_by("created_at")
        return Response(CommentSerializer(qs, many=True).data)

    @extend_schema(
        request=CommentCreateSerializer,
        responses={201: CommentSerializer, 400: APIErrorSchema},
    )
    def post(self, request):
        serializer = CommentCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        comment = Comment.objects.create(
            entity_type=serializer.validated_data["entity_type"],
            entity_id=serializer.validated_data["entity_id"],
            content=serializer.validated_data["content"],
            user=request.user,
        )
        return Response(CommentSerializer(comment).data, status=status.HTTP_201_CREATED)


class CommentDetailView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        responses={
            204: StatusOnlyResponseSchema,
            403: APIErrorSchema,
            404: APIErrorSchema,
        }
    )
    def delete(self, request, pk):
        comment = get_object_or_404(Comment, pk=pk)
        role_code = rbac.get_single_role_code(request.user)
        if comment.user_id != getattr(request.user, "user_id", None) and role_code != Role.QT.value:
            raise ForbiddenError(code="RBAC_FORBIDDEN")
        comment.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
