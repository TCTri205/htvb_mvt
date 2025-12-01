#!/usr/bin/env python
"""
Debug script to test finalize_registration
"""
import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'htvb_mvt.settings')
django.setup()

from documents.models import Document, RegisterBook
from accounts.models import User
from workflow.services.outbound_service import OutboundService
from workflow.services.errors import PermissionDenied, ValidationError, InvalidTransition
from workflow.services.status_resolver import StatusResolver as SR, OutboundStatus

# Find a document in PENDING_CLERK_CHECK status
try:
    pending_status_id = SR.doc_status_id(OutboundStatus.PENDING_CLERK_CHECK.value)
    doc = Document.objects.filter(
        doc_direction__in=['di', 'du_thao'],
        status_id=pending_status_id
    ).first()
    
    if not doc:
        print("ERROR: No document found in PENDING_CLERK_CHECK status")
        print("Creating a test document...")
        # We won't create one automatically, just notify
    else:
        print(f"Found document {doc.document_id}: {doc.title}")
        print(f"  Current status: {doc.status.status_name if doc.status else doc.status_id}")
        print(f"  Direction: {doc.doc_direction}")
        print(f"  Document code: {doc.document_code}")
        print(f"  Issue number: {doc.issue_number}")
        print(f"  Issue year: {doc.issue_year}")
        print(f"  Issued date: {doc.issued_date}")
        
        # Get a register book
        book = RegisterBook.objects.filter(direction='di', is_active=True).first()
        if not book:
            print("\nERROR: No active register book for 'di' direction")
        else:
            print(f"\nUsing register book: {book.name} (year={book.year})")
            print(f"  Prefix: {book.prefix}")
            print(f"  Suffix: {book.suffix}")
            print(f"  Padding: {book.padding}")
            print(f"  Next sequence: {book.next_sequence}")
            
            # Get a clerk user
            clerk = User.objects.filter(role__name__icontains='VAN_THU').first()
            if not clerk:
                clerk = User.objects.filter(is_staff=True).first()
            
            if not clerk:
                print("\nERROR: No clerk user found")
            else:
                print(f"\nUsing user: {clerk.username} (role: {clerk.role.name if clerk.role else 'N/A'})")
                
                # Try to register
                service = OutboundService(actor=clerk)
                
                try:
                    print("\nAttempting to register document...")
                    service.finalize_registration(doc, note="Testing from debug script", register_book_id=book.register_id)
                    print("SUCCESS: Document registered")
                    
                    # Reload doc
                    doc.refresh_from_db()
                    print(f"  New status: {doc.status.status_name if doc.status else doc.status_id}")
                    print(f"  New direction: {doc.doc_direction}")
                    print(f"  New issue number: {doc.issue_number}")
                    print(f"  New issue year: {doc.issue_year}")
                    print(f"  New issued date: {doc.issued_date}")
                    
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
                    
except Exception as e:
    print(f"ERROR: {type(e).__name__}: {e}")
    import traceback
    traceback.print_exc()
