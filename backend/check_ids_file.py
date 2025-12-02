import os
import django
import sys

# Setup Django environment
sys.path.append(os.getcwd())
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from accounts.models import User
from documents.models import Document

with open("check_ids_result.txt", "w") as f:
    try:
        doc = Document.objects.get(pk=62)
        f.write(f"DOC_DEPT: {doc.department_id}\n")
    except Exception as e:
        f.write(f"DOC_ERROR: {e}\n")

    try:
        user = User.objects.get(username='cv01')
        f.write(f"USER_DEPT: {user.department_id}\n")
    except Exception as e:
        f.write(f"USER_ERROR: {e}\n")
