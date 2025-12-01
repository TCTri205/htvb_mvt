from django.db import migrations, models
from django.db.models import Q
from django.db.models.functions import ExtractYear


def _backfill_issue_year(apps, schema_editor):
    Document = apps.get_model("documents", "Document")
    Document.objects.filter(
        doc_direction="di",
        issued_date__isnull=False,
    ).update(issue_year=ExtractYear("issued_date"))


class Migration(migrations.Migration):

    dependencies = [
        ("documents", "0003_document_updated_at"),
    ]

    operations = [
        migrations.AddField(
            model_name="document",
            name="issue_year",
            field=models.IntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="documentattachment",
            name="note",
            field=models.CharField(blank=True, max_length=250, null=True),
        ),
        migrations.RunPython(_backfill_issue_year, migrations.RunPython.noop),
        migrations.RemoveConstraint(
            model_name="document",
            name="uq_issue_number_di_only",
        ),
        migrations.AddConstraint(
            model_name="document",
            constraint=models.UniqueConstraint(
                condition=Q(("doc_direction", "di")),
                fields=("issue_year", "issue_number"),
                name="uq_issue_number_year_di_only",
            ),
        ),
    ]
