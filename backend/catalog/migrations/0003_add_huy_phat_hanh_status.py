# Generated migration for adding HUY_PHAT_HANH status
from django.db import migrations


def add_huy_phat_hanh_status(apps, schema_editor):
    DocumentStatus = apps.get_model('catalog', 'DocumentStatus')
    
    # Check if HUY_PHAT_HANH status already exists
    if not DocumentStatus.objects.filter(status_name='HUY_PHAT_HANH').exists():
        DocumentStatus.objects.create(
            status_name='HUY_PHAT_HANH',
            status_code='HUY_PHAT_HANH',
            description='Văn bản đã bị thu hồi/hủy phát hành',
            is_active=True,
        )


def reverse_add_status(apps, schema_editor):
    DocumentStatus = apps.get_model('catalog', 'DocumentStatus')
    DocumentStatus.objects.filter(status_name='HUY_PHAT_HANH').delete()


class Migration(migrations.Migration):

    dependencies = [
        ('catalog', '0002_normalize_outbound_statuses'),
    ]

    operations = [
        migrations.RunPython(add_huy_phat_hanh_status, reverse_add_status),
    ]
