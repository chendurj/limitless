"""Intake answers -> AccessibilityDNA, with the extraction model."""

from datetime import date
from pathlib import Path

from app.config import get_settings
from app.llm.client import parse, user_input
from app.models.api import QAnswer
from app.models.dna import AccessibilityDNA

SYSTEM = (Path(__file__).parent / "prompts" / "dna_extract.md").read_text()


def build_input(
    answers: dict[str, QAnswer],
    followup_qa: list[dict[str, str]] | None = None,
    today: date | None = None,
) -> str:
    lines = [f"Today's date: {(today or date.today()).isoformat()}", "", "Intake answers:"]
    for question_id, answer in answers.items():
        lines.append(f"- {question_id}:")
        if answer.selected:
            lines.append(f"  selected: {', '.join(answer.selected)}")
        if answer.other:
            lines.append(f"  other: {user_input(answer.other)}")
        if answer.freeform:
            lines.append(f"  in their words: {user_input(answer.freeform)}")
    if followup_qa:
        lines += ["", "Follow-up answers (newer than the intake answers):"]
        for qa in followup_qa:
            lines.append(
                f"- {qa['question']} (field {qa['target_field']}): {user_input(qa['answer'])}"
            )
    return "\n".join(lines)


def extract_dna(
    answers: dict[str, QAnswer],
    followup_qa: list[dict[str, str]] | None = None,
    today: date | None = None,
) -> AccessibilityDNA:
    return parse(
        model=get_settings().openai_model_extract,
        system=SYSTEM,
        user=build_input(answers, followup_qa, today),
        schema=AccessibilityDNA,
    )
