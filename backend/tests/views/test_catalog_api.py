import pytest

from django.test.utils import override_settings

from catalog.models import DocumentStatus, Field


@pytest.mark.django_db
@override_settings(ROOT_URLCONF="config.urls", TESTING=True)
def test_catalog_list_is_accessible_to_authenticated_user(client_with_user):
    DocumentStatus.objects.create(status_name="CATALOG-STATUS-A")
    DocumentStatus.objects.create(status_name="CATALOG-STATUS-B")

    client = client_with_user(username="cv-reader", role="CHUYEN_VIEN")
    resp = client.get("/api/v1/catalog/document-statuses/")

    assert resp.status_code == 200
    names = {item["name"] for item in resp.json()}
    assert "CATALOG-STATUS-A" in names
    assert "CATALOG-STATUS-B" in names


@pytest.mark.django_db
@override_settings(ROOT_URLCONF="config.urls", TESTING=True)
def test_unknown_catalog_slug_returns_404(client_with_user):
    client = client_with_user(username="vt-reader", role="VAN_THU")
    resp = client.get("/api/v1/catalog/unknown-category/")

    assert resp.status_code == 404


@pytest.mark.django_db
@override_settings(ROOT_URLCONF="config.urls", TESTING=True)
def test_vanthu_user_can_create_catalog_item(client_with_user):
    client = client_with_user(username="vt-creator", role="VAN_THU")
    resp = client.post(
        "/api/v1/catalog/fields/",
        data={"name": "Trường hợp thử"},
        format="json",
    )

    assert resp.status_code == 201
    assert Field.objects.filter(field_name="Trường hợp thử").exists()


@pytest.mark.django_db
@override_settings(ROOT_URLCONF="config.urls", TESTING=True)
def test_chuyenvien_user_cannot_create_catalog_item(client_with_user):
    client = client_with_user(username="cv-creator", role="CHUYEN_VIEN")
    resp = client.post(
        "/api/v1/catalog/fields/",
        data={"name": "Muốn tạo"},
        format="json",
    )

    assert resp.status_code == 403


@pytest.mark.django_db
@override_settings(ROOT_URLCONF="config.urls", TESTING=True)
def test_duplicate_catalog_items_return_validation_error(client_with_user):
    Field.objects.create(field_name="Khác biệt")
    client = client_with_user(username="vt-dup", role="VAN_THU")

    resp = client.post(
        "/api/v1/catalog/fields/",
        data={"name": "Khác biệt"},
        format="json",
    )

    assert resp.status_code == 400
    payload = resp.json()
    assert "field_errors" in payload
    assert "name" in payload["field_errors"]


@pytest.mark.django_db
@override_settings(ROOT_URLCONF="config.urls", TESTING=True)
def test_vanthu_user_can_patch_catalog_item(client_with_user):
    entry = Field.objects.create(field_name="Cũ")
    client = client_with_user(username="vt-patch", role="VAN_THU")

    resp = client.patch(
        f"/api/v1/catalog/fields/{entry.pk}/",
        data={"name": "Mới"},
        format="json",
    )

    assert resp.status_code == 200
    entry.refresh_from_db()
    assert entry.field_name == "Mới"


@pytest.mark.django_db
@override_settings(ROOT_URLCONF="config.urls", TESTING=True)
def test_chuyenvien_user_cannot_patch_catalog_item(client_with_user):
    entry = Field.objects.create(field_name="Tạm thời")
    client = client_with_user(username="cv-patch", role="CHUYEN_VIEN")

    resp = client.patch(
        f"/api/v1/catalog/fields/{entry.pk}/",
        data={"name": "Gắn lại"},
        format="json",
    )

    assert resp.status_code == 403
    entry.refresh_from_db()
    assert entry.field_name == "Tạm thời"


@pytest.mark.django_db
@override_settings(ROOT_URLCONF="config.urls", TESTING=True)
def test_quantri_user_can_delete_catalog_item(client_with_user):
    entry = Field.objects.create(field_name="Xoá được")
    client = client_with_user(username="qt-delete", role="QUAN_TRI")

    resp = client.delete(f"/api/v1/catalog/fields/{entry.pk}/")

    assert resp.status_code == 204
    assert not Field.objects.filter(pk=entry.pk).exists()


@pytest.mark.django_db
@override_settings(ROOT_URLCONF="config.urls", TESTING=True)
def test_vanthu_user_cannot_delete_catalog_item(client_with_user):
    entry = Field.objects.create(field_name="Không được xoá")
    client = client_with_user(username="vt-nodelete", role="VAN_THU")

    resp = client.delete(f"/api/v1/catalog/fields/{entry.pk}/")

    assert resp.status_code == 403
    assert Field.objects.filter(pk=entry.pk).exists()
