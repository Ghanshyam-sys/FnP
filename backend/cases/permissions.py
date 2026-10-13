from django.http import Http404
from rest_framework.permissions import BasePermission

from .models import Assessment, User


class IsReviewer(BasePermission):
    def has_permission(self, request, view) -> bool:
        return bool(request.user and request.user.is_authenticated and request.user.is_reviewer)


def assessment_for(user: User, public_id: str, *, queryset=None) -> Assessment:
    """The assessment if this user may see it, otherwise 404 — never 403, so an applicant cannot
    learn which assessment ids exist. Reviewers see every assessment; an applicant only their own.
    Every view that takes an assessment id goes through here."""
    qs = queryset if queryset is not None else Assessment.objects.all()
    if not user.is_reviewer:
        qs = qs.filter(applicant=user)
    try:
        return qs.get(public_id=public_id)
    except Assessment.DoesNotExist:
        raise Http404 from None
