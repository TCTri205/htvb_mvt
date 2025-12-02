import os
import django
import sys

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from accounts.models import User
from documents.models import Document

with open("debug_output.txt", "w", encoding="utf-8") as f:
    try:
        u = User.objects.get(username='cv01')
        f.write(f"User: {u.username}\n")
        f.write(f"Dept ID: {u.department_id}\n")
        f.write(f"Dept Name: {u.department.name if u.department else 'None'}\n")
    except Exception as e:
        f.write(f"Error checking user: {e}\n")

    try:
        doc = Document.objects.filter(pk=62).first()
        if doc:
            f.write(f"Doc 62 Dept ID: {doc.department_id}\n")
            f.write(f"Doc 62 Main Dept ID: {doc.department_id}\n")
            f.write(f"Doc 62 Created By: {doc.created_by.username if doc.created_by else 'None'}\n")
        else:
            f.write("Doc 62 not found\n")
    except Exception as e:
        f.write(f"Error checking doc: {e}\n")
