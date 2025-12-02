"""
Django management command to check users and departments distribution.
Usage: python manage.py check_specialists
"""
from django.core.management.base import BaseCommand
from django.db.models import Count, Q
from accounts.models import User, Role, UserRole, Department


class Command(BaseCommand):
    help = 'Check specialists (CV) distribution across departments'

    def add_arguments(self, parser):
        parser.add_argument(
            '--department-id',
            type=int,
            help='Check specific department ID',
        )

    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS('=== Checking Specialists Distribution ===\n'))
        
        # 1. Total users by role
        self.stdout.write(self.style.WARNING('1. Users by Role:'))
        roles = Role.objects.all()
        for role in roles:
            count = UserRole.objects.filter(role=role).values('user').distinct().count()
            self.stdout.write(f'   {role.name}: {count} users')
        
        # 2. Find CV role
        cv_roles = Role.objects.filter(name__in=['CV', 'CHUYEN_VIEN'])
        if not cv_roles.exists():
            self.stdout.write(self.style.ERROR('\n❌ No CV role found in database!'))
            return
        
        cv_role_ids = list(cv_roles.values_list('role_id', flat=True))
        self.stdout.write(f'\n   CV Role IDs: {cv_role_ids}')
        
        # 3. CVs by department
        self.stdout.write(self.style.WARNING('\n2. CVs by Department:'))
        departments = Department.objects.annotate(
            cv_count=Count(
                'users',
                filter=Q(users__user_roles__role_id__in=cv_role_ids),
                distinct=True
            )
        ).order_by('-cv_count', 'name')
        
        for dept in departments:
            if dept.cv_count > 0:
                self.stdout.write(f'   Dept {dept.department_id} ({dept.name}): {dept.cv_count} CVs')
        
        # 4. Check specific department if requested
        dept_id = options.get('department_id')
        if dept_id:
            self.stdout.write(self.style.WARNING(f'\n3. CVs in Department {dept_id}:'))
            try:
                dept = Department.objects.get(department_id=dept_id)
                self.stdout.write(f'   Department: {dept.name}')
                
                cvs = User.objects.filter(
                    department_id=dept_id,
                    user_roles__role_id__in=cv_role_ids
                ).distinct()
                
                if cvs.exists():
                    for cv in cvs:
                        self.stdout.write(f'   - {cv.full_name} ({cv.username}) - ID: {cv.user_id}')
                else:
                    self.stdout.write(self.style.ERROR(f'   ❌ No CVs found in this department!'))
                    
                    # Suggest departments with CVs
                    self.stdout.write(self.style.WARNING('\n   Suggested departments with CVs:'))
                    suggested = departments.filter(cv_count__gt=0)[:5]
                    for sugg in suggested:
                        self.stdout.write(f'   - Dept {sugg.department_id}: {sugg.name} ({sugg.cv_count} CVs)')
                    
            except Department.DoesNotExist:
                self.stdout.write(self.style.ERROR(f'   ❌ Department {dept_id} not found!'))
        
        # 5. All CVs with their departments
        self.stdout.write(self.style.WARNING('\n4. All CVs in system:'))
        all_cvs = User.objects.filter(
            user_roles__role_id__in=cv_role_ids
        ).select_related('department').distinct().order_by('department__name', 'full_name')
        
        current_dept = None
        for cv in all_cvs:
            if cv.department != current_dept:
                current_dept = cv.department
                dept_name = cv.department.name if cv.department else 'No Department'
                dept_id = cv.department.department_id if cv.department else 'N/A'
                self.stdout.write(f'\n   📁 {dept_name} (ID: {dept_id}):')
            
            self.stdout.write(f'      - {cv.full_name} ({cv.username})')
        
        self.stdout.write(self.style.SUCCESS('\n=== Check Complete ==='))
