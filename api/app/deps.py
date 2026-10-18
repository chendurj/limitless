import json
import secrets
import uuid
from typing import Annotated
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import get_settings

bearer = HTTPBearer(auto_error=False)

# Reserved for seeded examples and explicitly enabled legacy demos, never guests.
DEMO_USER_ID = uuid.UUID("00000000-0000-4000-8000-000000000001")


def verified_user_id(token: str) -> uuid.UUID:
    """Ask Supabase Auth to verify the token; never trust a decoded JWT or client user_id."""
    settings = get_settings()
    if not settings.supabase_url or not settings.supabase_secret_key:
        raise HTTPException(503, "Guest sign-in is not configured on the server.")
    request = Request(
        f"{settings.supabase_url.rstrip('/')}/auth/v1/user",
        headers={"apikey": settings.supabase_secret_key, "Authorization": f"Bearer {token}"},
    )
    try:
        with urlopen(request, timeout=10) as response:
            user = json.load(response)
        return uuid.UUID(user["id"])
    except HTTPError as exc:
        if exc.code in (401, 403):
            raise HTTPException(
                401, "Your guest session has expired. Please return to My trips."
            ) from None
        raise HTTPException(503, "Sign-in is temporarily unavailable. Please try again.") from None
    except (URLError, TimeoutError, OSError):
        raise HTTPException(503, "Sign-in is temporarily unavailable. Please try again.") from None
    except (ValueError, KeyError, TypeError):
        raise HTTPException(401, "Invalid guest session.") from None


def current_user(
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
) -> uuid.UUID:
    if creds is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Continue as guest to access your trips.")
    settings = get_settings()
    if (
        settings.allow_demo_auth
        and settings.demo_bearer_token
        and secrets.compare_digest(creds.credentials, settings.demo_bearer_token)
    ):
        return DEMO_USER_ID
    token = creds.credentials
    if len(token) > 8192 or len(token.split(".")) != 3:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid guest session.")
    return verified_user_id(token)
