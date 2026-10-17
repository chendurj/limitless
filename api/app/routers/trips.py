from fastapi import APIRouter, Depends

from app.deps import current_user, not_implemented
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

router = APIRouter(prefix="/trips", tags=["trips"], dependencies=[Depends(current_user)])


@router.post("", response_model=TripOut)
def create_trip(body: CreateTripRequest) -> TripOut:
    raise not_implemented()


@router.get("/{trip_id}", response_model=TripOut)
def get_trip(trip_id: str, version: int | None = None) -> TripOut:
    raise not_implemented()


@router.patch("/{trip_id}/items/{item_id}", response_model=ItemOut)
def update_item(trip_id: str, item_id: str, body: ItemPatch) -> ItemOut:
    raise not_implemented()


@router.post("/{trip_id}/feedback", response_model=FeedbackResponse)
def send_feedback(trip_id: str, body: FeedbackRequest) -> FeedbackResponse:
    raise not_implemented()


@router.post("/{trip_id}/replan", response_model=ReplanResult)
def replan(trip_id: str, body: ReplanRequest) -> ReplanResult:
    raise not_implemented()


@router.get("/{trip_id}/rental-links", response_model=list[RentalLink])
def rental_links(trip_id: str) -> list[RentalLink]:
    raise not_implemented()
