import uuid

import pytest
from fastapi.testclient import TestClient

from app.config import get_settings
from app.db import get_profile_store
from app.llm.client import LLMUnavailable
from app.main import app
from app.models.dna import AccessibilityDNA
from app.routers.intake import get_extractor
from app.services.similarity import dna_vector

from .conftest import load

AUTH = {"Authorization": "Bearer test-token"}
ANSWERS = {"answers": {"needs": {"selected": ["mobility_device"]}}, "consent_aggregate": True}


class MemoryStore:
    def __init__(self):
        self.rows = {}

    def create(self, user_id, row):
        pid = str(uuid.uuid4())
        self.rows[pid] = {"id": pid, "user_id": user_id, **row}
        return self.rows[pid]

    def list_for_user(self, user_id):
        return [row for row in reversed(list(self.rows.values())) if row["user_id"] == user_id]

    def get(self, user_id, profile_id):
        row = self.rows.get(profile_id)
        return row if row and row["user_id"] == user_id else None

    def update(self, user_id, profile_id, changes):
        row = self.get(user_id, profile_id)
        if row:
            row.update(changes)
        return row


@pytest.fixture
def api(monkeypatch):
    monkeypatch.setattr(get_settings(), "demo_bearer_token", "test-token")
    store = MemoryStore()
    calls = []

    def fake_extract(answers, followup_qa=None, today=None):
        calls.append((answers, followup_qa))
        return AccessibilityDNA.model_validate(load())

    app.dependency_overrides[get_profile_store] = lambda: store
    app.dependency_overrides[get_extractor] = lambda: fake_extract
    yield TestClient(app), store, calls
    app.dependency_overrides.clear()


def test_intake_saves_a_profile(api):
    client, store, calls = api
    response = client.post("/api/intake", json=ANSWERS, headers=AUTH)
    assert response.status_code == 200
    body = response.json()
    assert body["ready"] is True and body["followups"] == []
    row = store.rows[body["profile_id"]]
    assert row["consent_aggregate"] is True
    assert row["raw_answers"]["needs"]["selected"] == ["mobility_device"]
    assert row["dna_vector"].startswith("[1.0000,")  # manual wheelchair
    assert calls[0][0]["needs"].selected == ["mobility_device"]


def test_get_and_patch_profile(api):
    client, _, _ = api
    pid = client.post("/api/intake", json=ANSWERS, headers=AUTH).json()["profile_id"]
    got = client.get(f"/api/profiles/{pid}", headers=AUTH).json()
    assert got["dna"]["mobility"]["equipment"] == ["manual_wheelchair"]
    patched = client.patch(f"/api/profiles/{pid}", json={"consent_aggregate": False}, headers=AUTH)
    assert patched.json()["consent_aggregate"] is False


def test_other_users_profile_is_not_found(api):
    client, store, _ = api
    pid = client.post("/api/intake", json=ANSWERS, headers=AUTH).json()["profile_id"]
    store.rows[pid]["user_id"] = uuid.uuid4()
    response = client.get(f"/api/profiles/{pid}", headers=AUTH)
    assert response.status_code == 404
    assert response.json() == {"error": {"code": "NOT_FOUND", "message": "Profile not found"}}


def test_followup_answers_rerun_extraction(api):
    client, store, calls = api
    pid = client.post("/api/intake", json=ANSWERS, headers=AUTH).json()["profile_id"]
    store.rows[pid]["followup_qa"] = [
        {
            "id": "f1",
            "question": "Can someone push on slopes?",
            "target_field": "party.companion_assist",
        }
    ]
    body = {"answers": [{"followup_id": "f1", "answer": "Yes, my brother can."}]}
    response = client.post(f"/api/intake/{pid}/followups", json=body, headers=AUTH)
    assert response.json()["ready"] is True
    assert calls[-1][1][0]["answer"] == "Yes, my brother can."


def test_llm_failure_gives_502(api):
    client, _, _ = api

    def broken(*args, **kwargs):
        raise LLMUnavailable("timeout")

    app.dependency_overrides[get_extractor] = lambda: broken
    response = client.post("/api/intake", json=ANSWERS, headers=AUTH)
    assert response.status_code == 502
    assert response.json()["error"]["code"] == "LLM_UNAVAILABLE"


def test_validation_error_format(api):
    client, _, _ = api
    response = client.post("/api/intake", json={"answers": {}, "extra": 1}, headers=AUTH)
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


def test_dna_vector_is_16_numbers_in_range(make_dna):
    vector = dna_vector(make_dna())
    assert len(vector) == 16
    assert all(0 <= v <= 1 for v in vector)
