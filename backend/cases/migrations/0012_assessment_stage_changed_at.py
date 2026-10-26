import django.utils.timezone
from django.db import migrations, models
from django.db.models import F


def from_last_activity(apps, schema_editor):
    """Cases already there: the last activity is the best known time their stage moved."""
    Assessment = apps.get_model("cases", "Assessment")
    Assessment.objects.update(stage_changed_at=F("updated_at"))


class Migration(migrations.Migration):
    dependencies = [
        ("cases", "0011_case_document_library"),
    ]

    operations = [
        migrations.AddField(
            model_name="assessment",
            name="stage_changed_at",
            field=models.DateTimeField(default=django.utils.timezone.now),
        ),
        migrations.RunPython(from_last_activity, migrations.RunPython.noop),
    ]
