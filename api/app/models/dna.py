"""Accessibility DNA: the traveler profile that scoring and planning run on.

The same model is the OpenAI structured-output schema and the stored JSON, so:
- every field is required and has no default (strict mode); optional values are `X | None`
- `None` means "not answered", never "no"; empty lists mean "none selected"
- answer options mirror the adaptive intake tree (one Literal per intake question)
- ranges are checked in validators after parsing, not in the schema

Scoring should read the helper properties at the bottom (meters, minutes, flags)
rather than re-interpreting the raw intake answers.
"""

from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, field_validator, model_validator


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")  # -> additionalProperties: false


# Core question: "What should we plan around?" (no selection = no specific need)
NeedType = Literal[
    "mobility_device",
    "limited_mobility",
    "blind_low_vision",
    "deaf_hoh",
    "sensory_cognitive",
    "temporary_injury",
    "service_animal",
    "other",
]

# --- Mobility branch ---------------------------------------------------------
Equipment = Literal[
    "manual_wheelchair",
    "powered_wheelchair",
    "mobility_scooter",
    "walker",
    "crutches",
    "cane",
    "none",
    "other",
]
Walking = Literal[
    "cannot_walk",  # stays in mobility device
    "transfer_steps_only",  # 1-5 steps for transfers
    "under_5_min",
    "5_to_15_min",
    "15_to_30_min",
    "long_ok",
    "varies",
]
Standing = Literal[
    "cannot_stand", "under_2_min", "2_to_5_min", "5_to_15_min", "over_15_min", "varies"
]
Slope = Literal["flat_only", "gentle", "moderate_with_help", "moderate", "steep_ok", "unsure"]
Surface = Literal["uneven_pavement", "cobblestone", "gravel_dirt", "grass", "sand", "other"]
Stairs = Literal["none", "few_with_rail", "ok"]
RestInterval = Literal["30_min", "45_min", "60_min", "90_min", "on_request"]

# --- Blind and low-vision branch -----------------------------------------------
VisionLevel = Literal["blind", "light_perception", "low_vision", "prefer_not_to_say"]
NavAid = Literal["white_cane", "guide_dog", "sighted_guide", "phone_navigation", "none", "other"]
VisionSupport = Literal[
    "audio_description",
    "tactile_braille",
    "staff_guided_orientation",
    "high_contrast_large_print",
    "predictable_step_free_routes",
    "avoid_exposed_edges",
    "service_animal_relief",
]
YesNoSometimes = Literal["yes", "no", "sometimes"]

# --- Deaf and hard-of-hearing branch ---------------------------------------------
HearingSupport = Literal[
    "captions",
    "asl_interpretation",
    "assistive_listening",
    "written_transcript",
    "visual_emergency_info",
    "other",
]
AdvanceBooking = Literal["yes", "with_contact_and_script", "no"]

# --- Sensory and cognitive branch ------------------------------------------------
SensoryReduce = Literal[
    "crowds", "noise", "bright_lights", "strong_smells", "long_waits", "complex_navigation", "other"
]
SensorySupport = Literal[
    "quiet_spaces",
    "sensory_kits",
    "predictable_schedule",
    "extra_transition_time",
    "shorter_visits",
    "easy_exits",
]

# --- Temporary-injury branch -------------------------------------------------------
NeedsDuration = Literal["this_trip_only", "save_for_future", "unsure"]

# --- Shared must-have question -------------------------------------------------------
Feature = Literal[
    "step_free_entrance",
    "accessible_restroom",
    "accessible_parking",
    "dropoff_zone",
    "elevator",
    "seating",
    "mobility_rental",
    "beach_wheelchair_or_mat",
    "quiet_space",
    "captions_or_asl",
    "audio_description",
    "braille_tactile",
    "service_animal_ok",
]

# --- Trip and preference questions -----------------------------------------------------
TravelWith = Literal["alone", "partner_friend", "family", "caregiver", "group"]
CompanionAssist = Literal["push_and_transfer", "light_only", "no", "sometimes", "unsure"]
Interest = Literal[
    "beaches",
    "zoos_aquariums",
    "museums_art",
    "history",
    "nature",
    "photography",
    "shopping",
    "sports",
    "nightlife",
    "theme_parks",
    "food",
]
Cuisine = Literal[
    "italian",
    "mexican",
    "indian",
    "east_asian",
    "mediterranean",
    "seafood",
    "vegetarian",
    "vegan",
    "desserts_cafes",
    "other",
]
Avoid = Literal[
    "crowds",
    "hills",
    "long_distances",
    "heat_sun",
    "standing",
    "noise",
    "sand",
    "uneven_surfaces",
    "bright_lights",
    "tight_schedules",
]
Transport = Literal["personal_car", "accessible_vehicle", "rideshare", "transit", "walk_roll"]
Pace = Literal["relaxed", "moderate", "busy"]

WHEELCHAIRS = {"manual_wheelchair", "powered_wheelchair", "mobility_scooter"}

# Comfortable continuous distance in meters, at about 50 m per minute of walking.
# For people who stay in a wheelchair this is a rolling distance and is set by the
# route, not the person, so it is None (no walk limit) and other rules apply.
WALK_LIMIT_M: dict[str, int | None] = {
    "cannot_walk": None,
    "transfer_steps_only": None,
    "under_5_min": 200,
    "5_to_15_min": 600,
    "15_to_30_min": 1200,
    "long_ok": 3000,
    "varies": 400,  # plan for a bad day
}
STANDING_LIMIT_MIN: dict[str, int] = {
    "cannot_stand": 0,
    "under_2_min": 1,
    "2_to_5_min": 3,
    "5_to_15_min": 10,
    "over_15_min": 30,
    "varies": 3,  # plan for a bad day
}
REST_EVERY_MIN: dict[str, int | None] = {
    "30_min": 30,
    "45_min": 45,
    "60_min": 60,
    "90_min": 90,
    "on_request": None,
}


class Mobility(Strict):
    equipment: list[Equipment]
    walking: Walking | None
    standing: Standing | None
    slope_tolerance: Slope | None
    surfaces_to_avoid: list[Surface]
    stairs_tolerance: Stairs | None
    rest_interval: RestInterval | None


class Vision(Strict):
    level: VisionLevel | None
    nav_aids: list[NavAid]
    supports: list[VisionSupport]
    without_sighted_companion: YesNoSometimes | None


class Hearing(Strict):
    supports: list[HearingSupport]
    advance_booking: AdvanceBooking | None


class SensoryCognitive(Strict):
    reduce: list[SensoryReduce]
    supports: list[SensorySupport]


class TemporaryInjury(Strict):
    expected_duration: NeedsDuration | None  # app treats None as this_trip_only


class Requirements(Strict):
    must_have: list[Feature]
    nice_to_have: list[Feature]
    other: list[str]  # "Something else" answers, free text


class Party(Strict):
    travel_with: TravelWith | None
    size: int | None
    children_ages: list[int]
    companion_assist: CompanionAssist | None
    notes: str | None


class TripInfo(Strict):
    destination: Literal["San Diego"]
    start_date: str | None  # ISO yyyy-mm-dd
    nights: int | None
    lodging_area: str | None
    transport: Transport | None
    needs_accessible_vehicle: bool | None
    needs_rental_equipment: bool | None


class Preferences(Strict):
    interests: list[Interest]
    cuisines: list[Cuisine]
    avoid: list[Avoid]
    pace: Pace | None
    budget_per_day_usd: int | None  # excluding lodging
    day_start: str | None  # "HH:MM", 24-hour
    day_end: str | None


class AccessibilityDNA(Strict):
    schema_version: Literal["1.0"]
    summary: str  # 1-2 sentences, read back to the traveler
    needs: list[NeedType]
    mobility: Mobility
    vision: Vision
    hearing: Hearing
    sensory: SensoryCognitive
    temporary: TemporaryInjury
    requirements: Requirements
    party: Party
    trip: TripInfo
    preferences: Preferences
    missing_fields: list[str]  # dotted paths, e.g. "party.companion_assist"
    assumptions: list[str]  # shown to the traveler for confirmation

    # --- validation (runs after parsing; not part of the JSON schema) ---

    @field_validator("trip")
    @classmethod
    def _check_trip(cls, trip: TripInfo) -> TripInfo:
        if trip.nights is not None and not 1 <= trip.nights <= 7:
            raise ValueError("trip.nights must be between 1 and 7")
        if trip.start_date is not None:
            date.fromisoformat(trip.start_date)
        return trip

    @field_validator("party")
    @classmethod
    def _check_party(cls, party: Party) -> Party:
        if party.size is not None and not 1 <= party.size <= 20:
            raise ValueError("party.size must be between 1 and 20")
        if any(not 0 <= age <= 17 for age in party.children_ages):
            raise ValueError("party.children_ages must be between 0 and 17")
        return party

    @field_validator("preferences")
    @classmethod
    def _check_preferences(cls, prefs: Preferences) -> Preferences:
        if prefs.budget_per_day_usd is not None and prefs.budget_per_day_usd < 0:
            raise ValueError("preferences.budget_per_day_usd must not be negative")
        for name in ("day_start", "day_end"):
            value = getattr(prefs, name)
            if value is not None:
                hours, _, minutes = value.partition(":")
                if not (
                    hours.isdigit() and minutes.isdigit() and int(hours) < 24 and int(minutes) < 60
                ):
                    raise ValueError(f"preferences.{name} must be HH:MM")
        return prefs

    @model_validator(mode="after")
    def _normalize(self) -> "AccessibilityDNA":
        # A feature marked both ways stays a must-have; lists keep their order without repeats.
        req = self.requirements
        req.must_have = list(dict.fromkeys(req.must_have))
        req.nice_to_have = [f for f in dict.fromkeys(req.nice_to_have) if f not in req.must_have]
        self.needs = list(dict.fromkeys(self.needs))
        return self

    # --- derived values for scoring and scheduling ---

    @property
    def uses_wheelchair(self) -> bool:
        return bool(WHEELCHAIRS & set(self.mobility.equipment))

    @property
    def uses_manual_wheelchair(self) -> bool:
        return "manual_wheelchair" in self.mobility.equipment

    @property
    def max_walk_m(self) -> int | None:
        """Comfortable continuous walk in meters; None when unknown or not walking."""
        if self.mobility.walking is None:
            return 400 if "long_distances" in self.preferences.avoid else None
        return WALK_LIMIT_M[self.mobility.walking]

    @property
    def max_standing_min(self) -> int | None:
        if self.mobility.standing is None:
            return 5 if "standing" in self.preferences.avoid else None
        return STANDING_LIMIT_MIN[self.mobility.standing]

    @property
    def rest_every_min(self) -> int | None:
        return REST_EVERY_MIN[self.mobility.rest_interval] if self.mobility.rest_interval else None

    @property
    def no_stairs(self) -> bool:
        return self.uses_wheelchair or self.mobility.stairs_tolerance == "none"

    @property
    def companion_can_push(self) -> bool:
        return self.party.companion_assist == "push_and_transfer"

    @property
    def is_blind_low_vision(self) -> bool:
        return "blind_low_vision" in self.needs

    @property
    def blind_solo(self) -> bool:
        """Blind or low-vision and traveling without a sighted companion: edge hazards become HARD."""
        return self.is_blind_low_vision and self.vision.without_sighted_companion in (
            "yes",
            "sometimes",
        )

    @property
    def has_guide_dog(self) -> bool:
        return "guide_dog" in self.vision.nav_aids or "service_animal" in self.needs

    @property
    def trip_only(self) -> bool:
        """Temporary needs default to trip-only storage."""
        return (
            "temporary_injury" in self.needs
            and self.temporary.expected_duration != "save_for_future"
        )
