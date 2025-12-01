from django.db import migrations

def forwards(apps, schema_editor):
    Document = apps.get_model('documents', 'Document')
    Status = apps.get_model('catalog', 'DocumentStatus')
    waiting, _ = Status.objects.get_or_create(status_name='WAITING_ASSIGNMENT')
    received_ids = list(
        Status.objects.filter(status_name__in=['RECEIVED', 'TIEP_NHAN']).values_list('status_id', flat=True)
    )
    if received_ids:
        Document.objects.filter(doc_direction='den', status_id__in=received_ids).update(status_id=waiting.status_id)


def backwards(apps, schema_editor):
    # No-op rollback
    return


class Migration(migrations.Migration):
    dependencies = [
        ('documents', '0006_documentassignment_instruction_and_more'),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
