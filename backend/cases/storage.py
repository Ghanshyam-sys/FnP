"""Removing stored documents. Every deletion goes through here, so no folder is left behind."""

import os
from pathlib import PurePosixPath

from django.core.files.storage import default_storage


def delete_files(names: list[str]) -> None:
    """Deletes stored documents, then any folder they leave empty (an assessment's folder once its
    last document is gone). Storage without real folders, such as cloud object storage, has
    nothing to tidy."""
    folders = set()
    for name in names:
        default_storage.delete(name)
        folders.add(str(PurePosixPath(name).parent))
    for folder in folders:
        try:
            os.rmdir(default_storage.path(folder))  # only ever removes an empty folder
        except NotImplementedError:
            return  # not a local file system
        except OSError:
            pass  # still holds other documents, or already gone
