"""Identity verification and two-guest isolation, without external services."""

import io
import json
import uuid
from urllib.error import HTTPError, URLError

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app import deps
from app.config import get_settings
from app.db import get_profile_store, get_trip_store
from app.main import app
from app.models.dna import AccessibilityDNA
from app.routers.intake import get_extractor

from .conftest import load
from .test_intake import ANSWERS, MemoryStore
from .test_trips import Trips


@pytest.fixture
def configured(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "allow_demo_auth", False)
    monkeypatch.setattr(settings, "supabase_url", "https://example.supabase.co")
    monkeypatch.setattr(settings, "supabase_secret_key", "server-only-test-key")
    return settings


def test_verified_identity_comes_from_supabase(configured, monkeypatch):
    user_id = uuid.uuid4()

    def auth_response(request, timeout):
        assert request.full_url == "https://example.supabase.co/auth/v1/user"
        assert request.get_header("Authorization") == "Bearer signed.guest.token"
        assert request.get_header("Apikey") == "server-only-test-key"
        assert timeout == 10
        return io.BytesIO(json.dumps({"id": str(user_id), "is_anonymous": True}).encode())

    monkeypatch.setattr(deps, "urlopen", auth_response)
    assert deps.verified_user_id("signed.guest.token") == user_id


@pytest.mark.parametrize("status", [401, 403, 429, 500])
def test_auth_rejects_invalid_tokens_and_handles_outages(configured, monkeypatch, status):
    def unavailable(*args, **kwargs):
        raise HTTPError("https://example.supabase.co", status, "sensitive upstream error", {}, None)

    monkeypatch.setattr(deps, "urlopen", unavailable)
    response = TestClient(app).get("/api/trips", headers={"Authorization": "Bearer bad.jwt.token"})
    assert response.status_code == (401 if status in (401, 403) else 503)
    assert "sensitive" not in response.text


def test_network_failure_does_not_become_demo_user(configured, monkeypatch):
    monkeypatch.setattr(deps, "urlopen", lambda *a, **kw: (_ for _ in ()).throw(URLError("down")))
    with pytest.raises(HTTPException) as error:
        deps.verified_user_id("signed.guest.token")
    assert error.value.status_code == 503


def test_demo_token_is_disabled_by_default(configured, monkeypatch):
    monkeypatch.setattr(configured, "demo_bearer_token", "legacy-shared-token")
    response = TestClient(app).get(
        "/api/trips", headers={"Authorization": "Bearer legacy-shared-token"}
    )
    assert response.status_code == 401


def test_two_guests_cannot_read_or_change_each_others_records(configured, monkeypatch):
    users = {"guest.one.token": uuid.uuid4(), "guest.two.token": uuid.uuid4()}
    monkeypatch.setattr(deps, "verified_user_id", lambda token: users[token])
    profiles, trips = MemoryStore(), Trips()
    app.dependency_overrides.update(
        {
            get_profile_store: lambda: profiles,
            get_trip_store: lambda: trips,
            get_extractor: lambda: lambda *a, **kw: AccessibilityDNA.model_validate(load()),
        }
    )
    try:
        client = TestClient(app)
        first = {"Authorization": "Bearer guest.one.token"}
        second = {"Authorization": "Bearer guest.two.token"}
        created = client.post("/api/intake", headers=first, json=ANSWERS)
        assert created.status_code == 200
        profile_id = created.json()["profile_id"]
        assert profiles.rows[profile_id]["user_id"] == users["guest.one.token"]
        assert len(client.get("/api/profiles", headers=first).json()) == 1
        assert client.get("/api/profiles", headers=second).json() == []
        assert client.get(f"/api/profiles/{profile_id}", headers=second).status_code == 404
        assert (
            client.patch(
                f"/api/profiles/{profile_id}", headers=second, json={"consent_aggregate": False}
            ).status_code
            == 404
        )

        trip_id = str(uuid.uuid4())
        trips.create(users["guest.one.token"], {"id": trip_id, "profile_id": profile_id}, {})
        assert client.get("/api/trips", headers=second).json() == []
        assert client.get(f"/api/trips/{trip_id}", headers=second).status_code == 404
        assert (
            client.patch(
                f"/api/trips/{trip_id}/items/item", headers=second, json={"status": "done"}
            ).status_code
            == 404
        )
        assert (
            client.post(
                f"/api/trips/{trip_id}/feedback",
                headers=second,
                json={"transcript": "I am tired", "input_mode": "text"},
            ).status_code
            == 404
        )
        assert (
            client.post(
                f"/api/trips/{trip_id}/replan", headers=second, json={"apply_version": 1}
            ).status_code
            == 404
        )
        assert client.get("/api/trips/samples/not-a-persona").status_code == 422
    finally:
        app.dependency_overrides.clear()


@pytest.mark.parametrize("body", [{}, {"id": "not-a-uuid"}, {"id": None}, []])
def test_bad_upstream_user_is_rejected(configured, monkeypatch, body):
    monkeypatch.setattr(deps, "urlopen", lambda *a, **kw: io.BytesIO(json.dumps(body).encode()))
    with pytest.raises(HTTPException) as error:
        deps.verified_user_id("signed.guest.token")
    assert error.value.status_code == 401
