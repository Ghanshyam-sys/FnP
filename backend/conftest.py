import json
from pathlib import Path

import pytest
from django.core.cache import cache
from rest_framework.test import APIClient

FIXTURES = Path(__file__).resolve().parent / "engine" / "fixtures"


def engine_fixture(name: str) -> dict:
    """A real response captured from the Data Authentication API."""
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


@pytest.fixture(autouse=True)
def _isolated(settings, tmp_path):
    """Every test gets an empty cache, its own media folder, and no rate limits, can never reach
    the real engine, and writes nothing to the API call log."""
    cache.clear()
    settings.API_LOG = False
    settings.MEDIA_ROOT = tmp_path / "media"
    settings.ENGINE_BASE_URL = "http://engine.invalid"
    settings.REST_FRAMEWORK = {**settings.REST_FRAMEWORK, "DEFAULT_THROTTLE_CLASSES": []}
    yield
    cache.clear()


@pytest.fixture
def engine_options(monkeypatch):
    """The evidence options as the engine serves them."""
    from engine import client

    monkeypatch.setattr(client, "evidence_options", lambda: engine_fixture("evidence-options.json"))


class Api:
    """A signed-in browser: session cookie plus the CSRF header on every change, exactly as the
    frontend sends them."""

    def __init__(self, user):
        self.user = user
        self.client = APIClient(enforce_csrf_checks=True)
        self.client.force_login(user)
        self.client.get("/api/session")
        self.csrf = self.client.cookies["csrftoken"].value

    def get(self, path, **params):
        return self.client.get(path, params)

    def post(self, path, data=None, **kwargs):
        fmt = None if kwargs.pop("multipart", False) else "json"
        return self.client.post(path, data, format=fmt, HTTP_X_CSRFTOKEN=self.csrf)

    def patch(self, path, data):
        return self.client.patch(path, data, format="json", HTTP_X_CSRFTOKEN=self.csrf)

    def put(self, path, data):
        return self.client.put(path, data, format="json", HTTP_X_CSRFTOKEN=self.csrf)

    def delete(self, path):
        return self.client.delete(path, HTTP_X_CSRFTOKEN=self.csrf)


@pytest.fixture
def as_user():
    return Api
