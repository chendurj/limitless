import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.config import get_settings
from app.main import app

client = TestClient(app)


@pytest.fixture
def token(monkeypatch):
    monkeypatch.setattr(get_settings(), "demo_bearer_token", "test-token")
    return {"Authorization": "Bearer test-token"}


def test_private_routes_need_the_token(token):
    assert client.post("/api/trips", json={"profile_id": "p"}).status_code == 401
    wrong = {"Authorization": "Bearer nope"}
    assert client.post("/api/trips", json={"profile_id": "p"}, headers=wrong).status_code == 401
    assert client.post("/api/trips", json={"profile_id": "p"}, headers=token).status_code == 501


def test_no_token_configured_means_no_access(monkeypatch):
    monkeypatch.setattr(get_settings(), "demo_bearer_token", "")
    headers = {"Authorization": "Bearer "}
    assert client.get("/api/trips/t", headers=headers).status_code == 401


def test_places_are_public():
    assert client.get("/api/places").status_code == 501


def test_bad_request_is_422(token):
    response = client.post("/api/trips", json={"profile_id": "p", "nights": 9}, headers=token)
    assert response.status_code == 422


def test_committed_openapi_is_current():
    committed = json.loads((Path(__file__).parents[1] / "openapi.json").read_text())
    assert committed == app.openapi(), "Run from api/: uv run python -m scripts.export_openapi"
