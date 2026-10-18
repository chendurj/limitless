from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


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
    allow_demo_auth: bool = False
    mapillary_access_token: str = ""
    perceptron_api_key: str = ""

    cors_origins: list[str] = ["http://localhost:3000"]


@lru_cache
def get_settings() -> Settings:
    return Settings()
