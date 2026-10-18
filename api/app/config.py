import json
from functools import lru_cache
from typing import Annotated

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

QUOTES = "\"'“”‘’ "


class Settings(BaseSettings):
    """Server settings, read from api/.env. Every secret here stays on the server."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    openai_api_key: str = ""
    openai_model_extract: str = "gpt-6-luna"
    openai_model_compose: str = "gpt-6.1-sol"
    google_server_key: str = ""
    supabase_url: str = ""
    supabase_secret_key: str = ""
    database_url: str = ""
    demo_bearer_token: str = ""
    mapillary_access_token: str = ""
    perceptron_api_key: str = ""

    # A JSON list, or origins separated by commas. A wrong format must not stop the server.
    cors_origins: Annotated[list[str], NoDecode] = ["http://localhost:3000"]

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _parse_origins(cls, value: object) -> object:
        if not isinstance(value, str):
            return value
        text = value.strip().strip("“”")
        try:
            parsed = json.loads(text)
            if isinstance(parsed, list):
                return [str(origin).strip().rstrip("/") for origin in parsed if str(origin).strip()]
        except json.JSONDecodeError:
            pass
        parts = text.strip("[]").split(",")
        return [part.strip(QUOTES).rstrip("/") for part in parts if part.strip(QUOTES)]


@lru_cache
def get_settings() -> Settings:
    return Settings()
