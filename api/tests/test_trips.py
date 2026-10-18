"""Trip route tests with in-memory stores. No database and no LLM."""

import copy
import uuid

import pytest
from fastapi.testclient import TestClient

from app.config import get_settings
from app.db import get_feedback_store, get_place_store, get_profile_store, get_trip_store
from app.deps import DEMO_USER_ID
from app.main import app
from app.models.api import FeedbackParsed
from app.routers.trips import get_composer, get_feedback_parser, get_weather

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
            "current": 1,
            "versions": {1: (copy.deepcopy(plan), {})},
        }

    def list_for_user(self, user_id):
        return [
            self.get(user_id, tid)["plan"]
            for tid, row in self.trips.items()
            if row["user_id"] == user_id
        ]

    def get(self, user_id, trip_id, version=None):
        t = self.trips.get(trip_id)
        if not t or t["user_id"] != user_id:
            return None
        v = version or t["current"]
        plan, overrides = t["versions"][v]
        return {
            "id": trip_id,
            "profile_id": t["row"]["profile_id"],
            "current_version": t["current"],
            "version": v,
            "plan": copy.deepcopy(plan),
            "overrides": overrides,
        }

    def save_plan(self, user_id, trip_id, version, plan):
        t = self.trips[trip_id]
        t["versions"][version] = (copy.deepcopy(plan), t["versions"][version][1])

    def add_version(self, user_id, trip_id, plan, overrides, reason):
        t = self.trips[trip_id]
        v = max(t["versions"]) + 1
        t["versions"][v] = ({**copy.deepcopy(plan), "version": v}, overrides)
        return v

    def apply(self, user_id, trip_id, version):
        t = self.trips.get(trip_id)
        if not t or t["user_id"] != user_id or version not in t["versions"]:
            return False
        t["current"] = version
        return True


class Feedbacks:
    def __init__(self):
        self.rows = []

    def create(self, user_id, row):
        self.rows.append(row)
        return f"f{len(self.rows)}"


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
            get_feedback_store: lambda: FEEDBACKS,
            get_feedback_parser: lambda: PARSER,
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
    saved = client.get("/api/trips", headers=AUTH)
    assert saved.json() == [trip]
    assert saved.headers["Cache-Control"] == "private, no-store"


def test_public_sample_is_allowlisted_and_cannot_be_edited_by_guests(api, monkeypatch):
    from app import deps

    client, profile_id, trips, _ = api
    trip = client.post("/api/trips", json={"profile_id": profile_id}, headers=AUTH).json()
    sample_id = "00000000-0000-4000-8000-0000000000b2"
    trips.create(
        DEMO_USER_ID, {"id": sample_id, "profile_id": profile_id}, {**trip, "id": sample_id}
    )
    assert client.get("/api/trips/samples/deaf").json()["id"] == sample_id
    monkeypatch.setattr(deps, "verified_user_id", lambda _: uuid.uuid4())
    guest = {"Authorization": "Bearer guest.jwt.token"}
    assert client.get(f"/api/trips/{sample_id}", headers=guest).status_code == 404
    assert (
        client.post(
            f"/api/trips/{sample_id}/replan", headers=guest, json={"apply_version": 1}
        ).status_code
        == 404
    )


def test_mark_an_item_done(api):
    client, profile_id, _, _ = api
    trip = client.post("/api/trips", json={"profile_id": profile_id}, headers=AUTH).json()
    item = trip["days"][0]["items"][0]
    patched = client.patch(f"/api/trips/{trip['id']}/items/{item['id']}", json={"status": "done", "locked": True},
                           headers=AUTH)  # fmt: skip
    assert patched.json()["status"] == "done" and patched.json()["locked"] is True
    saved = client.get(f"/api/trips/{trip['id']}", headers=AUTH).json()
    assert saved["days"][0]["items"][0]["status"] == "done"


def test_manual_stop_edits_persist_and_can_be_restored(api):
    client, profile_id, _, _ = api
    trip = client.post("/api/trips", json={"profile_id": profile_id}, headers=AUTH).json()
    item = first_stop(trip)
    url = f"/api/trips/{trip['id']}/items/{item['id']}"
    changed = client.patch(
        url,
        headers=AUTH,
        json={"status": "skipped", "locked": True, "user_note": "  Bring my camera.  "},
    )
    assert changed.status_code == 200
    assert changed.json()["user_note"] == "Bring my camera."
    saved = client.get("/api/trips", headers=AUTH).json()[0]
    stop = next(i for d in saved["days"] for i in d["items"] if i["id"] == item["id"])
    assert stop["status"] == "skipped" and stop["locked"] is True
    assert stop["user_note"] == "Bring my camera."
    restored = client.patch(
        url, headers=AUTH, json={"status": "planned", "locked": False, "user_note": ""}
    ).json()
    assert restored["status"] == "planned" and restored["user_note"] == ""
    assert client.patch(url, headers=AUTH, json={"user_note": "x" * 501}).status_code == 422
    assert (
        client.patch(url, headers=AUTH, json={"title": "Unverified replacement"}).status_code == 422
    )


def test_ai_replanning_preserves_skipped_stops_and_personal_notes(api):
    client, profile_id, _, _ = api
    trip = client.post("/api/trips", json={"profile_id": profile_id}, headers=AUTH).json()
    item = first_stop(trip)
    client.patch(
        f"/api/trips/{trip['id']}/items/{item['id']}",
        headers=AUTH,
        json={"status": "skipped", "user_note": "Visit another day."},
    )
    response = send(client, trip, fatigue="high", terrain_difficulty="high")
    assert response.status_code == 200
    proposed = response.json()["replan"]["trip"]
    saved = next(i for d in proposed["days"] for i in d["items"] if i["id"] == item["id"])
    assert saved["status"] == "skipped" and saved["user_note"] == "Visit another day."


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


# --- feedback and re-plan ----------------------------------------------------------------------

FEEDBACKS = Feedbacks()


class Parser:
    """A fake parser. place_ref is the p-id of the place named in self.place_name."""

    def __init__(self):
        self.fields = {}
        self.place_name = None

    def __call__(self, transcript, places, summary, now):
        refs = {p["name"]: p["id"] for p in places}
        fields = dict(self.fields)
        for other in fields.get("other_places", []):
            other["place_ref"] = refs.get(other["place_ref"], other["place_ref"])  # name -> p-id
        return parsed_feedback(place_ref=refs.get(self.place_name, "none"), **fields)


PARSER = Parser()


def parsed_feedback(**fields):
    base = {
        "place_ref": "none",
        "wheelchair_difficulty": None,
        "terrain_difficulty": None,
        "fatigue": None,
        "crowding": None,
        "noise": None,
        "restroom_ok": None,
        "entrance_ok": None,
        "captions_ok": None,
        "booking_phone_only": None,
        "needs_met": None,
        "sentiment": -5,
        "needs_rest_now": False,
        "wants_to_skip_rest_of_today": False,
        "summary": "A traveler reported a problem.",
        "tip": None,
        "user_ack": "Thanks, I heard you.",
        "other_places": [],
    }
    return FeedbackParsed(**{**base, **fields})


def first_stop(trip):
    return next(i for d in trip["days"] for i in d["items"] if i["place"])


def send(client, trip, **fields):
    PARSER.fields = fields
    body = {"transcript": "x", "input_mode": "voice"}
    return client.post(f"/api/trips/{trip['id']}/feedback", json=body, headers=AUTH)


def test_feedback_proposes_then_apply_and_undo(api):
    client, profile_id, _, _ = api
    trip = client.post(
        "/api/trips", json={"profile_id": profile_id, "nights": 2}, headers=AUTH
    ).json()
    stop = first_stop(trip)
    client.patch(
        f"/api/trips/{trip['id']}/items/{stop['id']}", json={"status": "done"}, headers=AUTH
    )
    PARSER.place_name = stop["title"]
    response = send(client, trip, fatigue="high", terrain_difficulty="high", needs_rest_now=True)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["parsed"]["sentiment"] == -2  # clamped
    plan = body["replan"]
    assert plan["changed"] and plan["version"] == 2
    assert any(c["type"] == "rest_added" for c in plan["changes"])
    assert "Apply" in plan["message"]
    new_first = first_stop(plan["trip"])
    assert new_first["id"] == stop["id"] and new_first["status"] == "done"  # the done stop stays
    url = f"/api/trips/{trip['id']}"
    assert client.get(url, headers=AUTH).json()["version"] == 1  # not applied yet
    assert FEEDBACKS.rows[-1]["fatigue"] == "high"
    applied = client.post(f"{url}/replan", json={"apply_version": 2}, headers=AUTH).json()
    assert applied["version"] == 2
    assert client.get(url, headers=AUTH).json()["version"] == 2
    undo = client.post(f"{url}/replan", json={"apply_version": 1}, headers=AUTH).json()
    assert undo["message"] == "Your earlier plan is back."
    assert client.get(url, headers=AUTH).json()["version"] == 1
    assert client.post(f"{url}/replan", json={"apply_version": 9}, headers=AUTH).status_code == 404


def test_no_change_needed(api):
    client, profile_id, _, _ = api
    trip = client.post(
        "/api/trips", json={"profile_id": profile_id, "nights": 1}, headers=AUTH
    ).json()
    PARSER.place_name = first_stop(trip)["title"]
    plan = send(client, trip, sentiment=2).json()["replan"]
    assert not plan["changed"] and plan["version"] == 1
    assert "nothing changes" in plan["message"]


def test_no_captions_report_removes_that_museum(make_dna):
    from datetime import date

    from app.services.planner import build_trip
    from app.services.replan import Overrides, access_fits, apply_feedback, override_facts, repair

    from .test_planner import open_day

    dna = open_day(
        make_dna(
            needs=["deaf_hoh", "non_speaking"],
            mobility__equipment=[],
            mobility__walking="long_ok",
            mobility__slope_tolerance="steep_ok",
            mobility__stairs_tolerance="ok",
            mobility__surfaces_to_avoid=[],
            requirements__must_have=["captions_or_asl"],
            preferences__interests=["museums_art"],
            communication__phone_calls="no",
        )
    )
    today = date(2099, 1, 1)
    trip = build_trip(dna, PLACES, FACTS, start_date=date(2099, 1, 10), nights=1, today=today)
    museum = next(i for d in trip.days for i in d.items if i.place and i.place.id == "art")
    new_dna, overrides, reasons = apply_feedback(
        dna, parsed_feedback(captions_ok=False), "art", Overrides()
    )
    assert overrides.facts[0]["attribute"] == "captions_asl" and "captions" in reasons[0]
    before = access_fits(dna, PLACES, FACTS, {}, today)
    fixed = repair(trip, new_dna, PLACES, FACTS, override_facts(overrides), 0, None, today, before)
    assert "art" not in [i.place.id for d in fixed.trip.days for i in d.items if i.place]
    change = next(c for c in fixed.changes if c.old_item_id == museum.id)
    assert change.type in ("replaced", "removed") and "captions" in change.reason


def test_feedback_about_two_places(api, monkeypatch):
    import app.routers.trips as routes

    client, profile_id, _, _ = api
    trip = client.post(
        "/api/trips", json={"profile_id": profile_id, "nights": 1}, headers=AUTH
    ).json()
    stops = [i for d in trip["days"] for i in d["items"] if i["place"]]
    first, second = stops[0], stops[1]
    seen = {}

    def spy(dna, parsed, place_id, old, others=()):
        seen.update(place_id=place_id, others=others)
        return real(dna, parsed, place_id, old, others)

    real = routes.apply_feedback
    monkeypatch.setattr(routes, "apply_feedback", spy)
    PARSER.place_name = first["title"]
    other = {"restroom_ok": None, "entrance_ok": None, "captions_ok": None}
    response = send(client, trip, captions_ok=False, other_places=[
        {"place_ref": second["title"], "booking_phone_only": True, **other},
        {"place_ref": first["title"], "booking_phone_only": True, **other},  # the main place again
        {"place_ref": "p99", "booking_phone_only": True, **other},  # not in the trip
    ])  # fmt: skip
    assert response.status_code == 200, response.text
    assert seen["place_id"] == first["place"]["id"]
    assert [(pid, r.booking_phone_only) for pid, r in seen["others"]] == [
        (second["place"]["id"], True)
    ]
