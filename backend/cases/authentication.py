from rest_framework.authentication import SessionAuthentication as DrfSessionAuthentication


class SessionAuthentication(DrfSessionAuthentication):
    """Django's session sign-in. A request with no signed-in session is answered 401 rather than
    DRF's default 403, so the frontend can tell a session that ended from an action not allowed."""

    def authenticate_header(self, request):
        return "Session"
