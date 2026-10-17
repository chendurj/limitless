"""Trip feedback text -> FeedbackParsed, with the extraction model."""

import json
from datetime import datetime
from pathlib import Path

from app.config import get_settings
from app.llm.client import parse, user_input
from app.models.api import FeedbackParsed

SYSTEM = (Path(__file__).parent / "prompts" / "feedback_parse.md").read_text()


def parse_feedback(
    transcript: str, places: list[dict], dna_summary: str, now: datetime
) -> FeedbackParsed:
    """places: [{"id": "p1", "name": ..., "status": ...}], today's first."""
    message = "\n".join(
        [
            f"Local time: {now.strftime('%A %H:%M')}",
            f"Traveler profile (for the de-identified summary only): {user_input(dna_summary)}",
            f"Trip places: {json.dumps(places, ensure_ascii=False)}",
            f"What the traveler said: {user_input(transcript)}",
        ]
    )
    return parse(
        model=get_settings().openai_model_extract,
        system=SYSTEM,
        user=message,
        schema=FeedbackParsed,
    )
