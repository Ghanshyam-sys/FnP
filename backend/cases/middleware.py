from django.conf import settings
from django.http import JsonResponse
from django.utils.csp import CSP

# Room for the multipart framing and the form fields around an uploaded file.
_FORM_OVERHEAD_BYTES = 64 * 1024


class RequestSizeLimitMiddleware:
    """Refuses a request whose declared body is larger than any upload may be, before anything
    reads it. Django otherwise streams the whole body to disk (the CSRF check alone reads it), and
    its own limits do not cover uploaded files. A reverse proxy should enforce the same limit for
    bodies sent without a length."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        try:
            declared = int(request.META.get("CONTENT_LENGTH") or 0)
        except ValueError:
            declared = 0
        if declared > settings.EVIDENCE_MAX_BYTES + _FORM_OVERHEAD_BYTES:
            limit = settings.EVIDENCE_MAX_BYTES // (1024 * 1024)
            return JsonResponse({"file": [f"Files must be {limit} MB or smaller."]}, status=413)
        return self.get_response(request)


# The admin site's own stylesheets, scripts and icons: everything from this origin, still never
# framed. Every other response keeps SECURE_CSP, which allows nothing (the API returns only JSON).
_ADMIN_CSP = {
    "default-src": [CSP.SELF],
    "img-src": [CSP.SELF, "data:"],
    "frame-ancestors": [CSP.NONE],
    "base-uri": [CSP.NONE],
    "form-action": [CSP.SELF],
}


class AdminCspMiddleware:
    """Gives the admin site's pages a policy that lets them load their own assets. It sets the
    same response attribute Django's csp_override decorator does, which the CSP middleware above
    it reads; listed after that middleware, it runs first on the way back."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        if request.path.startswith("/admin/"):
            response._csp_config = _ADMIN_CSP
        return response
