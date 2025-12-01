import os
import sys
import django

# Setup Django environment
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "core.settings")
django.setup()

from apps.catalog.models import CaseStatus

REQUIRED_STATUSES = [
    ("MOI_TAO", "Mới tạo"),
    ("CHO_PHAN_CONG", "Chờ phân công"),
    ("DA_PHAN_CONG", "Đã phân công"),
    ("DANG_THUC_HIEN", "Đang thực hiện"),
    ("TAM_DUNG", "Tạm dừng"),
    ("CHO_DUYET_DONG", "Chờ duyệt đóng"),
    ("DONG", "Đã đóng"),
]

def run():
    print("Checking Case Statuses...")
    existing = {s.case_status_name: s for s in CaseStatus.objects.all()} # Note: model uses case_status_name as code based on previous edits?
    
    # Wait, let's check the model definition again.
    # In Step 322, we saw:
    # case_status_name = models.CharField(max_length=200, unique=True)
    # @property code(self): return self.case_status_name
    
    # So the 'code' IS the 'case_status_name'.
    
    for code, name in REQUIRED_STATUSES:
        if code in existing:
            print(f"  [OK] {code}")
        else:
            print(f"  [MISSING] {code} - Creating...")
            CaseStatus.objects.create(case_status_name=code)
            print(f"  [CREATED] {code}")

if __name__ == "__main__":
    run()
