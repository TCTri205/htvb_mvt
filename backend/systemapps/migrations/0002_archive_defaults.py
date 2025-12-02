from django.db import migrations


def create_archive_settings(apps, schema_editor):
    SystemSetting = apps.get_model("systemapps", "SystemSetting")
    defaults = {
        "archive_auto_backup_frequency": "daily_02:00",
        "archive_backup_retention_count": 30,
        "archive_alert_threshold": 80,
        "archive_auto_archive_enabled": True,
    }
    for key, value in defaults.items():
        SystemSetting.objects.update_or_create(
            setting_key=key,
            defaults={"setting_value": value},
        )


def remove_archive_settings(apps, schema_editor):
    SystemSetting = apps.get_model("systemapps", "SystemSetting")
    keys = [
        "archive_auto_backup_frequency",
        "archive_backup_retention_count",
        "archive_alert_threshold",
        "archive_auto_archive_enabled",
    ]
    SystemSetting.objects.filter(setting_key__in=keys).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("systemapps", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(create_archive_settings, remove_archive_settings),
    ]
