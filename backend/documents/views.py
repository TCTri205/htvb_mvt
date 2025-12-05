from __future__ import annotations

import os
from typing import Any, Dict, List, Optional, Callable
from uuid import uuid4

from django.conf import settings
from django.core.files.storage import default_storage
from django.http import FileResponse, Http404
from django.db.models import Count
from django.utils import timezone
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated, SAFE_METHODS
from rest_framework.response import Response

from drf_spectacular.utils import extend_schema

from core.exceptions import ForbiddenError
from documents.models import (
    DispatchOutbox,
    Document,
    DocumentAssignment,
    DocumentAttachment,
    DocumentApproval,
    DocumentVersion,
    DocumentWorkflowLog,
    Organization,
    OrgContact,
)
from documents.serializers import (
    DocumentAssignmentSerializer,
    DocumentAssignmentUpsertSerializer,
    DocumentAttachmentSerializer,
    DocumentApprovalSerializer,
    DocumentApprovalUpsertSerializer,
    DocumentDetailSerializer,
    DocumentDispatchCreateSerializer,
    DocumentDispatchSerializer,
    DocumentDispatchUpdateSerializer,
    DocumentListSerializer,
    DocumentSlimSerializer,
    DocumentUpsertSerializer,
    DocumentVersionCreateSerializer,
    DocumentVersionSerializer,
    DocumentWorkflowLogListSerializer,
    OrganizationSerializer,
    OrgContactSerializer,
)
from documents.views_base import DocumentBaseViewSet
from workflow.services import rbac
from workflow.services.rbac import Act, Role
from workflow.services.status_resolver import StatusResolver as SR, InboundStatus
from documents.utils.outbound_status import cv_assignable_status_kind
from workflow.services.outbound_service import OutboundService
from workflow.services.events import emit
from workflow.services.audit import audit_log

UserRole = Role

LOG_ATTACHMENT_TYPE = "nhat_ky_xu_ly"
_TRUTHY_PARAM_VALUES = {"1", "true", "yes", "on"}


def _query_param_is_true(value: Optional[str]) -> bool:
    if value is None:
        return False
    return str(value).strip().lower() in _TRUTHY_PARAM_VALUES


def _user_role(user) -> Optional[str]:
    return rbac.get_single_role_code(user)


def _can_user_manage_assignments(user, doc) -> bool:
    role_code = _user_role(user)
    if role_code in (Role.VT.value, Role.LD.value, Role.QT.value):
        return True
    if role_code == Role.CV.value:
        # Kiểm tra direction - chấp nhận cả DI và DU_THAO
        doc_direction = getattr(doc, "doc_direction", "").lower()
        if doc_direction not in (Document.Direction.DI, Document.Direction.DU_THAO):
            return False
        
        # CV có thể manage assignments khi văn bản ở trạng thái draft (bao gồm SUBMITTED)
        status_id = getattr(doc, "status_id", None)
        status_kind = cv_assignable_status_kind(status_id)
        
        # Nếu status_id là None (văn bản mới), mặc định là draft
        if status_kind is None and status_id is None:
            status_kind = "draft"
        
        if status_kind != "draft":
            return False
        
        # Chuyên viên có quyền phân công nếu:
        # 1. Là người tạo document
        # 2. HOẶC là owner/assignee hiện tại
        # 3. VÀ có quyền CV_UPDATE_DRAFT
        
        # 1. Check creator
        created_by = getattr(doc, "created_by", None)
        created_by_id = getattr(doc, "created_by_id", None)
        user_id = getattr(user, "user_id", None)
        
        is_creator = False
        if created_by:
            is_creator = getattr(created_by, "user_id", None) == user_id
        elif created_by_id is not None:
            is_creator = created_by_id == user_id or created_by_id == getattr(user, "id", None)
        
        # 2. Check assignee
        is_assignee_or_owner = rbac._is_doc_assignee(user, doc)
        
        # Nếu không thỏa mãn điều kiện creator hoặc assignee thì reject
        if not (is_creator or is_assignee_or_owner):
            return False
        
        # Kiểm tra quyền RBAC CV_UPDATE_DRAFT
        return rbac.can(user, Act.CV_UPDATE_DRAFT, doc)
    return False


class DocumentViewSet(DocumentBaseViewSet):
    """Read-only API plus assignment/approval/version/attachment subresources."""

    lookup_field = "document_id"
    lookup_url_kwarg = "document_id"
    required_act_map = {"workflow_logs": Act.VIEW, "attachments": Act.VIEW}

    def _direction_from_source(self, request=None, obj=None) -> str:
        if obj is not None:
            return getattr(obj, "doc_direction", None) or Document.Direction.DU_THAO
        if request is not None and hasattr(request, "data"):
            data = request.data
            try:
                return data.get("doc_direction") or Document.Direction.DU_THAO
            except AttributeError:
                return Document.Direction.DU_THAO
        return Document.Direction.DU_THAO

    def resolve_required_act(self, action=None, method=None, request=None, obj=None):
        method = (method or "").upper()
        direction = self._direction_from_source(request=request, obj=obj)

        def _by_direction(in_act: Act, out_act: Act) -> Act:
            return in_act if direction == Document.Direction.DEN else out_act

        if action == "assignments":
            return Act.VIEW
        if action == "approvals":
            return Act.VIEW
        if action == "dispatches":
            if method in SAFE_METHODS:
                return Act.VIEW
            return Act.OUT_PUBLISH
        if action in ("versions",):
            if method == "GET":
                return Act.VIEW
            return _by_direction(Act.IN_EDIT_NOTE, Act.OUT_DRAFT_EDIT)
        if action in ("attachments", "delete_attachment", "download_attachment"):
            if method == "GET":
                return Act.VIEW
            if action == "download_attachment":
                return Act.VIEW
            return None
        if action in ("workflow_logs", "log_event"):
            return Act.VIEW
        if action in ("update", "partial_update"):
            return _by_direction(Act.IN_DRAFT_EDIT, Act.OUT_DRAFT_EDIT)
        if action == "create":
            if direction in (Document.Direction.DU_THAO, Document.Direction.DI):
                return Act.OUT_DRAFT_CREATE
            return Act.IN_DRAFT_EDIT
        return Act.VIEW if action in ("list", "retrieve") else None

    def _ensure_role(self, request, allowed: List[str]):
        code = _user_role(request.user)
        if not code or code not in allowed:
            raise ForbiddenError(code="RBAC_FORBIDDEN")

    def _parse_includes(self, request) -> set[str]:
        if request is None:
            return set()
        raw = request.query_params.get("include")
        if not raw:
            return set()
        include: set[str] = set()
        alias_map = {
            "assignments": "assignments",
            "approvals": "approvals",
            "approvals_count": "approvals_count",
            "attachments": "attachments_count",
            "attachments_count": "attachments_count",
            "versions": "versions_count",
            "versions_count": "versions_count",
            "counts": "counts",
        }
        for token in str(raw).split(","):
            slug = token.strip().lower().replace("-", "_")
            if not slug:
                continue
            include.add(alias_map.get(slug, slug))
        return include

    def _get_include_set(self) -> set[str]:
        cached = getattr(self, "_cached_include_set", None)
        if cached is None:
            cached = self._parse_includes(getattr(self, "request", None))
            self._cached_include_set = cached
        return cached

    def get_serializer_class(self):
        if getattr(self, "action", None) == "list":
            return DocumentListSerializer
        return super().get_serializer_class()

    def _prepare_upsert_payload(self, request, *, instance: Optional[Document] = None) -> dict:
        data = dict(request.data or {})
        if not data.get("doc_direction"):
            data["doc_direction"] = getattr(instance, "doc_direction", None) or Document.Direction.DU_THAO
        return data

    def _serialize_detail_response(self, doc: Document, *, status_code=status.HTTP_200_OK) -> Response:
        resp = Response(DocumentDetailSerializer(doc).data, status=status_code)
        try:
            resp["ETag"] = self._build_etag(doc)
        except Exception:
            pass
        return resp

    def create(self, request, *args, **kwargs):
        payload = self._prepare_upsert_payload(request)
        serializer = DocumentUpsertSerializer(data=payload)
        serializer.is_valid(raise_exception=True)
        doc = serializer.save(created_by=request.user)
        # Đảm bảo trạng thái dự thảo + log khởi tạo
        OutboundService(actor=request.user).touch_draft(doc)
        return self._serialize_detail_response(doc, status_code=status.HTTP_201_CREATED)

    def partial_update(self, request, *args, **kwargs):
        doc = self.get_object()
        if doc.doc_direction not in (Document.Direction.DU_THAO, Document.Direction.DI):
            raise ForbiddenError("Chỉ được chỉnh sửa dự thảo/văn bản đi.")
        self._maybe_enforce_if_match(request, doc)
        payload = self._prepare_upsert_payload(request, instance=doc)
        serializer = DocumentUpsertSerializer(instance=doc, data=payload, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        OutboundService(actor=request.user).touch_draft(doc)
        return self._serialize_detail_response(doc)

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        include = self._get_include_set()
        if include:
            ctx["include"] = include
        return ctx

    def get_queryset(self):
        qs = super().get_queryset()
        include = self._get_include_set()
        if include:
            annotations: Dict[str, Any] = {}
            if "attachments_count" in include or "counts" in include:
                annotations["attachments_count"] = Count("attachments", distinct=True)
            if "assignments" in include or "counts" in include:
                annotations["assignments_count"] = Count("assignments", distinct=True)
            if "approvals" in include or "approvals_count" in include or "counts" in include:
                annotations["approvals_count"] = Count("approvals", distinct=True)
            if "versions_count" in include or "counts" in include:
                annotations["versions_count"] = Count("versions", distinct=True)
            if annotations:
                qs = qs.annotate(**annotations)
        return qs

    # ---- Workflow logs -----------------------------------------------------------
    @extend_schema(tags=["Văn bản"], operation_id="document_workflow_logs")
    @action(detail=True, methods=["get"], url_path="workflow-logs")
    def workflow_logs(self, request, *args, **kwargs):
        doc = self.get_object()
        logs = (
            DocumentWorkflowLog.objects.filter(document=doc)
            .select_related("acted_by", "from_status", "to_status")
            .order_by("-acted_at")
        )
        data = DocumentWorkflowLogListSerializer(logs, many=True).data
        return Response(data)

    @extend_schema(tags=["Văn bản"], operation_id="document_log_event")
    @action(detail=True, methods=["post"], url_path="log-event")
    def log_event(self, request, *args, **kwargs):
        doc = self.get_object()
        # Allow VT, LD, QT to log events
        self._ensure_role(request, [Role.VT.value, Role.LD.value, Role.QT.value])
        
        event_type = request.data.get("event_type")
        description = request.data.get("description")
        
        if not description:
            return Response({"detail": "Cần nhập nội dung sự kiện."}, status=status.HTTP_400_BAD_REQUEST)
            
        log = DocumentWorkflowLog.objects.create(
            document=doc,
            action=DocumentWorkflowLog.Action.MANUAL_LOG,
            acted_by=request.user,
            comment=description,
            meta_json={"event_type": event_type} if event_type else None,
            from_status=doc.status,
            to_status=doc.status
        )
        
        return Response(DocumentWorkflowLogListSerializer(log).data, status=status.HTTP_201_CREATED)

    # ---- Assignments -------------------------------------------------------------
    @action(detail=True, methods=["get", "put"], url_path="assignments")
    def assignments(self, request, *args, **kwargs):
        doc = self.get_object()
        if request.method == "GET":
            qs = (
                DocumentAssignment.objects.filter(document=doc)
                .select_related("user", "assigned_by")
                .order_by("-assigned_at")
            )
            return Response(DocumentAssignmentSerializer(qs, many=True).data)

        if not _can_user_manage_assignments(request.user, doc):
            raise ForbiddenError(code="RBAC_FORBIDDEN")
        payload = request.data
        if isinstance(payload, list):
            payload = {"assignments": payload}
        serializer = DocumentAssignmentUpsertSerializer(data=payload)
        serializer.is_valid(raise_exception=True)
        assignments = serializer.save(document=doc, assigned_by=request.user)

        # Log assignment without changing status
        # Status change to PROCESSING is now done via confirm_assignment action
        if doc.doc_direction == Document.Direction.DEN:
            audit_log(
                actor=request.user,
                action="DOC.IN.ADD_ASSIGNEE.API",
                entity_type="document",
                entity_id=doc.document_id,
                after={
                    "assignees": [str(a["user_id"]) for a in serializer.validated_data.get("assignments", [])],
                },
            )
        return Response(DocumentAssignmentSerializer(assignments, many=True).data)

    # ---- Approvals ---------------------------------------------------------------
    @action(detail=True, methods=["get", "put"], url_path="approvals")
    def approvals(self, request, *args, **kwargs):
        doc = self.get_object()
        if request.method == "GET":
            qs = (
                DocumentApproval.objects.filter(document=doc)
                .select_related("approver")
                .order_by("step_no")
            )
            return Response(DocumentApprovalSerializer(qs, many=True).data)

        self._ensure_role(request, [Role.VT.value, Role.QT.value])
        payload = request.data
        if isinstance(payload, list):
            payload = {"approvals": payload}
        serializer = DocumentApprovalUpsertSerializer(data=payload)
        serializer.is_valid(raise_exception=True)
        approvals = serializer.save(document=doc)
        return Response(DocumentApprovalSerializer(approvals, many=True).data)

    # ---- Versions ----------------------------------------------------------------
    @action(detail=True, methods=["get", "post"], url_path="versions")
    def versions(self, request, *args, **kwargs):
        doc = self.get_object()
        if request.method == "GET":
            qs = (
                DocumentVersion.objects.filter(document=doc)
                .select_related("changed_by")
                .order_by("-version_no")
            )
            return Response(DocumentVersionSerializer(qs, many=True).data)

        serializer = DocumentVersionCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        upload = request.FILES.get("file")
        storage_path = None
        file_name = None
        if upload is not None:
            file_name = getattr(upload, "name", "version")
            storage_path = default_storage.save(
                f"document-versions/{uuid4()}_{file_name}",
                upload,
            )
        version = DocumentVersion.objects.create(
            document=doc,
            version_no=serializer.validated_data["version_no"],
            file_name=file_name,
            storage_path=storage_path,
            changed_by=request.user,
        )
        return Response(DocumentVersionSerializer(version).data)

    # ---- Dispatches -------------------------------------------------------------
    @action(detail=True, methods=["get", "post"], url_path="dispatches")
    def dispatches(self, request, *args, **kwargs):
        doc = self.get_object()
        if request.method == "GET":
            qs = (
                DispatchOutbox.objects.filter(document=doc)
                .select_related("organization", "contact")
                .order_by("-sent_at", "-dispatch_id")
            )
            return Response(DocumentDispatchSerializer(qs, many=True).data)

        self._ensure_role(request, [Role.VT.value])
        serializer = DocumentDispatchCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        org = None
        if data.get("organization_id"):
            org = Organization.objects.filter(pk=data["organization_id"]).first()
            if org is None:
                return Response({"detail": "Tổ chức không hợp lệ."}, status=status.HTTP_400_BAD_REQUEST)

        contact = None
        if data.get("contact_id"):
            contact = OrgContact.objects.filter(pk=data["contact_id"]).first()
            if contact is None:
                return Response({"detail": "Liên hệ không hợp lệ."}, status=status.HTTP_400_BAD_REQUEST)

        dispatch = DispatchOutbox.objects.create(
            document=doc,
            organization=org,
            contact=contact,
            method=data["method"],
            status=DispatchOutbox.Status.PENDING,
            note=data.get("note"),
        )
        return Response(DocumentDispatchSerializer(dispatch).data, status=status.HTTP_201_CREATED)

    def _attachment_ordering_field(self) -> str:
        for name in ("uploaded_at", "attachment_id"):
            try:
                DocumentAttachment._meta.get_field(name)
                return f"-{name}"
            except Exception:
                continue
        return "-attachment_id"

    def _attachments_queryset_for(self, doc: Document):
        rel = getattr(doc, "attachments", None)
        if rel is not None:
            try:
                return rel.all()
            except Exception:
                pass
        return DocumentAttachment.objects.filter(document=doc)

    def _user_is_assigned(self, user, doc):
        """Check if user can upload attachments to this document.
        
        Returns True if user is:
        - Assigned to the document (as OWNER or ASSIGNEE)
        - The document creator
        - The document receiver (for inbound docs)
        - Has VT/LD/QT role (clerks, leaders, admins can always upload)
        """
        if user is None or doc is None:
            return False
        
        # Văn thư, Lãnh đạo, Quản trị can always upload
        user_role = _user_role(user)
        if user_role in (Role.VT.value, Role.LD.value, Role.QT.value):
            return True
        
        # Check if user created the document
        created_by = getattr(doc, "created_by", None)
        if created_by is not None:
            if getattr(created_by, "pk", None) == getattr(user, "pk", None):
                return True
            if getattr(created_by, "user_id", None) == getattr(user, "user_id", None):
                return True
        created_by_id = getattr(doc, "created_by_id", None)
        if created_by_id is not None:
            if created_by_id == getattr(user, "pk", None) or created_by_id == getattr(user, "id", None):
                return True
        
        # Check if user received the document (for inbound docs)
        received_by = getattr(doc, "received_by", None)
        if received_by is not None:
            if getattr(received_by, "pk", None) == getattr(user, "pk", None):
                return True
        
        # Check assignment
        return DocumentAssignment.objects.filter(
            document=doc,
            user=user,
            role_on_doc__in=(
                DocumentAssignment.RoleOnDoc.ASSIGNEE.value,
                DocumentAssignment.RoleOnDoc.OWNER.value,
            ),
        ).exists()


    def _allow_json_upload(self) -> bool:
        allow_json = getattr(settings, "ALLOW_JSON_UPLOAD_FALLBACK", None)
        if allow_json is None:
            allow_json = getattr(settings, "TESTING", False)
        return bool(allow_json)

    def _validate_upload_ext(self, name: Optional[str]):
        if not name:
            return
        allowed_ext = getattr(
            settings,
            "DOCUMENTS_ALLOWED_EXT",
            [".pdf", ".doc", ".docx", ".xls", ".xlsx", ".jpg", ".jpeg", ".png"],
        )
        _, ext = os.path.splitext(str(name).lower())
        if allowed_ext and ext and ext not in allowed_ext:
            raise ForbiddenError(detail=f"Định dạng không được phép ({ext}).")

    @action(detail=True, methods=["get", "post"], url_path="attachments")
    def attachments(self, request, *args, **kwargs):
        doc = self.get_object()
        if request.method == "GET":
            order_field = self._attachment_ordering_field()
            qs = self._attachments_queryset_for(doc)
            try:
                qs = qs.order_by(order_field)
            except Exception:
                pass
            if _query_param_is_true(request.query_params.get("exclude_log")):
                qs = qs.exclude(attachment_type__iexact=LOG_ATTACHMENT_TYPE)
            return Response(DocumentAttachmentSerializer(qs, many=True).data)

        upload = request.FILES.get("file")
        if upload is None and self._allow_json_upload():
            upload = request.data.get("file")

        if upload is None:
            return Response({"detail": "Thiếu tệp 'file'."}, status=status.HTTP_400_BAD_REQUEST)

        name = getattr(upload, "name", None) or "upload"
        self._validate_upload_ext(name)

        if not self._user_is_assigned(request.user, doc):
            raise ForbiddenError("Chưa được phân công xử lý văn bản.")
        storage_path = default_storage.save(f"document-attachments/{uuid4()}_{name}", upload)
        data = {
            "document": doc,
            "file_name": name,
            "storage_path": storage_path,
            "uploaded_by": request.user,
            "attachment_type": request.data.get("attachment_type") or "tep_kem",
            "note": request.data.get("note"),
        }
        attachment = DocumentAttachment.objects.create(**{k: v for k, v in data.items() if v is not None})
        return Response(DocumentAttachmentSerializer(attachment).data, status=status.HTTP_201_CREATED)

    @action(
        detail=True,
        methods=["delete"],
        url_path=r"attachments/(?P<attachment_id>[^/]+)",
    )
    def delete_attachment(self, request, attachment_id=None, *args, **kwargs):
        doc = self.get_object()
        try:
            attachment = DocumentAttachment.objects.get(document=doc, attachment_id=attachment_id)
        except DocumentAttachment.DoesNotExist:
            raise Http404("Không tìm thấy tệp đính kèm.")
        attachment.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(
        detail=True,
        methods=["get"],
        url_path=r"attachments/(?P<attachment_id>[^/]+)/download",
    )
    def download_attachment(self, request, attachment_id=None, *args, **kwargs):
        doc = self.get_object()
        try:
            attachment = DocumentAttachment.objects.get(document=doc, attachment_id=attachment_id)
        except DocumentAttachment.DoesNotExist:
            raise Http404("Không tìm thấy tệp đính kèm.")

        file_url = getattr(attachment, "storage_path", None)
        if not file_url:
            raise Http404("Không có dữ liệu tệp.")
        file_handle = default_storage.open(file_url, "rb")
        return FileResponse(file_handle, filename=attachment.file_name or "download")


class OrganizationViewSet(viewsets.ModelViewSet):
    queryset = Organization.objects.all().order_by("name")
    serializer_class = OrganizationSerializer
    permission_classes = [IsAuthenticated]
    with_counts = False
    with_docs = False

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        params = getattr(self.request, "query_params", {})
        ctx["with_counts"] = params.get("with_counts") in ("1", "true", "yes")
        ctx["with_docs"] = params.get("with_docs") in ("1", "true", "yes")
        return ctx

    def get_queryset(self):
        qs = super().get_queryset()
        params = getattr(self.request, "query_params", {})
        with_counts = params.get("with_counts") in ("1", "true", "yes")
        if with_counts:
            qs = qs.annotate(dispatches_count=Count("dispatchoutbox"))
        return qs

    def _require_write_role(self, request):
        if _user_role(request.user) not in (Role.VT.value, Role.QT.value):
            raise ForbiddenError(code="RBAC_FORBIDDEN")

    def _require_read_role(self, request):
        if _user_role(request.user) not in (Role.VT.value, Role.QT.value):
            raise ForbiddenError(code="RBAC_FORBIDDEN")

    def create(self, request, *args, **kwargs):
        self._require_write_role(request)
        return super().create(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        self._require_write_role(request)
        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        self._require_write_role(request)
        return super().destroy(request, *args, **kwargs)

    def list(self, request, *args, **kwargs):
        self._require_read_role(request)
        return super().list(request, *args, **kwargs)

    @action(detail=True, methods=["get", "post"], url_path="contacts")
    def contacts(self, request, *args, **kwargs):
        org = self.get_object()
        if request.method == "GET":
            self._require_read_role(request)
            qs = org.contacts.all()
            return Response(OrgContactSerializer(qs, many=True).data)
        self._require_write_role(request)
        data = dict(request.data)
        data["organization_id"] = org.pk
        serializer = OrgContactSerializer(data=data)
        serializer.is_valid(raise_exception=True)
        contact = serializer.save(organization=org)
        return Response(OrgContactSerializer(contact).data, status=status.HTTP_201_CREATED)

    @action(
        detail=True,
        methods=["patch", "delete"],
        url_path=r"contacts/(?P<contact_id>[^/]+)",
    )
    def contact_detail(self, request, contact_id: str, *args, **kwargs):
        self._require_write_role(request)
        org = self.get_object()
        try:
            contact = org.contacts.get(pk=contact_id)
        except OrgContact.DoesNotExist:
            raise Http404("Không tìm thấy liên hệ.")
        if request.method == "DELETE":
            contact.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)
        serializer = OrgContactSerializer(contact, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class DispatchViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    queryset = DispatchOutbox.objects.select_related("document").all()
    ordering = ("-sent_at", "-dispatch_id")
    serializer_class = DocumentDispatchSerializer
    permission_classes = [IsAuthenticated]
    lookup_field = "dispatch_id"
    lookup_url_kwarg = "pk"

    def _ensure_publish_permission(self, user, document: Optional[Document]):
        if not rbac.can(user, Act.OUT_PUBLISH, document):
            raise ForbiddenError(code="RBAC_FORBIDDEN")

    def partial_update(self, request, *args, **kwargs):
        dispatch = self.get_object()
        self._ensure_publish_permission(request.user, dispatch.document)
        serializer = DocumentDispatchUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        for field, value in serializer.validated_data.items():
            setattr(dispatch, field, value)
        dispatch.save()
        return Response(DocumentDispatchSerializer(dispatch).data)

    @action(detail=True, methods=["post"], url_path="resend")
    def resend(self, request, *args, **kwargs):
        dispatch = self.get_object()
        self._ensure_publish_permission(request.user, dispatch.document)
        dispatch.status = DispatchOutbox.Status.PENDING
        dispatch.sent_at = timezone.now()
        dispatch.save(update_fields=["status", "sent_at"])
        return Response(DocumentDispatchSerializer(dispatch).data)
