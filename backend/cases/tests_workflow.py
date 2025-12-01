from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from django.contrib.auth import get_user_model
from cases.models import Case, CaseStatus, CaseParticipant
from catalog.models import CaseType
from accounts.models import Department

User = get_user_model()

class CaseWorkflowTests(APITestCase):
    def setUp(self):
        # Setup Users
        self.leader = User.objects.create_user(username='leader', password='password', role='LD')
        self.assignee = User.objects.create_user(username='assignee', password='password', role='CV')
        self.vanthu = User.objects.create_user(username='vanthu', password='password', role='VT')
        self.other = User.objects.create_user(username='other', password='password', role='CV')
        
        # Setup Department
        self.dept = Department.objects.create(name="IT Dept", code="IT")
        
        # Setup Case Types & Statuses
        self.type_cv = CaseType.objects.create(name="Cong viec", code="CONG_VIEC")
        self.stt_new = CaseStatus.objects.create(name="Moi tao", code="MOI_TAO")
        self.stt_pending = CaseStatus.objects.create(name="Cho phan cong", code="CHO_PHAN_CONG")
        self.stt_assigned = CaseStatus.objects.create(name="Da phan cong", code="DA_PHAN_CONG")
        self.stt_processing = CaseStatus.objects.create(name="Dang thuc hien", code="DANG_THUC_HIEN")
        self.stt_paused = CaseStatus.objects.create(name="Tam dung", code="TAM_DUNG")
        self.stt_waiting = CaseStatus.objects.create(name="Cho duyet dong", code="CHO_DUYET_DONG")
        self.stt_closed = CaseStatus.objects.create(name="Dong", code="DONG")
        
        # Create Case
        self.case = Case.objects.create(
            case_code="CASE-001",
            title="Test Case",
            case_type=self.type_cv,
            created_by=self.vanthu,
            owner=self.vanthu,
            leader=self.leader,
            department=self.dept,
            status=self.stt_new
        )
        
        # Add Assignee
        CaseParticipant.objects.create(
            case=self.case,
            user=self.assignee,
            role_on_case=CaseParticipant.RoleOnCase.ASSIGNEE
        )

    def test_submit_success(self):
        self.client.force_authenticate(user=self.vanthu)
        url = reverse('case-submit', args=[self.case.pk])
        response = self.client.post(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.case.refresh_from_db()
        self.assertEqual(self.case.status.code, "CHO_PHAN_CONG")

    def test_assign_success(self):
        self.case.status = self.stt_pending
        self.case.save()
        self.client.force_authenticate(user=self.leader)
        url = reverse('case-assign', args=[self.case.pk])
        response = self.client.post(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.case.refresh_from_db()
        self.assertEqual(self.case.status.code, "DA_PHAN_CONG")

    def test_start_success(self):
        self.case.status = self.stt_assigned
        self.case.save()
        # Assignee can start
        self.client.force_authenticate(user=self.assignee)
        url = reverse('case-start', args=[self.case.pk])
        response = self.client.post(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.case.refresh_from_db()
        self.assertEqual(self.case.status.code, "DANG_THUC_HIEN")

    def test_pause_resume_success(self):
        self.case.status = self.stt_processing
        self.case.save()
        
        # Pause (Leader)
        self.client.force_authenticate(user=self.leader)
        url_pause = reverse('case-pause', args=[self.case.pk])
        response = self.client.post(url_pause, {'reason': 'Busy'})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.case.refresh_from_db()
        self.assertEqual(self.case.status.code, "TAM_DUNG")
        
        # Resume (Leader)
        url_resume = reverse('case-resume', args=[self.case.pk])
        response = self.client.post(url_resume)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.case.refresh_from_db()
        self.assertEqual(self.case.status.code, "DANG_THUC_HIEN")

    def test_reject_close_success(self):
        self.case.status = self.stt_waiting
        self.case.save()
        
        self.client.force_authenticate(user=self.leader)
        url = reverse('case-reject-close', args=[self.case.pk])
        response = self.client.post(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.case.refresh_from_db()
        self.assertEqual(self.case.status.code, "DANG_THUC_HIEN")

    def test_edit_restriction_when_closed(self):
        self.case.status = self.stt_closed
        self.case.save()
        
        self.client.force_authenticate(user=self.leader)
        url = reverse('case-detail', args=[self.case.pk])
        data = {"title": "Should Fail"}
        response = self.client.patch(url, data)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Cannot edit case in status", str(response.data))

    def test_participant_edit_restriction_when_closed(self):
        self.case.status = self.stt_closed
        self.case.save()
        
        self.client.force_authenticate(user=self.leader)
        url = reverse('case-participants', args=[self.case.pk])
        data = [{"user_id": self.other.pk, "role": "assignee"}]
        response = self.client.put(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
