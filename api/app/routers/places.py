from fastapi import APIRouter

from app.deps import not_implemented
from app.models.api import PlaceOut

# Place data is public, so these routes need no token.
router = APIRouter(prefix="/places", tags=["places"])


@router.get("", response_model=list[PlaceOut])
def list_places(category: str | None = None, neighborhood: str | None = None) -> list[PlaceOut]:
    raise not_implemented()


@router.get("/{place_id}", response_model=PlaceOut)
def get_place(place_id: str) -> PlaceOut:
    raise not_implemented()
