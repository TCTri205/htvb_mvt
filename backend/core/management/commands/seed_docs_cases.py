# core/management/commands/seed_docs_cases.py
from __future__ import annotations

from typing import Any, Dict, Optional, Sequence, Tuple, Type
import random

from django.core.management.base import BaseCommand
from django.utils import timezone
from django.apps import apps
from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Model, Field, Max, Q, ForeignKey
from django.db.models import (
    IntegerField, BigIntegerField, SmallIntegerField, PositiveIntegerField,
    AutoField, CharField,
)

# -----------------------------
# Helpers
# -----------------------------
def M(app_label: str, model_name: str) -> Optional[Type[Model]]:
    try:
        return apps.get_model(app_label, model_name)
    except Exception:
        return None

def model_has_field(model: Optional[Type[Model]], name: str) -> bool:
    if not model:
        return False
    try:
        return any(f.name == name for f in model._meta.get_fields())
    except Exception:
        return False

def get_field(model: Type[Model], name: str) -> Optional[Field]:
    try:
        return model._meta.get_field(name)  # type: ignore[attr-defined]
    except Exception:
        return None

def is_int_field(model: Type[Model], name: str) -> bool:
    f = get_field(model, name)
    return isinstance(f, (IntegerField, BigIntegerField, SmallIntegerField, PositiveIntegerField, AutoField))

def is_char_field(model: Type[Model], name: str) -> bool:
    f = get_field(model, name)
    return isinstance(f, CharField)

def _choices_map(field) -> Sequence[Tuple[Any, str]]:
    try:
        ch = getattr(field, "choices", None) or ()
        norm = []
        for v, lbl in ch:
            s = str(lbl).lower() if lbl is not None else ""
            norm.append((v, s))
        return norm
    except Exception:
        return ()

def _pick_in_out_values(document_model: Type[Model]) -> Tuple[Optional[Any], Optional[Any]]:
    try:
        fld = document_model._meta.get_field("doc_direction")
    except Exception:
        return None, None

    ch = _choices_map(fld)
    in_val = out_val = None
    for v, lbl in ch:
        if in_val is None and any(k in lbl for k in ("in", "đến", "den", "inbound")):
            in_val = v
        if out_val is None and any(k in lbl for k in ("out", "đi", "di", "outbound")):
            out_val = v

    if (in_val is None or out_val is None) and len(ch) >= 2:
        v0, _ = ch[0]
        v1, _ = ch[1]
        if in_val is None:
            in_val = v0
        if out_val is None:
            out_val = v1

    return in_val, out_val

def _pick_first_choice(field) -> Optional[Any]:
    try:
        ch = getattr(field, "choices", None) or ()
        return ch[0][0] if ch else None
    except Exception:
        return None

def _next_int_for(Document: Type[Model], field_name: str, direction_field: Optional[str], direction_value: Any) -> int:
    """Trả về max(field)+1 có filter theo hướng (nếu có)."""
    qs = Document.objects.all()
    if direction_field and direction_value is not None and model_has_field(Document, direction_field):
        qs = qs.filter(**{direction_field: direction_value})
    maxv = qs.aggregate(m=Max(field_name)).get("m") or 0
    return int(maxv) + 1

def _unique_char_for(Document: Type[Model], field_name: str, prefix: str,
                     direction_field: Optional[str], direction_value: Any) -> str:
    """
    Tạo giá trị chuỗi chưa tồn tại cho field theo hướng (nếu có).
    Dùng format ngắn gọn để không vượt max_length phổ biến.
    """
    base = f"{prefix}{timezone.now().strftime('%m%d%H%M%S')[-8:]}"  # ví dụ: OUT-11051530
    candidate = base
    for i in range(100):
        filt = Q(**{field_name: candidate})
        if direction_field and direction_value is not None and model_has_field(Document, direction_field):
            filt &= Q(**{direction_field: direction_value})
        if not Document.objects.filter(filt).exists():
            return candidate
        candidate = f"{base}-{i+1}"
    return f"{prefix}{timezone.now().strftime('%H%M%S%f')[-10:]}"  # fallback cuối

# -----------------------------
# Case status helpers
# -----------------------------
def _ensure_case_status(case_model: Type[Model]) -> Optional[Any]:
    """
    Đảm bảo có 1 status hợp lệ để gán cho Case.status (khi là FK).
    - Lấy remote model từ FK.
    - Nếu có 'scope': ưu tiên scope='CASE'.
    - Tạo bản ghi tối thiểu bằng các trường sẵn có: (code,name,scope) hoặc (name) hoặc rỗng.
    """
    f = get_field(case_model, "status")
    if not f or not isinstance(f, ForeignKey):
        return None
    status_model = getattr(getattr(f, "remote_field", None), "model", None)
    if status_model is None:
        return None

    # Tìm sẵn có
    try:
        if model_has_field(status_model, "scope"):
            obj = status_model.objects.filter(scope="CASE").first()
            if obj:
                return obj
        obj = status_model.objects.first()
        if obj:
            return obj
    except Exception:
        obj = None

    # Tạo mới
    payload: Dict[str, Any] = {}
    if model_has_field(status_model, "code"):
        payload["code"] = "WAIT_ASSIGN"
    if model_has_field(status_model, "name"):
        payload["name"] = payload.get("name") or "Chờ phân công"
    if model_has_field(status_model, "scope"):
        payload["scope"] = "CASE"

    try:
        if payload:
            return status_model.objects.create(**payload)
        return status_model.objects.create()
    except Exception:
        # Thử get_or_create nếu code unique
        try:
            if model_has_field(status_model, "code"):
                obj, _ = status_model.objects.get_or_create(
                    code=payload.get("code", "DEFAULT"),
                    defaults={k: v for k, v in payload.items() if k != "code"},
                )
                return obj
        except Exception:
            pass
    return None


class Command(BaseCommand):
    help = "Seed tối thiểu dữ liệu Inbound/Outbound Documents + Cases để test không bị skip."

    def handle(self, *args, **opts):
        tz_now = timezone.now()

        # ===== Resolve models =====
        User = get_user_model()
        Department = M("accounts", "Department")

        Document = M("documents", "Document")
        DocumentAttachment = M("documents", "DocumentAttachment")  # model không có FileField
        DocumentType = M("catalog", "DocumentType")  # app 'catalog', field 'type_name'
        Case = M("cases", "Case")                     # optional

        if not Document:
            self.stdout.write(self.style.WARNING("⚠️ Không tìm thấy documents.Document — bỏ qua seed docs."))
            self.stdout.write(self.style.SUCCESS("SEED_DOCS_CASES DONE"))
            return

        # ===== Pick users & department =====
        user = User.objects.filter(username="ld01").first() \
               or User.objects.filter(is_superuser=True).first() \
               or User.objects.first()
        vt_user = User.objects.filter(username="vt01").first() \
                  or User.objects.filter(username="vt_vanthu").first() \
                  or user
        dept = Department.objects.first() if Department else None

        if not user or not dept:
            self.stdout.write(self.style.WARNING("⚠️ Cần có ít nhất 1 User và 1 Department trước khi seed docs."))
            self.stdout.write(self.style.SUCCESS("SEED_DOCS_CASES DONE"))
            return

        # ===== Ensure a DocumentType =====
        dtype = None
        if DocumentType:
            try:
                dtype = DocumentType.objects.filter(type_name__iexact="Công văn").first()
                if not dtype and model_has_field(DocumentType, "type_name"):
                    dtype = DocumentType.objects.create(type_name="Công văn")
            except Exception:
                dtype = DocumentType.objects.first()

        # ===== Detect IN/OUT values for doc_direction =====
        in_val, out_val = (None, None)
        if model_has_field(Document, "doc_direction"):
            in_val, out_val = _pick_in_out_values(Document)
        if in_val is None or out_val is None:
            self.stdout.write(self.style.WARNING("⚠️ Không xác định được doc_direction choices; vẫn seed nhưng doc_direction có thể để None."))

        # ===== Optional: default Document.status if CharField(choices)
        default_doc_status = None
        if model_has_field(Document, "status"):
            f = get_field(Document, "status")
            if f is not None and not isinstance(f, ForeignKey):
                default_doc_status = _pick_first_choice(f)

        direction_field = "doc_direction" if model_has_field(Document, "doc_direction") else None

        # ===== Create helper: one Document (savepoint per doc) =====
        def _create_document(title: str, direction_value: Any, is_inbound: bool, idx: int) -> Optional[Model]:
            with transaction.atomic():
                doc = Document()
                if model_has_field(Document, "title"):
                    setattr(doc, "title", title)
                if model_has_field(Document, "created_at"):
                    setattr(doc, "created_at", tz_now)

                if model_has_field(Document, "created_by"):
                    setattr(doc, "created_by", user)
                if dept and model_has_field(Document, "department"):
                    setattr(doc, "department", dept)
                if dtype and model_has_field(Document, "document_type"):
                    setattr(doc, "document_type", dtype)

                if direction_field:
                    setattr(doc, direction_field, direction_value)

                if default_doc_status is not None and model_has_field(Document, "status"):
                    try:
                        setattr(doc, "status", default_doc_status)
                    except Exception:
                        pass

                # Số & ngày theo hướng + các field bắt buộc khi IN
                if is_inbound:
                    if model_has_field(Document, "received_number"):
                        if is_int_field(Document, "received_number"):
                            val = _next_int_for(Document, "received_number", direction_field, direction_value)
                            setattr(doc, "received_number", val)
                        elif is_char_field(Document, "received_number"):
                            val = _unique_char_for(Document, "received_number", "IN-", direction_field, direction_value)
                            setattr(doc, "received_number", val)
                    if model_has_field(Document, "received_date"):
                        setattr(doc, "received_date", tz_now.date())
                    if model_has_field(Document, "sender"):
                        setattr(doc, "sender", "Cơ quan A")
                    if model_has_field(Document, "received_by"):
                        setattr(doc, "received_by", vt_user)
                else:
                    if model_has_field(Document, "issue_number"):
                        if is_int_field(Document, "issue_number"):
                            val = _next_int_for(Document, "issue_number", direction_field, direction_value)
                            setattr(doc, "issue_number", val)
                        elif is_char_field(Document, "issue_number"):
                            val = _unique_char_for(Document, "issue_number", "OUT-", direction_field, direction_value)
                            setattr(doc, "issue_number", val)
                    if model_has_field(Document, "issued_date"):
                        setattr(doc, "issued_date", tz_now.date())

                try:
                    doc.save()
                    return doc
                except Exception as e:
                    raise e  # rollback savepoint for this doc only

        # ===== Seed a few inbound & outbound =====
        made_in = 0
        made_out = 0
        for i in range(1, 4):
            try:
                d_in = _create_document(f"VB đến seed #{i}", in_val, True, i)
                if d_in:
                    made_in += 1
            except Exception as e:
                self.stdout.write(self.style.WARNING(f"⚠️ Tạo Inbound #{i} lỗi: {e}"))
            try:
                d_out = _create_document(f"VB đi seed #{i}", out_val, False, i)
                if d_out:
                    made_out += 1
            except Exception as e:
                self.stdout.write(self.style.WARNING(f"⚠️ Tạo Outbound #{i} lỗi: {e}"))

        self.stdout.write(self.style.SUCCESS(f"✓ Documents seeded — inbound: {made_in}, outbound: {made_out}"))

        # ===== Seed some attachments (best-effort; model không có FileField) =====
        DocumentAttachment = M("documents", "DocumentAttachment")
        if DocumentAttachment:
            try:
                docs = list(Document.objects.all()[:3])
            except Exception:
                docs = []
            att_made = 0
            for idx, d in enumerate(docs, start=1):
                payload: Dict[str, Any] = {}
                if model_has_field(DocumentAttachment, "document"):
                    payload["document"] = d
                if model_has_field(DocumentAttachment, "uploaded_by"):
                    payload["uploaded_by"] = user
                if model_has_field(DocumentAttachment, "file_name"):
                    payload["file_name"] = f"seed_{idx}.pdf"
                if model_has_field(DocumentAttachment, "storage_path"):
                    payload["storage_path"] = f"seed/seed_{idx}.pdf"
                if model_has_field(DocumentAttachment, "attachment_type"):
                    payload["attachment_type"] = "PDF"
                if model_has_field(DocumentAttachment, "uploaded_at"):
                    payload["uploaded_at"] = timezone.now()

                try:
                    with transaction.atomic():
                        DocumentAttachment.objects.create(**payload)
                        att_made += 1
                except Exception as e:
                    self.stdout.write(self.style.WARNING(f"⚠️ Tạo Attachment thất bại cho doc [{getattr(d,'pk',None)}]: {e}"))

            self.stdout.write(self.style.SUCCESS(f"✓ Attachments seeded: {att_made}"))

        # ===== Seed a Case (đảm bảo case_code/code không rỗng & duy nhất; status/case_type nếu là FK) =====
        Case = M("cases", "Case")
        if Case:
            # case_type (FK bắt buộc?)
            case_type_obj = None
            if model_has_field(Case, "case_type"):
                f_ct = get_field(Case, "case_type")
                ct_model = getattr(getattr(f_ct, "remote_field", None), "model", None) if isinstance(f_ct, ForeignKey) else None
                if ct_model:
                    try:
                        case_type_obj = ct_model.objects.first()
                        if not case_type_obj:
                            payload_ct: Dict[str, Any] = {}
                            if model_has_field(ct_model, "type_name"):
                                payload_ct["type_name"] = "Hồ sơ thường"
                            elif model_has_field(ct_model, "name"):
                                payload_ct["name"] = "Hồ sơ thường"
                            elif model_has_field(ct_model, "code"):
                                payload_ct["code"] = "DEFAULT"
                            case_type_obj = ct_model.objects.create(**payload_ct) if payload_ct else ct_model.objects.create()
                    except Exception as e:
                        self.stdout.write(self.style.WARNING(f"⚠️ Không thể tạo CaseType: {e}"))

            # status (FK bắt buộc?)
            case_status_obj = None
            if model_has_field(Case, "status"):
                f_st = get_field(Case, "status")
                if isinstance(f_st, ForeignKey):
                    case_status_obj = _ensure_case_status(Case)

            # xác định field code cho Case: "case_code" hoặc "code"
            code_field = "case_code" if model_has_field(Case, "case_code") else ("code" if model_has_field(Case, "code") else None)
            max_len = getattr(get_field(Case, code_field), "max_length", None) if code_field else None

            def _gen_case_code() -> str:
                base = f"CASE-{timezone.now():%Y%m%d%H%M%S}-{random.randint(100,999)}"
                if isinstance(max_len, int) and max_len > 0:
                    return base[:max_len]
                return base

            # dựng payload
            case_payload: Dict[str, Any] = {}
            if model_has_field(Case, "title"):
                case_payload["title"] = "Hồ sơ seed tối thiểu"
            if model_has_field(Case, "department"):
                case_payload["department"] = dept
            if model_has_field(Case, "created_by"):
                case_payload["created_by"] = user
            if model_has_field(Case, "deadline"):
                case_payload["deadline"] = tz_now.date()
            if model_has_field(Case, "case_type") and case_type_obj is not None:
                case_payload["case_type"] = case_type_obj
            # status
            if model_has_field(Case, "status"):
                f = get_field(Case, "status")
                if isinstance(f, ForeignKey):
                    if case_status_obj is not None:
                        case_payload["status"] = case_status_obj
                else:
                    st0 = _pick_first_choice(f) if f is not None else None
                    if st0 is not None:
                        case_payload["status"] = st0

            case_obj = None
            try:
                with transaction.atomic():
                    if code_field:
                        code_val = _gen_case_code()
                        # Tạo theo get_or_create để đảm bảo không trùng unique & không rỗng
                        defaults = case_payload.copy()
                        kwargs = {code_field: code_val}
                        case_obj, _ = Case.objects.get_or_create(**kwargs, defaults=defaults)
                    else:
                        # Không có field code/case_code → tạo thường
                        case_obj = Case.objects.create(**case_payload)
                self.stdout.write(self.style.SUCCESS("✓ Case seeded"))
            except Exception as e:
                self.stdout.write(self.style.WARNING(f"⚠️ Bỏ qua seed Case (không đủ field bắt buộc?): {e}"))
                case_obj = None

            # Liên kết documents nếu có quan hệ M2M/Reverse
            if case_obj is not None:
                linked = 0
                try:
                    rel = getattr(case_obj, "documents", None)
                    if rel is not None and hasattr(rel, "add"):
                        docs_link = list(Document.objects.all()[:3])
                        if docs_link:
                            with transaction.atomic():
                                rel.add(*docs_link)
                            linked = len(docs_link)
                except Exception:
                    pass
                if linked:
                    self.stdout.write(self.style.SUCCESS(f"✓ Liên kết {linked} document vào Case"))

        self.stdout.write(self.style.SUCCESS("SEED_DOCS_CASES DONE"))
