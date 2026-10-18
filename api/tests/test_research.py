"""The team's research file and how the app uses it."""

from app.services.planner import place_out
from app.services.rules import Place
from scripts import import_research


def test_every_researched_place_matches_a_demo_place():
    _, researched = import_research.load()
    slugs = import_research.slugs()
    assert len(researched) == 42
    assert all(loc["location_id"] in slugs for loc in researched)
    assert all(loc["sources"] for loc in researched)


def test_official_facts_point_to_a_researched_source():
    researched = {loc["location_id"]: loc for loc in import_research.load()[1]}
    for location_id, (_, _, _, source) in import_research.OFFICIAL_FACTS.items():
        assert source < len(researched[location_id]["sources"])


def test_place_card_shows_the_research():
    sources = [{"title": "Accessibility", "url": "https://example.test/access"}]
    meta = {"research_summary": "Test summary.", "research_sources": sources, "data_tier": "B"}
    out = place_out(Place("p", "Test Museum", "museum", 90, meta=meta), [])
    assert out.research_summary == "Test summary."
    assert out.research_sources[0].url == "https://example.test/access"
    assert out.data_tier == "B"
