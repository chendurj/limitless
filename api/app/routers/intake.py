from fastapi import APIRouter, Depends

from app.deps import current_user, not_implemented
from app.models.api import (
    FollowupAnswers,
    IntakeRequest,
    IntakeResponse,
    ProfileOut,
    ProfilePatch,
)

router = APIRouter(tags=["intake"], dependencies=[Depends(current_user)])


@router.post("/intake", response_model=IntakeResponse)
def create_profile(body: IntakeRequest) -> IntakeResponse:
    raise not_implemented()


@router.post("/intake/{profile_id}/followups", response_model=IntakeResponse)
def answer_followups(profile_id: str, body: FollowupAnswers) -> IntakeResponse:
    raise not_implemented()


@router.get("/profiles/{profile_id}", response_model=ProfileOut)
def get_profile(profile_id: str) -> ProfileOut:
    raise not_implemented()


@router.patch("/profiles/{profile_id}", response_model=ProfileOut)
def update_profile(profile_id: str, body: ProfilePatch) -> ProfileOut:
    raise not_implemented()
