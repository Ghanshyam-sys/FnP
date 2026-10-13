from django.conf import settings
from django.contrib.auth import login, logout
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_protect, ensure_csrf_cookie
from rest_framework import serializers, status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .. import audit
from ..models import Role, User

# DEVELOPMENT SIGN-IN. Mirrors the demo's rule: any email signs in as that applicant, and the
# username "admin" signs in as the reviewer, with no password. It answers only where
# settings.DEV_SIGN_IN is on (by default, where DEBUG is). Replace this view (only this view) with
# real authentication before the app holds real data; every other endpoint already checks the
# signed-in user's role and ownership.
REVIEWER_USERNAME = "admin"


class SignInSerializer(serializers.Serializer):
    email = serializers.CharField(max_length=254, trim_whitespace=True)

    def validate_email(self, value: str) -> str:
        value = value.lower()
        if value == REVIEWER_USERNAME:
            return value
        serializers.EmailField().run_validation(value)
        return value


def _user_payload(user: User) -> dict:
    return {"email": user.email, "role": user.role}


@method_decorator(ensure_csrf_cookie, name="dispatch")
class SessionView(APIView):
    """GET reports who is signed in (and sets the CSRF cookie the frontend sends back on every
    change). POST signs in, DELETE signs out."""

    permission_classes = [AllowAny]
    throttle_scope = "session"

    def get_throttles(self):
        # Only sign-in attempts are rate limited; reading the session is not.
        return super().get_throttles() if self.request.method == "POST" else []

    def get(self, request):
        user = request.user if request.user.is_authenticated else None
        return Response({"user": _user_payload(user) if user else None})

    @method_decorator(csrf_protect)
    def post(self, request):
        if not settings.DEV_SIGN_IN:
            # Without it there is no way in yet: real authentication replaces this view.
            return Response(
                {"detail": "Sign-in is not available on this server yet."}, status=status.HTTP_403_FORBIDDEN
            )
        data = SignInSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        email = data.validated_data["email"]
        # A new email becomes an applicant. An existing account signs in with the role it has, which
        # an administrator may have changed at /admin/ (applicant to reviewer or back); "admin" is
        # always the reviewer.
        role = Role.REVIEWER if email == REVIEWER_USERNAME else Role.APPLICANT
        user = User.objects.get_or_create_for_email(email, role)
        refused = not user.is_active or (
            user.role != Role.REVIEWER if email == REVIEWER_USERNAME
            # Staff accounts sign in to the admin site with their password, never here without one.
            else user.is_staff
        )
        if refused:
            return Response({"detail": "This account cannot sign in."}, status=status.HTTP_403_FORBIDDEN)
        # Rotates the session key, so a session id planted before sign-in is worthless after it.
        login(request, user, backend="django.contrib.auth.backends.ModelBackend")
        audit.record(user, "session.sign_in")
        return Response({"user": _user_payload(user)})

    def delete(self, request):
        if request.user.is_authenticated:
            audit.record(request.user, "session.sign_out")
        logout(request)
        return Response(status=status.HTTP_204_NO_CONTENT)
