import pytest
from datetime import date, timedelta
from django.contrib.auth import get_user_model
from django.test.utils import override_settings
from django.utils import timezone

from documents.models import (
    Document,
    DocumentAttachment,
    DocumentWorkflowLog,
    DispatchOutbox,
    Organization,
)


@pytest.mark.django_db
@override_settings(ROOT_URLCONF="config.urls", TESTING=True)
def test_documents_list_filters_by_direction(client_with_user):
    client = client_with_user(username="vt-list", role="VAN_THU", full_name="Văn Thư")
    Document.objects.create(
        doc_direction="den",
        title="Văn bản đến một",
        received_number=10,
        received_date=date(2025, 1, 1),
        sender="Sở Nội vụ",
    )
    Document.objects.create(
        doc_direction="di",
        title="Văn bản đi",
        issue_number="123/UBND",
        issued_date=date(2025, 1, 2),
    )

    resp = client.get("/api/v1/documents/", {"doc_direction": "den"})
    assert resp.status_code == 200
    payload = resp.json()
    assert payload["count"] == 1
    assert payload["results"][0]["doc_direction"] == "den"


@pytest.mark.django_db
@override_settings(ROOT_URLCONF="config.urls", TESTING=True)
def test_document_detail_exposes_attachment_and_log_summary(client_with_user):
    username = "vt-detail"
    client = client_with_user(username=username, role="VAN_THU", full_name="Văn Thư")
    user = get_user_model().objects.get(username=username)
    doc = Document.objects.create(
        doc_direction="den",
        title="Chúc năng detail",
        received_number=12,
        received_date=date(2025, 1, 3),
        sender="Sở Tài chính",
    )
    DocumentAttachment.objects.create(
        document=doc,
        attachment_type="phan_bo",
        file_name="file-a.pdf",
        storage_path="tmp/file-a.pdf",
        uploaded_by=user,
    )
    DocumentAttachment.objects.create(
        document=doc,
        attachment_type="phan_bo",
        file_name="file-b.pdf",
        storage_path="tmp/file-b.pdf",
        uploaded_by=user,
    )
    now = timezone.now()
    DocumentWorkflowLog.objects.create(
        document=doc,
        action=DocumentWorkflowLog.Action.RECEIVED,
        acted_by=user,
        acted_at=now - timedelta(minutes=10),
    )
    DocumentWorkflowLog.objects.create(
        document=doc,
        action=DocumentWorkflowLog.Action.ASSIGNED,
        acted_by=user,
        acted_at=now,
    )

    resp = client.get(f"/api/v1/documents/{doc.document_id}/")
    assert resp.status_code == 200
    data = resp.json()
    assert data["attachment_count"] == 2
    assert data["workflow_log_count"] == 2
    assert data["last_workflow_log"]["action"] == DocumentWorkflowLog.Action.ASSIGNED
    assert data["last_workflow_log"]["actor"]["id"] == user.id


@pytest.mark.django_db
@override_settings(ROOT_URLCONF="config.urls", TESTING=True)
def test_document_workflow_logs_endpoint(client_with_user):
    username = "vt-logs"
    client = client_with_user(username=username, role="VAN_THU", full_name="Văn Thư")
    user = get_user_model().objects.get(username=username)
    doc = Document.objects.create(
        doc_direction="den",
        title="Lịch sử quy trình",
        received_number=15,
        received_date=date(2025, 1, 4),
        sender="Sở Y tế",
    )
    now = timezone.now()
    DocumentWorkflowLog.objects.create(
        document=doc,
        action=DocumentWorkflowLog.Action.SUBMITTED,
        acted_by=user,
        acted_at=now - timedelta(minutes=5),
    )
    DocumentWorkflowLog.objects.create(
        document=doc,
        action=DocumentWorkflowLog.Action.APPROVED,
        acted_by=user,
        acted_at=now,
    )

    resp = client.get(f"/api/v1/documents/{doc.document_id}/workflow-logs/")
    assert resp.status_code == 200
    logs = resp.json()
    assert logs[0]["action"] == DocumentWorkflowLog.Action.APPROVED
    assert logs[1]["action"] == DocumentWorkflowLog.Action.SUBMITTED


@pytest.mark.django_db
@override_settings(ROOT_URLCONF="config.urls", TESTING=True)
def test_document_dispatches_endpoint(client_with_user):
    client = client_with_user(username="vt-dispatch", role="VAN_THU", full_name="VT Dispatch")
    doc = Document.objects.create(
        doc_direction="di",
        title="Công văn phát hành",
        issue_number="123/UBND",
        issued_date=date(2025, 2, 1),
    )
    org = Organization.objects.create(name="Sở Y tế")

    payload = {
        "organization_id": org.organization_id,
        "method": DispatchOutbox.Method.POST,
        "note": "Gửi phát hành nhanh",
    }

    resp = client.post(
        f"/api/v1/documents/{doc.document_id}/dispatches/",
        data=payload,
        format="json",
    )
    assert resp.status_code == 201
    assert DispatchOutbox.objects.filter(document=doc, organization=org).count() == 1

    resp = client.get(f"/api/v1/documents/{doc.document_id}/dispatches/")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)


@pytest.mark.django_db
@override_settings(ROOT_URLCONF="config.urls", TESTING=True)
def test_organization_list_contacts_restricted_to_vt_and_qt(client_with_user):
    vt_client = client_with_user(username="vt-org", role="VAN_THU", full_name="VT Org")
    qt_client = client_with_user(username="qt-org", role="QUAN_TRI", full_name="QT Org")
    cv_client = client_with_user(username="cv-org", role="CHUYEN_VIEN", full_name="CV Org")

    org = Organization.objects.create(name="Sở Giáo dục")

    resp = vt_client.get("/api/v1/organizations/")
    assert resp.status_code == 200

    resp = qt_client.get("/api/v1/organizations/")
    assert resp.status_code == 200

    resp = cv_client.get("/api/v1/organizations/")
    assert resp.status_code == 403

    # Contacts
    resp = vt_client.get(f"/api/v1/organizations/{org.organization_id}/contacts/")
    assert resp.status_code == 200

    resp = cv_client.get(f"/api/v1/organizations/{org.organization_id}/contacts/")
    assert resp.status_code == 403
