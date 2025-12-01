# Script to check and update case status for testing
# Run from backend directory: python scripts/check_case_status.py

import os
import django

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from cases.models import Case
from catalog.models import CaseStatus

# Get case ID 5 (from the URL in the image)
case_id = 5

try:
    case = Case.objects.get(case_id=case_id)
    print(f"Case #{case_id}: {case.title}")
    print(f"Current Status: {case.status.case_status_name if case.status else 'None'}")
    print(f"Status Code: {case.status.code if case.status else 'None'}")
    
    # List all available statuses
    print("\n=== Available Statuses ===")
    for status in CaseStatus.objects.all():
        print(f"  - {status.case_status_name} ({status.code})")
    
    # Ask to change status
    print("\n" + "="*50)
    change = input("Do you want to change status to CHO_PHAN_CONG? (y/n): ")
    
    if change.lower() == 'y':
        cho_phan_cong = CaseStatus.objects.get(case_status_name='CHO_PHAN_CONG')
        case.status = cho_phan_cong
        case.save()
        print(f"✓ Status updated to CHO_PHAN_CONG")
    else:
        print("Status not changed")
        
except Case.DoesNotExist:
    print(f"✗ Case #{case_id} does not exist")
except CaseStatus.DoesNotExist:
    print(f"✗ CaseStatus 'CHO_PHAN_CONG' not found in database")
except Exception as e:
    print(f"✗ Error: {e}")
