from functools import cache

from cryptography.fernet import Fernet, MultiFernet
from django.conf import settings
from django.db import models


@cache
def _fernet() -> MultiFernet:
    """FIELD_ENCRYPTION_KEY may list several keys, comma-separated: new values are encrypted with
    the first, and stored values are read with whichever key they were written with. To rotate,
    put the new key first and keep the old one listed until every value has been rewritten."""
    keys = [k.strip() for k in settings.FIELD_ENCRYPTION_KEY.split(",") if k.strip()]
    return MultiFernet([Fernet(k.encode()) for k in keys])


class EncryptedTextField(models.TextField):
    """Text encrypted with Fernet (AES-128-CBC + HMAC) before it reaches the database, for
    personal identifiers. The column holds ciphertext only, so it cannot be searched or indexed,
    and a database dump alone does not expose the values. Empty values are stored as empty."""

    def get_prep_value(self, value):
        value = super().get_prep_value(value)
        if not value:
            return value
        return _fernet().encrypt(value.encode()).decode()

    def from_db_value(self, value, expression, connection):
        if not value:
            return value
        return _fernet().decrypt(value.encode()).decode()
