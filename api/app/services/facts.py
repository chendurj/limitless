"""Fact resolution: pick one effective fact for each (place, attribute).

Rules, in order:
1. A negative value wins at any confidence. Among negatives, the highest confidence wins.
2. Otherwise the highest confidence wins, then the most recent verified_at.
3. A fact verified more than 24 months ago drops one confidence level.
No fact for an attribute means "unknown". Scoring never guesses a value.
"""

from dataclasses import dataclass, replace
from datetime import date

CONF_RANK = {"VERIFIED": 3, "COMMUNITY": 2, "INFERRED": 1}
CONF_WEIGHT = {"VERIFIED": 1.0, "COMMUNITY": 0.8, "INFERRED": 0.6}
DECAY_DAYS = 730

SOURCE_LABEL = {
    "official": "the official accessibility page",
    "phone_call": "a phone call to the venue",
    "team_verified": "a team check",
    "wheelmap": "Wheelmap community reports",
    "osm": "OpenStreetMap",
    "google_places": "Google Maps",
    "community_feedback": "traveler feedback",
    "photo_ai": "an AI check of an entrance photo",
    "inferred": "an estimate",
    "demo_data": "demo data, not verified",
}

# How much a fact from each source can be trusted, for the Verification Score (0-1).
# Demo data is low on purpose: it is generated, not checked.
SOURCE_TRUST = {
    "official": 1.0,
    "phone_call": 1.0,
    "team_verified": 1.0,
    "wheelmap": 0.6,
    "osm": 0.6,
    "google_places": 0.6,
    "community_feedback": 0.6,
    "photo_ai": 0.4,
    "inferred": 0.3,
    "demo_data": 0.2,
}
CONF_CAP = {"VERIFIED": 1.0, "COMMUNITY": 0.8, "INFERRED": 0.5}


def trust(fact: "Fact") -> float:
    """0-1: the source's trust, capped by the confidence level."""
    return min(SOURCE_TRUST.get(fact.source, 0.3), CONF_CAP[fact.confidence])


def agreed_trust(effective: "Fact", facts: list["Fact"]) -> float:
    """0-1: trust in the effective value, raised when other sources state the same value.

    Each agreeing source is treated as an independent check: 1 - product(1 - trust).
    Demo data agreeing with an official page adds a little; two demo rows of the same
    value never come from different sources, so only distinct sources count.
    """
    best: dict[str, float] = {}
    for fact in facts:
        if fact.attribute == effective.attribute and fact.value == effective.value:
            best[fact.source] = max(best.get(fact.source, 0.0), trust(fact))
    best[effective.source] = max(best.get(effective.source, 0.0), trust(effective))
    doubt = 1.0
    for value in best.values():
        doubt *= 1 - value
    return round(1 - doubt, 3)


# Values that count as negative evidence for each attribute. Default: {"no"}.
NEGATIVE: dict[str, set[str]] = {
    "status": {"closed", "partial"},
    "entrance_step_free": {"no", "partial"},
    "stairs": {"required"},
    "terrain": {"uneven", "sand"},
    "max_slope": {"moderate", "steep"},
    "seating": {"none"},
    "shade": {"none"},
    "crowd_level": {"high"},
    "noise_level": {"high"},
    "edge_hazard": {"yes"},
    "typical_walk_m": set(),
    "standing_min": set(),
}


@dataclass(frozen=True)
class Fact:
    id: int
    attribute: str
    value: str
    detail: str
    confidence: str  # VERIFIED | COMMUNITY | INFERRED
    source: str
    source_url: str | None = None
    verified_at: date | None = None

    @property
    def source_label(self) -> str:
        return SOURCE_LABEL.get(self.source, self.source)

    @property
    def weight(self) -> float:
        return CONF_WEIGHT[self.confidence]

    @property
    def is_strong(self) -> bool:
        """VERIFIED or COMMUNITY. Only a strong 'yes' satisfies a must-have."""
        return self.confidence in ("VERIFIED", "COMMUNITY")


def is_negative(fact: Fact) -> bool:
    return fact.value in NEGATIVE.get(fact.attribute, {"no"})


def decayed(fact: Fact, today: date) -> Fact:
    if fact.verified_at is None or (today - fact.verified_at).days <= DECAY_DAYS:
        return fact
    lower = {"VERIFIED": "COMMUNITY", "COMMUNITY": "INFERRED", "INFERRED": "INFERRED"}
    return replace(fact, confidence=lower[fact.confidence])


def _rank(fact: Fact) -> tuple[int, date]:
    return CONF_RANK[fact.confidence], fact.verified_at or date.min


def resolve(facts: list[Fact], today: date | None = None) -> dict[str, Fact]:
    """Return the effective fact for each attribute that has at least one fact."""
    today = today or date.today()
    by_attr: dict[str, list[Fact]] = {}
    for fact in facts:
        by_attr.setdefault(fact.attribute, []).append(decayed(fact, today))
    effective = {}
    for attr, group in by_attr.items():
        negatives = [f for f in group if is_negative(f)]
        effective[attr] = max(negatives or group, key=_rank)
    return effective
