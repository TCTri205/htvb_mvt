import uuid
from datetime import date

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test.utils import override_settings

from accounts.models import Department
from catalog.models import CaseType, CaseStatus
from cases.models import (
    Case,
    CaseParticipant,
    CaseTask,
    CaseAttachment,
    CaseDocument,
    Comment,
)
from documents.models import Document


def _case_factory(make_user, code_prefix="HS") -> Case:
    dept, _ = Department.objects.get_or_create(name="Phòng Hành chính", defaults={"department_code": "PHC"})
    case_type, _ = CaseType.objects.get_or_create(case_type_name="Loại chuẩn")
    case_status, _ = CaseStatus.objects.get_or_create(case_status_name="DA_PHAN_CONG")
    creator, _ = make_user(username=f"creator-{uuid.uuid4().hex[:6]}", full_name="Người tạo")
    return Case.objects.create(
        case_code=f"{code_prefix}-{uuid.uuid4().hex[:6]}",
        title="Hồ sơ thử nghiệm",
        case_type=case_type,
        created_by=creator,
        department=dept,
        status=case_status,
    )


@pytest.mark.django_db
@override_settings(ROOT_URLCONF="config.urls", TESTING=True)
def test_leader_can_replace_participants(client_with_user, make_user):
    case = _case_factory(make_user, code_prefix="HS-PART")
    participant_a, _ = make_user(username="cv-A", role="CHUYEN_VIEN", full_name="CV A")
    participant_b, _ = make_user(username="cv-B", role="CHUYEN_VIEN", full_name="CV B")
    client = client_with_user(username="ld-case", role="LANH_DAO", full_name="Lãnh đạo")

    payload = {
        "participants": [
            {"user_id": str(participant_a.user_id), "role_on_case": "owner"},
            {"user_id": str(participant_b.user_id), "role_on_case": "watcher"},
        ]
    }
    resp = client.put(
        f"/api/v1/cases/{case.case_id}/participants/",
        data=payload,
        format="json",
    )

    assert resp.status_code == 200
    assert CaseParticipant.objects.filter(case=case).count() == 2


@pytest.mark.django_db
@override_settings(ROOT_URLCONF="config.urls", TESTING=True)
def test_leader_creates_tasks_and_patch_status(client_with_user, make_user):
    case = _case_factory(make_user, code_prefix="HS-TASK")
    assignee, _ = make_user(username="cv-task", role="CHUYEN_VIEN", full_name="CV Task")
    client = client_with_user(username="ld-task", role="LANH_DAO", full_name="LD Task")

    create_resp = client.post(
        f"/api/v1/cases/{case.case_id}/tasks/",
        data={"title": "Soạn dự thảo", "assignee_id": str(assignee.user_id)},
        format="json",
    )
    assert create_resp.status_code == 201
    task_id = create_resp.json()["task_id"]

    patch_resp = client.patch(
        f"/api/v1/case-tasks/{task_id}/",
        data={"status": "DONE"},
        format="json",
    )
    assert patch_resp.status_code == 200
    assert CaseTask.objects.get(task_id=task_id).status == "DONE"


@pytest.mark.django_db
@override_settings(ROOT_URLCONF="config.urls", TESTING=True)
def test_upload_case_attachment(client_with_user, make_user, media_tmp_path):
    case = _case_factory(make_user, code_prefix="HS-ATT")
    client = client_with_user(username="ld-att", role="LANH_DAO", full_name="LD Attachment")

    upload = SimpleUploadedFile("note.txt", b"Nhiem vu dinh kem", content_type="text/plain")
    resp = client.post(
        f"/api/v1/cases/{case.case_id}/attachments/",
        data={"file": upload, "attachment_type": "tep_kem_theo"},
        format="multipart",
    )
    assert resp.status_code == 201
    assert CaseAttachment.objects.filter(case=case).count() == 1


@pytest.mark.django_db
@override_settings(ROOT_URLCONF="config.urls", TESTING=True)
def test_link_documents_to_case(client_with_user, make_user):
    case = _case_factory(make_user, code_prefix="HS-DOC")
    doc = Document.objects.create(
        doc_direction="den",
        title="Đơn kiến nghị",
        received_number=21,
        received_date=date(2025, 3, 1),
        sender="UBND TP",
    )
    client = client_with_user(username="cv-link", role="CHUYEN_VIEN", full_name="CV Link")

    resp = client.put(
        f"/api/v1/cases/{case.case_id}/documents/",
        data={"document_ids": [doc.document_id]},
        format="json",
    )
    assert resp.status_code == 200
    assert CaseDocument.objects.filter(case=case, document=doc).exists()


@pytest.mark.django_db
@override_settings(ROOT_URLCONF="config.urls", TESTING=True)
def test_comment_crud_flow(client_with_user, make_user):
    case = _case_factory(make_user, code_prefix="HS-CMT")
    client = client_with_user(username="cv-comment", role="CHUYEN_VIEN", full_name="CV Comment")

    create_resp = client.post(
        "/api/v1/comments/",
        data={"entity_type": "case", "entity_id": case.case_id, "content": "Đã tiếp nhận"},
        format="json",
    )
    assert create_resp.status_code == 201
    comment_id = create_resp.json()["comment_id"]

    list_resp = client.get(f"/api/v1/comments/?entity_type=case&entity_id={case.case_id}")
    assert list_resp.status_code == 200
    assert len(list_resp.json()) == 1

    delete_resp = client.delete(f"/api/v1/comments/{comment_id}/")
    assert delete_resp.status_code == 204
    assert not Comment.objects.filter(comment_id=comment_id).exists()
