import datetime
from collections.abc import Iterable

from django.conf import settings
from django.contrib.auth import SESSION_KEY
from django.contrib.sessions.backends import db
from django.contrib.sessions.models import Session
from django.utils import timezone

from .models import User


# How often a session in use is renewed (moved to a full SESSION_COOKIE_AGE from now). Renewing on
# every request would write the session row on every poll; this way it is written at most once in
# this long, and a session still ends SESSION_COOKIE_AGE after its last use, give or take this.
RENEW_AFTER = datetime.timedelta(minutes=5)


class SessionStore(db.SessionStore):
    """The database session store (SESSION_ENGINE), remembering when the loaded session expires so
    SessionRenewalMiddleware can tell whether it is due to be renewed. Sessions are stored exactly
    as before."""

    expires_at: datetime.datetime | None = None

    def _get_session_from_db(self):
        s = super()._get_session_from_db()
        self.expires_at = s.expire_date if s else None
        return s


class SessionRenewalMiddleware:
    """Keeps a session alive while it is used: when a request uses a session that last renewed
    more than RENEW_AFTER ago, the session is saved, which moves its expiry (and the cookie's) to a
    full SESSION_COOKIE_AGE from now. Listed after SessionMiddleware, so it runs before that saves."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        session = getattr(request, "session", None)
        expires_at = getattr(session, "expires_at", None)
        if session is None or expires_at is None or session.modified or not session.accessed or session.is_empty():
            return response
        renewed_at = expires_at - datetime.timedelta(seconds=settings.SESSION_COOKIE_AGE)
        if timezone.now() - renewed_at >= RENEW_AFTER:
            session.modified = True
        return response


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
