from django.db import migrations
from django.db.models import Count

def forwards(apps, schema_editor):
    Document = apps.get_model('documents', 'Document')
    Status = apps.get_model('catalog', 'DocumentStatus')
    waiting = Status.objects.filter(status_name='WAITING_ASSIGNMENT').first()
    if not waiting:
        waiting = Status.objects.create(status_name='WAITING_ASSIGNMENT')
    processing_ids = list(Status.objects.filter(status_name__in=['PROCESSING']).values_list('status_id', flat=True))
    if not processing_ids:
        return
    qs = (
        Document.objects.filter(doc_direction='den', status_id__in=processing_ids)
        .annotate(assign_count=Count('assignments'))
        .filter(assign_count=0)
    )
    qs.update(status_id=waiting.status_id)


def backwards(apps, schema_editor):
    # No rollback
    return


class Migration(migrations.Migration):
    dependencies = [
        ('documents', '0007_set_waiting_assignment'),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
