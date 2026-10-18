"""Anonymous app reviews."""

import pytest
from fastapi.testclient import TestClient

from app.db import get_review_store
from app.main import app
from app.routers import reviews

client = TestClient(app)


class MemoryReviews:
    def __init__(self):
        self.rows = []

    def create(self, rating, body, context):
        self.rows.append((rating, body, context))


@pytest.fixture
def store():
    memory = MemoryReviews()
    app.dependency_overrides[get_review_store] = lambda: memory
    reviews._recent.clear()
    yield memory
    app.dependency_overrides.clear()
    reviews._recent.clear()


def test_a_review_is_stored_without_a_token(store):
    response = client.post(
        "/api/reviews", json={"rating": 5, "body": "  It found captions.  ", "context": "Deaf"}
    )
    assert response.status_code == 202
    assert store.rows == [(5, "It found captions.", "Deaf")]


@pytest.mark.parametrize(
    "body",
    [
        {"rating": 0, "body": "x"},
        {"rating": 6, "body": "x"},
        {"rating": 5, "body": ""},
        {"rating": 5, "body": "x" * 1001},
        {"rating": 5, "body": "x", "name": "extra field"},
    ],
)
def test_bad_reviews_are_rejected(store, body):
    assert client.post("/api/reviews", json=body).status_code == 422
    assert store.rows == []


def test_blank_review_is_rejected(store):
    assert client.post("/api/reviews", json={"rating": 4, "body": "   "}).status_code == 422


def test_the_hidden_field_drops_spam(store):
    response = client.post("/api/reviews", json={"rating": 5, "body": "buy", "website": "x"})
    assert response.status_code == 202
    assert store.rows == []


def test_one_address_is_rate_limited(store):
    for _ in range(reviews.LIMIT):
        assert client.post("/api/reviews", json={"rating": 5, "body": "ok"}).status_code == 202
    assert client.post("/api/reviews", json={"rating": 5, "body": "ok"}).status_code == 429
