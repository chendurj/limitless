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
    for location_id, facts in import_research.OFFICIAL_FACTS.items():
        for _, _, _, source, confidence in facts:
            assert source < len(researched[location_id]["sources"])
            assert confidence in ("VERIFIED", "COMMUNITY")


def test_place_card_shows_the_research():
    sources = [{"title": "Accessibility", "url": "https://example.test/access"}]
    meta = {"research_summary": "Test summary.", "research_sources": sources, "data_tier": "B"}
    out = place_out(Place("p", "Test Museum", "museum", 90, meta=meta), [])
    assert out.research_summary == "Test summary."
    assert out.research_sources[0].url == "https://example.test/access"
    assert out.data_tier == "B"


def test_demo_variety_is_stable_and_only_uses_known_values():
    from scripts import demo_variety

    first = demo_variety.values("demo-test-museum", "museum", None, "smooth")
    assert first == demo_variety.values("demo-test-museum", "museum", None, "smooth")
    allowed = {
        "captions_asl", "booking_phone_only", "online_booking", "kiosk_or_app_ordering",
        "text_contact", "terrain", "typical_walk_m", "max_slope",
    }  # fmt: skip
    assert set(first) <= allowed
    assert demo_variety.values("demo-cafe", "cafe", None, None).get("captions_asl") is None
    # Indoor places are flat or gently sloped.
    assert first["max_slope"][0] in ("flat", "gentle")


def test_verified_facts_file_is_well_formed():
    import json

    if not import_research.VERIFIED.exists():
        return
    data = json.loads(import_research.VERIFIED.read_text())
    slugs = import_research.slugs()
    for fact in data["facts"]:
        assert fact["location_id"] in slugs, fact
        assert fact["attribute"] in import_research.ATTRIBUTES, fact
        assert fact["url"].startswith("https://"), fact
        assert fact["quote"].strip() and fact["detail"].strip(), fact


def test_osm_facts_are_reviewed_and_linked():
    import json

    if not import_research.OSM.exists():
        return
    data = json.loads(import_research.OSM.read_text())
    assert "OpenStreetMap" in data["license"]
    slugs = import_research.slugs()
    for fact in data["facts"]:
        assert fact["location_id"] in slugs
        assert fact["attribute"] in ("entrance_step_free", "restroom_accessible")
        assert fact["url"].startswith("https://www.openstreetmap.org/")
