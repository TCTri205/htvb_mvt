# Quick Reference: Kiểm tra Specialists và Departments

## Cách 1: Django Management Command (Khuyên dùng)

```bash
# Kiểm tra tổng quan
python manage.py check_specialists

# Kiểm tra department cụ thể (ví dụ department 8)
python manage.py check_specialists --department-id=8
```

## Cách 2: SQL Script

Chạy file `check_users_departments.sql` trong PostgreSQL:

```bash
psql -U postgres -d htvb_db -f backend/check_users_departments.sql
```

Hoặc copy từng query trong file SQL và chạy trong psql hoặc pgAdmin.

## Cách 3: Django Shell

```bash
python manage.py shell
```

Sau đó trong shell:

```python
from accounts.models import User, Role, UserRole, Department

# Tìm role CV
cv_role = Role.objects.filter(name__in=['CV', 'CHUYEN_VIEN']).first()
print(f"CV Role: {cv_role.name} (ID: {cv_role.role_id})")

# Đếm tổng số CVs
cv_count = UserRole.objects.filter(role=cv_role).values('user').distinct().count()
print(f"Total CVs: {cv_count}")

# CVs trong department 8
dept_8_cvs = User.objects.filter(
    department_id=8,
    user_roles__role=cv_role
).distinct()
print(f"CVs in Dept 8: {dept_8_cvs.count()}")
for cv in dept_8_cvs:
    print(f"  - {cv.full_name} ({cv.username})")

# Departments có CVs
from django.db.models import Count, Q
depts_with_cvs = Department.objects.annotate(
    cv_count=Count('user', filter=Q(user__user_roles__role=cv_role), distinct=True)
).filter(cv_count__gt=0).order_by('-cv_count')

print("\nDepartments with CVs:")
for dept in depts_with_cvs:
    print(f"  Dept {dept.department_id}: {dept.name} - {dept.cv_count} CVs")
```

## Giải pháp nếu Department 8 không có CVs

**Option 1**: Thêm CV vào department 8
```python
from accounts.models import User
# Giả sử user_id=123 là CV
user = User.objects.get(user_id=123)
user.department_id = 8
user.save()
```

**Option 2**: Chuyển document sang department có CVs
```python
from documents.models import Document
doc = Document.objects.get(document_id=60)
doc.main_department_id = <department_id_có_CVs>
doc.save()
```

**Option 3**: Test với department khác có CVs
- Chọn department từ danh sách departments có CVs
- Tạo document mới trong department đó
