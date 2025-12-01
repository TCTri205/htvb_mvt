# Generated migration to normalize outbound document statuses

from django.db import migrations


def migrate_outbound_statuses_forward(apps, schema_editor):
    """
    Migrate existing documents from old statuses to new simplified workflow.
    RETURNED → DRAFT
    APPROVED → PENDING_CLERK_CHECK
    """
    Document = apps.get_model('documents', 'Document')
    DocumentStatus = apps.get_model('catalog', 'DocumentStatus')
    
    # Get status IDs
    try:
        draft_status = DocumentStatus.objects.get(status_name='DRAFT')
    except DocumentStatus.DoesNotExist:
        print("WARNING: DRAFT status not found, skipping RETURNED migration")
        draft_status = None
    
    try:
        pending_clerk = DocumentStatus.objects.get(status_name='PENDING_CLERK_CHECK')
    except DocumentStatus.DoesNotExist:
        print("WARNING: PENDING_CLERK_CHECK status not found, skipping APPROVED migration")
        pending_clerk = None
    
    # Migrate RETURNED → DRAFT
    if draft_status:
        try:
            returned_status = DocumentStatus.objects.get(status_name='RETURNED')
            count = Document.objects.filter(
                status_id=returned_status.status_id,
                doc_direction__in=['di', 'du_thao']
            ).update(
                status_id=draft_status.status_id,
                doc_direction='du_thao'
            )
            print(f"✓ Migrated {count} outbound documents from RETURNED to DRAFT")
        except DocumentStatus.DoesNotExist:
            print("✓ RETURNED status not found (already cleaned up or never existed)")
    
    # Migrate APPROVED → PENDING_CLERK_CHECK
    if pending_clerk:
        try:
            approved_status = DocumentStatus.objects.get(status_name='APPROVED')
            count = Document.objects.filter(
                status_id=approved_status.status_id,
                doc_direction__in=['di', 'du_thao']
            ).update(status_id=pending_clerk.status_id)
            print(f"✓ Migrated {count} outbound documents from APPROVED to PENDING_CLERK_CHECK")
        except DocumentStatus.DoesNotExist:
            print("✓ APPROVED status not found (already cleaned up or never existed)")


def migrate_outbound_statuses_reverse(apps, schema_editor):
    """
    Reverse migration (best effort - some information may be lost).
    Note: We cannot reliably distinguish which DRAFT docs came from RETURNED
    and which PENDING_CLERK_CHECK docs came from APPROVED.
    """
    print("WARNING: Reverse migration may not perfectly restore original states")
    print("Documents in DRAFT may have originally been RETURNED or actually DRAFT")
    print("Documents in PENDING_CLERK_CHECK may have originally been APPROVED or actually PENDING_CLERK_CHECK")
    # Intentionally left incomplete as perfect reversal is not possible


class Migration(migrations.Migration):

    dependencies = [
        ('catalog', '0001_initial'),  # Adjust to your latest migration
        ('documents', '0001_initial'),  # Adjust to your latest migration
    ]

    operations = [
        migrations.RunPython(
            migrate_outbound_statuses_forward,
            migrate_outbound_statuses_reverse
        ),
    ]
