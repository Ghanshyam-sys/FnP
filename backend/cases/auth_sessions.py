from django.contrib.auth import SESSION_KEY
from django.contrib.sessions.models import Session
from django.utils import timezone

from .models import User


def end_sessions(user: User) -> int:
    """Signs the user out of every browser they are signed in on, so a change to their account
    (such as their role) applies from their next sign-in. Sessions are stored in the database and
    hold the user's id only inside their encoded data, so each unexpired one is read: fine at this
    scale, and only done when an administrator changes an account."""
    ended = [
        s.pk
        for s in Session.objects.filter(expire_date__gt=timezone.now()).iterator()
        if s.get_decoded().get(SESSION_KEY) == str(user.pk)
    ]
    Session.objects.filter(pk__in=ended).delete()
    return len(ended)
