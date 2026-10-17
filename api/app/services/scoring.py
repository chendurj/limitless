"""Compatibility filter and score for one place and one traveler.

The database decides access: this module, not the LLM, excludes places. The LLM only
picks from the places that pass and explains them with the fact_ids recorded here.

Unknown data:
- A rule is only applied to a known value.
- If a critical value is unknown, or its only "yes" is INFERRED, the place is not
  excluded. It gets a 0.2 penalty and a "Not verified: call ahead" warning.
"""

from dataclasses import dataclass, field
from datetime import date

from app.models.dna import AccessibilityDNA
from app.services.facts import Fact, is_negative, resolve
from app.services.rules import (
    FEATURE_ASK,
    FEATURE_ATTRS,
    FEATURE_CATEGORIES,
    FEATURE_MISS,
    RULES,
    Ctx,
    Effect,
    Place,
    cite,
    must_have_check,
)

UNKNOWN_PENALTY = 0.2
MIN_ACCESS_FIT = 0.4
NICE_TO_HAVE_BONUS = 0.05
MAX_BONUS = 0.3


@dataclass
class Evaluation:
    place_id: str
    excluded: bool
    reasons: list[str]  # why the place is excluded; shown in "Places we skipped"
    access_fit: float  # 1 minus penalties; below MIN_ACCESS_FIT the place is excluded
    bonus: float  # cited extras (captions, beach wheelchair...); raises the rank only
    interest: float
    feedback_signal: float
    score: float
    warnings: list[str]
    highlights: list[str]  # positive, cited facts
    fact_ids: list[int]  # the facts this decision depends on
    unknown_critical: list[str] = field(default_factory=list)  # attributes to confirm by phone


_STRENGTH = {"HARD": 3, "SOFT": 2, "NOTE": 1, "BONUS": 0}


def _stronger(a: Effect, b: Effect) -> bool:
    return (_STRENGTH[a.kind], a.weight) > (_STRENGTH[b.kind], b.weight)


def _applies(categories: frozenset[str] | None, place: Place) -> bool:
    return categories is None or place.category in categories


def evaluate(
    place: Place,
    facts: list[Fact],
    dna: AccessibilityDNA,
    feedback_signal: float = 0.0,
    today: date | None = None,
) -> Evaluation:
    effective = resolve(facts, today)
    ctx = Ctx(dna, place, effective)
    effects: dict[str, tuple[Effect, Fact]] = {}  # strongest effect per attribute
    unknown: dict[str, str] = {}  # attribute -> warning
    used: set[int] = set()

    def add(effect: Effect | None, fact: Fact) -> None:
        if effect is None:
            return
        used.add(fact.id)
        current = effects.get(fact.attribute)
        if current is None or _stronger(effect, current[0]):
            effects[fact.attribute] = (effect, fact)

    def not_verified(attribute: str, ask: str, weak: Fact | None) -> None:
        if attribute in unknown:
            return
        if weak is not None:
            used.add(weak.id)
            unknown[attribute] = f"Not verified: {cite(weak)} Call ahead to confirm {ask}."
        else:
            unknown[attribute] = f"Not verified: call ahead to confirm {ask}."

    for rule in RULES:
        if not rule.when(dna) or not _applies(rule.categories, place):
            continue
        fact = effective.get(rule.attribute)
        if fact is None:
            if rule.critical:
                not_verified(rule.attribute, rule.ask, None)
            continue
        effect = rule.check(fact, ctx)
        add(effect, fact)
        if effect is None and rule.critical and not fact.is_strong and not is_negative(fact):
            not_verified(rule.attribute, rule.ask, fact)

    for feature in dna.requirements.must_have:
        if not _applies(FEATURE_CATEGORIES.get(feature), place):
            continue
        attrs = FEATURE_ATTRS[feature]
        present = [effective[a] for a in attrs if a in effective]
        satisfied = [f for f in present if f.is_strong and f.value not in FEATURE_MISS]
        if satisfied:
            used.update(f.id for f in satisfied)
            continue
        misses = [(e, f) for f in present if (e := must_have_check(f, ctx)) is not None]
        if misses:
            add(*max(misses, key=lambda m: (_STRENGTH[m[0].kind], m[0].weight)))
        else:
            not_verified(attrs[0], FEATURE_ASK[feature], present[0] if present else None)

    for feature in dna.requirements.nice_to_have:
        if not _applies(FEATURE_CATEGORIES.get(feature), place):
            continue
        for attr in FEATURE_ATTRS[feature]:
            fact = effective.get(attr)
            if fact is not None and fact.is_strong and fact.value not in FEATURE_MISS:
                add(Effect("BONUS", NICE_TO_HAVE_BONUS, cite(fact)), fact)
                break

    # A negative fact overrides a "not verified" warning for the same attribute.
    for attr in effects:
        unknown.pop(attr, None)

    hard = [e.reason for e, _ in effects.values() if e.kind == "HARD"]
    soft = [(e, f) for e, f in effects.values() if e.kind == "SOFT"]
    notes = [e.reason for e, _ in effects.values() if e.kind == "NOTE"]
    bonuses = [(e, f) for e, f in effects.values() if e.kind == "BONUS"]

    access_fit = 1 - sum(e.weight * f.weight for e, f in soft) - UNKNOWN_PENALTY * len(unknown)
    access_fit = round(min(max(access_fit, 0.0), 1.0), 3)
    # Bonuses are kept apart from access_fit. If they were added and clamped at 1, a place
    # with no problems could not gain from captions or a beach wheelchair.
    bonus = round(min(sum(e.weight for e, _ in bonuses), MAX_BONUS), 3)

    reasons = list(hard)
    if not hard and access_fit < MIN_ACCESS_FIT:
        reasons.append("Multiple comfort issues: " + " ".join(e.reason for e, _ in soft))

    interest = _interest(place, dna)
    quality = (place.rating - 1) / 4 if place.rating else 0.5
    score = (
        0.45 * interest
        + 0.35 * access_fit
        + 0.35 * bonus
        + 0.10 * (feedback_signal + 1) / 2
        + 0.10 * quality
    )

    return Evaluation(
        place_id=place.id,
        excluded=bool(reasons),
        reasons=reasons,
        access_fit=access_fit,
        bonus=bonus,
        interest=interest,
        feedback_signal=feedback_signal,
        score=round(score, 3),
        warnings=[e.reason for e, _ in soft] + notes + list(unknown.values()),
        highlights=[e.reason for e, _ in bonuses],
        fact_ids=sorted(used),
        unknown_critical=list(unknown),
    )


def _interest(place: Place, dna: AccessibilityDNA) -> float:
    prefs = dna.preferences
    if not prefs.interests and not prefs.cuisines:
        return 0.5
    if set(place.interest_tags) & set(prefs.interests):
        return 1.0
    if set(place.subcategories) & set(prefs.cuisines):
        return 1.0
    return 0.3


def shortlist(
    places: list[Place],
    facts_by_place: dict[str, list[Fact]],
    dna: AccessibilityDNA,
    today: date | None = None,
) -> tuple[list[Evaluation], list[Evaluation]]:
    """Return (kept places by score, highest first; excluded places)."""
    evals = [evaluate(p, facts_by_place.get(p.id, []), dna, today=today) for p in places]
    kept = sorted((e for e in evals if not e.excluded), key=lambda e: e.score, reverse=True)
    return kept, [e for e in evals if e.excluded]
