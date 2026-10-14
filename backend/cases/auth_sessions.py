from collections.abc import Iterable

from django.contrib.auth import SESSION_KEY
from django.contrib.sessions.models import Session
from django.utils import timezone

from .models import User


def end_sessions(users: Iterable[User]) -> int:
    """Signs these users out of every browser they are signed in on, so a change to their accounts
    (such as their role) applies from their next sign-in. Sessions are stored in the database and
    hold the user's id only inside their encoded data, so each unexpired one is read: once, however
    many users, and only when an administrator changes accounts."""
    ids = {str(u.pk) for u in users}
    if not ids:
        return 0
    ended = [
        s.pk
        for s in Session.objects.filter(expire_date__gt=timezone.now()).iterator()
        if s.get_decoded().get(SESSION_KEY) in ids
    ]
    Session.objects.filter(pk__in=ended).delete()
    return len(ended)
