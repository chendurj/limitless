import pytest

from app.config import Settings

SITE = "https://limitless.vercel.app"


@pytest.mark.parametrize(
    "value",
    [
        f'["{SITE}"]',
        SITE,
        f"{SITE}/",
        f"[{SITE}]",
        f"“{SITE}”",
        f"“[“{SITE}”]”",
        f' "{SITE}" ',
    ],
)
def test_cors_origins_accepts_common_formats(monkeypatch, value):
    monkeypatch.setenv("CORS_ORIGINS", value)
    assert Settings(_env_file=None).cors_origins == [SITE]


def test_cors_origins_accepts_a_list(monkeypatch):
    monkeypatch.setenv("CORS_ORIGINS", f"{SITE}, https://limitless.example")
    assert Settings(_env_file=None).cors_origins == [SITE, "https://limitless.example"]
