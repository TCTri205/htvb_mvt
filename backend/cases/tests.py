from datetime import date

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import Department, Role, UserRole
from catalog.models import CaseType
from workflow.services.rbac import Role as WorkflowRole


class CaseCreationAPITest(APITestCase):
    def setUp(self):
        User = get_user_model()
        self.department = Department.objects.create(name="Phòng Thử nghiệm")
        self.case_type = CaseType.objects.create(case_type_code="TEST", case_type_name="Thử nghiệm")
        self.ld_role, _ = Role.objects.get_or_create(name=WorkflowRole.LD.value)
        self.cv_role, _ = Role.objects.get_or_create(name=WorkflowRole.CV.value)

        self.leader = User.objects.create_user(username="ld_user", password="Password123!", full_name="Lãnh đạo")
        self.assignee = User.objects.create_user(username="cv_user", password="Password123!", full_name="Chuyên viên")
        UserRole.objects.create(user=self.leader, role=self.ld_role)
        UserRole.objects.create(user=self.assignee, role=self.cv_role)

        self.client.force_authenticate(self.leader)

    def test_leader_can_create_case_with_tasks(self):
        payload = {
            "title": "Case API test",
            "case_type": self.case_type.case_type_name,
            "department_id": self.department.department_id,
            "due_date": date.today().isoformat(),
            "participants": [
                {"user_id": str(self.assignee.user_id), "role_on_case": "assignee"}
            ],
            "tasks": [
                {
                    "title": "Xử lý ghi chú",
                    "assignee_id": str(self.assignee.user_id),
                    "status": "OPEN",
                    "due_date": date.today().isoformat(),
                }
            ],
        }

        response = self.client.post("/api/v1/cases/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data.get("title"), payload["title"])
