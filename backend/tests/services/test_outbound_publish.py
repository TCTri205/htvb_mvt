# from django.test import TestCase
# from django.apps import apps
# from django.utils import timezone
# from django.contrib.auth import get_user_model

# from workflow.services.outbound_service import OutboundService
# from workflow.services.errors import ValidationError
# from workflow.services.status_resolver import StatusResolver as SR

# User = get_user_model()

# class TestOutboundPublish(TestCase):
#     @classmethod
#     def setUpTestData(cls):
#         # Seed role VT + gán cho user phát hành
#         Role = apps.get_model('accounts', 'Role')
#         cls.role_vt = Role.objects.create(name="VT")
#         cls.vt = User.objects.create(username="vt", full_name="Văn thư", password_hash="x")
#         setattr(cls.vt, "role_id", cls.role_vt.pk)
#         cls.vt.save(update_fields=[])

#         # Seed document statuses cần dùng
#         DocStatus = apps.get_model('catalog', 'DocumentStatus')
#         for name in ["DU_THAO", "TRINH_DUYET", "PHE_DUYET", "KY_SO", "PHAT_HANH", "LUU_TRU"]:
#             DocStatus.objects.get_or_create(status_name=name)

#         # Chuẩn bị số đi để tạo xung đột
#         cls.existing_issue_number = f"99/{timezone.now().year}"

#         # Tạo 1 VB đi đã có số (để tạo xung đột)
#         Document = apps.get_model('documents', 'Document')
#         cls.doc_existing = Document.objects.create(
#             title="Công văn A",
#             doc_direction="di",
#             status_id=SR.doc_status_id("PHAT_HANH"),
#             issue_number=cls.existing_issue_number,
#             issued_date=timezone.now().date(),
#         )

#         # Tạo một dự thảo sẽ publish trùng số
#         cls.doc_draft = Document.objects.create(
#             title="Công văn B",
#             doc_direction="du_thao",
#             status_id=SR.doc_status_id("PHE_DUYET"),  # đã duyệt → có thể ký → publish, đơn giản hoá test
#         )

#     def test_publish_duplicate_issue_number_raises_validationerror(self):
#         svc = OutboundService(self.vt)
#         with self.assertRaises(ValidationError) as ctx:
#             # Truyền trực tiếp chuỗi số đi đã chuẩn bị (tránh .issue_number trên Model ẩn danh)
#             svc.publish(self.doc_draft, issue_number=self.existing_issue_number)
#         self.assertEqual(ctx.exception.code, "DUPLICATE_ISSUE_NUMBER")

from django.test import TestCase
from django.apps import apps
from django.utils import timezone
from django.contrib.auth import get_user_model

from workflow.services.outbound_service import OutboundService
from workflow.services.errors import ValidationError
from workflow.services.status_resolver import StatusResolver as SR, OutboundStatus

User = get_user_model()

class TestOutboundPublish(TestCase):
    @classmethod
    def setUpTestData(cls):
        # Seed role VT + gán cho user phát hành
        Role = apps.get_model('accounts', 'Role')
        cls.role_vt, _ = Role.objects.get_or_create(name="VT")

        # Tạo user phát hành (không dùng password_hash)
        try:
            cls.vt = User.objects.create_user(username="vt", password="x")
        except TypeError:
            # Fallback nếu create_user khác signature
            cls.vt = User.objects.create(username="vt")
            cls.vt.set_password("x")
            cls.vt.save()
        # Gắn role_id ngay trên instance (RBAC đọc trực tiếp thuộc tính)
        setattr(cls.vt, "role_id", cls.role_vt.pk)

        # Seed document statuses cần dùng
        DocStatus = apps.get_model('catalog', 'DocumentStatus')
        for name in [
            OutboundStatus.DRAFT.value,
            OutboundStatus.SUBMITTED.value,
            OutboundStatus.APPROVED.value,
            OutboundStatus.PENDING_CLERK_CHECK.value,
            OutboundStatus.REGISTERED.value,
            OutboundStatus.ISSUED.value,
            OutboundStatus.ARCHIVED.value,
            OutboundStatus.HUY_PHAT_HANH.value,
        ]:
            DocStatus.objects.get_or_create(status_name=name)

        # Chuẩn bị số đi để tạo xung đột
        cls.existing_issue_number = f"99/{timezone.now().year}"

        # Tạo 1 VB đi đã có số (để tạo xung đột)
        Document = apps.get_model('documents', 'Document')
        cls.doc_existing = Document.objects.create(
            title="Công văn A",
            doc_direction="di",
            status_id=SR.doc_status_id(OutboundStatus.ISSUED.value),
            issue_number=cls.existing_issue_number,
            issued_date=timezone.now().date(),
        )

        # Tạo một DỰ THẢO (nhớ thêm document_code để qua CHECK)
        cls.doc_draft = Document.objects.create(
            title="Công văn B",
            doc_direction="du_thao",
            document_code="DT-001",
            status_id=SR.doc_status_id(OutboundStatus.REGISTERED.value),  # đã vào sổ để chuẩn bị phát hành
        )

    def test_publish_duplicate_issue_number_raises_validationerror(self):
        svc = OutboundService(self.vt)
        with self.assertRaises(ValidationError) as ctx:
            # Truyền trực tiếp chuỗi số đi đã chuẩn bị (tránh .issue_number trên Model ẩn danh)
            svc.publish(self.doc_draft, issue_number=self.existing_issue_number)
        self.assertEqual(ctx.exception.code, "DUPLICATE_ISSUE_NUMBER")
