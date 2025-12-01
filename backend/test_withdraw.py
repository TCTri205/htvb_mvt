#!/usr/bin/env python
"""
Debug script to test withdraw_publish action
"""
import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'htvb_mvt.settings')
django.setup()

from documents.models import Document
from accounts.models import User
from workflow.services.outbound_service import OutboundService
from workflow.services.errors import PermissionDenied, ValidationError, InvalidTransition

# Get document 19
try:
    doc = Document.objects.get(document_id=19)
    print(f"Document {doc.document_id}: {doc.title}")
    print(f"  Current status: {doc.status.status_name if doc.status else doc.status_id}")
    print(f"  Direction: {doc.doc_direction}")
    print(f"  Issue number: {doc.issue_number}")
    print(f"  Issued date: {doc.issued_date}")
    
    # Get a leader user
    leader = User.objects.filter(role__name__icontains='LANH_DAO').first()
    if not leader:
        leader = User.objects.filter(is_staff=True).first()
    
    if not leader:
        print("ERROR: No leader user found")
    else:
        print(f"\nUsing user: {leader.username} (role: {leader.role.name if leader.role else 'N/A'})")
        
        # Try to withdraw
        service = OutboundService(actor=leader)
        
        try:
            print("\nAttempting to withdraw...")
            service.withdraw_publish(doc, reason="Testing withdraw from debug script")
            print("SUCCESS: Document withdrawn")
            
            # Reload doc
            doc.refresh_from_db()
            print(f"  New status: {doc.status.status_name if doc.status else doc.status_id}")
            
        except PermissionDenied as e:
            print(f"PERMISSION ERROR: {e}")
        except ValidationError as e:
            print(f"VALIDATION ERROR: {e}")
        except InvalidTransition as e:
            print(f"INVALID TRANSITION ERROR: {e}")
        except Exception as e:
            print(f"UNEXPECTED ERROR: {type(e).__name__}: {e}")
            import traceback
            traceback.print_exc()
            
except Document.DoesNotExist:
    print("ERROR: Document 19 not found")
except Exception as e:
    print(f"ERROR: {type(e).__name__}: {e}")
    import traceback
    traceback.print_exc()
