import os
import django
import sys

# Redirect stdout/stderr to file
sys.stdout = open('db_update_output.txt', 'w', encoding='utf-8')
sys.stderr = sys.stdout

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "backend.settings")
django.setup()

from accounts.models import Permission, Role, RolePermission
from django.db import transaction

def update_permissions():
    print("--- UPDATE START ---")
    
    perm_code = "DOC.OUT.REGISTER"
    perm_name = "Vào sổ văn bản đi"
    
    # 1. Ensure Permission exists
    perm, created = Permission.objects.get_or_create(
        code=perm_code,
        defaults={'name': perm_name}
    )
    if created:
        print(f"Created permission: {perm_code}")
    else:
        print(f"Permission exists: {perm_code}")
        
    # 2. Ensure VT role has this permission
    vt_role = Role.objects.filter(name__iexact='VAN_THU').first()
    if not vt_role:
        print("ERROR: Role 'VAN_THU' not found!")
        return
        
    print(f"VT Role ID: {vt_role.role_id}")
    
    rp, rp_created = RolePermission.objects.get_or_create(
        role=vt_role,
        permission=perm
    )
    
    if rp_created:
        print(f"Assigned permission {perm_code} to role {vt_role.name}")
    else:
        print(f"Role {vt_role.name} already has permission {perm_code}")

    print("--- UPDATE END ---")

if __name__ == "__main__":
    update_permissions()
