from django.core.management.base import BaseCommand
from accounts.models import User, Department, Role
from workflow.services.rbac import Role as WorkflowRole


class Command(BaseCommand):
    help = 'Check specialists in Department 1'

    def handle(self, *args, **options):
        self.stdout.write("=" * 60)
        self.stdout.write("CHECKING SPECIALISTS IN DEPARTMENT 1")
        self.stdout.write("=" * 60)
        
        # Check Department 1
        dept1 = Department.objects.filter(pk=1).first()
        if not dept1:
            self.stdout.write(self.style.ERROR("\n❌ Department 1 not found!"))
            return
        
        self.stdout.write(f"\n✓ Department: {dept1.name} (ID: {dept1.department_id})")
        
        # Check all users in Department 1
        users_in_dept = User.objects.filter(department_id=1).select_related('department').prefetch_related('user_roles__role')
        self.stdout.write(f"\n✓ Total users in Department 1: {users_in_dept.count()}")
        
        for user in users_in_dept:
            roles = [ur.role.name for ur in user.user_roles.all()]
            self.stdout.write(f"  - {user.username} ({user.full_name}): Roles = {roles}")
        
        # Check CV role
        alias_names = [WorkflowRole.CV.value, "CHUYEN_VIEN"]
        self.stdout.write(f"\n✓ Looking for roles: {alias_names}")
        
        cv_roles = Role.objects.filter(name__in=alias_names)
        self.stdout.write(f"  Found {cv_roles.count()} CV roles:")
        for role in cv_roles:
            self.stdout.write(f"    - {role.name} (ID: {role.role_id})")
        
        # Check specialists in Department 1
        specialists = (
            User.objects
            .filter(user_roles__role__name__in=alias_names, department_id=1)
            .distinct()
        )
        
        self.stdout.write(f"\n✓ Specialists in Department 1: {specialists.count()}")
        for spec in specialists:
            self.stdout.write(f"  - {spec.username} ({spec.full_name})")
        
        self.stdout.write("\n" + "=" * 60)
