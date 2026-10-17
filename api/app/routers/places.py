from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from app.db import PlaceStore, get_place_store
from app.models.api import PlaceOut
from app.services.facts import resolve
from app.services.planner import place_out

# Place data is public, so these routes need no token.
router = APIRouter(prefix="/places", tags=["places"])
Places = Annotated[PlaceStore, Depends(get_place_store)]


@router.get("", response_model=list[PlaceOut])
def list_places(
    places: Places, category: str | None = None, neighborhood: str | None = None
) -> list[PlaceOut]:
    all_places, facts = places.load()
    return [
        place_out(p, list(resolve(facts.get(p.id, [])).values()))
        for p in all_places
        if (category is None or p.category == category)
        and (neighborhood is None or p.neighborhood == neighborhood)
    ]


@router.get("/{place_id}", response_model=PlaceOut)
def get_place(place_id: str, places: Places) -> PlaceOut:
    all_places, facts = places.load()
    place = next((p for p in all_places if p.id == place_id), None)
    if place is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Place not found")
    return place_out(place, list(resolve(facts.get(place.id, [])).values()))
