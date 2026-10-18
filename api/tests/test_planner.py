"""Planner tests. The places and facts here are test data, not real San Diego facts."""

from datetime import date, datetime
from itertools import count

import pytest
from pydantic import BaseModel

from app.llm.client import LLMUnavailable
from app.llm.compose import output_model
from app.services.facts import Fact
from app.services.planner import build_trip
from app.services.rules import Place
from app.validators import grounding

from .test_scoring import ankle, deaf_non_speaking  # noqa: F401  (fixtures)

TODAY = date(2026, 10, 17)
START = date(2026, 10, 23)
_ids = count(1000)


def fact(attribute, value, detail, confidence="VERIFIED", source="official"):
    return Fact(next(_ids), attribute, value, detail, confidence, source)


def place(
    pid,
    name,
    category,
    hood,
    lat,
    lng,
    minutes=90,
    exertion=2,
    indoor=True,
    tags=(),
    subs=(),
    meal=None,
):
    return Place(
        pid, name, category, minutes, subs, tags, indoor, 4.5, hood, lat, lng, exertion, meal
    )


PLACES = [
    place(
        "art", "Test Art Museum", "museum", "balboa_park", 32.732, -117.150, tags=("museums_art",)
    ),
    place(
        "hist",
        "Test History Museum",
        "museum",
        "balboa_park",
        32.731,
        -117.148,
        tags=("history", "museums_art"),
    ),
    place(
        "stairs",
        "Test Stair Museum",
        "museum",
        "balboa_park",
        32.733,
        -117.151,
        tags=("museums_art",),
    ),
    place(
        "zoo",
        "Test Zoo",
        "attraction",
        "balboa_park",
        32.735,
        -117.149,
        180,
        4,
        False,
        ("zoos_aquariums",),
    ),
    place(
        "oldtown",
        "Test Old Town Park",
        "park",
        "old_town",
        32.754,
        -117.197,
        90,
        2,
        False,
        ("history",),
    ),
    place(
        "cove",
        "Test Cove",
        "beach",
        "la_jolla",
        32.850,
        -117.272,
        90,
        2,
        False,
        ("beaches", "nature"),
    ),
    place(
        "pier",
        "Test Pier",
        "photo_spot",
        "la_jolla",
        32.866,
        -117.257,
        45,
        1,
        False,
        ("photography",),
    ),
    place(
        "r1",
        "Test Taqueria",
        "restaurant",
        "little_italy",
        32.724,
        -117.169,
        60,
        1,
        subs=("mexican",),
    ),
    place(
        "r2",
        "Test Trattoria",
        "restaurant",
        "little_italy",
        32.725,
        -117.168,
        60,
        1,
        subs=("italian",),
    ),
    place("r3", "Test Grill", "restaurant", "balboa_park", 32.730, -117.147, 60, 1),
    place(
        "r4",
        "Test Fish House",
        "restaurant",
        "la_jolla",
        32.848,
        -117.273,
        60,
        1,
        subs=("seafood",),
    ),
    place(
        "r5", "Test Cantina", "restaurant", "old_town", 32.753, -117.196, 60, 1, subs=("mexican",)
    ),
    place(
        "r6",
        "Test Noodle Bar",
        "restaurant",
        "la_jolla",
        32.847,
        -117.271,
        60,
        1,
        subs=("east_asian",),
    ),
    place("r7", "Test Bistro", "restaurant", "old_town", 32.752, -117.195, 60, 1),
    place("r8", "Test Diner", "restaurant", "balboa_park", 32.729, -117.146, 60, 1),
    place(
        "d1",
        "Test Coffee Bar",
        "cafe",
        "little_italy",
        32.726,
        -117.170,
        30,
        1,
        subs=("desserts_cafes",),
    ),
]
STEP_FREE = "entrance_step_free"


def facts_for(pid: str) -> list[Fact]:
    common = [
        fact(STEP_FREE, "yes", "Main entrance is step-free."),
        fact("seating", "plenty", "Benches throughout."),
    ]
    special = {
        "stairs": [fact("stairs", "required", "The only entrance has 12 steps.")],
        "art": [fact("captions_asl", "yes", "Captioned videos and ASL tours on request.")],
        "hist": [fact("captions_asl", "no", "Audio-only guided tour.")],
        "zoo": [
            fact("max_slope", "moderate", "Many paths are hilly."),
            fact("typical_walk_m", "2500", "Loop is about 2500 m."),
        ],
        "cove": [fact("terrain", "sand", "Sand beach with no mat.")],
        "r1": [fact("booking_phone_only", "yes", "Reservations by phone only.")],
        "r2": [
            fact("online_booking", "yes", "Book online."),
            fact("text_contact", "yes", "Answers texts."),
        ],
    }
    return common + special.get(pid, [])


FACTS = {p.id: facts_for(p.id) for p in PLACES}


def open_day(dna):
    """Use the pace's default day window instead of the fixture's 09:00-18:00."""
    prefs = dna.preferences.model_copy(update={"day_start": None, "day_end": None})
    return dna.model_copy(update={"preferences": prefs})


def trip(dna, **kwargs):
    return build_trip(
        open_day(dna), PLACES, FACTS, start_date=START, nights=3, today=TODAY, **kwargs
    )


def all_items(t):
    return [i for d in t.days for i in d.items]


def check_invariants(t, dna):
    excluded = {e.place_id for e in t.excluded}
    seen = set()
    for day in t.days:
        visits = [i for i in day.items if i.kind == "visit"]
        assert (
            len(visits)
            <= {"relaxed": 2, "moderate": 3, "busy": 4}[dna.preferences.pace or "relaxed"]
        )
        unknown = [i for i in visits if any(w.startswith("Not verified") for w in i.warnings)]
        assert len(unknown) <= 1
        starts = [datetime.fromisoformat(i.start) for i in day.items]
        assert starts == sorted(starts)
        for item in day.items:
            if item.place is None:
                assert item.kind == "rest"
                continue
            assert item.place.id not in excluded
            assert item.place.id not in seen, "a place is used twice"
            seen.add(item.place.id)
            own = {f.fact_id for f in item.place.facts}
            assert set(item.cited_fact_ids) <= own, "cited a fact of another place"


# --- greedy path (no LLM) ---------------------------------------------------------------------


def test_ankle_trip_without_llm(ankle):  # noqa: F811
    t = trip(ankle)
    check_invariants(t, ankle)
    assert len(t.days) == 3
    skipped = {e.place_id: e for e in t.excluded}
    assert "stairs" in skipped and "12 steps" in skipped["stairs"].reasons[0]
    assert "zoo" in skipped  # moderate slope with only light help, and a long walk
    assert "cove" in skipped or "cove" not in {i.place.id for i in all_items(t) if i.place}
    for day in t.days:
        kinds = [i.kind for i in day.items]
        assert kinds.count("meal") >= 2, "lunch and dinner"


def test_deaf_trip_is_different(ankle, deaf_non_speaking):  # noqa: F811
    a, d = trip(ankle), trip(deaf_non_speaking)
    check_invariants(d, deaf_non_speaking)
    assert {e.place_id for e in a.excluded} != {e.place_id for e in d.excluded}
    assert "hist" in {e.place_id for e in d.excluded}  # captions are a must-have
    assert "zoo" not in {e.place_id for e in d.excluded}
    for day in d.days:
        assert [i.kind for i in day.items].count("meal") >= 2, "lunch and dinner on every day"


def test_meals_are_in_their_windows(ankle):  # noqa: F811
    for day in trip(ankle).days:
        meals = [
            datetime.fromisoformat(i.start)
            for i in day.items
            if i.kind == "meal" and i.place.category == "restaurant"
        ]
        lunch, dinner = meals[0], meals[-1]
        assert (11, 45) <= (lunch.hour, lunch.minute) <= (13, 30)
        assert (17, 30) <= (dinner.hour, dinner.minute) <= (19, 30)


def test_rest_after_tiring_stop(make_dna):
    dna = make_dna(
        needs=["limited_mobility"], mobility__equipment=["cane"], mobility__walking="long_ok",
        mobility__slope_tolerance="steep_ok", mobility__surfaces_to_avoid=[], requirements__must_have=[],
        party__companion_assist="no", preferences__pace="busy", preferences__interests=["zoos_aquariums"],
    )  # fmt: skip
    items = all_items(trip(dna))
    zoo = next(i for i, it in enumerate(items) if it.place and it.place.id == "zoo")
    assert items[zoo + 1].kind == "rest"
    assert "Benches throughout" in items[zoo + 1].rationale


# --- LLM composer path ---------------------------------------------------------------------------


def fake_composer(make_items):
    def composer(request, short_ids):
        model = output_model(short_ids)
        ids = {c["name"]: c["id"] for day in request["days"] for c in day["candidates"]}
        return model.model_validate(make_items(ids, request))

    return composer


def test_llm_output_is_grounded(deaf_non_speaking):  # noqa: F811
    found = {}

    def items(ids, request):
        art_day = next(d["day_index"] for d in request["days"]
                       if any(c["name"] == "Test Art Museum" for c in d["candidates"]))  # fmt: skip
        found["day"] = art_day
        art = next(f for day in request["days"] for c in day["candidates"] if c["name"] == "Test Art Museum"
                   for f in c["facts"] if "Captioned" in f["detail"])  # fmt: skip
        return {
            "days": [
                {"day_index": art_day, "theme": "Museums", "items": [
                    {"place_id": ids["Test Art Museum"], "slot": "morning",
                     "rationale": "Captioned videos and ASL tours fit you.", "fact_ids": [art["fact_id"], 999999],
                     "tips": ["Go early.", "The ramp is 30 m long."]},
                    {"place_id": ids["Test Old Town Park"], "slot": "afternoon",
                     "rationale": "It is fully accessible and only 5 minutes away.", "fact_ids": [], "tips": []},
                ]},
                {"day_index": (art_day + 1) % 3, "theme": "Again", "items": [
                    {"place_id": ids["Test Art Museum"], "slot": "morning", "rationale": "Twice.", "fact_ids": [],
                     "tips": []},
                ]},
            ],
            "overall_notes": "A calm trip.",
        }  # fmt: skip

    t = trip(deaf_non_speaking, composer=fake_composer(items))
    check_invariants(t, deaf_non_speaking)
    first = t.days[found["day"]].items
    art = next(i for i in first if i.place and i.place.id == "art")
    assert art.rationale.startswith("Captioned videos and ASL tours fit you.")
    assert len(art.cited_fact_ids) == 1  # the unknown fact id was dropped
    assert (
        "Go early." in art.rationale and "ramp" not in art.rationale
    )  # access claim in a tip removed
    park = next((i for i in first if i.place and i.place.id == "oldtown"), None)
    if park:
        assert "fully accessible" not in park.rationale and "5 minutes" not in park.rationale
    assert t.overall_notes == "A calm trip."
    assert t.days[found["day"]].theme == "Museums"


def test_llm_failure_falls_back_to_greedy(ankle):  # noqa: F811
    def broken(request, short_ids):
        raise LLMUnavailable("timeout")

    t = trip(ankle, composer=broken)
    check_invariants(t, ankle)
    assert all(d.items for d in t.days)


# --- grounding validator ------------------------------------------------------------------------


@pytest.mark.parametrize(
    "text",
    [
        "This place is fully accessible.",
        "Great for wheelchairs with a ramp.",  # access words with no citation
        "Only 200 m from your hotel.",  # a number with no citation
        "",
    ],
)
def test_grounding_replaces_bad_rationales(text):
    facts = [fact(STEP_FREE, "yes", "Main entrance is step-free.")]
    rationale, ids = grounding.check(
        "Test Place", text, [], facts, "Test Place fits your interests."
    )
    assert rationale == "Test Place fits your interests. Main entrance is step-free."
    assert ids == [facts[0].id]


def test_grounding_keeps_cited_claims_and_flags_inferred():
    ai = fact(STEP_FREE, "yes", "Photo shows a ramp at the entrance.", "INFERRED", "photo_ai")
    rationale, ids = grounding.check("X", "The photo shows a ramp at the entrance.", [ai.id], [ai])
    assert ids == [ai.id]
    assert rationale.endswith(grounding.NOT_VERIFIED)


def test_output_model_rejects_unknown_ids():
    model = output_model(["p1", "p2"])
    bad = {"days": [{"day_index": 0, "theme": "x", "items": [
        {"place_id": "p9", "slot": "morning", "rationale": "", "fact_ids": [], "tips": []}]}], "overall_notes": ""}  # fmt: skip
    with pytest.raises(ValueError):
        model.model_validate(bad)
    assert issubclass(model, BaseModel)


def test_long_visit_drops_a_late_lunch(ankle):  # noqa: F811
    long_visit = place(
        "long", "Test Long Museum", "museum", "balboa_park", 32.732, -117.150, 300, 1
    )
    places = [long_visit] + [p for p in PLACES if p.category == "restaurant"]
    facts = {p.id: facts_for(p.id) for p in places}
    t = build_trip(open_day(ankle), places, facts, start_date=START, nights=1, today=TODAY)
    for day in t.days:
        assert any(i.kind == "visit" for i in day.items)
        for i in day.items:
            if i.kind == "meal":
                start = datetime.fromisoformat(i.start)
                assert (start.hour, start.minute) <= (13, 30) or start.hour >= 17, i.title


def test_long_visits_keep_their_length_and_fit_the_day(ankle):  # noqa: F811
    park = place("park", "Test Theme Park", "attraction", "balboa_park", 32.732, -117.150, 300, 3)
    places = [park] + [p for p in PLACES if p.category == "restaurant"]
    facts = {p.id: facts_for(p.id) for p in places}
    t = build_trip(open_day(ankle), places, facts, start_date=START, nights=1, today=TODAY)
    visit = next(i for d in t.days for i in d.items if i.kind == "visit")
    start, end = datetime.fromisoformat(visit.start), datetime.fromisoformat(visit.end)
    assert (end - start).total_seconds() == 300 * 60  # the real length, not cut
    assert end <= start.replace(hour=18, minute=30)  # inside the relaxed day
    assert any(w.startswith("Long visit: about 5 hours") for w in visit.warnings)
    meal = next(i for d in t.days for i in d.items if i.kind == "meal")
    assert not any(w.startswith("Long visit") for w in meal.warnings)


def test_a_visit_past_the_end_of_the_day_is_left_out(ankle):  # noqa: F811
    show = place("show", "Test Late Show", "attraction", "balboa_park", 32.733, -117.151, 600, 1)
    places = [show] + [p for p in PLACES if p.category == "restaurant"]
    facts = {p.id: facts_for(p.id) for p in places}
    t = build_trip(open_day(ankle), places, facts, start_date=START, nights=1, today=TODAY)
    assert not any(i.place and i.place.id == "show" for d in t.days for i in d.items)


def test_every_day_has_an_activity_a_meal_and_one_more_stop(ankle):  # noqa: F811
    t = trip(ankle)
    for day in t.days:
        kinds = [i.kind for i in day.items if i.place]
        visits = kinds.count("visit")
        meals = kinds.count("meal")  # cafes and dessert stops are also "meal" items
        assert visits >= 1 and meals >= 1, kinds
        assert visits + meals >= 3, kinds  # the third stop: a light stop or a second visit
        assert day.energy_used <= day.energy_budget
