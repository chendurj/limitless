import uuid
from collections.abc import Callable
from datetime import date, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from app.db import (
    PlaceStore,
    ProfileStore,
    TripStore,
    dumps,
    get_place_store,
    get_profile_store,
    get_trip_store,
)
from app.deps import current_user, not_implemented
from app.llm.compose import compose
from app.models.api import (
    CreateTripRequest,
    FeedbackRequest,
    FeedbackResponse,
    ItemOut,
    ItemPatch,
    RentalLink,
    ReplanRequest,
    ReplanResult,
    TripOut,
)
from app.models.dna import AccessibilityDNA
from app.services.planner import build_trip
from app.services.weather import forecast

router = APIRouter(prefix="/trips", tags=["trips"])

DEFAULT_NIGHTS = 3

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


@router.post("/{trip_id}/feedback", response_model=FeedbackResponse)
def send_feedback(trip_id: str, body: FeedbackRequest, user: User) -> FeedbackResponse:
    raise not_implemented()


@router.post("/{trip_id}/replan", response_model=ReplanResult)
def replan(trip_id: str, body: ReplanRequest, user: User) -> ReplanResult:
    raise not_implemented()


@router.get("/{trip_id}/rental-links", response_model=list[RentalLink])
def rental_links(trip_id: str, user: User) -> list[RentalLink]:
    raise not_implemented()
