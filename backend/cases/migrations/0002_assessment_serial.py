from django.db import migrations

# Numbers newly created assessments (FNP-<year>-<serial>). A database sequence hands out each
# value exactly once, even to concurrent requests, and never reuses one after a removal. It starts
# above the built-in demo assessments' serials.


class Migration(migrations.Migration):
    dependencies = [("cases", "0001_initial")]

    operations = [
        migrations.RunSQL(
            sql="CREATE SEQUENCE assessment_serial START WITH 1000",
            reverse_sql="DROP SEQUENCE assessment_serial",
        ),
    ]
