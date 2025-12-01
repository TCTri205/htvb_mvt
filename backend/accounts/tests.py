from django.contrib.auth import get_user_model

from rest_framework.test import APITestCase

from accounts.models import Department, Role, RbacPermission, RolePermission, UserRole


class ChangePasswordAPITest(APITestCase):
    def setUp(self):
        User = get_user_model()
        self.user = User.objects.create_user(username="taikhoan", password="OldPass123")

    def test_change_password_endpoint_updates_password(self):
        self.client.force_authenticate(self.user)
        payload = {
            "current_password": "OldPass123",
            "new_password": "NewPass123!",
            "new_password_confirm": "NewPass123!",
        }
        response = self.client.post("/api/v1/auth/change-password/", payload)
        self.assertEqual(response.status_code, 204)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("NewPass123!"))

    def test_change_password_requires_matching_confirmation(self):
        self.client.force_authenticate(self.user)
        payload = {
            "current_password": "OldPass123",
            "new_password": "NewPass123!",
            "new_password_confirm": "Mismatch123!",
        }
        response = self.client.post("/api/v1/auth/change-password/", payload)
        self.assertEqual(response.status_code, 400)
        self.assertIn("new_password_confirm", response.data.get("field_errors", response.data))


class AccountManagementAPITest(APITestCase):
    def setUp(self):
        User = get_user_model()
        self.department, _ = Department.objects.get_or_create(name="Quản trị")
        self.qt_role, _ = Role.objects.get_or_create(name="QT")
        self.cv_role, _ = Role.objects.get_or_create(name="CV")
        self.ld_role, _ = Role.objects.get_or_create(name="LD")
        self.vt_role, _ = Role.objects.get_or_create(name="VT")
        self.permission, _ = RbacPermission.objects.get_or_create(
            code="DOC.TEST", defaults={"name": "Test permission"}
        )
        self.user_qt = User.objects.create_user(
            username="qt_user", password="StrongPass123!", full_name="Quản trị viên"
        )
        self.user_cv = User.objects.create_user(
            username="cv_user", password="StrongPass123!", full_name="Chuyên viên"
        )
        self.user_vt = User.objects.create_user(
            username="vt_user", password="StrongPass123!", full_name="Văn thư"
        )
        UserRole.objects.create(user=self.user_qt, role=self.qt_role)
        UserRole.objects.create(user=self.user_cv, role=self.cv_role)
        UserRole.objects.create(user=self.user_vt, role=self.vt_role)

    def _auth_qt(self):
        self.client.force_authenticate(self.user_qt)

    def _auth_cv(self):
        self.client.force_authenticate(self.user_cv)

    def _auth_vt(self):
        self.client.force_authenticate(self.user_vt)

    def test_user_list_requires_qt_role(self):
        self._auth_cv()
        response = self.client.get("/api/v1/users/")
        self.assertEqual(response.status_code, 403)
        self._auth_qt()
        response = self.client.get("/api/v1/users/", {"q": "cv"})
        self.assertEqual(response.status_code, 200)
        self.assertTrue(
            any(user["username"] == self.user_cv.username for user in response.data.get("items", []))
        )

    def test_specialist_list_accessible_to_assigners(self):
        self._auth_vt()
        response = self.client.get("/api/v1/specialists/")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(
            any(str(entry.get("user_id")) == str(self.user_cv.user_id) for entry in response.data)
        )

    def test_specialist_list_forbidden_for_chuyenvien(self):
        self._auth_cv()
        response = self.client.get("/api/v1/specialists/")
        self.assertEqual(response.status_code, 403)

    def test_clerk_list_accessible_to_assigners(self):
        self._auth_vt()
        response = self.client.get("/api/v1/clerks/")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(
            any(str(entry.get("user_id")) == str(self.user_vt.user_id) for entry in response.data)
        )

    def test_clerk_list_forbidden_for_chuyenvien(self):
        self._auth_cv()
        response = self.client.get("/api/v1/clerks/")
        self.assertEqual(response.status_code, 403)

    def test_qt_can_create_lock_unlock_user(self):
        self._auth_qt()
        payload = {
            "username": "newuser",
            "full_name": "Người dùng mới",
            "email": "new@example.com",
            "phone": "0900000000",
            "password": "StrongPass123!",
            "department_id": self.department.department_id,
        }
        response = self.client.post("/api/v1/users/", payload, format="json")
        self.assertEqual(response.status_code, 201)
        user_id = response.data["user_id"]
        lock_response = self.client.post(f"/api/v1/users/{user_id}/lock/")
        self.assertEqual(lock_response.status_code, 204)
        target = get_user_model().objects.get(user_id=user_id)
        self.assertFalse(target.is_active)
        unlock_response = self.client.post(f"/api/v1/users/{user_id}/unlock/")
        self.assertEqual(unlock_response.status_code, 204)
        target.refresh_from_db()
        self.assertTrue(target.is_active)

    def test_qt_can_assign_roles(self):
        self._auth_qt()
        payload = {"role_ids": [self.ld_role.role_id]}
        response = self.client.put(
            f"/api/v1/users/{self.user_cv.user_id}/roles/", payload, format="json"
        )
        self.assertEqual(response.status_code, 204)
        response = self.client.get(f"/api/v1/users/{self.user_cv.user_id}/roles/")
        self.assertEqual(response.status_code, 200)
        names = [role["name"] for role in response.data]
        self.assertEqual(names, ["LD"])

    def test_qt_can_manage_role_permissions(self):
        self._auth_qt()
        payload = {"permission_ids": [self.permission.permission_id]}
        response = self.client.put(
            f"/api/v1/roles/{self.qt_role.role_id}/permissions/", payload, format="json"
        )
        self.assertEqual(response.status_code, 204)
        self.assertTrue(
            RolePermission.objects.filter(role=self.qt_role, permission=self.permission).exists()
        )
        response = self.client.get("/api/v1/roles/")
        self.assertEqual(response.status_code, 200)
        found = False
        for entry in response.data.get("items", []):
            if entry.get("role_id") == self.qt_role.role_id:
                found = any(
                    perm.get("code") == self.permission.code for perm in entry.get("permissions", [])
                )
                break
        self.assertTrue(found)

    def test_permissions_list_requires_qt(self):
        self._auth_cv()
        response = self.client.get("/api/v1/permissions/")
        self.assertEqual(response.status_code, 403)
        self._auth_qt()
        response = self.client.get("/api/v1/permissions/")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(
            any(
                perm["permission_id"] == self.permission.permission_id
                for perm in response.data.get("items", [])
            )
        )

    def test_departments_access(self):
        self._auth_cv()
        list_response = self.client.get("/api/v1/departments/")
        self.assertEqual(list_response.status_code, 200)
        create_response = self.client.post(
            "/api/v1/departments/", {"name": "Phòng mới"}, format="json"
        )
        self.assertEqual(create_response.status_code, 403)
        self._auth_qt()
        create_response = self.client.post(
            "/api/v1/departments/",
            {"name": "Phòng mới", "department_code": "PM"},
            format="json",
        )
        self.assertEqual(create_response.status_code, 201)
