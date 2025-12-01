import os
import sys
import django

# Setup Django environment
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "core.settings")
django.setup()

from django.db import transaction
from documents.models import Document
from catalog.models import DocumentStatus
from workflow.services.status_resolver import (
    StatusResolver,
    canonical_status_key,
    ALL_INBOUND_STATUSES,
    ALL_OUTBOUND_STATUSES,
)

def run():
    print("Starting status synchronization...")
    
    # 1. Ensure all canonical statuses exist
    print("Ensuring canonical statuses exist...")
    all_canonical = ALL_INBOUND_STATUSES.union(ALL_OUTBOUND_STATUSES)
    for name in all_canonical:
        StatusResolver.doc_status_id(name)
    
    # 2. Normalize Document statuses
    print("Normalizing Document statuses...")
    docs = Document.objects.select_related("status").all()
    updated_count = 0
    
    with transaction.atomic():
        for doc in docs:
            current_status = doc.status
            if not current_status:
                continue
                
            current_name = current_status.status_name
            direction = doc.doc_direction
            
            # Determine canonical key
            canonical = canonical_status_key(current_name, direction=direction)
            
            if not canonical:
                print(f"Warning: Could not resolve status '{current_name}' for doc {doc.pk} ({direction})")
                continue
                
            # If current name is already canonical, skip
            if current_name == canonical:
                continue
                
            # Get ID for canonical status
            new_status_id = StatusResolver.doc_status_id(canonical)
            
            if doc.status_id != new_status_id:
                print(f"Updating doc {doc.pk}: '{current_name}' -> '{canonical}'")
                doc.status_id = new_status_id
                doc.save(update_fields=["status"])
                updated_count += 1
                
    print(f"Finished. Updated {updated_count} documents.")

if __name__ == "__main__":
    run()
