"""Minimal builders for tests: just enough rows to satisfy the schema's constraints. The reference
data (departments, questionnaire v1) comes from migration 0003, as in every real database."""

import datetime

from cases.models import Assessment, Department, QuestionnaireVersion, Role, User


def user(email: str = "a.applicant@example.na", role: str = Role.APPLICANT) -> User:
    return User.objects.get_or_create_for_email(email, role)


def reviewer() -> User:
    return user("admin", Role.REVIEWER)


def assessment(
    applicant: User | None = None,
    public_id: str = "FNP-2026-0001",
    reference: str = "BL-2026-0001",
    created_by: User | None = None,
    **fields,
) -> Assessment:
    return Assessment.objects.create(
        public_id=public_id,
        applicant=applicant or user(),
        applicant_name="Anna M. Nghipandulwa",
        department=Department.objects.get(key="banking"),
        entity="Namib Trust Bank Limited",
        position="Non-Executive Director",
        parent_reference=reference,
        initiated_on=datetime.date(2026, 10, 1),
        version=QuestionnaireVersion.objects.get(is_active=True),
        created_by=created_by,
        **fields,
    )
