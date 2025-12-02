import os
import django
import sys

# Redirect stdout/stderr to file
sys.stdout = open('db_update_ld_output.txt', 'w', encoding='utf-8')
sys.stderr = sys.stdout

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "backend.settings")
django.setup()

from accounts.models import Permission, Role, RolePermission

def update_ld_permissions():
    print("--- UPDATE LD START ---")
    
    perm_code = "DOC.OUT.REGISTER"
    
    # 1. Get Permission
    perm = Permission.objects.filter(code=perm_code).first()
    if not perm:
        print(f"ERROR: Permission {perm_code} not found! Run update_perm.py first.")
        return
        
    # 2. Ensure LD role has this permission
    ld_role = Role.objects.filter(name__iexact='LANH_DAO').first()
    if not ld_role:
        print("ERROR: Role 'LANH_DAO' not found!")
        return
        
    print(f"LD Role ID: {ld_role.role_id}")
    
    rp, rp_created = RolePermission.objects.get_or_create(
        role=ld_role,
        permission=perm
    )
    
    if rp_created:
        print(f"Assigned permission {perm_code} to role {ld_role.name}")
    else:
        print(f"Role {ld_role.name} already has permission {perm_code}")

    print("--- UPDATE LD END ---")

if __name__ == "__main__":
    update_ld_permissions()
