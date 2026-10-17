"""Trip route tests with in-memory stores. No database and no LLM."""

import copy
import uuid

import pytest
from fastapi.testclient import TestClient

from app.config import get_settings
from app.db import get_place_store, get_profile_store, get_trip_store
from app.deps import DEMO_USER_ID
from app.main import app
from app.routers.trips import get_composer, get_weather

from .conftest import load
from .test_intake import MemoryStore
from .test_planner import FACTS, PLACES

AUTH = {"Authorization": "Bearer test-token"}


class Places:
    def __init__(self, places=PLACES):
        self.places = places

    def load(self):
        return self.places, FACTS


class Trips:
    def __init__(self):
        self.trips = {}

    def create(self, user_id, row, plan):
        self.trips[row["id"]] = {
            "user_id": user_id,
            "row": row,
            "versions": {1: copy.deepcopy(plan)},
        }

    def get(self, user_id, trip_id, version=None):
        t = self.trips.get(trip_id)
        if not t or t["user_id"] != user_id:
            return None
        v = version or max(t["versions"])
        return {
            "id": trip_id,
            "current_version": max(t["versions"]),
            "version": v,
            "plan": t["versions"][v],
        }

    def save_plan(self, user_id, trip_id, version, plan):
        self.trips[trip_id]["versions"][version] = copy.deepcopy(plan)


@pytest.fixture
def api(monkeypatch):
    monkeypatch.setattr(get_settings(), "demo_bearer_token", "test-token")
    profiles, trips, places = MemoryStore(), Trips(), Places()
    dna = load(
        preferences__day_start=None, preferences__day_end=None, trip__start_date="2099-01-10"
    )
    profile = profiles.create(DEMO_USER_ID, {"dna": dna, "raw_answers": {}, "followup_qa": [],
                                             "consent_aggregate": False, "trip_only": False})  # fmt: skip
    app.dependency_overrides.update(
        {
            get_profile_store: lambda: profiles,
            get_trip_store: lambda: trips,
            get_place_store: lambda: places,
            get_composer: lambda: None,  # greedy picks
            get_weather: lambda: None,
        }
    )
    yield TestClient(app), profile["id"], trips, places
    app.dependency_overrides.clear()


def test_create_and_read_a_trip(api):
    client, profile_id, _, _ = api
    response = client.post("/api/trips", json={"profile_id": profile_id, "nights": 2}, headers=AUTH)
    assert response.status_code == 200, response.text
    trip = response.json()
    assert trip["start_date"] == "2099-01-10" and trip["nights"] == 2 and len(trip["days"]) == 2
    assert trip["travelers"] == 4  # from the profile's party size
    assert any(e["place_id"] == "stairs" for e in trip["excluded"])
    assert trip["disclaimer"]
    again = client.get(f"/api/trips/{trip['id']}", headers=AUTH).json()
    assert again == trip


def test_mark_an_item_done(api):
    client, profile_id, _, _ = api
    trip = client.post("/api/trips", json={"profile_id": profile_id}, headers=AUTH).json()
    item = trip["days"][0]["items"][0]
    patched = client.patch(f"/api/trips/{trip['id']}/items/{item['id']}", json={"status": "done", "locked": True},
                           headers=AUTH)  # fmt: skip
    assert patched.json()["status"] == "done" and patched.json()["locked"] is True
    saved = client.get(f"/api/trips/{trip['id']}", headers=AUTH).json()
    assert saved["days"][0]["items"][0]["status"] == "done"


def test_other_users_trip_is_not_found(api):
    client, profile_id, trips, _ = api
    trip = client.post("/api/trips", json={"profile_id": profile_id}, headers=AUTH).json()
    trips.trips[trip["id"]]["user_id"] = uuid.uuid4()
    assert client.get(f"/api/trips/{trip['id']}", headers=AUTH).status_code == 404


def test_unknown_profile_and_bad_dates(api):
    client, profile_id, _, _ = api
    assert (
        client.post("/api/trips", json={"profile_id": str(uuid.uuid4())}, headers=AUTH).status_code
        == 404
    )
    past = client.post(
        "/api/trips", json={"profile_id": profile_id, "start_date": "2020-01-01"}, headers=AUTH
    )
    assert past.status_code == 422
    assert (
        client.post(
            "/api/trips", json={"profile_id": profile_id, "nights": 9}, headers=AUTH
        ).status_code
        == 422
    )


def test_no_places_gives_409(api):
    client, profile_id, _, places = api
    places.places = []
    response = client.post("/api/trips", json={"profile_id": profile_id}, headers=AUTH)
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "CONFLICT"


def test_place_routes(api):
    client, *_ = api
    museums = client.get("/api/places", params={"category": "museum"}).json()
    assert {p["id"] for p in museums} == {"art", "hist", "stairs"}
    art = client.get("/api/places/art").json()
    assert any("ASL" in f["detail"] for f in art["facts"])
    assert client.get("/api/places/nope").status_code == 404


def test_dumps_handles_lists_of_models():
    from app.db import dumps
    from app.models.api import ExcludedPlace

    out = dumps([ExcludedPlace(place_id="a", name="A", reasons=["r"], fact_ids=[1])])
    assert out == [{"place_id": "a", "name": "A", "reasons": ["r"], "fact_ids": [1]}]
