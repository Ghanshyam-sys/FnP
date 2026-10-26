"""Clears every user's data so the application starts fresh: applicants and their sessions, every
assessment with its answers and uploaded documents (the files too), every engine run with its
results, rulings, scores and decisions, and the audit trail.

Kept: staff accounts (the admin site's, with their passwords), the app's built-in "admin"
reviewer login, the departments, the question set with its current settings, and the numbering of
new assessments (it carries on, so no case id the AI engine has already seen is used again).

    manage.py reset_data            report what would be removed; nothing is changed
    manage.py reset_data --confirm  remove it

Stop the web and worker services first, and back up the database and the media folder: this cannot
be undone. The AI engine keeps its own copies of what was sent to it; this does not reach those.
"""

import os
from pathlib import Path

from django.conf import settings
from django.contrib.admin.models import LogEntry
from django.contrib.sessions.models import Session
from django.core.cache import cache
from django.core.management.base import BaseCommand
from django.db import transaction

from cases.models import (
    AnswerValue,
    ApplicantProfile,
    Assessment,
    AuditEvent,
    Decision,
    CaseDocument,
    EvidenceFile,
    QuestionResult,
    Ruling,
    Score,
    Submission,
    SubmissionDocument,
    User,
)
from cases.storage import delete_files
from cases.views.session import REVIEWER_USERNAME

# Where uploaded documents are stored (see cases.models._evidence_path).
EVIDENCE_FOLDER = "evidence"


def users_to_remove():
    """Every account except the staff ones and the built-in reviewer login."""
    return User.objects.exclude(is_staff=True).exclude(email=REVIEWER_USERNAME)


def leftover_files(root: Path) -> list[Path]:
    """Every file under the evidence folder: what the database lists, and anything left behind."""
    if not root.is_dir():
        return []
    return [Path(folder) / name for folder, _, names in os.walk(root) for name in names]


class Command(BaseCommand):
    help = "Removes all user data (accounts, assessments, documents, runs, decisions, audit trail)."

    def add_arguments(self, parser):
        parser.add_argument("--confirm", action="store_true", help="Remove it. Without this, only report.")

    def handle(self, *args, confirm: bool, **options):
        evidence_root = Path(settings.MEDIA_ROOT) / EVIDENCE_FOLDER
        files = leftover_files(evidence_root)
        counts = [
            ("users (applicants and other app accounts)", users_to_remove().count()),
            ("sign-in sessions", Session.objects.count()),
            ("assessments", Assessment.objects.count()),
            ("saved answers", AnswerValue.objects.count()),
            ("applicant profiles", ApplicantProfile.objects.count()),
            ("uploaded documents (records)", EvidenceFile.objects.count()),
            ("documents in applicants' libraries", CaseDocument.objects.count()),
            ("uploaded documents (files on disk)", len(files)),
            ("engine runs", Submission.objects.count()),
            ("per-question results", QuestionResult.objects.count()),
            ("rulings", Ruling.objects.count()),
            ("scores", Score.objects.count()),
            ("decisions", Decision.objects.count()),
            ("audit events", AuditEvent.objects.count()),
            ("admin site change log", LogEntry.objects.count()),
        ]
        size = sum(f.stat().st_size for f in files)
        kept = list(User.objects.exclude(pk__in=users_to_remove()).values_list("email", flat=True))

        self.stdout.write("Would remove:" if not confirm else "Removing:")
        for label, n in counts:
            self.stdout.write(f"  {n:>7}  {label}")
        self.stdout.write(f"  {size / 1024 / 1024:>7.1f}  MB of documents in {evidence_root}")
        self.stdout.write("Keeping accounts: " + (", ".join(sorted(kept)) or "none"))
        self.stdout.write("Keeping: departments, the question set and its settings, case numbering.")
        if not confirm:
            self.stdout.write(self.style.WARNING("Nothing was changed. Run again with --confirm to remove it."))
            return

        names = sorted(
            set(EvidenceFile.objects.values_list("file", flat=True))
            | set(CaseDocument.objects.values_list("file", flat=True))
        )
        with transaction.atomic():
            # Records that protect the ones they point to go first.
            AuditEvent.objects.all().delete()
            LogEntry.objects.all().delete()
            Decision.objects.all().delete()
            Score.objects.all().delete()
            Ruling.objects.all().delete()
            QuestionResult.objects.all().delete()
            SubmissionDocument.objects.all().delete()
            Submission.evidence_files.through.objects.all().delete()
            Submission.objects.all().delete()
            EvidenceFile.objects.all().delete()
            CaseDocument.objects.all().delete()
            AnswerValue.objects.all().delete()
            ApplicantProfile.objects.all().delete()
            Assessment.objects.all().delete()
            Session.objects.all().delete()
            users_to_remove().delete()

        # Only once the records are gone, so a failure above never leaves them pointing at nothing.
        delete_files(names)
        for path in leftover_files(evidence_root):
            path.unlink(missing_ok=True)
        for folder, _, _ in sorted(os.walk(evidence_root), key=lambda w: -len(w[0])):
            if Path(folder) != evidence_root:
                try:
                    os.rmdir(folder)  # only ever an empty folder
                except OSError:
                    pass
        cache.clear()  # cached question lists and engine options, rate-limit counters
        self.stdout.write(self.style.SUCCESS("Done. The application starts fresh."))
