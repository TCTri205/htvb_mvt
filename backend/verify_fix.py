import os
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from accounts.models import User, Role, UserRole, Department
from django.db.models import Count, Q

print("=== VERIFICATION SCRIPT ===")

# 1. Check CV Role
cv_roles = Role.objects.filter(name__in=['CV', 'CHUYEN_VIEN'])
print(f"CV Roles found: {[r.name for r in cv_roles]}")
cv_role_ids = list(cv_roles.values_list('role_id', flat=True))

# 2. Check Dept 8
try:
    dept = Department.objects.get(department_id=8)
    print(f"\nChecking Department 8: {dept.name}")
    
    cvs = User.objects.filter(
        department_id=8,
        user_roles__role_id__in=cv_role_ids
    ).distinct()
    
    print(f"Number of CVs in Dept 8: {cvs.count()}")
    for cv in cvs:
        print(f" - {cv.full_name} ({cv.username})")
        
except Department.DoesNotExist:
    print("\n❌ Department 8 does not exist!")

# 3. Suggest Departments
print("\nSuggested Departments with CVs:")
departments = Department.objects.annotate(
    cv_count=Count('users', filter=Q(users__user_roles__role_id__in=cv_role_ids), distinct=True)
).filter(cv_count__gt=0).order_by('-cv_count')

for d in departments:
    print(f" - Dept {d.department_id}: {d.name} ({d.cv_count} CVs)")
