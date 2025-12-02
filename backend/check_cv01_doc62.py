import os
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from accounts.models import User, Department
from documents.models import Document

print("=== CHECK CV01 & DOC 62 ===")

# 1. Check User cv01
try:
    u = User.objects.get(username='cv01')
    print(f"User: {u.username}")
    print(f" - ID: {u.user_id}")
    print(f" - Dept ID: {u.department_id}")
    if u.department:
        print(f" - Dept Name: {u.department.name}")
    else:
        print(" - Dept: None")
except User.DoesNotExist:
    print("❌ User cv01 not found")

# 2. Check Document 62
try:
    doc = Document.objects.get(pk=62)
    print(f"\nDocument 62: {doc.title}")
    print(f" - ID: {doc.document_id}")
    print(f" - Dept ID: {doc.department_id}")
    if doc.department:
        print(f" - Dept Name: {doc.department.name}")
    else:
        print(" - Dept: None")
    
    print(f" - Created By: {doc.created_by.username if doc.created_by else 'None'}")
    print(f" - Main Dept ID (field): {doc.department_id}")
    
except Document.DoesNotExist:
    print("\n❌ Document 62 not found")
