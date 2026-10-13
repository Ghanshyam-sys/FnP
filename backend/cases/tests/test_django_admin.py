"""Django's admin site at /admin/: staff only, case records read-only, ID numbers never shown."""

import pytest
from django.test import Client
from django.urls import reverse
from rest_framework.test import APIClient

from cases.models import ApplicantProfile, Assessment, AuditEvent, Role, Stage, User
from cases.tests import factories as make

pytestmark = pytest.mark.django_db


@pytest.fixture
def staff():
    return User.objects.create_superuser("ops@example.na", "a long test password")


@pytest.fixture
def browser(staff):
    client = Client()
    assert client.login(username="ops@example.na", password="a long test password")
    return client


@pytest.fixture
def case():
    assessment = make.assessment(applicant=make.user("anna@example.na"), stage=Stage.NOT_SUBMITTED)
    ApplicantProfile.objects.create(assessment=assessment, national_id_number="72012700462", town="Windhoek")
    return assessment


def test_a_staff_account_is_a_reviewer_with_a_password(staff):
    assert staff.role == Role.REVIEWER and staff.is_staff and staff.has_usable_password()
    assert staff.has_perm("cases.view_assessment") and staff.has_module_perms("cases")
    assert not make.user("someone@example.na").has_module_perms("cases")


def test_the_admin_pages_may_load_their_own_assets_and_the_api_still_allows_nothing():
    admin_csp = Client().get("/admin/login/")["Content-Security-Policy"]
    assert "default-src 'self'" in admin_csp and "frame-ancestors 'none'" in admin_csp
    assert "default-src 'none'" in Client().get("/api/session")["Content-Security-Policy"]


def test_only_staff_get_in(case):
    # Signed out, and signed in without staff rights (the app's own reviewer), both go to the login.
    assert Client().get("/admin/").status_code == 302
    reviewer = Client()
    reviewer.force_login(make.reviewer())
    assert reviewer.get("/admin/cases/assessment/").status_code == 302


def test_every_list_page_opens_for_staff_and_none_offers_to_add(browser, case):
    from django.contrib import admin
    from django.contrib.auth.models import Group

    assert Group not in admin.site._registry
    for model in admin.site._registry:
        url = reverse(f"admin:{model._meta.app_label}_{model._meta.model_name}_changelist")
        page = browser.get(url)
        assert page.status_code == 200, url
        assert "addlink" not in page.content.decode(), url


def test_case_records_are_read_only(browser, case):
    page = browser.get(reverse("admin:cases_assessment_change", args=[case.pk]))
    assert page.status_code == 200
    content = page.content.decode()
    assert 'name="_save"' not in content and "Delete" not in content
    assert browser.get(reverse("admin:cases_assessment_add")).status_code == 403
    assert browser.post(reverse("admin:cases_assessment_delete", args=[case.pk]), {"post": "yes"}).status_code == 403


def test_the_national_id_number_is_never_shown(browser, case):
    profile = browser.get(reverse("admin:cases_applicantprofile_change", args=[case.pk])).content.decode()
    assert "Windhoek" in profile and "72012700462" not in profile


def test_a_user_can_be_deactivated_and_it_is_audited(browser, staff):
    anna = make.user("anna@example.na")
    url = reverse("admin:cases_user_change", args=[anna.pk])
    assert browser.post(url, {"role": "applicant", "is_active": ""}).status_code == 302
    anna.refresh_from_db()
    assert anna.is_active is False
    event = AuditEvent.objects.get(action="user.deactivate")
    assert event.actor == staff and event.target_id == str(anna.pk)
    # Nothing else about the account changed, and staff cannot lock themselves out.
    assert anna.email == "anna@example.na" and anna.role == Role.APPLICANT
    own = browser.get(reverse("admin:cases_user_change", args=[staff.pk])).content.decode()
    assert 'name="is_active"' not in own


# ---- Roles: an administrator gives or removes reviewer access ----------------------------------

def _app_sign_in(email: str):
    client = APIClient(enforce_csrf_checks=True)
    client.get("/api/session")
    return client.post("/api/session", {"email": email}, format="json",
                       HTTP_X_CSRFTOKEN=client.cookies["csrftoken"].value)


def test_a_user_can_be_made_a_reviewer_and_back_and_it_is_audited(browser, staff):
    anna = make.user("anna@example.na")
    signed_in = APIClient()
    signed_in.force_login(anna)
    url = reverse("admin:cases_user_change", args=[anna.pk])

    assert browser.post(url, {"role": "reviewer", "is_active": "on"}).status_code == 302
    anna.refresh_from_db()
    assert anna.role == Role.REVIEWER and anna.is_active and not anna.is_staff
    event = AuditEvent.objects.get(action="user.role_change")
    assert event.actor == staff and event.target_id == str(anna.pk)
    assert event.metadata == {"from": "applicant", "to": "reviewer"}
    # Their open session ended, so the app is not left running for the old role.
    assert signed_in.get("/api/session").json() == {"user": None}
    assert _app_sign_in("anna@example.na").json()["user"] == {"email": "anna@example.na", "role": "reviewer"}

    assert browser.post(url, {"role": "applicant", "is_active": "on"}).status_code == 302
    anna.refresh_from_db()
    assert anna.role == Role.APPLICANT
    assert _app_sign_in("anna@example.na").json()["user"] == {"email": "anna@example.na", "role": "applicant"}


def test_some_accounts_keep_their_role(browser, staff):
    admin_account = make.reviewer()
    for account in (staff, admin_account):
        page = browser.get(reverse("admin:cases_user_change", args=[account.pk])).content.decode()
        assert 'name="role"' not in page
    editable = browser.get(reverse("admin:cases_user_change", args=[make.user("anna@example.na").pk])).content.decode()
    assert 'name="role"' in editable


def test_roles_can_be_changed_for_several_users_at_once(browser, staff):
    anna, ben = make.user("anna@example.na"), make.user("ben@example.na")
    admin_account = make.reviewer()
    changelist = reverse("admin:cases_user_changelist")
    picked = [anna.pk, ben.pk, admin_account.pk, staff.pk]

    browser.post(changelist, {"action": "make_reviewer", "_selected_action": picked})
    assert set(User.objects.filter(role=Role.REVIEWER).values_list("email", flat=True)) == {
        "anna@example.na", "ben@example.na", "admin", "ops@example.na"}
    assert AuditEvent.objects.filter(action="user.role_change").count() == 2

    browser.post(changelist, {"action": "make_applicant", "_selected_action": picked})
    anna.refresh_from_db(); ben.refresh_from_db(); admin_account.refresh_from_db(); staff.refresh_from_db()
    assert anna.role == ben.role == Role.APPLICANT
    # The built-in reviewer and the staff account were skipped.
    assert admin_account.role == staff.role == Role.REVIEWER
    assert AuditEvent.objects.filter(action="user.role_change").count() == 4


def test_a_staff_account_cannot_use_the_apps_passwordless_sign_in(staff):
    assert _app_sign_in("ops@example.na").status_code == 403


def test_a_reviewer_cannot_rule_on_or_decide_their_own_application():
    anna = make.user("anna@example.na", Role.REVIEWER)
    own = make.assessment(applicant=anna, stage=Stage.DECISION_PENDING)
    client = APIClient()
    client.force_login(anna)
    decided = client.post(f"/api/assessments/{own.public_id}/decision", {"verdict": "accepted", "remarks": "Fine."})
    assert decided.status_code == 403 and "your own application" in decided.json()["detail"]
    assert client.put(f"/api/assessments/{own.public_id}/rulings/Q1",
                      {"verdict": "accepted", "comment": "ok"}).status_code == 403
    own.refresh_from_db()
    assert own.stage == Stage.DECISION_PENDING



def test_an_applicant_with_applications_to_finish_is_not_made_a_reviewer(browser, staff):
    anna = make.user("anna@example.na")
    make.assessment(applicant=anna, stage=Stage.NOT_SUBMITTED)
    page = browser.post(reverse("admin:cases_user_change", args=[anna.pk]), {"role": "reviewer", "is_active": "on"})
    assert page.status_code == 200 and "FNP-2026-0001" in page.content.decode()
    anna.refresh_from_db()
    assert anna.role == Role.APPLICANT

    browser.post(reverse("admin:cases_user_changelist"), {"action": "make_reviewer", "_selected_action": [anna.pk]})
    anna.refresh_from_db()
    assert anna.role == Role.APPLICANT and not AuditEvent.objects.filter(action="user.role_change").exists()

    # Once nothing waits on them (submitted, say), they can be.
    Assessment.objects.filter(applicant=anna).update(stage=Stage.REVIEW_PENDING)
    assert browser.post(reverse("admin:cases_user_change", args=[anna.pk]), {"role": "reviewer", "is_active": "on"}).status_code == 302
    anna.refresh_from_db()
    assert anna.role == Role.REVIEWER


def test_the_assessment_says_whether_it_is_the_viewers_own():
    anna = make.user("anna@example.na", Role.REVIEWER)
    own = make.assessment(applicant=anna, stage=Stage.DECISION_PENDING)
    other = make.assessment(public_id="FNP-2026-0002", reference="BL-2026-0002", stage=Stage.DECISION_PENDING)
    client = APIClient()
    client.force_login(anna)
    assert client.get(f"/api/assessments/{own.public_id}").json()["ownApplication"] is True
    assert client.get(f"/api/assessments/{other.public_id}").json()["ownApplication"] is False
