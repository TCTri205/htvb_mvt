import os
import django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "backend.settings")
django.setup()

from accounts.models import User, Permission, Role
from workflow.services.rbac import can, Act, Role as RoleEnum, ROLE_ACTIONS, PERM_CODE, get_single_role_code, _has_permission_db

def debug_permissions():
    print("--- DEBUG START ---")
    u = User.objects.filter(username__icontains='vanthu').first()
    if not u:
        print("User 'vanthu' not found!")
        return

    print(f"User: {u.username}")
    print(f"User Role ID: {u.role_id}")
    
    role_code = get_single_role_code(u)
    print(f"Calculated Role Code: {role_code}")
    
    act = Act.VT_REGISTER_OUTBOUND
    print(f"Act: {act}")
    print(f"Act value: {act.value}")
    
    in_perm_code = act in PERM_CODE
    print(f"In PERM_CODE? {in_perm_code}")
    if in_perm_code:
        print(f"Mapped to: {PERM_CODE[act]}")
        
    in_role_actions = act in ROLE_ACTIONS.get(RoleEnum.VT, set())
    print(f"In ROLE_ACTIONS[VT]? {in_role_actions}")
    
    db_has = _has_permission_db(u, act)
    print(f"_has_permission_db result: {db_has}")
    
    can_result = can(u, act)
    print(f"can() result: {can_result}")
    
    # Check if permission exists in DB
    perm_code_str = "DOC.OUT.REGISTER"
    p = Permission.objects.filter(code=perm_code_str).first()
    print(f"Permission '{perm_code_str}' exists in DB? {p is not None}")
    if p:
        print(f"Permission ID: {p.permission_id}")

    print("--- DEBUG END ---")

if __name__ == "__main__":
    debug_permissions()
