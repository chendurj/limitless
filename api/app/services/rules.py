"""The rule table: which facts exclude, penalize or reward a place for a traveler.

Each Rule has:
- when:      a DNA predicate. The rule runs only for travelers it applies to.
- attribute: the place_accessibility attribute it reads.
- check:     maps the effective value to an Effect (HARD, SOFT, BONUS or NOTE), or None.
- critical:  if True and the value is unknown, the place gets a "call ahead" warning.
- categories: the place categories the rule applies to (None = all).

Severity:
- HARD excludes the place. A negative from any source can trigger it.
- SOFT subtracts weight x confidence weight from access_fit.
- BONUS adds weight to access_fit (strong facts only).
- NOTE adds a warning and changes no score.
"""

from collections.abc import Callable
from dataclasses import dataclass, field

from app.models.dna import AccessibilityDNA
from app.services.facts import Fact


@dataclass(frozen=True)
class Place:
    id: str
    name: str
    category: str
    est_visit_min: int
    subcategories: tuple[str, ...] = ()
    interest_tags: tuple[str, ...] = ()
    indoor: bool | None = None
    rating: float | None = None  # Google rating, 1-5
    neighborhood: str = ""
    lat: float = 0.0
    lng: float = 0.0
    exertion_level: int = 2  # 1-5
    meal_slot: str | None = None  # breakfast | lunch | dinner | snack
    # Display fields (address, website, accessibility_url, data_tier, google_place_id,
    # research_summary, research_sources).
    meta: dict = field(default_factory=dict, compare=False, hash=False)


@dataclass(frozen=True)
class Effect:
    kind: str  # HARD | SOFT | BONUS | NOTE
    weight: float
    reason: str


@dataclass(frozen=True)
class Ctx:
    dna: AccessibilityDNA
    place: Place
    facts: dict[str, Fact]  # effective fact per attribute

    def strong_yes(self, *attributes: str) -> bool:
        return any(
            (f := self.facts.get(a)) is not None and f.value == "yes" and f.is_strong
            for a in attributes
        )


Check = Callable[[Fact, Ctx], Effect | None]


@dataclass(frozen=True)
class Rule:
    name: str
    attribute: str
    when: Callable[[AccessibilityDNA], bool]
    check: Check
    critical: bool = False
    ask: str = ""  # what to confirm by phone, e.g. "a step-free entrance"
    categories: frozenset[str] | None = None


def cite(fact: Fact) -> str:
    """Reason text that names the source, e.g. 'Main entrance has 3 steps (Wheelmap community reports).'"""
    return f"{fact.detail.rstrip('.')} ({fact.source_label})."


def by_value(table: dict[str, tuple[str, float]]) -> Check:
    def check(fact: Fact, ctx: Ctx) -> Effect | None:
        if fact.value in table:
            kind, weight = table[fact.value]
            return Effect(kind, weight, cite(fact))
        return None

    return check


def bonus_if_yes(weight: float) -> Check:
    """A bonus needs a strong 'yes' (VERIFIED or COMMUNITY)."""

    def check(fact: Fact, ctx: Ctx) -> Effect | None:
        if fact.value == "yes" and fact.is_strong:
            return Effect("BONUS", weight, cite(fact))
        return None

    return check


# --- categories -----------------------------------------------------------------

WITH_ENTRANCE = frozenset({"attraction", "museum", "restaurant", "cafe", "dessert", "shopping"})
VENUES = frozenset({"attraction", "museum"})
OUTDOOR_EDGES = frozenset({"photo_spot", "park", "beach", "attraction"})
BOOKABLE = frozenset({"attraction", "museum", "restaurant"})
FOOD = frozenset({"restaurant", "cafe", "dessert"})

# --- must-have and nice-to-have features -------------------------------------------

FEATURE_ATTRS: dict[str, tuple[str, ...]] = {
    "step_free_entrance": ("entrance_step_free",),
    "accessible_restroom": ("restroom_accessible",),
    "accessible_parking": ("parking_accessible",),
    "dropoff_zone": ("dropoff_zone",),
    "elevator": ("elevator",),
    "seating": ("seating",),
    "mobility_rental": ("wheelchair_rental", "ecv_rental"),
    "beach_wheelchair_or_mat": ("beach_wheelchair", "beach_mat"),
    "quiet_space": ("quiet_space",),
    "captions_or_asl": ("captions_asl",),
    "audio_description": ("audio_description",),
    "braille_tactile": ("braille_tactile",),
    "service_animal_ok": ("service_animal_ok",),
    "online_booking": ("online_booking",),
    "text_contact": ("text_contact",),
}
FEATURE_CATEGORIES: dict[str, frozenset[str] | None] = {
    "step_free_entrance": WITH_ENTRANCE,
    "elevator": frozenset({"attraction", "museum", "shopping"}),
    "mobility_rental": frozenset({"attraction", "museum", "park"}),
    "beach_wheelchair_or_mat": frozenset({"beach"}),
    "quiet_space": frozenset({"attraction", "museum", "shopping"}),
    "captions_or_asl": VENUES,
    "audio_description": VENUES,
    "braille_tactile": VENUES,
    "online_booking": BOOKABLE,
}
FEATURE_ASK = {
    "step_free_entrance": "a step-free entrance",
    "accessible_restroom": "an accessible restroom",
    "accessible_parking": "accessible parking",
    "dropoff_zone": "a drop-off zone",
    "elevator": "an elevator",
    "seating": "seating",
    "mobility_rental": "wheelchair or scooter rental",
    "beach_wheelchair_or_mat": "a beach wheelchair or beach mat",
    "quiet_space": "a quiet space",
    "captions_or_asl": "captions or ASL",
    "audio_description": "audio description",
    "braille_tactile": "braille or tactile information",
    "service_animal_ok": "that service animals are permitted",
    "online_booking": "online booking",
    "text_contact": "a text, chat or email contact",
}
# Values that do not satisfy a must-have. "no" excludes; "partial" or "some" penalizes.
FEATURE_MISS = {
    "no": ("HARD", 0.0),
    "none": ("HARD", 0.0),
    "partial": ("SOFT", 0.2),
    "some": ("SOFT", 0.1),
}


def must_have_check(fact: Fact, ctx: Ctx) -> Effect | None:
    if fact.value not in FEATURE_MISS:
        return None
    kind, weight = FEATURE_MISS[fact.value]
    # A missing accessible restroom only excludes long visits.
    if fact.attribute == "restroom_accessible" and kind == "HARD" and ctx.place.est_visit_min < 90:
        kind, weight = "SOFT", 0.3
    return Effect(kind, weight, cite(fact))


# --- custom checks ------------------------------------------------------------------


def slope_limit(dna: AccessibilityDNA) -> str | None:
    """The traveler's slope tolerance. Mobility travelers who did not answer get 'gentle'."""
    tol = dna.mobility.slope_tolerance
    if tol in (None, "unsure"):
        mobility = {"mobility_device", "limited_mobility", "temporary_injury"} & set(dna.needs)
        return "gentle" if mobility or dna.uses_wheelchair else None
    return tol


def slope_check(fact: Fact, ctx: Ctx) -> Effect | None:
    tol, slope, push = slope_limit(ctx.dna), fact.value, ctx.dna.companion_can_push
    reason = cite(fact)
    if tol == "flat_only":
        return {
            "moderate": Effect("HARD", 0, reason),
            "steep": Effect("HARD", 0, reason),
            "gentle": Effect("SOFT", 0.15, reason),
        }.get(slope)
    if tol == "gentle":
        if slope == "steep":
            return Effect("HARD", 0, reason)
        if slope == "moderate":
            return Effect("SOFT", 0.3, reason) if push else Effect("HARD", 0, reason)
    if tol == "moderate_with_help":
        if slope == "steep":
            return Effect("HARD", 0, reason)
        if slope == "moderate":
            return Effect("SOFT", 0.15, reason) if push else Effect("HARD", 0, reason)
    if tol == "moderate" and slope == "steep":
        return Effect("SOFT", 0.3, reason)
    return None


def terrain_check(fact: Fact, ctx: Ctx) -> Effect | None:
    dna, reason = ctx.dna, cite(fact)
    if fact.value == "sand":
        equipment = [ctx.facts[a] for a in ("beach_wheelchair", "beach_mat") if a in ctx.facts]
        for item in equipment:
            if item.value == "yes" and item.is_strong:
                return Effect("BONUS", 0.05, f"Sand, but {cite(item)[0].lower()}{cite(item)[1:]}")
        if dna.uses_wheelchair or {"crutches", "walker"} & set(dna.mobility.equipment):
            return Effect("HARD", 0, reason)
        if "sand" in dna.mobility.surfaces_to_avoid or "sand" in dna.preferences.avoid:
            return Effect("SOFT", 0.3, reason)
    if fact.value == "uneven":
        if dna.uses_manual_wheelchair:
            return Effect("HARD", 0, reason)
        return Effect("SOFT", 0.2, reason)
    return None


# Walking aids that make uneven ground harder, even when the traveler did not name it.
WALKING_AIDS = {"crutches", "walker", "cane"}


def avoids_uneven(dna: AccessibilityDNA) -> bool:
    return (
        dna.uses_wheelchair
        or bool(WALKING_AIDS & set(dna.mobility.equipment))
        or bool(
            {"uneven_pavement", "cobblestone", "gravel_dirt", "sand"}
            & set(dna.mobility.surfaces_to_avoid)
        )
        or bool({"uneven_surfaces", "sand"} & set(dna.preferences.avoid))
        or dna.is_blind_low_vision
    )


def walk_check(fact: Fact, ctx: Ctx) -> Effect | None:
    limit = ctx.dna.max_walk_m
    if limit is None or not fact.value.isdigit():
        return None
    walk = int(fact.value)
    if walk > 2 * limit:
        if ctx.strong_yes("wheelchair_rental", "ecv_rental"):
            return Effect("SOFT", 0.15, f"{cite(fact)} Wheelchair or scooter rental is available.")
        return Effect("HARD", 0, cite(fact))
    if walk > limit:
        return Effect("SOFT", 0.2, cite(fact))
    return None


def standing_check(fact: Fact, ctx: Ctx) -> Effect | None:
    limit, seating = ctx.dna.max_standing_min, ctx.facts.get("seating")
    if limit is None or not fact.value.isdigit() or seating is None or seating.value != "none":
        return None
    if int(fact.value) > limit:
        return Effect("SOFT", 0.3, f"{cite(fact)} {cite(seating)}")
    return None


def heat_check(fact: Fact, ctx: Ctx) -> Effect | None:
    if ctx.place.indoor is False and fact.value == "none":
        return Effect("SOFT", 0.2, cite(fact))
    return None


def parking_check(fact: Fact, ctx: Ctx) -> Effect | None:
    dropoff = ctx.facts.get("dropoff_zone")
    if fact.value == "no" and dropoff is not None and dropoff.value == "no":
        return Effect("SOFT", 0.25, f"{cite(fact)} {cite(dropoff)}")
    return None


def captions_check(fact: Fact, ctx: Ctx) -> Effect | None:
    if fact.value == "yes":
        return Effect("BONUS", 0.1, cite(fact)) if fact.is_strong else None
    if fact.value == "no":
        return Effect("SOFT", 0.15, cite(fact))  # never exclude unless it is a must-have
    return None


def edge_check(fact: Fact, ctx: Ctx) -> Effect | None:
    if fact.value != "yes":
        return None
    if ctx.dna.blind_solo:
        return Effect("HARD", 0, cite(fact))
    return Effect("SOFT", 0.2, f"{cite(fact)} Stay with your sighted companion near the edge.")


def sighted_guide_check(fact: Fact, ctx: Ctx) -> Effect | None:
    if fact.value == "yes" and fact.is_strong:
        return Effect("BONUS", 0.1, f"{cite(fact)} Book the guide before you go.")
    return None


def phone_only_check(fact: Fact, ctx: Ctx) -> Effect | None:
    if fact.value != "yes" or ctx.strong_yes("online_booking"):
        return None
    return Effect("SOFT", 0.2, f"{cite(fact)} Ask a companion or a relay service to book.")


def status_check(fact: Fact, ctx: Ctx) -> Effect | None:
    if fact.value == "closed":
        return Effect("HARD", 0, cite(fact))
    if fact.value == "partial":
        return Effect("NOTE", 0, cite(fact))
    return None


# --- DNA predicates -------------------------------------------------------------------


def _always(dna: AccessibilityDNA) -> bool:
    return True


def _mobility(dna: AccessibilityDNA) -> bool:
    mobility = {"mobility_device", "limited_mobility", "temporary_injury"} & set(dna.needs)
    return bool(mobility) or dna.no_stairs


def _hearing(dna: AccessibilityDNA) -> bool:
    return "deaf_hoh" in dna.needs


def _wants(dna: AccessibilityDNA, word: str) -> bool:
    return word in dna.preferences.avoid or word in dna.sensory.reduce


def _no_calls(dna: AccessibilityDNA) -> bool:
    return dna.no_phone_calls


def _needs_car(dna: AccessibilityDNA) -> bool:
    return dna.trip.transport in ("personal_car", "accessible_vehicle")


RULES: list[Rule] = [
    Rule("status", "status", _always, status_check),
    Rule(
        "wheelchair entrance",
        "entrance_step_free",
        lambda d: d.uses_wheelchair,
        by_value({"no": ("HARD", 0), "partial": ("SOFT", 0.2)}),
        critical=True,
        ask="a step-free entrance",
        categories=WITH_ENTRANCE,
    ),
    Rule(
        "stairs",
        "stairs",
        lambda d: d.no_stairs,
        by_value({"required": ("HARD", 0), "avoidable": ("SOFT", 0.05)}),
    ),
    Rule("not ADA-accessible", "ada_accessible", _mobility, by_value({"no": ("HARD", 0)})),
    Rule("slope", "max_slope", lambda d: slope_limit(d) is not None, slope_check),
    Rule(
        "avoid hills",
        "max_slope",
        lambda d: "hills" in d.preferences.avoid,
        by_value({"moderate": ("SOFT", 0.2), "steep": ("SOFT", 0.3)}),
    ),
    Rule("terrain", "terrain", avoids_uneven, terrain_check),
    Rule("walk distance", "typical_walk_m", lambda d: d.max_walk_m is not None, walk_check),
    Rule("standing", "standing_min", lambda d: d.max_standing_min is not None, standing_check),
    Rule(
        "crowds", "crowd_level", lambda d: _wants(d, "crowds"), by_value({"high": ("SOFT", 0.25)})
    ),
    Rule("noise", "noise_level", lambda d: _wants(d, "noise"), by_value({"high": ("SOFT", 0.3)})),
    Rule("heat", "shade", lambda d: "heat_sun" in d.preferences.avoid, heat_check),
    Rule("parking", "parking_accessible", _needs_car, parking_check),
    # Deaf and hard of hearing
    Rule("captions or ASL", "captions_asl", _hearing, captions_check, categories=VENUES),
    Rule(
        "assistive listening",
        "assistive_listening",
        _hearing,
        bonus_if_yes(0.05),
        categories=VENUES,
    ),
    # Blind and low vision
    Rule(
        "audio description",
        "audio_description",
        lambda d: d.is_blind_low_vision,
        bonus_if_yes(0.1),
        categories=VENUES,
    ),
    Rule(
        "braille or tactile",
        "braille_tactile",
        lambda d: d.is_blind_low_vision,
        bonus_if_yes(0.05),
        categories=VENUES,
    ),
    Rule(
        "edge hazard",
        "edge_hazard",
        lambda d: d.is_blind_low_vision,
        edge_check,
        critical=True,
        ask="that there are no unfenced edges or drop-offs",
        categories=OUTDOOR_EDGES,
    ),
    Rule(
        "sighted guide",
        "sighted_guide_on_request",
        lambda d: "staff_guided_orientation" in d.vision.supports,
        sighted_guide_check,
    ),
    Rule(
        "guide dog",
        "service_animal_ok",
        lambda d: d.has_guide_dog,
        by_value({"no": ("HARD", 0)}),
        critical=True,
        ask="that service animals are permitted",
    ),
    Rule("guide dog relief", "guide_dog_relief", lambda d: d.has_guide_dog, bonus_if_yes(0.05)),
    # Deaf or non-speaking: no voice phone calls
    Rule(
        "phone-only booking", "booking_phone_only", _no_calls, phone_only_check, categories=BOOKABLE
    ),
    Rule("online booking", "online_booking", _no_calls, bonus_if_yes(0.05), categories=BOOKABLE),
    Rule("text contact", "text_contact", _no_calls, bonus_if_yes(0.05)),
    Rule(
        "kiosk or app ordering",
        "kiosk_or_app_ordering",
        _no_calls,
        bonus_if_yes(0.05),
        categories=FOOD,
    ),
    Rule("written notes", "written_notes_ok", lambda d: d.is_non_speaking, bonus_if_yes(0.05)),
]
