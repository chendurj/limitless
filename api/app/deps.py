import secrets
import uuid
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import get_settings

bearer = HTTPBearer(auto_error=False)

# The demo uses one shared bearer token instead of Supabase Auth. Every request with
# the token belongs to this one demo user.
DEMO_USER_ID = uuid.UUID("00000000-0000-4000-8000-000000000001")


def current_user(
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
) -> uuid.UUID:
    expected = get_settings().demo_bearer_token
    if not expected or creds is None or not secrets.compare_digest(creds.credentials, expected):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing or wrong bearer token")
    return DEMO_USER_ID


def not_implemented() -> HTTPException:
    return HTTPException(status.HTTP_501_NOT_IMPLEMENTED, "Not implemented yet")
