import os
import django
import sys

# Setup Django environment
sys.path.append(os.getcwd())
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from accounts.models import User, Department
from documents.models import Document

def fix_data():
    try:
        # 1. Ensure Department 1 exists
        dept1 = Department.objects.filter(pk=1).first()
        if not dept1:
            print("Department 1 not found! Using first available department.")
            dept1 = Department.objects.first()
            print(f"Using Department {dept1.department_id} ({dept1.name}) instead.")
        
        # 2. Fix User cv01
        u = User.objects.get(username='cv01')
        print(f"User {u.username} current Dept: {u.department_id}")
        
        if u.department_id != dept1.department_id:
            u.department = dept1
            u.save()
            print(f"Updated User {u.username} to Dept {dept1.department_id}")
        else:
            print(f"User {u.username} already in Dept {dept1.department_id}")

        # 3. Fix Document 62
        doc = Document.objects.filter(pk=62).first()
        if doc:
            print(f"Doc 62 current Dept: {doc.department_id}")
            if doc.department_id != dept1.department_id:
                doc.department = dept1
                doc.save()
                print(f"Updated Doc 62 to Dept {dept1.department_id}")
            else:
                print(f"Doc 62 already in Dept {dept1.department_id}")
        else:
            print("Doc 62 not found")

        # 4. Fix ALL documents created by cv01 to have correct department
        docs = Document.objects.filter(created_by=u)
        count = 0
        for d in docs:
            if d.department_id != dept1.department_id:
                d.department = dept1
                d.save()
                count += 1
        print(f"Updated {count} other documents for cv01 to Dept {dept1.department_id}")

        with open("fix_success.txt", "w") as f:
            f.write("SUCCESS")

    except Exception as e:
        print(f"Error: {e}")
        with open("fix_error.txt", "w") as f:
            f.write(str(e))

if __name__ == "__main__":
    fix_data()
