import os
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from accounts.models import User
from documents.models import Document

print("=== FIXING DATA ===")

# 1. Fix User cv01
try:
    u = User.objects.get(username='cv01')
    if u.department_id != 1:
        print(f"Updating User {u.username} from Dept {u.department_id} to 1")
        u.department_id = 1
        u.save()
    else:
        print(f"User {u.username} is already in Dept 1")
except Exception as e:
    print(f"Error user: {e}")

# 2. Fix Document 62
try:
    doc = Document.objects.filter(pk=62).first()
    if doc:
        if doc.department_id != 1:
            print(f"Updating Doc 62 from Dept {doc.department_id} to 1")
            doc.department_id = 1
            doc.save()
        else:
            print("Doc 62 is already in Dept 1")
    else:
        print("Doc 62 not found")
except Exception as e:
    print(f"Error doc: {e}")
