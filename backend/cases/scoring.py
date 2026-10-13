"""The fit and proper scoring model, for the cases the engine will not score: those whose flags the
reviewer overrode. Ported from the frontend's domain/engine.ts and bands.ts (the published
fnp_scoring_model_15q workbook). Lines use the engine's own field names, so both sources render
the same way."""

from decimal import Decimal

from .models import Answer, Polarity, Question

# Lower bound of each band on the normalised 0-1 scale, with its recommended action.
BANDS = [
    (Decimal("0"), "Low", "Recommend approval"),
    (Decimal("0.1"), "Moderate", "Approve with conditions or monitoring"),
    (Decimal("0.25"), "Elevated", "Refer for supervisory review"),
    (Decimal("0.45"), "High", "Recommend rejection"),
]
KNOCK_OUT_RECOMMENDATION = "Recommend rejection — refer for supervisory review (knock-out triggered)"


def band_for(normalised: Decimal) -> tuple[str, str]:
    band, action = BANDS[0][1:]
    for lower, name, recommendation in BANDS:
        if normalised >= lower:
            band, action = name, recommendation
    return band, action


def score(questions: dict[str, Question], answers: dict[str, str]) -> dict:
    """answers: qid -> Yes/No/N/A as submitted (unanswered counts as No, as on the form)."""
    lines, total_weight, total_risk, knocked_out = [], Decimal(0), Decimal(0), []
    for q in questions.values():
        answer = answers.get(q.qid, Answer.NO)
        applicable = answer != Answer.NA
        # Positive questions carry risk on No (e.g. "holds a relevant qualification"); negative
        # questions on Yes (e.g. "has been convicted").
        risk = applicable and (answer == Answer.NO if q.polarity == Polarity.POSITIVE else answer == Answer.YES)
        applicable_weight = q.weight if applicable else Decimal(0)
        weighted = applicable_weight if risk else Decimal(0)
        triggered = q.is_knockout and risk
        if triggered:
            knocked_out.append(q.qid)
        total_weight += applicable_weight
        total_risk += weighted
        lines.append({
            "qid": q.qid,
            "section": q.section.name,
            "question": q.text,
            "polarity": q.polarity,
            "answer": answer,
            "question_weight": float(q.weight),
            "applicable": int(applicable),
            "risk_flag": int(risk),
            "applicable_weight": float(applicable_weight),
            "weighted_risk": float(weighted),
            "knockout": int(q.is_knockout),
            "knockout_triggered": triggered,
        })

    normalised = total_risk / total_weight if total_weight else Decimal(0)
    band, action = band_for(normalised)
    return {
        "risk_score": (normalised * 100).quantize(Decimal("0.001")),
        "normalised": normalised.quantize(Decimal("0.000001")),
        "band": band,
        "knock_out": bool(knocked_out),
        "recommendation": KNOCK_OUT_RECOMMENDATION if knocked_out else action,
        "lines": lines,
    }
