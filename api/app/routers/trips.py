import uuid
from collections.abc import Callable
from datetime import date, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from app.db import (
    FeedbackStore,
    PlaceStore,
    ProfileStore,
    TripStore,
    dumps,
    get_feedback_store,
    get_place_store,
    get_profile_store,
    get_trip_store,
)
from app.deps import current_user
from app.llm.compose import compose
from app.llm.feedback_parse import parse_feedback
from app.models.api import (
    CreateTripRequest,
    FeedbackRequest,
    FeedbackResponse,
    ItemOut,
    ItemPatch,
    ReplanRequest,
    ReplanResult,
    TripOut,
)
from app.models.dna import AccessibilityDNA
from app.services.planner import build_trip
from app.services.replan import (
    Overrides,
    access_fits,
    apply_feedback,
    message,
    override_facts,
    repair,
)
from app.services.scheduler import TZ
from app.services.similarity import dna_vector, to_pgvector
from app.services.weather import forecast

router = APIRouter(prefix="/trips", tags=["trips"])

DEFAULT_NIGHTS = 3
LEVELS = ("wheelchair_difficulty", "terrain_difficulty", "fatigue", "crowding", "noise")

User = Annotated[uuid.UUID, Depends(current_user)]
Profiles = Annotated[ProfileStore, Depends(get_profile_store)]
Places = Annotated[PlaceStore, Depends(get_place_store)]
Trips = Annotated[TripStore, Depends(get_trip_store)]


def get_composer() -> Callable | None:
    return compose


def get_weather() -> Callable | None:
    return forecast


Composer = Annotated[Callable | None, Depends(get_composer)]
WeatherFn = Annotated[Callable | None, Depends(get_weather)]


def _trip_dates(body: CreateTripRequest, dna: AccessibilityDNA, today: date) -> tuple[date, int]:
    start = body.start_date or dna.trip.start_date
    start_date = date.fromisoformat(start) if start else today + timedelta(days=7)
    if start_date < today:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "start_date is in the past")
    return start_date, body.nights or dna.trip.nights or DEFAULT_NIGHTS


@router.post("", response_model=TripOut)
def create_trip(
    body: CreateTripRequest,
    user: User,
    profiles: Profiles,
    places: Places,
    trips: Trips,
    composer: Composer,
    weather: WeatherFn,
) -> TripOut:
    profile = profiles.get(user, body.profile_id)
    if profile is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Profile not found")
    dna = AccessibilityDNA.model_validate(profile["dna"])
    today = date.today()
    start_date, nights = _trip_dates(body, dna, today)
    travelers = body.travelers or dna.party.size or 1
    lodging = (body.lodging.name, body.lodging.lat, body.lodging.lng) if body.lodging else None
    all_places, facts = places.load()
    if not all_places:
        raise HTTPException(status.HTTP_409_CONFLICT, "There are no places in the database yet")

    trip_id = str(uuid.uuid4())
    trip = build_trip(
        dna,
        all_places,
        facts,
        trip_id=trip_id,
        start_date=start_date,
        nights=nights,
        travelers=travelers,
        lodging=lodging,
        composer=composer,
        weather=weather,
        today=today,
    )
    transport = {"transit": "transit", "walk_roll": "walk"}.get(dna.trip.transport or "", "drive")
    trips.create(
        user,
        {
            "id": trip_id,
            "profile_id": body.profile_id,
            "start_date": start_date,
            "nights": nights,
            "travelers": travelers,
            "lodging_name": lodging[0] if lodging else None,
            "lodging_lat": lodging[1] if lodging else None,
            "lodging_lng": lodging[2] if lodging else None,
            "transport_mode": body.transport_mode or transport,
            "status": "ready",
            "excluded": dumps(trip.excluded),
            "overall_notes": trip.overall_notes,
        },
        dumps(trip),
    )
    return trip


def _owned_trip(
    trips: TripStore, user: uuid.UUID, trip_id: str, version: int | None = None
) -> dict:
    row = trips.get(user, trip_id, version)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Trip not found")
    return row


@router.get("/{trip_id}", response_model=TripOut)
def get_trip(trip_id: str, user: User, trips: Trips, version: int | None = None) -> TripOut:
    return TripOut.model_validate(_owned_trip(trips, user, trip_id, version)["plan"])


@router.patch("/{trip_id}/items/{item_id}", response_model=ItemOut)
def update_item(trip_id: str, item_id: str, body: ItemPatch, user: User, trips: Trips) -> ItemOut:
    row = _owned_trip(trips, user, trip_id)
    trip = TripOut.model_validate(row["plan"])
    item = next((i for d in trip.days for i in d.items if i.id == item_id), None)
    if item is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Item not found")
    if body.status is not None:
        item.status = body.status
    if body.locked is not None:
        item.locked = body.locked
    trips.save_plan(user, trip_id, row["version"], dumps(trip))
    return item


def get_feedback_parser() -> Callable:
    return parse_feedback


Feedbacks = Annotated[FeedbackStore, Depends(get_feedback_store)]
Parser = Annotated[Callable, Depends(get_feedback_parser)]


def _feedback_target(
    trip: TripOut, parsed_ref: str, short: dict[str, ItemOut], item_id: str | None
):
    """The item the feedback is about: the named place, then the UI's item, then in progress, then last done."""
    items = [i for d in trip.days for i in d.items if i.place]
    return (
        short.get(parsed_ref)
        or next((i for i in items if i.id == item_id), None)
        or next((i for i in items if i.status == "in_progress"), None)
        or next((i for i in reversed(items) if i.status == "done"), None)
    )


@router.post("/{trip_id}/feedback", response_model=FeedbackResponse)
def send_feedback(
    trip_id: str,
    body: FeedbackRequest,
    user: User,
    profiles: Profiles,
    places: Places,
    trips: Trips,
    feedbacks: Feedbacks,
    parser: Parser,
) -> FeedbackResponse:
    row = _owned_trip(trips, user, trip_id)
    trip = TripOut.model_validate(row["plan"])
    profile = profiles.get(user, row["profile_id"])
    if profile is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Profile not found")
    old = Overrides.from_json(row.get("overrides"))
    dna = AccessibilityDNA.model_validate(old.dna or profile["dna"])

    order = {"in_progress": 0, "done": 1, "planned": 2, "skipped": 3}
    stops = sorted(
        (i for d in trip.days for i in d.items if i.place), key=lambda i: order[i.status]
    )
    short = {f"p{n}": item for n, item in enumerate(stops, start=1)}
    listed = [{"id": k, "name": v.title, "status": v.status} for k, v in short.items()]
    parsed = parser(body.transcript, listed, dna.summary, datetime.now(TZ))
    parsed.sentiment = max(-2, min(2, parsed.sentiment))

    target = _feedback_target(trip, parsed.place_ref, short, body.item_id)
    place_id = target.place.id if target and target.place else None
    new_dna, overrides, reasons = apply_feedback(dna, parsed, place_id, old)
    from_day = next(
        (d.day_index for d in trip.days if target and any(i.id == target.id for i in d.items)),
        next((d.day_index for d in trip.days if any(i.status == "planned" for i in d.items)), 0),
    )
    all_places, facts = places.load()
    in_trip = [
        p
        for p in all_places
        if any(i.place and i.place.id == p.id for d in trip.days for i in d.items)
    ]
    before = access_fits(dna, in_trip, facts, override_facts(old))
    fixed = repair(
        trip,
        new_dna,
        all_places,
        facts,
        override_facts(overrides),
        from_day,
        target.id if target and parsed.needs_rest_now else None,
        before=before,
    )
    version = row["current_version"]
    if fixed.changes:
        version = trips.add_version(
            user, trip_id, dumps(fixed.trip), overrides.to_json(), parsed.summary
        )
    proposed = fixed.trip.model_copy(update={"version": version})

    feedback_id = feedbacks.create(
        user,
        {
            "trip_id": trip_id,
            "place_id": place_id,
            "input_mode": body.input_mode,
            "transcript": body.transcript,
            "parsed": dumps(parsed),
            **{k: getattr(parsed, k) for k in LEVELS},
            "restroom_ok": parsed.restroom_ok,
            "entrance_ok": parsed.entrance_ok,
            "sentiment": parsed.sentiment,
            "summary": parsed.summary,
            "tip": parsed.tip,
            "reporter_dna_snapshot": dumps(dna),
            "reporter_vector": to_pgvector(dna_vector(dna)),
            "consent_aggregate": body.consent_aggregate
            if body.consent_aggregate is not None
            else profile["consent_aggregate"],
        },
    )
    return FeedbackResponse(
        feedback_id=feedback_id,
        parsed=parsed,
        acknowledged_text=parsed.user_ack,
        replan=ReplanResult(
            changed=bool(fixed.changes),
            version=version,
            changes=fixed.changes,
            message=message(parsed.user_ack, reasons, fixed.changes),
            trip=proposed,
        ),
    )


@router.post("/{trip_id}/replan", response_model=ReplanResult)
def replan(trip_id: str, body: ReplanRequest, user: User, trips: Trips) -> ReplanResult:
    """Apply a proposed version, or undo to an earlier version."""
    before = _owned_trip(trips, user, trip_id)
    if not trips.apply(user, trip_id, body.apply_version):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Version not found")
    trip = TripOut.model_validate(_owned_trip(trips, user, trip_id)["plan"])
    undo = body.apply_version < before["current_version"]
    return ReplanResult(
        changed=body.apply_version != before["current_version"],
        version=body.apply_version,
        changes=[],
        message="Your earlier plan is back." if undo else "Your plan is updated.",
        trip=trip,
    )
