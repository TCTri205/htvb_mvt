from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("documents", "0004_document_issue_year_attachment_note"),
    ]

    operations = [
        migrations.AlterField(
            model_name="document",
            name="received_number",
            field=models.CharField(max_length=50, null=True, blank=True),
        ),
    ]
