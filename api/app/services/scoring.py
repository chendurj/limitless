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
from app.services.facts import Fact, agreed_trust, decayed, is_negative, resolve, trust
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

# Display score: how much each kind of check counts. A must-have counts most.
WEIGHT_MUST_HAVE, WEIGHT_CRITICAL, WEIGHT_RULE, WEIGHT_NICE = 4.0, 3.0, 1.0, 1.0
UNKNOWN_QUALITY, UNKNOWN_MUST_HAVE_QUALITY = 0.6, 0.45
# Extras: a "yes" helps, but an unknown is not a problem. They count half and start higher.
EXTRAS = {
    "assistive_listening", "audio_description", "braille_tactile", "guide_dog_relief",
    "sighted_guide_on_request", "online_booking", "text_contact", "kiosk_or_app_ordering",
    "written_notes_ok",
}  # fmt: skip
WEIGHT_EXTRA, UNKNOWN_EXTRA_QUALITY = 0.5, 0.75
# General comfort for travelers with mobility needs. No rule reads these, but they help.
COMFORT = ("restroom_accessible", "parking_accessible", "crowd_level", "elevator", "dropoff_zone")
WEIGHT_COMFORT = 0.5
# How good each value is, when no rule found a problem. Better values score higher.
VALUE_QUALITY = {
    "max_slope": {"flat": 1.0, "gentle": 0.85, "moderate": 0.55, "steep": 0.2},
    "terrain": {"smooth": 1.0, "mixed": 0.7, "uneven": 0.45, "sand": 0.3},
    "seating": {"plenty": 1.0, "some": 0.7, "none": 0.2},
    "crowd_level": {"low": 1.0, "medium": 0.7, "high": 0.4},
    "noise_level": {"low": 1.0, "medium": 0.7, "high": 0.4},
}
DEFAULT_QUALITY = {"yes": 1.0, "some": 0.7, "partial": 0.6, "no": 0.25, "none": 0.25}


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
    verification: float | None = None  # 0-1 trust in the facts this decision depends on
    display_fit: float | None = None  # 0-1 for the page; access_fit is for ranking
    verification_note: str | None = None  # why the Verification Score is what it is

    @property
    def accessibility_score(self) -> int:
        """0-100: how well the place fits this traveler, from all the facts that matter to them."""
        return round((self.access_fit if self.display_fit is None else self.display_fit) * 100)

    @property
    def verification_score(self) -> int | None:
        """0-100: how much the facts behind the decision can be trusted. None: nothing checked."""
        return None if self.verification is None else round(self.verification * 100)


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
    checked: dict[str, Fact | None] = {}  # attributes this traveler depends on; None = unknown

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

    # Display score inputs: attribute -> weight, and must-have attribute -> (quality, strength).
    relevant: dict[str, float] = {}
    optional: set[str] = set()  # nice-to-haves and comfort facts: an unknown here says nothing
    must_q: dict[str, tuple[float, float]] = {}

    for rule in RULES:
        if not rule.when(dna) or not _applies(rule.categories, place):
            continue
        if rule.attribute != "status":  # an unknown status is normal; it says nothing
            weight = (
                WEIGHT_CRITICAL
                if rule.critical
                else WEIGHT_EXTRA
                if rule.attribute in EXTRAS
                else WEIGHT_RULE
            )
            relevant[rule.attribute] = max(relevant.get(rule.attribute, 0), weight)
        fact = effective.get(rule.attribute)
        if rule.critical:
            checked[rule.attribute] = fact
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
        checked[attrs[0]] = max(present, key=trust) if present else None
        relevant[attrs[0]] = WEIGHT_MUST_HAVE
        if satisfied:
            used.update(f.id for f in satisfied)
            best = max(satisfied, key=lambda f: f.weight)
            must_q[attrs[0]] = (1.0, best.weight)
            continue
        misses = [(e, f) for f in present if (e := must_have_check(f, ctx)) is not None]
        if misses:
            effect, fact = max(misses, key=lambda m: (_STRENGTH[m[0].kind], m[0].weight))
            add(effect, fact)
            must_q[attrs[0]] = (_quality(effect), fact.weight)
        else:
            must_q[attrs[0]] = (UNKNOWN_MUST_HAVE_QUALITY, 1.0)
            not_verified(attrs[0], FEATURE_ASK[feature], present[0] if present else None)

    if {"mobility_device", "limited_mobility", "temporary_injury"} & set(dna.needs):
        for attr in COMFORT:
            if attr not in relevant:
                relevant[attr] = WEIGHT_COMFORT
                optional.add(attr)

    for feature in dna.requirements.nice_to_have:
        if not _applies(FEATURE_CATEGORIES.get(feature), place):
            continue
        if FEATURE_ATTRS[feature][0] not in relevant:
            relevant[FEATURE_ATTRS[feature][0]] = WEIGHT_NICE
            optional.add(FEATURE_ATTRS[feature][0])
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
        # Name every problem, including the unknown must-haves, so the reason is complete.
        problems = [e.reason for e, _ in soft] + list(unknown.values())
        reasons.append("Too many problems together: " + " ".join(problems))

    display_fit = _display_fit(relevant, must_q, effects, effective, dna)

    decayed_facts = [decayed(f, today or date.today()) for f in facts]
    verification, verification_note = _verification(
        relevant, optional, checked, effective, decayed_facts
    )

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
        verification=verification,
        verification_note=verification_note,
        display_fit=None if hard else display_fit,
    )


def _verification(
    relevant: dict[str, float],
    optional: set[str],
    checked: dict[str, Fact | None],
    effective: dict[str, Fact],
    facts: list[Fact],
) -> tuple[float | None, str | None]:
    """0-1 trust in the facts behind this traveler's checks, and a short reason for it.

    Weighted like the Accessibility Score: a must-have counts most. A must-have or critical
    check with no fact counts as 0 (nothing confirms it). Other unknown facts are left out:
    the traveler does not depend on them. Sources that state the same value raise the trust together.
    """
    total = weighted = 0.0
    official = demo = other = missing = 0
    for attr, weight in relevant.items():
        fact = checked[attr] if attr in checked else effective.get(attr)
        if fact is None:
            # Only a must-have or a critical check is something the traveler depends on.
            if attr in optional or attr in EXTRAS or weight < WEIGHT_CRITICAL:
                continue
            total += weight
            missing += 1
            continue
        total += weight
        weighted += weight * agreed_trust(fact, facts)
        if fact.source in ("official", "phone_call", "team_verified"):
            official += 1
        elif fact.source == "demo_data":
            demo += 1
        else:
            other += 1
    if total == 0:
        # Nothing this traveler depends on applies here: fall back to all the place's facts.
        if not effective:
            return None, None
        mean = sum(agreed_trust(f, facts) for f in effective.values()) / len(effective)
        return round(mean, 3), "General facts only"
    checks = official + demo + other + missing
    if official == checks:
        note = "All checks from official pages"
    elif official:
        note = f"{official} of {checks} checks from official pages"
    elif demo and not other:
        note = "Demo data, not checked yet"
    else:
        note = "Not confirmed by an official page"
    if missing and official != checks:
        note += f" · {missing} unknown"
    return round(weighted / total, 3), note


def _quality(effect: Effect | None) -> float:
    """0-1: how good one checked value is for this traveler."""
    if effect is None:
        return 1.0  # known, and no rule found a problem
    return {"HARD": 0.0, "BONUS": 1.0, "NOTE": 0.7}.get(effect.kind) or max(
        0.0, 1 - 2.5 * effect.weight
    )


def _display_fit(
    relevant: dict[str, float],
    must_q: dict[str, tuple[float, float]],
    effects: dict[str, tuple[Effect, Fact]],
    effective: dict[str, Fact],
    dna: AccessibilityDNA,
) -> float:
    """0-1 for the page: the weighted mean quality of every check that matters to this traveler.

    Each value starts at 0.5 (unknown) and moves toward its quality by the fact's strength:
    a VERIFIED fact moves it all the way, a COMMUNITY fact 80%. So a place with many confirmed
    good facts scores higher than a place we know little about.
    """
    if not relevant:
        return 0.75
    total = weighted = 0.0
    for attr, weight in relevant.items():
        if attr in must_q:
            q, strength = must_q[attr]
        elif (fact := effective.get(attr)) is None:
            q, strength = (UNKNOWN_EXTRA_QUALITY if attr in EXTRAS else UNKNOWN_QUALITY), 1.0
        else:
            effect = effects.get(attr, (None, fact))[0]
            value = VALUE_QUALITY.get(attr, DEFAULT_QUALITY).get(fact.value, 1.0)
            q = min(_quality(effect), value)
            if attr == "typical_walk_m" and fact.value.isdigit() and dna.max_walk_m:
                # Longer walks score lower, step by step, not in one jump.
                over = int(fact.value) / dna.max_walk_m - 1
                q = 0.95 if over <= 0 else max(0.0, 0.9 - 0.6 * over)
            strength = fact.weight
        total += weight
        base = UNKNOWN_EXTRA_QUALITY if attr in EXTRAS else UNKNOWN_QUALITY
        weighted += weight * (base + (q - base) * strength)
    return round(weighted / total, 3)


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
