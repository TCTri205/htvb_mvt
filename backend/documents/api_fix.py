# documents/api_fix.py
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.db import transaction

from accounts.models import User, Department
from documents.models import Document


@api_view(['POST', 'GET'])
@permission_classes([IsAuthenticated])
def fix_department_assignment(request):
    """
    Emergency endpoint to fix cv01 and document department assignments.
    Access: GET or POST to /api/v1/fix-department/
    """
    results = {
        'success': False,
        'message': '',
        'details': []
    }
    
    try:
        # Get Department 1
        dept1 = Department.objects.filter(pk=1).first()
        if not dept1:
            results['message'] = 'Department 1 not found!'
            return Response(results, status=404)
        
        results['details'].append(f"Target Department: {dept1.name} (ID: {dept1.department_id})")
        
        with transaction.atomic():
            # Fix user cv01
            try:
                user = User.objects.get(username='cv01')
                old_dept = user.department_id
                user.department = dept1
                user.save()
                results['details'].append(
                    f"Updated user 'cv01': Dept {old_dept} → {dept1.department_id}"
                )
            except User.DoesNotExist:
                results['message'] = "User 'cv01' not found!"
                return Response(results, status=404)
            
            # Fix all documents created by cv01
            docs = Document.objects.filter(created_by=user)
            count = docs.count()
            results['details'].append(f"Found {count} documents created by cv01")
            
            updated = 0
            for doc in docs:
                if doc.department_id != dept1.department_id:
                    old_dept_id = doc.department_id
                    doc.department = dept1
                    doc.save()
                    updated += 1
                    results['details'].append(
                        f"Doc {doc.document_id}: Dept {old_dept_id} → {dept1.department_id}"
                    )
            
            results['details'].append(f"Updated {updated} documents to Department {dept1.department_id}")
        
        results['success'] = True
        results['message'] = 'Department assignments fixed successfully! Please restart the Django server.'
        return Response(results)
        
    except Exception as e:
        results['message'] = f"Error: {str(e)}"
        return Response(results, status=500)
