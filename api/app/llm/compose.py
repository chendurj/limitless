"""Itinerary composition: the LLM picks and orders places from each day's shortlist."""

import json
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, create_model

from app.config import get_settings
from app.llm.client import parse

SYSTEM = (Path(__file__).parent / "prompts" / "compose.md").read_text()
Slot = Literal["morning", "lunch", "afternoon", "dinner", "evening"]


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


def output_model(short_ids: list[str]) -> type[BaseModel]:
    """A schema whose place_id is an enum of this request's short IDs (p1..pN)."""
    PlaceId = Literal[tuple(short_ids)]  # type: ignore[valid-type]
    item = create_model(
        "ComposedItem",
        __base__=Strict,
        place_id=(PlaceId, ...),
        slot=(Slot, ...),
        rationale=(str, ...),
        fact_ids=(list[int], ...),
        tips=(list[str], Field(...)),
    )
    day = create_model(
        "ComposedDay",
        __base__=Strict,
        day_index=(int, ...),
        theme=(str, ...),
        items=(list[item], ...),
    )
    return create_model(
        "ComposedTrip", __base__=Strict, days=(list[day], ...), overall_notes=(str, ...)
    )


def compose(request: dict, short_ids: list[str]) -> BaseModel:
    return parse(
        model=get_settings().openai_model_compose,
        system=SYSTEM,
        user=json.dumps(request, ensure_ascii=False),
        schema=output_model(short_ids),
        attempts=1,  # one try: on failure the planner uses the greedy picks at once
    )
