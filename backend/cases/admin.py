"""The admin site at /admin/, for staff accounts (manage.py createsuperuser).

Staff may look at everything, but case records stay as the workflow made them: assessments,
answers, documents, runs, rulings, scores, decisions and the audit trail are read-only, so a case
can never be put into a state the workflow would not produce, and the trail cannot be edited. The
only changes possible are a user's active status (recorded in the audit trail) and the departments'
names. National ID numbers are never shown, and documents are listed without a link to the file.
"""

import json

from django.contrib import admin
from django.contrib.auth.models import Group
from django.utils.html import format_html

from . import audit
from .models import (
    AnswerValue,
    ApplicantProfile,
    Assessment,
    AuditEvent,
    Decision,
    Department,
    EvidenceFile,
    Question,
    QuestionnaireVersion,
    QuestionResult,
    QuestionSection,
    Ruling,
    Score,
    Submission,
    SubmissionDocument,
    User,
)

# Accounts have a role, not groups or per-user permissions: Django's own Groups page would only
# offer records that mean nothing here.
admin.site.unregister(Group)

admin.site.site_header = "Fit and Proper Assessment: Administration"
admin.site.site_title = "Fit and Proper Assessment admin"
admin.site.index_title = "Records"


def pretty_json(value) -> str:
    """A JSON document, indented, for reading on a record's page."""
    if value in (None, "", {}, []):
        return "—"
    return format_html("<pre style='white-space:pre-wrap;margin:0'>{}</pre>", json.dumps(value, indent=2, ensure_ascii=False))


class ReadOnlyAdmin(admin.ModelAdmin):
    """Viewable, never added to, changed or deleted here."""

    def get_readonly_fields(self, request, obj=None):
        # Every field shown, as plain values (timestamps and the like cannot be form fields).
        shown = self.fields or [f.name for f in self.model._meta.fields if f.name not in (self.exclude or ())]
        return list(dict.fromkeys([*shown, *self.readonly_fields]))

    def has_add_permission(self, request, obj=None):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


class ReadOnlyInline(admin.TabularInline):
    extra = 0
    can_delete = False
    show_change_link = False

    def get_readonly_fields(self, request, obj=None):
        return self.fields

    def has_add_permission(self, request, obj=None):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


# ---- People and reference data -----------------------------------------------------------------

@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    list_display = ("email", "role", "is_active", "is_staff", "created_at", "last_login")
    list_filter = ("role", "is_active", "is_staff")
    search_fields = ("email",)
    ordering = ("-created_at",)
    fields = ("email", "role", "is_active", "is_staff", "created_at", "last_login")

    def get_readonly_fields(self, request, obj=None):
        # Only whether the account may sign in can change here; a staff member cannot lock
        # themselves out.
        fixed = ["email", "role", "is_staff", "created_at", "last_login"]
        return fixed + ["is_active"] if obj is not None and obj.pk == request.user.pk else fixed

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

    def save_model(self, request, obj, form, change):
        super().save_model(request, obj, form, change)
        if "is_active" in form.changed_data:
            action = "user.activate" if obj.is_active else "user.deactivate"
            audit.record(request.user, action, target_type="user", target_id=obj.pk)


@admin.register(Department)
class DepartmentAdmin(admin.ModelAdmin):
    list_display = ("key", "name", "blurb")
    readonly_fields = ("key",)  # Assessments and the frontend refer to departments by key.

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


# ---- Questionnaire -------------------------------------------------------------------------------

class QuestionSectionInline(ReadOnlyInline):
    model = QuestionSection
    fields = ("position", "name", "weight")


@admin.register(QuestionnaireVersion)
class QuestionnaireVersionAdmin(ReadOnlyAdmin):
    list_display = ("label", "published_at", "is_active")
    inlines = [QuestionSectionInline]


@admin.register(Question)
class QuestionAdmin(ReadOnlyAdmin):
    list_display = ("qid", "version", "section", "evidence_required", "allowed_answers", "file_types", "max_files")
    list_filter = ("version",)
    list_select_related = ("version", "section")
    search_fields = ("qid", "text")


# ---- Cases ---------------------------------------------------------------------------------------

class AnswerInline(ReadOnlyInline):
    model = AnswerValue
    fields = ("qid", "value", "updated_at")


class EvidenceInline(ReadOnlyInline):
    model = EvidenceFile
    # The stored file itself is not linked: it is served only through the app, to people allowed it.
    fields = ("qid", "doc_type", "role", "original_name", "size_bytes", "uploaded_at", "superseded_at")


class SubmissionInline(ReadOnlyInline):
    model = Submission
    fields = ("attempt_no", "status", "outcome", "submitted_at", "completed_at")
    show_change_link = True


@admin.register(Assessment)
class AssessmentAdmin(ReadOnlyAdmin):
    list_display = ("public_id", "applicant_name", "applicant", "department", "stage", "initiated_on", "submitted_at", "decided_at")
    list_filter = ("stage", "department")
    list_select_related = ("applicant", "department")
    search_fields = ("public_id", "applicant_name", "parent_reference", "applicant__email")
    ordering = ("-updated_at",)
    inlines = [AnswerInline, EvidenceInline, SubmissionInline]


@admin.register(ApplicantProfile)
class ApplicantProfileAdmin(ReadOnlyAdmin):
    # The national ID number is left out on purpose: it is encrypted at rest and never displayed here.
    fields = ("assessment", "date_of_birth", "nationality", "town", "phone", "updated_at")
    list_display = ("assessment", "nationality", "town", "updated_at")
    list_select_related = ("assessment",)
    search_fields = ("assessment__public_id",)


@admin.register(EvidenceFile)
class EvidenceFileAdmin(ReadOnlyAdmin):
    fields = (
        "public_id", "assessment", "qid", "option_code", "doc_type", "role", "description", "original_name",
        "content_type", "size_bytes", "sha256", "uploaded_by", "uploaded_at", "superseded_at",
    )
    list_display = ("original_name", "assessment", "qid", "doc_type", "role", "size_bytes", "uploaded_at", "superseded_at")
    list_filter = ("doc_type", "role")
    list_select_related = ("assessment",)
    search_fields = ("assessment__public_id", "original_name", "qid")


class QuestionResultInline(ReadOnlyInline):
    model = QuestionResult
    fields = ("qid", "status", "verdict", "confidence")


class RulingInline(ReadOnlyInline):
    model = Ruling
    fields = ("qid", "verdict", "comment", "reviewer", "created_at")


@admin.register(Submission)
class SubmissionAdmin(ReadOnlyAdmin):
    list_display = ("assessment", "attempt_no", "status", "outcome", "submitted_at", "completed_at")
    list_filter = ("status", "outcome")
    list_select_related = ("assessment",)
    search_fields = ("assessment__public_id", "engine_request_id")
    exclude = ("payload",)
    readonly_fields = ("payload_document",)
    inlines = [QuestionResultInline, RulingInline]

    @admin.display(description="Sent to the engine")
    def payload_document(self, obj):
        return pretty_json(obj.payload)


@admin.register(SubmissionDocument)
class SubmissionDocumentAdmin(ReadOnlyAdmin):
    list_display = ("submission",)
    list_select_related = ("submission__assessment",)
    search_fields = ("submission__assessment__public_id",)
    fields = ("submission", "authentication_document", "score_document", "assessment_document")
    readonly_fields = fields

    @admin.display(description="Authentication report")
    def authentication_document(self, obj):
        return pretty_json(obj.authentication)

    @admin.display(description="Score")
    def score_document(self, obj):
        return pretty_json(obj.score)

    @admin.display(description="Written assessment")
    def assessment_document(self, obj):
        return pretty_json(obj.assessment)


@admin.register(Score)
class ScoreAdmin(ReadOnlyAdmin):
    list_display = ("submission", "source", "risk_score", "band", "knock_out", "recommendation", "created_at")
    list_filter = ("band", "source", "knock_out")
    list_select_related = ("submission__assessment",)
    exclude = ("lines",)
    readonly_fields = ("lines_document",)

    @admin.display(description="Lines")
    def lines_document(self, obj):
        return pretty_json(obj.lines)


@admin.register(Decision)
class DecisionAdmin(ReadOnlyAdmin):
    list_display = ("assessment", "verdict", "reviewer", "decided_at")
    list_filter = ("verdict",)
    list_select_related = ("assessment", "reviewer")
    search_fields = ("assessment__public_id",)


# ---- Audit trail ---------------------------------------------------------------------------------

@admin.register(AuditEvent)
class AuditEventAdmin(ReadOnlyAdmin):
    list_display = ("occurred_at", "actor", "action", "assessment_ref", "target_type", "target_id")
    list_filter = ("action",)
    list_select_related = ("actor",)
    search_fields = ("assessment_ref", "actor__email", "action")
    date_hierarchy = "occurred_at"
    ordering = ("-occurred_at",)
    exclude = ("metadata",)
    readonly_fields = ("metadata_document",)

    @admin.display(description="Details")
    def metadata_document(self, obj):
        return pretty_json(obj.metadata)
