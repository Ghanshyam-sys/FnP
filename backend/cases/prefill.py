"""Application details already on record for known applicants: what "Start a new application" is
filled in with for them. For now these are the five demo applicants (data/demo_assessments.json,
the same records seed_demo loads); anyone else starts from an empty form, as before."""

import json
from functools import lru_cache
from pathlib import Path

RECORDS = Path(__file__).resolve().parent / "data" / "demo_assessments.json"


@lru_cache(maxsize=1)
def _records() -> dict[str, dict]:
    """email -> the five details, read once."""
    rows = json.loads(RECORDS.read_text(encoding="utf-8"))
    return {
        row["email"].strip().lower(): {
            "applicantName": row["applicantName"],
            "department": row["departmentKey"],
            "entity": row["entity"],
            "position": row["position"],
            "reference": row["reference"],
        }
        for row in rows
    }


def details_for(email: str) -> dict | None:
    """The details on record for this sign-in email (a copy), or None for anyone else."""
    found = _records().get(email.strip().lower())
    return dict(found) if found else None
