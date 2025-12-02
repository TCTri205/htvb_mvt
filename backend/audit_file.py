import os
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from accounts.models import User, Department
from documents.models import Document

with open("audit_result.txt", "w", encoding="utf-8") as f:
    f.write("=== SYSTEM AUDIT ===\n")

    f.write("\n1. DEPARTMENTS:\n")
    for d in Department.objects.all().order_by('department_id'):
        f.write(f" - ID: {d.department_id}, Name: {d.name}, Code: {d.department_code}\n")

    f.write("\n2. USER cv01:\n")
    try:
        u = User.objects.get(username='cv01')
        f.write(f" - Username: {u.username}\n")
        f.write(f" - ID: {u.user_id}\n")
        f.write(f" - Dept ID: {u.department_id}\n")
        f.write(f" - Dept Name: {u.department.name if u.department else 'None'}\n")
    except User.DoesNotExist:
        f.write(" - Not found\n")

    f.write("\n3. DOCUMENT 62:\n")
    try:
        doc = Document.objects.get(pk=62)
        f.write(f" - ID: {doc.document_id}\n")
        f.write(f" - Title: {doc.title}\n")
        f.write(f" - Dept ID: {doc.department_id}\n")
        f.write(f" - Main Dept ID (field): {doc.department_id}\n")
        f.write(f" - Created By: {doc.created_by.username if doc.created_by else 'None'}\n")
        f.write(f" - Created At: {doc.created_at}\n")
    except Document.DoesNotExist:
        f.write(" - Not found\n")
