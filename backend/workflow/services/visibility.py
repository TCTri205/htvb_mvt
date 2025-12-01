# workflow/services/visibility.py
from typing import Optional
from django.db.models import Q
from django.apps import apps
from .settings_reader import get_setting_bool

def visible_documents_q(user, dept_visibility: Optional[bool] = None):
    """
    CV chỉ thấy:
      - created_by = user
      - hoặc được phân công trong document_assignments
      - (nếu bật) cùng department_id
    """
    Document = apps.get_model('documents', 'Document')
    Assign = apps.get_model('documents', 'DocumentAssignment')

    my_doc_ids = Assign.objects.filter(user_id=user.user_id).values_list('document_id', flat=True)
    cond = Q(created_by=user.user_id) | Q(document_id__in=my_doc_ids)

    if dept_visibility is None:
        dept_visibility = get_setting_bool('doc.visibility.department_level', default=False)

    if dept_visibility and getattr(user, "department_id", None):
        cond |= Q(department_id=user.department_id)
    return Document.objects.filter(cond)

def visible_cases_q(user, dept_visibility: Optional[bool] = None):
    Case = apps.get_model('cases', 'Case')
    Part = apps.get_model('cases', 'CaseParticipant')

    my_case_ids = Part.objects.filter(user_id=user.user_id).values_list('case_id', flat=True)
    cond = Q(created_by=user.user_id) | Q(owner_id=user.user_id) | Q(case_id__in=my_case_ids)

    if dept_visibility is None:
        dept_visibility = get_setting_bool('doc.visibility.department_level', default=False)

    if dept_visibility and getattr(user, "department_id", None):
        cond |= Q(department_id=user.department_id)
    return Case.objects.filter(cond)
