"""Input rules shared by the views. The frontend applies the same rules for instant feedback
(domain/newAssessment.ts); these are the ones that count."""

import datetime
import zipfile

from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.utils import timezone



def today() -> datetime.date:
    return timezone.localdate()


# ---- Opening an assessment --------------------------------------------------------------------

def applicant_email(value: str) -> str:
    value = value.strip().lower()
    try:
        validate_email(value)
    except ValidationError:
        raise ValidationError("Enter a valid email address.") from None
    return value


def initiated_on(value: datetime.date) -> datetime.date:
    if value > today():
        raise ValidationError("Initiated on cannot be in the future.")
    return value


# ---- Uploaded files ---------------------------------------------------------------------------

# Everything the engine reads (its /authentication/verify documentation), keyed by extension,
# with the content type served back and how to recognise the real thing from its first bytes.
_OOXML = {"docx": "word/", "xlsx": "xl/", "xlsm": "xl/"}
FILE_TYPES: dict[str, str] = {
    "pdf": "application/pdf",
    "png": "image/png",
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "tif": "image/tiff",
    "tiff": "image/tiff",
    "bmp": "image/bmp",
    "heic": "image/heic",
    "heif": "image/heif",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "xlsm": "application/vnd.ms-excel.sheet.macroEnabled.12",
    "csv": "text/csv",
    "txt": "text/plain",
}
# The reviewer's configured formats name "jpg"; a .jpeg file is the same format.
_SAME_FORMAT = {"jpeg": "jpg", "tiff": "tif", "heif": "heic"}


def extension(name: str) -> str:
    """A file name's extension, lower-cased ("" when it has none)."""
    return name.rsplit(".", 1)[-1].lower() if "." in name else ""


def format_allowed(name: str, allowed: list[str]) -> bool:
    """Whether a file of this name is in one of the allowed formats (.jpeg counts as jpg, and so on)."""
    ext = extension(name)
    return ext in FILE_TYPES and _SAME_FORMAT.get(ext, ext) in {_SAME_FORMAT.get(a, a) for a in allowed}


def _looks_like(ext: str, head: bytes, upload) -> bool:
    if ext == "pdf":
        return head.startswith(b"%PDF-")
    if ext == "png":
        return head.startswith(b"\x89PNG\r\n\x1a\n")
    if ext in {"jpg", "jpeg"}:
        return head.startswith(b"\xff\xd8\xff")
    if ext in {"tif", "tiff"}:
        return head[:4] in {b"II*\x00", b"MM\x00*"}
    if ext == "bmp":
        return head.startswith(b"BM")
    if ext in {"heic", "heif"}:
        return head[4:8] == b"ftyp" and head[8:12] in {b"heic", b"heix", b"mif1", b"msf1", b"heim", b"heis"}
    if ext in _OOXML:
        if not head.startswith(b"PK\x03\x04"):
            return False
        upload.seek(0)
        try:
            # Reads the zip directory only; nothing is decompressed.
            names = zipfile.ZipFile(upload).namelist()
        except (zipfile.BadZipFile, NotImplementedError, UnicodeDecodeError, ValueError, OSError, EOFError):
            # Damaged or unsupported zip structures are simply not a valid document.
            return False
        return "[Content_Types].xml" in names and any(n.startswith(_OOXML[ext]) for n in names)
    if ext in {"csv", "txt"}:
        if b"\x00" in head:
            return False
        try:
            head.decode("utf-8")
        except UnicodeDecodeError as exc:  # a multi-byte character cut at the sample's end is fine
            return exc.start >= len(head) - 3
        return True
    return False


def formats_refused(allowed: list[str], accepts: str = "This question accepts") -> str:
    """The refusal for a file in a format not allowed: "This question accepts PDF, PNG files." (the
    frontend's fileProblem words it the same way)."""
    return f"{accepts} {', '.join(a.upper() for a in allowed)} files."


def evidence_file(upload, allowed: list[str], max_bytes: int, accepts: str = "This question accepts") -> tuple[str, str]:
    """Checks one uploaded file against the question's allowed formats, the size limit and its
    actual contents. Returns (extension, content type to serve it back with). `accepts` begins the
    message for a refused format ("Upload" where the formats are not one question's)."""
    name = upload.name or ""
    ext = extension(name)
    if not format_allowed(name, allowed):
        raise ValidationError(formats_refused(allowed, accepts))
    if upload.size > max_bytes:
        raise ValidationError(f"Files must be {max_bytes // (1024 * 1024)} MB or smaller.")
    if upload.size == 0:
        raise ValidationError("The file is empty.")
    upload.seek(0)
    head = upload.read(4096)
    if not _looks_like(ext, head, upload):
        raise ValidationError(f"The file's contents are not a valid {ext.upper()} file.")
    upload.seek(0)
    return ext, FILE_TYPES[ext]
