import os
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from accounts.models import User, Role, UserRole, Department
from django.db.models import Count, Q

print("=== VERIFY DEPT 1 ===")

# 1. Check CV Role
cv_roles = Role.objects.filter(name__in=['CV', 'CHUYEN_VIEN'])
cv_role_ids = list(cv_roles.values_list('role_id', flat=True))

# 2. Check Dept 1
try:
    dept = Department.objects.get(department_id=1)
    print(f"\nChecking Department 1: {dept.name}")
    
    cvs = User.objects.filter(
        department_id=1,
        user_roles__role_id__in=cv_role_ids
    ).distinct()
    
    print(f"Number of CVs in Dept 1: {cvs.count()}")
    for cv in cvs:
        print(f" - {cv.full_name} ({cv.username})")
        
except Department.DoesNotExist:
    print("\n❌ Department 1 does not exist!")
