from datetime import date

from accounts.models import Role, UserRole
from catalog.models import CaseStatus, CaseType, DocumentStatus
from cases.models import Case
from documents.models import Document
from django.contrib.auth import get_user_model
from django.test import Client, TestCase
from django.urls import reverse


class UIViewsSmokeTest(TestCase):
    """
    Smoke tests that cover the main unauthenticated entry points and a sample
    authenticated route to ensure the new MVT UI layer loads as expected.
    """

    def setUp(self):
        self.client = Client()
        self.user = get_user_model().objects.create_user(username="tester", password="passw0rd")
        role, _ = Role.objects.get_or_create(name="VAN_THU")
        UserRole.objects.create(user=self.user, role=role)

    def test_login_page_loads_and_serves_static_paths(self):
        response = self.client.get(reverse("ui:login"))
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "static/css/styles.css")
        self.assertContains(response, "static/js/api.js")

    def test_index_page_loads_without_auth(self):
        response = self.client.get(reverse("ui:index"))
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "static/js/api.js")

    def test_vanthu_dashboard_requires_auth(self):
        response = self.client.get("/vanthu/dashboard/")
        self.assertEqual(response.status_code, 302)
        self.assertIn(reverse("ui:index"), response["Location"])

    def test_vanthu_dashboard_authenticated(self):
        self.client.force_login(self.user)
        response = self.client.get("/vanthu/dashboard/")
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Văn bản đến chưa xử lý")

    def _create_inbound_doc(self):
        status = DocumentStatus.objects.create(status_name="TIEP_NHAN")
        return Document.objects.create(
            doc_direction=Document.Direction.DEN,
            title="Test inbound",
            received_number=1,
            received_date=date.today(),
            sender="UBND",
            status=status,
        )

    def test_vanthu_inbound_detail_requires_auth(self):
        doc = self._create_inbound_doc()
        response = self.client.get(f"/vanthu/vanbanden/{doc.pk}/")
        self.assertEqual(response.status_code, 302)
        self.assertIn(reverse("ui:login"), response["Location"])

    def test_vanthu_inbound_detail_authenticated(self):
        doc = self._create_inbound_doc()
        self.client.force_login(self.user)
        response = self.client.get(f"/vanthu/vanbanden/{doc.pk}/")
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Chi tiết văn bản đến")

    def test_vanthu_outbound_detail_authenticated(self):
        doc = self._create_outbound_doc()
        self.client.force_login(self.user)
        response = self.client.get(f"/vanthu/vanbandi/{doc.pk}/")
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Văn bản đi")

    def test_lanhdao_approve_outbound_action(self):
        leader = self._create_role_user("LANH_DAO", "lanhdao-approve")
        submitted_status, _ = DocumentStatus.objects.get_or_create(status_name="SUBMITTED")
        doc = Document.objects.create(
            doc_direction=Document.Direction.DU_THAO,
            title="Test outbound approve",
            document_code="LD-APPROVE",
            status=submitted_status,
            created_by=self.user,
        )
        self.client.force_login(leader)
        response = self.client.post(
            reverse("ui_lanhdao:vanbandi_detail", args=[doc.document_id]),
            data={"action": "LD_APPROVE_OUTBOUND"},
        )
        self.assertEqual(response.status_code, 302)
        doc.refresh_from_db()
        self.assertEqual(doc.status.status_name, "APPROVED")

    def test_lanhdao_request_changes_from_clerk_action(self):
        leader = self._create_role_user("LANH_DAO", "lanhdao-clerk")
        pending_status, _ = DocumentStatus.objects.get_or_create(status_name="PENDING_CLERK_CHECK")
        doc = Document.objects.create(
            doc_direction=Document.Direction.DU_THAO,
            title="Test outbound clerk change",
            document_code="LD-CLERK",
            status=pending_status,
            created_by=self.user,
        )
        self.client.force_login(leader)
        response = self.client.post(
            reverse("ui_lanhdao:vanbandi_detail", args=[doc.document_id]),
            data={"action": "LD_REQUEST_CHANGES_FROM_CLERK", "note": "Sửa lỗi văn thư"},
        )
        self.assertEqual(response.status_code, 302)
        doc.refresh_from_db()
        self.assertEqual(doc.status.status_name, "RETURNED")

    def test_chuyenvien_submit_action_aliases(self):
        cv_user = get_user_model().objects.create_user(username="cv-user", password="secret")
        role, _ = Role.objects.get_or_create(name="CHUYEN_VIEN")
        UserRole.objects.get_or_create(user=cv_user, role=role)
        draft_status, _ = DocumentStatus.objects.get_or_create(status_name="DRAFT")
        doc = Document.objects.create(
            doc_direction=Document.Direction.DU_THAO,
            title="Draft outbound",
            document_code="DRAFT-01",
            status=draft_status,
            created_by=cv_user,
        )
        self.client.force_login(cv_user)
        response = self.client.post(
            reverse("ui_chuyenvien:vanbandi_detail", args=[doc.document_id]),
            data={"action": "CV_SUBMIT_DRAFT", "route": "vanbandi"},
        )
        self.assertEqual(response.status_code, 302)
        doc.refresh_from_db()
        self.assertEqual(doc.status.status_name, "SUBMITTED")

    def test_vanthu_case_detail_authenticated(self):
        case = self._create_case()
        self.client.force_login(self.user)
        response = self.client.get(f"/vanthu/hosocongviec/{case.pk}/")
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Chi tiết hồ sơ công việc")

    def _create_outbound_doc(self):
        status = DocumentStatus.objects.create(status_name="DANG_XU_LY")
        return Document.objects.create(
            doc_direction=Document.Direction.DI,
            title="Test outbound",
            issue_number="A123",
            issued_date=date.today(),
            status=status,
        )

    def _create_role_user(self, role_name, username):
        user = get_user_model().objects.create_user(username=username, password="passw0rd")
        role, _ = Role.objects.get_or_create(name=role_name)
        UserRole.objects.get_or_create(user=user, role=role)
        return user

    def _create_case(self):
        case_type = CaseType.objects.create(case_type_name="Thử nghiệm")
        case_status = CaseStatus.objects.create(case_status_name="Mới")
        return Case.objects.create(
            case_code="CASE-1",
            title="Trường hợp thử",
            created_by=self.user,
            case_type=case_type,
            status=case_status,
        )
