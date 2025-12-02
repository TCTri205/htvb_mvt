import os
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from accounts.models import User
from documents.models import Document

try:
    u = User.objects.get(username='cv01')
    print(f"User: {u.username}")
    print(f"Dept ID: {u.department_id}")
except Exception as e:
    print(f"Error user: {e}")

try:
    doc = Document.objects.filter(pk=62).first()
    if doc:
        print(f"Doc 62 Dept ID: {doc.department_id}")
    else:
        print("Doc 62 not found")
except Exception as e:
    print(f"Error doc: {e}")
