from .models import AuditEvent, User


def record(
    actor: User | None,
    action: str,
    *,
    assessment_ref: str = "",
    target_type: str = "",
    target_id: str = "",
    metadata: dict | None = None,
) -> None:
    """Appends to the audit trail. Callers pass identifiers and decisions, never personal data
    such as answers, ID numbers or document contents. Call inside the same transaction as the
    change it records, so the trail and the data cannot disagree."""
    AuditEvent.objects.create(
        actor=actor,
        action=action,
        assessment_ref=assessment_ref,
        target_type=target_type,
        target_id=str(target_id),
        metadata=metadata or {},
    )
