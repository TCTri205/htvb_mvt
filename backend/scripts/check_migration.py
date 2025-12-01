import os
import sys
import django

# Setup Django environment
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "core.settings")
django.setup()

from documents.models import Document
from workflow.services.status_resolver import ALL_INBOUND_STATUSES, ALL_OUTBOUND_STATUSES

def check():
    print("Checking document statuses...")
    docs = Document.objects.select_related("status").all()
    
    canonical_statuses = ALL_INBOUND_STATUSES.union(ALL_OUTBOUND_STATUSES)
    
    non_canonical_count = 0
    total_count = 0
    
    for doc in docs:
        total_count += 1
        if not doc.status:
            print(f"Doc {doc.pk}: No status")
            continue
            
        status_name = doc.status.status_name
        if status_name not in canonical_statuses:
            print(f"Doc {doc.pk}: Non-canonical status '{status_name}'")
            non_canonical_count += 1
            
    print(f"Total docs: {total_count}")
    print(f"Non-canonical docs: {non_canonical_count}")

if __name__ == "__main__":
    check()
