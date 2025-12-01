from django.test import TestCase
from django.apps import apps
from django.contrib.auth import get_user_model
from django.utils import timezone

from workflow.services.visibility import visible_documents_q

User = get_user_model()

class TestVisibility(TestCase):
    @classmethod
    def setUpTestData(cls):
        Department = apps.get_model('accounts', 'Department')
        cls.dep_a = Department.objects.create(name="Phòng A")
        cls.dep_b = Department.objects.create(name="Phòng B")

        # Tạo user A/B
        try:
            cls.user_a = User.objects.create_user(username="a", password="x")
        except TypeError:
            cls.user_a = User.objects.create(username="a")
            cls.user_a.set_password("x")
            cls.user_a.save()

        try:
            cls.user_b = User.objects.create_user(username="b", password="x")
        except TypeError:
            cls.user_b = User.objects.create(username="b")
            cls.user_b.set_password("x")
            cls.user_b.save()

        # Gán phòng ban qua update() để tránh Pylance bắt bẻ AbstractUser
        User.objects.filter(pk=cls.user_a.pk).update(department=cls.dep_a)
        User.objects.filter(pk=cls.user_b.pk).update(department=cls.dep_b)
        cls.user_a.refresh_from_db()
        cls.user_b.refresh_from_db()

        # Tạo VB đến thuộc phòng A — đáp ứng CHECK (received_*)
        Document = apps.get_model('documents', 'Document')
        cls.doc_dept_a = Document.objects.create(
            title="VB của phòng A",
            doc_direction="den",
            department=cls.dep_a,
            created_by=cls.user_a,
            received_number=1,
            received_date=timezone.now().date(),
            sender="Sở Nội vụ",
            # status_id có thể NULL theo schema của bạn; nếu NOT NULL thì seed & gán:
            # status_id=SR.doc_status_id("TIEP_NHAN"),
        )

        # Bật setting (nếu có model SystemSetting) — mở rộng tìm cả 'systemapps'
        SystemSetting = None
        for app_label in ("system", "settings", "core", "catalog", "systemapps"):
            try:
                SystemSetting = apps.get_model(app_label, "SystemSetting")
                break
            except LookupError:
                continue
        if SystemSetting:
            SystemSetting.objects.update_or_create(
                setting_key='doc.visibility.department_level',
                defaults={'setting_value': 'true'}
            )

    def test_department_visibility_flag(self):
        # user_b khác phòng, không assignee → không thấy
        qs_for_b = visible_documents_q(self.user_b, dept_visibility=True)  # ép bật flag ở test
        self.assertFalse(qs_for_b.filter(pk=self.doc_dept_a.pk).exists())

        # Chuyển user_b sang phòng A ⇒ phải thấy nhờ department visibility
        User.objects.filter(pk=self.user_b.pk).update(department=self.dep_a)
        self.user_b.refresh_from_db()

        qs_for_b = visible_documents_q(self.user_b, dept_visibility=True)  # ép bật flag ở test
        self.assertTrue(qs_for_b.filter(pk=self.doc_dept_a.pk).exists())
