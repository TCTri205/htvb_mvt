import os
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from accounts.models import User, Department
from documents.models import Document

print("=== SYSTEM AUDIT ===")

print("\n1. DEPARTMENTS:")
for d in Department.objects.all().order_by('department_id'):
    print(f" - ID: {d.department_id}, Name: {d.name}, Code: {d.department_code}")

print("\n2. USER cv01:")
try:
    u = User.objects.get(username='cv01')
    print(f" - Username: {u.username}")
    print(f" - ID: {u.user_id}")
    print(f" - Dept ID: {u.department_id}")
    print(f" - Dept Name: {u.department.name if u.department else 'None'}")
except User.DoesNotExist:
    print(" - Not found")

print("\n3. DOCUMENT 62:")
try:
    doc = Document.objects.get(pk=62)
    print(f" - ID: {doc.document_id}")
    print(f" - Title: {doc.title}")
    print(f" - Dept ID: {doc.department_id}")
    print(f" - Main Dept ID (field): {doc.department_id}")
    print(f" - Created By: {doc.created_by.username if doc.created_by else 'None'}")
    print(f" - Created At: {doc.created_at}")
except Document.DoesNotExist:
    print(" - Not found")
