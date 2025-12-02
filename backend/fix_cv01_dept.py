import os
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from accounts.models import User, Department

try:
    u = User.objects.get(username='cv01')
    print(f"Current User: {u.username}, Dept: {u.department_id}")
    
    if u.department_id != 1:
        print("Updating cv01 to Department 1...")
        u.department_id = 1
        u.save()
        print("✅ Updated successfully.")
    else:
        print("✅ User is already in Department 1.")
        
    # Verify
    u.refresh_from_db()
    print(f"Final State: {u.username}, Dept: {u.department_id} - {u.department.name}")

except User.DoesNotExist:
    print("❌ User cv01 not found")
except Department.DoesNotExist:
    print("❌ Department 1 not found")
except Exception as e:
    print(f"❌ Error: {e}")
