# documents/api_debug.py
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from accounts.models import User, Department, Role
from workflow.services.rbac import Role as WorkflowRole


@api_view(['GET'])
@permission_classes([AllowAny])  # Allow unauthenticated access for debugging
def debug_specialists(request):
    """
    Debug endpoint to check specialists in departments.
    Access: GET /api/v1/debug-specialists/?dept=1
    """
    results = {
        'department': None,
        'total_users': 0,
        'users': [],
        'cv_roles': [],
        'specialists': [],
    }
    
    dept_id = request.GET.get('dept', '1')
    try:
        dept_id = int(dept_id)
    except ValueError:
        dept_id = 1
    
    # Check Department
    dept = Department.objects.filter(pk=dept_id).first()
    if not dept:
        return Response({'error': f'Department {dept_id} not found'}, status=404)
    
    results['department'] = {
        'id': dept.department_id,
        'name': dept.name,
        'code': dept.department_code
    }
    
    # Check all users in this department
    users_in_dept = User.objects.filter(department_id=dept_id).prefetch_related('user_roles__role')
    results['total_users'] = users_in_dept.count()
    results['users'] = [
        {
            'username': u.username,
            'full_name': u.full_name,
            'roles': [ur.role.name for ur in u.user_roles.all()]
        }
        for u in users_in_dept
    ]
    
    # Check CV role definitions
    alias_names = [WorkflowRole.CV.value, "CHUYEN_VIEN"]
    cv_roles = Role.objects.filter(name__in=alias_names)
    results['cv_roles'] = [
        {'id': r.role_id, 'name': r.name}
        for r in cv_roles
    ]
    
    # Check specialists (same query as SpecialistViewSet)
    specialists = (
        User.objects
        .select_related('department')
        .filter(user_roles__role__name__in=alias_names, department_id=dept_id)
        .distinct()
    )
    results['specialists'] = [
        {
            'user_id': str(s.user_id),
            'username': s.username,
            'full_name': s.full_name,
            'department_id': s.department_id,
            'department_name': s.department.name if s.department else None
        }
        for s in specialists
    ]
    
    return Response(results)
