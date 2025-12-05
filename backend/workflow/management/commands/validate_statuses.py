"""
Django management command to validate document statuses after migration.

Usage:
    python manage.py validate_statuses
"""
from django.core.management.base import BaseCommand
from django.db.models import Count
from catalog.models import DocumentStatus
from documents.models import Document, DocumentWorkflowLog
from workflow.services.status_resolver import (
    ALL_INBOUND_STATUSES,
    ALL_OUTBOUND_STATUSES,
)


class Command(BaseCommand):
    help = "Validate document statuses after status standardization migration"

    def handle(self, *args, **options):
        self.stdout.write("\n" + "="*70)
        self.stdout.write(self.style.HTTP_INFO(" 📋 Document Status Validation Report"))
        self.stdout.write("="*70 + "\n")
        
        all_canonical_statuses = ALL_INBOUND_STATUSES.union(ALL_OUTBOUND_STATUSES)
        
        # Check 1: Validate DocumentStatus table
        self.stdout.write(self.style.HTTP_INFO("1️⃣  Checking DocumentStatus table..."))
        all_statuses = DocumentStatus.objects.all()
        total_status_records = all_statuses.count()
        
        invalid_statuses = all_statuses.exclude(
            status_name__in=all_canonical_statuses
        )
        
        if invalid_statuses.exists():
            self.stdout.write(self.style.ERROR(
                f"   ❌ Found {invalid_statuses.count()} non-canonical DocumentStatus records:"
            ))
            for status in invalid_statuses:
                doc_count = Document.objects.filter(status=status).count()
                log_from_count = DocumentWorkflowLog.objects.filter(from_status=status).count()
                log_to_count = DocumentWorkflowLog.objects.filter(to_status=status).count()
                
                self.stdout.write(self.style.WARNING(
                    f"      • {status.status_name:30} "
                    f"(docs={doc_count}, logs_from={log_from_count}, logs_to={log_to_count})"
                ))
            self.stdout.write()
            return_code = 1
        else:
            self.stdout.write(self.style.SUCCESS(
                f"   ✅ All {total_status_records} DocumentStatus records are canonical!\n"
            ))
            return_code = 0
        
        # Check 2: Validate Documents
        self.stdout.write(self.style.HTTP_INFO("2️⃣  Checking Document table..."))
        total_docs = Document.objects.count()
        
        # Group documents by status
        doc_status_counts = Document.objects.values(
            'status__status_name'
        ).annotate(
            count=Count('document_id')
        ).order_by('-count')
        
        invalid_docs = Document.objects.filter(
            status__isnull=False
        ).exclude(
            status__status_name__in=all_canonical_statuses
        )
        
        if invalid_docs.exists():
            self.stdout.write(self.style.ERROR(
                f"   ❌ Found {invalid_docs.count()} documents with invalid status"
            ))
            # Show sample of invalid documents
            for doc in invalid_docs[:10]:
                self.stdout.write(self.style.WARNING(
                    f"      • Doc #{doc.document_id}: {doc.title[:50]}... "
                    f"(status={doc.status.status_name if doc.status else 'NULL'})"
                ))
            if invalid_docs.count() > 10:
                self.stdout.write(self.style.WARNING(
                    f"      ... and {invalid_docs.count() - 10} more"
                ))
            self.stdout.write()
            return_code = 1
        else:
            self.stdout.write(self.style.SUCCESS(
                f"   ✅ All {total_docs} documents have valid canonical statuses!"
            ))
            
            # Show distribution
            self.stdout.write("   ")
            self.stdout.write("   Status distribution:")
            for item in doc_status_counts:
                status_name = item['status__status_name'] or 'NULL'
                count = item['count']
                self.stdout.write(f"      • {status_name:30} {count:6} docs")
            self.stdout.write()
        
        # Check 3: Validate Workflow Logs
        self.stdout.write(self.style.HTTP_INFO("3️⃣  Checking DocumentWorkflowLog table..."))
        total_logs = DocumentWorkflowLog.objects.count()
        
        invalid_logs_from = DocumentWorkflowLog.objects.filter(
            from_status__isnull=False
        ).exclude(
            from_status__status_name__in=all_canonical_statuses
        )
        
        invalid_logs_to = DocumentWorkflowLog.objects.filter(
            to_status__isnull=False
        ).exclude(
            to_status__status_name__in=all_canonical_statuses
        )
        
        invalid_count = invalid_logs_from.count() + invalid_logs_to.count()
        
        if invalid_count > 0:
            self.stdout.write(self.style.ERROR(
                f"   ❌ Found {invalid_count} workflow logs with invalid status"
            ))
            self.stdout.write(self.style.WARNING(
                f"      • from_status invalid: {invalid_logs_from.count()}"
            ))
            self.stdout.write(self.style.WARNING(
                f"      • to_status invalid: {invalid_logs_to.count()}"
            ))
            self.stdout.write()
            return_code = 1
        else:
            self.stdout.write(self.style.SUCCESS(
                f"   ✅ All {total_logs} workflow logs have valid canonical statuses!\n"
            ))
        
        # Summary
        self.stdout.write("="*70)
        if return_code == 0:
            self.stdout.write(self.style.SUCCESS("✨ VALIDATION PASSED"))
            self.stdout.write(self.style.SUCCESS(
                f"   All statuses are canonical and properly migrated!"
            ))
            self.stdout.write(self.style.SUCCESS(
                f"   • DocumentStatus records: {total_status_records}"
            ))
            self.stdout.write(self.style.SUCCESS(
                f"   • Documents: {total_docs}"
            ))
            self.stdout.write(self.style.SUCCESS(
                f"   • Workflow logs: {total_logs}"
            ))
        else:
            self.stdout.write(self.style.ERROR("❌ VALIDATION FAILED"))
            self.stdout.write(self.style.ERROR(
                "   Non-canonical statuses found. Please review migration."
            ))
        self.stdout.write("="*70 + "\n")
        
        # Don't return integer - Django will try to write it and cause AttributeError
