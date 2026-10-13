import json
from decimal import Decimal
from pathlib import Path

from django.db import migrations

# Reference data every database needs: the departments and the first edition of the question
# catalogue, exported from the frontend's domain/questions.ts. Later editions are created through
# the question configuration endpoint, never by editing this file.
CATALOGUE = Path(__file__).resolve().parent.parent / "data" / "questionnaire_v1.json"

DEPARTMENTS = [
    ("banking", "Banking Licence", "Licensing of banking institutions"),
    ("education", "Education Department", "Accreditation of training institutions"),
    ("insurance", "Insurance Supervision", "Long and short term insurers"),
    ("microfinance", "Microfinance Licensing", "Micro-lenders and credit providers"),
    ("payments", "Payment Systems", "Payment service providers and operators"),
    ("markets", "Capital Markets", "Securities dealers and market operators"),
]


def load(apps, schema_editor):
    Department = apps.get_model("cases", "Department")
    Version = apps.get_model("cases", "QuestionnaireVersion")
    Section = apps.get_model("cases", "QuestionSection")
    Question = apps.get_model("cases", "Question")

    Department.objects.bulk_create(
        [Department(key=key, name=name, blurb=blurb) for key, name, blurb in DEPARTMENTS]
    )

    data = json.loads(CATALOGUE.read_text(encoding="utf-8"))
    version = Version.objects.create(label=data["label"], is_active=True)
    sections = {
        s["name"]: Section.objects.create(
            version=version, name=s["name"], weight=Decimal(str(s["weight"])), position=i
        )
        for i, s in enumerate(data["sections"], start=1)
    }
    Question.objects.bulk_create(
        [
            Question(
                version=version,
                section=sections[q["section"]],
                qid=q["qid"],
                text=q["text"],
                polarity=q["polarity"],
                weight=Decimal(str(q["weight"])),
                is_knockout=q["is_knockout"],
                evidence_required=q["evidence_required"],
                allows_na=q["allows_na"],
                accepts_supporting=q["accepts_supporting"],
                checks=q["checks"],
                allowed_answers=q["allowed_answers"],
                file_types=q["file_types"],
                max_files=q["max_files"],
                position=i,
            )
            for i, q in enumerate(data["questions"], start=1)
        ]
    )


def unload(apps, schema_editor):
    apps.get_model("cases", "Question").objects.all().delete()
    apps.get_model("cases", "QuestionSection").objects.all().delete()
    apps.get_model("cases", "QuestionnaireVersion").objects.all().delete()
    apps.get_model("cases", "Department").objects.all().delete()


class Migration(migrations.Migration):
    dependencies = [("cases", "0002_assessment_serial")]

    operations = [migrations.RunPython(load, unload)]
