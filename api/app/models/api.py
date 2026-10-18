"""Request and response models for the HTTP API.

These models are the contract between the server and the web app. The web app gets
them as TypeScript types, made from the OpenAPI spec (see scripts/gen-types.sh).
Change a model here first, then make the types again.
"""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.models.dna import AccessibilityDNA

Confidence = Literal["VERIFIED", "COMMUNITY", "INFERRED"]
Level = Literal["low", "medium", "high"]


class Model(BaseModel):
    model_config = ConfigDict(extra="forbid")


# --- Errors -------------------------------------------------------------------------


class ErrorDetail(Model):
    code: str  # e.g. "LLM_UNAVAILABLE", "NOT_FOUND", "RATE_LIMITED"
    message: str


class ErrorResponse(Model):
    error: ErrorDetail


# --- Intake -------------------------------------------------------------------------


class QAnswer(Model):
    selected: list[str] = []  # option keys from dna.py
    other: str | None = None  # "Other" or "Something else" text
    freeform: str | None = None  # voice or typed answer


class IntakeRequest(Model):
    answers: dict[str, QAnswer]  # key = question id from intakeQuestions.ts
    consent_aggregate: bool = False


class Followup(Model):
    id: str
    question: str
    target_field: str  # dotted DNA path, e.g. "party.companion_assist"
    answer_type: Literal["yes_no", "choice", "free_text"]
    options: list[str] | None = None
    why: str  # one sentence: why the answer changes the plan


class IntakeResponse(Model):
    profile_id: str
    dna: AccessibilityDNA
    followups: list[Followup] = Field(max_length=3)  # empty = ready
    ready: bool
    assumptions: list[str]


class FollowupAnswer(Model):
    followup_id: str
    answer: str


class FollowupAnswers(Model):
    answers: list[FollowupAnswer]


class ProfileOut(Model):
    id: str
    dna: AccessibilityDNA
    consent_aggregate: bool
    trip_only: bool


class ProfilePatch(Model):
    dna: AccessibilityDNA | None = None  # edit on the review page
    consent_aggregate: bool | None = None


# --- Places and facts ---------------------------------------------------------------


class Fact(Model):
    fact_id: int
    attribute: str
    value: str
    detail: str
    confidence: Confidence
    source: str
    source_label: str = ""  # text to show, e.g. "demo data, not verified"
    source_url: str | None
    verified_at: str | None  # ISO date


class PlacePhoto(Model):
    image_url: str
    captured_at: str | None
    attribution: str  # show next to the photo
    review_status: Literal["pending", "confirmed", "rejected"]


class PlaceOut(Model):
    id: str
    name: str
    category: str
    neighborhood: str
    lat: float
    lng: float
    address: str | None
    google_maps_url: str | None
    website: str | None
    accessibility_url: str | None
    data_tier: Literal["A", "B", "C"]
    est_visit_min: int
    indoor: bool | None
    facts: list[Fact]
    photos: list[PlacePhoto] = []
    rating: float | None = None


# --- Trips --------------------------------------------------------------------------


class Lodging(Model):
    name: str
    lat: float
    lng: float


class CreateTripRequest(Model):
    profile_id: str
    start_date: str | None = None  # ISO date; default: the DNA trip date
    nights: int | None = Field(default=None, ge=1, le=7)
    travelers: int | None = Field(default=None, ge=1, le=20)
    lodging: Lodging | None = None  # default: a Downtown / Little Italy point
    transport_mode: Literal["drive", "transit"] | None = None


class Insight(Model):
    text: str
    n_reports: int
    avg_similarity: float
    includes_demo_data: bool  # the UI labels demo data


class Travel(Model):
    minutes: int
    mode: str
    polyline: str | None
    estimated: bool  # true = distance estimate, not a Routes API result


class ItemOut(Model):
    id: str
    seq: int
    kind: Literal["visit", "meal", "rest"]
    title: str
    start: str  # ISO datetime
    end: str
    travel: Travel | None
    status: Literal["planned", "in_progress", "done", "skipped"]
    locked: bool
    place: PlaceOut | None
    rationale: str
    cited_fact_ids: list[int]
    warnings: list[str]  # e.g. "Not verified: call ahead to confirm ..."
    insights: list[Insight]
    accessibility_score: int | None = None  # 0-100: how well the place fits this traveler
    verification_score: int | None = None  # 0-100: trust in the facts behind that fit


class Weather(Model):
    tmax_f: float
    precip_prob: int
    uv_max: float
    advisory: str | None


class DayOut(Model):
    day_index: int
    date: str
    theme: str
    weather: Weather | None
    energy_budget: int
    energy_used: int
    items: list[ItemOut]


class ExcludedPlace(Model):
    place_id: str
    name: str
    reasons: list[str]  # cited, shown in "Places we skipped"
    fact_ids: list[int]


class RentalLink(Model):
    label: str
    url: str
    note: str


class TripOut(Model):
    id: str
    status: Literal["generating", "ready", "failed"]
    version: int
    start_date: str
    nights: int
    travelers: int
    profile_summary: str
    days: list[DayOut]
    excluded: list[ExcludedPlace]
    rental_links: list[RentalLink]
    overall_notes: str
    disclaimer: str


class ItemPatch(Model):
    status: Literal["done", "skipped", "in_progress"] | None = None
    locked: bool | None = None


# --- Feedback and re-plan -------------------------------------------------------------


class FeedbackRequest(Model):
    transcript: str = Field(min_length=1, max_length=2000)
    input_mode: Literal["voice", "text"]
    item_id: str | None = None  # the current stop, if the UI knows it
    consent_aggregate: bool | None = None  # default: the profile consent


class PlaceReport(Model):
    """Facts about one more place that the traveler named in the same message."""

    place_ref: str  # a trip place id, not the main place_ref
    restroom_ok: bool | None
    entrance_ok: bool | None
    captions_ok: bool | None
    booking_phone_only: bool | None


class FeedbackParsed(Model):
    place_ref: str  # a trip place id, or "none"
    wheelchair_difficulty: Level | None
    terrain_difficulty: Level | None
    fatigue: Level | None
    crowding: Level | None
    noise: Level | None
    restroom_ok: bool | None
    entrance_ok: bool | None
    captions_ok: bool | None  # false = no captions or ASL were available
    booking_phone_only: bool | None  # true = the place could only be booked by phone
    needs_met: Literal["yes", "partially", "no"] | None
    sentiment: int  # -2..2; the server clamps it (no min/max in the model schema)
    needs_rest_now: bool
    wants_to_skip_rest_of_today: bool
    summary: str  # third person, no names
    tip: str | None
    user_ack: str  # one sentence: what we heard
    other_places: list[PlaceReport]  # other named places with their own facts; usually empty


class ChangeOut(Model):
    type: Literal["removed", "added", "replaced", "retimed", "rest_added"]
    day_index: int
    old_item_id: str | None = None
    new_item_id: str | None = None
    reason: str
    cited_fact_ids: list[int]


class ReplanRequest(Model):
    apply_version: int  # the proposed version to apply, or an earlier version to undo


class ReplanResult(Model):
    changed: bool
    version: int
    changes: list[ChangeOut]
    message: str  # 2-4 sentences, for the screen and for speech
    trip: TripOut


class FeedbackResponse(Model):
    feedback_id: str
    parsed: FeedbackParsed
    acknowledged_text: str
    replan: ReplanResult


class HealthOut(Model):
    status: Literal["ok"]
    version: str
