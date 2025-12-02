from accounts.models import User, Role, UserRole
from departments.models import Department
from django.db.models import Count, Q

print("=== Checking Specialists Distribution ===")

# 1. Users by Role
print("\n1. Users by Role:")
roles = Role.objects.all()
for role in roles:
    count = UserRole.objects.filter(role=role).values('user').distinct().count()
    print(f"   {role.name}: {count} users")

# 2. Find CV role
cv_roles = Role.objects.filter(name__in=['CV', 'CHUYEN_VIEN'])
if not cv_roles.exists():
    print('\n❌ No CV role found in database!')
else:
    cv_role_ids = list(cv_roles.values_list('role_id', flat=True))
    print(f'\n   CV Role IDs: {cv_role_ids}')

    # 3. CVs by department
    print('\n2. CVs by Department:')
    departments = Department.objects.annotate(
        cv_count=Count(
            'user',
            filter=Q(user__user_roles__role_id__in=cv_role_ids),
            distinct=True
        )
    ).order_by('-cv_count', 'name')

    for dept in departments:
        if dept.cv_count > 0:
            print(f"   Dept {dept.department_id} ({dept.name}): {dept.cv_count} CVs")

    # 4. All CVs in system
    print('\n3. All CVs in system:')
    all_cvs = User.objects.filter(
        user_roles__role_id__in=cv_role_ids
    ).select_related('department').distinct().order_by('department__name', 'full_name')

    current_dept = None
    for cv in all_cvs:
        if cv.department != current_dept:
            current_dept = cv.department
            dept_name = cv.department.name if cv.department else 'No Department'
            dept_id = cv.department.department_id if cv.department else 'N/A'
            print(f'\n   📁 {dept_name} (ID: {dept_id}):')
        
        print(f"      - {cv.full_name} ({cv.username})")
