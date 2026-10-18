"""Scoring tests. Facts here are test data, not real accessibility facts."""

from datetime import date
from itertools import count

import pytest

from app.services.facts import Fact, resolve
from app.services.rules import Place
from app.services.scoring import evaluate, shortlist

TODAY = date(2026, 10, 17)
_ids = count(1)


def fact(attribute, value, confidence="VERIFIED", source="official", verified_at=None, detail=None):
    return Fact(
        id=next(_ids),
        attribute=attribute,
        value=value,
        detail=detail or f"Test fact: {attribute} is {value}.",
        confidence=confidence,
        source=source,
        source_url="https://example.test/photo.jpg" if source == "photo_ai" else None,
        verified_at=verified_at,
    )


ZOO = Place("zoo", "Test Zoo", "attraction", 180, interest_tags=("zoos_aquariums",), indoor=False)
CAFE = Place("cafe", "Test Cafe", "cafe", 45, subcategories=("desserts_cafes",))
CLIFFS = Place("cliffs", "Test Cliffs", "photo_spot", 45, interest_tags=("nature", "photography"))
BEACH = Place("beach", "Test Beach", "beach", 120, interest_tags=("beaches",), indoor=False)
MUSEUM = Place("museum", "Test Museum", "museum", 90, interest_tags=("museums_art",), indoor=True)

STEP_FREE = fact("entrance_step_free", "yes")
RESTROOM = fact("restroom_accessible", "yes")


def run(place, facts, dna):
    return evaluate(place, facts, dna, today=TODAY)


@pytest.fixture
def maya(make_dna):
    return make_dna()


@pytest.fixture
def blind_solo(make_dna):
    return make_dna(
        needs=["blind_low_vision"],
        mobility__equipment=[],
        mobility__walking="long_ok",
        mobility__slope_tolerance="steep_ok",
        mobility__stairs_tolerance="ok",
        mobility__surfaces_to_avoid=[],
        requirements__must_have=[],
        vision__level="blind",
        vision__nav_aids=["white_cane"],
        vision__without_sighted_companion="yes",
        preferences__interests=["nature", "photography"],
    )


@pytest.fixture
def hearing(make_dna):
    return make_dna(
        needs=["deaf_hoh"],
        mobility__equipment=[],
        mobility__walking="long_ok",
        mobility__slope_tolerance="steep_ok",
        mobility__stairs_tolerance="ok",
        mobility__surfaces_to_avoid=[],
        requirements__must_have=[],
        requirements__nice_to_have=[],
        hearing__supports=["captions", "asl_interpretation"],
        preferences__interests=["museums_art"],
    )


# --- fact resolution ------------------------------------------------------------------


def test_negative_wins_over_a_stronger_positive():
    official_yes = fact("entrance_step_free", "yes", "VERIFIED")
    wheelmap_no = fact("entrance_step_free", "no", "COMMUNITY", "wheelmap")
    assert resolve([official_yes, wheelmap_no], TODAY)["entrance_step_free"] is wheelmap_no


def test_strong_negative_wins_over_weak_negative():
    weak = fact("stairs", "required", "INFERRED", "photo_ai")
    strong = fact("stairs", "required", "COMMUNITY", "wheelmap")
    assert resolve([weak, strong], TODAY)["stairs"] is strong


def test_old_facts_lose_one_confidence_level():
    old = fact("seating", "plenty", "VERIFIED", verified_at=date(2023, 1, 1))
    assert resolve([old], TODAY)["seating"].confidence == "COMMUNITY"


# --- wheelchair traveler (Maya) ---------------------------------------------------------


def test_step_free_place_is_kept(maya):
    result = run(CAFE, [STEP_FREE, RESTROOM], maya)
    assert not result.excluded
    assert result.unknown_critical == []


def test_negative_from_wheelmap_excludes_and_names_the_source(maya):
    no = fact(
        "entrance_step_free", "no", "COMMUNITY", "wheelmap", detail="Main entrance has 3 steps."
    )
    result = run(CAFE, [STEP_FREE, no, RESTROOM], maya)
    assert result.excluded
    assert result.reasons == ["Main entrance has 3 steps (Wheelmap community reports)."]
    assert no.id in result.fact_ids


def test_unknown_entrance_warns_and_does_not_exclude(maya):
    result = run(CAFE, [RESTROOM], maya)
    assert not result.excluded
    assert "entrance_step_free" in result.unknown_critical
    assert any(
        w.startswith("Not verified: call ahead to confirm a step-free entrance")
        for w in result.warnings
    )


def test_ai_photo_yes_does_not_satisfy_a_must_have(maya):
    ai_yes = fact("entrance_step_free", "yes", "INFERRED", "photo_ai", detail="Photo shows a ramp.")
    result = run(CAFE, [ai_yes, RESTROOM], maya)
    assert not result.excluded
    assert result.unknown_critical == ["entrance_step_free"]
    assert "an AI check of an entrance photo" in result.warnings[0]


def test_ai_photo_no_can_exclude(maya):
    ai_no = fact("entrance_step_free", "no", "INFERRED", "photo_ai", detail="Photo shows steps.")
    assert run(CAFE, [ai_no, RESTROOM], maya).excluded


def test_closed_place_is_excluded_for_everyone(maya, hearing):
    closed = fact("status", "closed", detail="Closed for repairs until 2027.")
    assert run(MUSEUM, [closed], maya).excluded
    assert run(MUSEUM, [closed], hearing).excluded


def test_not_ada_accessible_excludes_mobility_travelers_only(maya, hearing, make_dna):
    not_ada = fact("ada_accessible", "no", detail="The operator says it is not ADA-accessible.")
    result = run(MUSEUM, [STEP_FREE, not_ada], maya)
    assert result.excluded
    assert "not ADA-accessible" in result.reasons[0]
    ankle = make_dna(
        needs=["temporary_injury"],
        mobility__equipment=["crutches"],
        mobility__slope_tolerance="gentle",
        mobility__stairs_tolerance="few_with_rail",
    )
    assert run(MUSEUM, [STEP_FREE, not_ada], ankle).excluded
    assert not run(MUSEUM, [not_ada], hearing).excluded


def test_missing_restroom_excludes_long_visits_only(maya):
    no_restroom = fact("restroom_accessible", "no")
    assert run(ZOO, [STEP_FREE, no_restroom], maya).excluded  # 180 min
    short = run(CAFE, [STEP_FREE, no_restroom], maya)  # 45 min
    assert not short.excluded
    assert short.access_fit < 1


def test_moderate_slope_needs_a_companion_who_can_push(make_dna):
    slope = fact("max_slope", "moderate", "COMMUNITY", "community_feedback")
    with_push = run(ZOO, [STEP_FREE, RESTROOM, slope], make_dna())
    assert not with_push.excluded
    assert with_push.access_fit == pytest.approx(1 - 0.3 * 0.8)
    alone = run(ZOO, [STEP_FREE, RESTROOM, slope], make_dna(party__companion_assist="no"))
    assert alone.excluded


def test_uneven_ground_costs_a_crutch_user_points(make_dna):
    ankle = make_dna(
        needs=["temporary_injury"],
        mobility__equipment=["crutches"],
        mobility__surfaces_to_avoid=["sand"],
        preferences__avoid=[],
    )
    uneven = fact("terrain", "uneven", "COMMUNITY", "demo_data")
    result = run(CAFE, [STEP_FREE, RESTROOM, uneven], ankle)
    assert not result.excluded
    assert result.accessibility_score == 84  # 1 - 0.2 x 0.8 (COMMUNITY)


def test_sand_needs_beach_equipment(maya):
    sand = fact("terrain", "sand")
    assert run(BEACH, [RESTROOM, sand], maya).excluded
    chair = fact("beach_wheelchair", "yes", detail="Free beach wheelchairs at the lifeguard tower.")
    result = run(BEACH, [RESTROOM, sand, chair], maya)
    assert not result.excluded
    assert any("beach wheelchairs" in h for h in result.highlights)


def test_many_small_issues_exclude(maya):
    facts = [
        STEP_FREE,
        RESTROOM,
        fact("max_slope", "moderate"),  # 0.3
        fact("stairs", "avoidable"),  # 0.05
        fact("terrain", "uneven", "INFERRED", "inferred"),  # HARD for a manual wheelchair
    ]
    assert run(ZOO, facts, maya).excluded
    soft_only = [STEP_FREE, RESTROOM, fact("max_slope", "moderate"), fact("crowd_level", "high")]
    result = run(ZOO, soft_only, maya)
    assert not result.excluded  # 0.3 + no crowd rule for Maya


def test_access_fit_below_threshold_excludes(make_dna):
    dna = make_dna(
        preferences__avoid=["crowds", "noise", "heat_sun", "hills"],
        party__companion_assist="push_and_transfer",
    )
    facts = [
        STEP_FREE,
        RESTROOM,
        fact("max_slope", "moderate"),  # 0.3 (slope rule beats the hills rule)
        fact("crowd_level", "high"),  # 0.25
        fact("noise_level", "high"),  # 0.3
    ]
    result = run(ZOO, facts, dna)
    assert result.excluded
    assert result.reasons[0].startswith("Multiple comfort issues")


# --- blind solo traveler -------------------------------------------------------------------


def test_edge_hazard_excludes_blind_solo_traveler(blind_solo, make_dna):
    edge = fact("edge_hazard", "yes", detail="Unfenced cliff edges along the trail.")
    assert run(CLIFFS, [edge], blind_solo).excluded
    with_companion = make_dna(
        needs=["blind_low_vision"],
        mobility__equipment=[],
        mobility__slope_tolerance="steep_ok",
        mobility__surfaces_to_avoid=[],
        requirements__must_have=[],
        vision__without_sighted_companion="no",
    )
    result = run(CLIFFS, [edge], with_companion)
    assert not result.excluded
    assert any("sighted companion" in w for w in result.warnings)


def test_unknown_edges_warn_the_blind_solo_traveler(blind_solo):
    result = run(CLIFFS, [], blind_solo)
    assert "edge_hazard" in result.unknown_critical


def test_edge_hazard_does_not_affect_maya(maya):
    edge = fact("edge_hazard", "yes")
    assert "edge_hazard" not in run(CLIFFS, [edge], maya).fact_ids


def test_guide_dog_refused_excludes(make_dna):
    dna = make_dna(
        needs=["blind_low_vision"], vision__nav_aids=["guide_dog"], requirements__must_have=[]
    )
    no_dogs = fact("service_animal_ok", "no")
    assert run(MUSEUM, [STEP_FREE, no_dogs], dna).excluded


# --- hearing traveler ------------------------------------------------------------------------


def test_captions_give_a_bonus_to_hearing_traveler(hearing):
    plain = run(MUSEUM, [], hearing)
    captioned = run(
        MUSEUM, [fact("captions_asl", "yes"), fact("assistive_listening", "yes")], hearing
    )
    assert captioned.score > plain.score
    assert len(captioned.highlights) == 2


def test_no_captions_penalizes_but_does_not_exclude(hearing):
    result = run(MUSEUM, [fact("captions_asl", "no")], hearing)
    assert not result.excluded
    assert result.access_fit == pytest.approx(0.85)


def test_captions_must_have_excludes_when_missing(make_dna):
    dna = make_dna(
        needs=["deaf_hoh"],
        mobility__equipment=[],
        mobility__slope_tolerance="steep_ok",
        requirements__must_have=["captions_or_asl"],
    )
    assert run(MUSEUM, [fact("captions_asl", "no")], dna).excluded
    assert not run(CAFE, [], dna).unknown_critical  # captions do not apply to a cafe


def test_personas_get_different_results(maya, hearing):
    facts = [fact("entrance_step_free", "no"), fact("captions_asl", "yes")]
    assert run(MUSEUM, facts, maya).excluded
    assert not run(MUSEUM, facts, hearing).excluded


# --- score and shortlist ------------------------------------------------------------------------


def test_interest_match_ranks_higher(maya):
    museum = Place("m2", "Other Museum", "museum", 90, interest_tags=("museums_art",))
    facts = {p.id: [STEP_FREE, RESTROOM] for p in (ZOO, museum)}
    kept, excluded = shortlist([museum, ZOO], facts, maya, today=TODAY)
    assert [e.place_id for e in kept] == ["zoo", "m2"]
    assert excluded == []


def test_shortlist_splits_excluded(maya):
    facts = {"zoo": [STEP_FREE, RESTROOM], "cafe": [fact("entrance_step_free", "no")]}
    kept, excluded = shortlist([ZOO, CAFE], facts, maya, today=TODAY)
    assert [e.place_id for e in kept] == ["zoo"]
    assert [e.place_id for e in excluded] == ["cafe"]


# --- the two demo personas: ankle injury, and Deaf and non-speaking ------------------------


@pytest.fixture
def ankle(make_dna):
    return make_dna(
        needs=["temporary_injury", "limited_mobility"],
        mobility__equipment=["crutches"],
        mobility__walking="under_5_min",
        mobility__standing="2_to_5_min",
        mobility__slope_tolerance="gentle",
        mobility__stairs_tolerance="none",
        mobility__surfaces_to_avoid=["uneven_pavement", "sand"],
        party__companion_assist="light_only",
        requirements__must_have=["seating"],
        requirements__nice_to_have=["mobility_rental"],
        temporary__expected_duration="this_trip_only",
    )


@pytest.fixture
def deaf_non_speaking(make_dna):
    return make_dna(
        needs=["deaf_hoh", "non_speaking"],
        mobility__equipment=[],
        mobility__walking="long_ok",
        mobility__standing="over_15_min",
        mobility__slope_tolerance="steep_ok",
        mobility__stairs_tolerance="ok",
        mobility__surfaces_to_avoid=[],
        requirements__must_have=["captions_or_asl"],
        requirements__nice_to_have=["text_contact"],
        hearing__supports=["captions", "asl_interpretation"],
        communication__methods=["sign_language", "writing_or_typing"],
        communication__phone_calls="no",
        communication__contact_preferences=["text_sms", "email"],
        party__companion_assist="no",
    )


def test_ankle_injury_limits(ankle):
    assert ankle.trip_only
    assert ankle.max_walk_m == 200 and not ankle.uses_wheelchair
    stairs = fact("stairs", "required", detail="The only entrance has 12 steps.")
    assert run(MUSEUM, [stairs], ankle).excluded
    assert run(ZOO, [fact("typical_walk_m", "1500"), fact("seating", "plenty")], ankle).excluded
    rental = fact("wheelchair_rental", "yes", detail="Wheelchairs to rent at the gate.")
    kept = run(ZOO, [fact("typical_walk_m", "1500"), rental, fact("seating", "plenty")], ankle)
    assert not kept.excluded  # a rental chair makes the long walk possible
    assert any("rent" in w for w in kept.warnings)
    assert any("rent" in h for h in kept.highlights)  # nice-to-have


def test_ankle_moderate_slope_without_push_excludes(ankle):
    assert run(ZOO, [fact("max_slope", "moderate"), fact("seating", "plenty")], ankle).excluded


def test_no_phone_calls(deaf_non_speaking, ankle):
    assert deaf_non_speaking.no_phone_calls and deaf_non_speaking.is_non_speaking
    assert not ankle.no_phone_calls
    restaurant = Place("r", "Test Trattoria", "restaurant", 75, subcategories=("italian",))
    phone_only = fact("booking_phone_only", "yes", detail="Reservations by phone only.")
    result = run(restaurant, [phone_only], deaf_non_speaking)
    assert not result.excluded
    assert result.access_fit == pytest.approx(0.8)
    assert any("relay service" in w for w in result.warnings)
    assert not any("relay service" in w for w in run(restaurant, [phone_only], ankle).warnings)


def test_text_friendly_places_rank_higher(deaf_non_speaking):
    restaurant = Place("r", "Test Trattoria", "restaurant", 75, subcategories=("italian",))
    plain = run(restaurant, [], deaf_non_speaking)
    friendly = run(
        restaurant,
        [
            fact("online_booking", "yes"),
            fact("text_contact", "yes"),
            fact("kiosk_or_app_ordering", "yes"),
            fact("written_notes_ok", "yes", "VERIFIED", "phone_call"),
        ],
        deaf_non_speaking,
    )
    assert friendly.score > plain.score
    assert len(friendly.highlights) == 4


def test_two_personas_differ_on_the_same_places(ankle, deaf_non_speaking):
    museum_facts = [
        fact("stairs", "required"),
        fact("captions_asl", "yes", detail="Captioned films and ASL tours on request."),
    ]
    assert run(MUSEUM, museum_facts, ankle).excluded
    assert not run(MUSEUM, museum_facts, deaf_non_speaking).excluded
    tour = [fact("captions_asl", "no", detail="Audio-only guided tour."), fact("seating", "plenty")]
    assert run(MUSEUM, tour, deaf_non_speaking).excluded  # captions are a must-have
    assert not run(MUSEUM, tour, ankle).excluded


def test_seating_levels_satisfy_a_seating_must_have(make_dna):
    dna = make_dna(
        requirements__must_have=["seating"],
        mobility__equipment=["cane"],
        needs=["limited_mobility"],
    )
    plenty = run(CAFE, [fact("seating", "plenty")], dna)
    assert plenty.unknown_critical == [] and plenty.access_fit == 1
    assert run(CAFE, [fact("seating", "none")], dna).excluded
    assert not run(CAFE, [fact("seating", "some")], dna).excluded


def test_scores_for_the_traveler(deaf_non_speaking):
    official = fact("captions_asl", "yes", detail="Captioned films.")
    demo = Fact(990, "captions_asl", "yes", "Captions.", "COMMUNITY", "demo_data")
    strong = evaluate(MUSEUM, [official], deaf_non_speaking)
    weak = evaluate(MUSEUM, [demo], deaf_non_speaking)
    unknown = evaluate(MUSEUM, [], deaf_non_speaking)
    assert strong.accessibility_score == 100
    assert strong.verification_score > weak.verification_score > unknown.verification_score
    assert weak.verification_score <= 20  # demo data is never high
    assert unknown.verification_score == 0
    assert unknown.accessibility_score < strong.accessibility_score  # unknown captions cost fit
