import os
import django
import sys

# Redirect stdout/stderr to file
sys.stdout = open('user_role_check.txt', 'w', encoding='utf-8')
sys.stderr = sys.stdout

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "backend.settings")
django.setup()

from accounts.models import User
from workflow.services.rbac import _get_user_role_names

def check_user_role():
    print("--- CHECK START ---")
    try:
        u = User.objects.get(username='ld01')
        print(f"User: {u.username}")
        print(f"Role ID: {u.role_id}")
        roles = _get_user_role_names(u)
        print(f"Roles: {roles}")
    except User.DoesNotExist:
        print("User 'ld01' not found!")
    print("--- CHECK END ---")

if __name__ == "__main__":
    check_user_role()
