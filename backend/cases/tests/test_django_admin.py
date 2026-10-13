"""Django's admin site at /admin/: staff only, case records read-only, ID numbers never shown."""

import pytest
from django.test import Client
from django.urls import reverse

from cases.models import ApplicantProfile, AuditEvent, Role, Stage, User
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
    assert browser.post(url, {"is_active": ""}).status_code == 302
    anna.refresh_from_db()
    assert anna.is_active is False
    event = AuditEvent.objects.get(action="user.deactivate")
    assert event.actor == staff and event.target_id == str(anna.pk)
    # Nothing else about the account can be changed there, and staff cannot lock themselves out.
    assert anna.email == "anna@example.na" and anna.role == Role.APPLICANT
    own = browser.get(reverse("admin:cases_user_change", args=[staff.pk])).content.decode()
    assert 'name="is_active"' not in own
