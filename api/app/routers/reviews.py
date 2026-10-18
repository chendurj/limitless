"""Anonymous reviews of the app, from the Reviews page.

No account is needed, so the route limits how often one address can send a review. A review
is stored as "pending" and is not shown until a team member approves it.
"""

import time
from collections import defaultdict, deque
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.db import ReviewStore, get_review_store
from app.models.api import ReviewAccepted, ReviewIn

router = APIRouter(prefix="/reviews", tags=["reviews"])
Reviews = Annotated[ReviewStore, Depends(get_review_store)]

LIMIT, WINDOW_S = 3, 600  # at most 3 reviews from one address in 10 minutes
_recent: dict[str, deque[float]] = defaultdict(deque)


def _allow(address: str, now: float) -> bool:
    times = _recent[address]
    while times and now - times[0] > WINDOW_S:
        times.popleft()
    if len(times) >= LIMIT:
        return False
    times.append(now)
    return True


@router.post("", response_model=ReviewAccepted, status_code=status.HTTP_202_ACCEPTED)
def create_review(body: ReviewIn, request: Request, reviews: Reviews) -> ReviewAccepted:
    if body.website:  # only bots fill the hidden field; accept and drop it
        return ReviewAccepted(status="received")
    address = request.client.host if request.client else "unknown"
    if not _allow(address, time.monotonic()):
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS, "Too many reviews. Please try again later."
        )
    text = body.body.strip()
    if not text:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Write a review first.")
    reviews.create(body.rating, text, body.context.strip())
    return ReviewAccepted(status="received")
