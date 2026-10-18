import uuid
from collections.abc import Callable
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, status

from app.db import ProfileStore, dumps, get_profile_store
from app.deps import current_user
from app.llm.dna_extract import extract_dna
from app.models.api import (
    FollowupAnswers,
    IntakeRequest,
    IntakeResponse,
    ProfileOut,
    ProfilePatch,
    QAnswer,
)
from app.models.dna import AccessibilityDNA
from app.services.similarity import dna_vector, to_pgvector

router = APIRouter(tags=["intake"])

Extractor = Callable[..., AccessibilityDNA]
User = Annotated[uuid.UUID, Depends(current_user)]
Store = Annotated[ProfileStore, Depends(get_profile_store)]


def get_extractor() -> Extractor:
    return extract_dna


Extract = Annotated[Extractor, Depends(get_extractor)]


def _dna_columns(dna: AccessibilityDNA) -> dict[str, Any]:
    return {
        "dna": dumps(dna),
        "dna_vector": to_pgvector(dna_vector(dna)),
        "trip_only": dna.trip_only,
    }


def _response(row: dict[str, Any]) -> IntakeResponse:
    dna = AccessibilityDNA.model_validate(row["dna"])
    pending = [f for f in row["followup_qa"] if f.get("answer") is None]
    return IntakeResponse(
        profile_id=row["id"],
        dna=dna,
        followups=pending,
        ready=not pending,
        assumptions=dna.assumptions,
    )


def _owned(store: ProfileStore, user: uuid.UUID, profile_id: str) -> dict[str, Any]:
    row = store.get(user, profile_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Profile not found")
    return row


@router.post("/intake", response_model=IntakeResponse)
def create_profile(
    body: IntakeRequest, user: User, store: Store, extract: Extract
) -> IntakeResponse:
    dna = extract(body.answers)
    row = store.create(
        user,
        {
            "raw_answers": {k: v.model_dump() for k, v in body.answers.items()},
            "followup_qa": [],  # follow-up questions are added by the gap finder
            "consent_aggregate": body.consent_aggregate,
            **_dna_columns(dna),
        },
    )
    return _response(row)


@router.post("/intake/{profile_id}/followups", response_model=IntakeResponse)
def answer_followups(
    profile_id: str, body: FollowupAnswers, user: User, store: Store, extract: Extract
) -> IntakeResponse:
    row = _owned(store, user, profile_id)
    given = {a.followup_id: a.answer for a in body.answers}
    followup_qa = [{**f, "answer": given.get(f["id"], f.get("answer"))} for f in row["followup_qa"]]
    answered = [f for f in followup_qa if f.get("answer")]
    answers = {k: QAnswer.model_validate(v) for k, v in row["raw_answers"].items()}
    dna = extract(answers, answered)
    # One round of follow-ups only: unanswered questions are dropped.
    updated = store.update(user, profile_id, {"followup_qa": answered, **_dna_columns(dna)})
    return _response(updated)


@router.get("/profiles", response_model=list[ProfileOut])
def list_profiles(user: User, store: Store) -> list[ProfileOut]:
    return [_profile_out(row) for row in store.list_for_user(user)]


@router.get("/profiles/{profile_id}", response_model=ProfileOut)
def get_profile(profile_id: str, user: User, store: Store) -> ProfileOut:
    return _profile_out(_owned(store, user, profile_id))


@router.patch("/profiles/{profile_id}", response_model=ProfileOut)
def update_profile(profile_id: str, body: ProfilePatch, user: User, store: Store) -> ProfileOut:
    _owned(store, user, profile_id)
    changes: dict[str, Any] = {}
    if body.dna is not None:
        changes.update(_dna_columns(body.dna))
    if body.consent_aggregate is not None:
        changes["consent_aggregate"] = body.consent_aggregate
    if not changes:
        return get_profile(profile_id, user, store)
    return _profile_out(store.update(user, profile_id, changes))


def _profile_out(row: dict[str, Any]) -> ProfileOut:
    return ProfileOut(
        id=row["id"],
        dna=AccessibilityDNA.model_validate(row["dna"]),
        consent_aggregate=row["consent_aggregate"],
        trip_only=row["trip_only"],
    )
