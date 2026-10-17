import json
from pathlib import Path

import pytest
from openai.lib._pydantic import to_strict_json_schema
from pydantic import ValidationError

from app.models.dna import AccessibilityDNA

FIXTURE = Path(__file__).parent / "fixtures" / "dna_maya.json"


def load(**changes) -> dict:
    data = json.loads(FIXTURE.read_text())
    for path, value in changes.items():
        *parents, leaf = path.split("__")
        node = data
        for key in parents:
            node = node[key]
        node[leaf] = value
    return data


def test_example_profile_parses():
    dna = AccessibilityDNA.model_validate(load())
    assert dna.uses_manual_wheelchair and dna.uses_wheelchair
    assert dna.no_stairs
    assert dna.companion_can_push
    assert dna.max_walk_m is None  # stays in the chair; route rules apply instead
    assert dna.max_standing_min == 3
    assert dna.rest_every_min == 60
    assert not dna.blind_solo


def test_schema_is_openai_strict():
    schema = to_strict_json_schema(AccessibilityDNA)

    def check(node):
        if isinstance(node, dict):
            if node.get("type") == "object":
                assert node["additionalProperties"] is False
                assert set(node["required"]) == set(node["properties"])
            assert "default" not in node
            for value in node.values():
                check(value)
        elif isinstance(node, list):
            for value in node:
                check(value)

    check(schema)


def test_unknown_field_rejected():
    with pytest.raises(ValidationError):
        AccessibilityDNA.model_validate(load(mobility__stamina="low"))


def test_missing_field_rejected():
    data = load()
    del data["party"]["companion_assist"]
    with pytest.raises(ValidationError):
        AccessibilityDNA.model_validate(data)


@pytest.mark.parametrize(
    "change",
    [
        {"trip__nights": 0},
        {"trip__nights": 8},
        {"trip__start_date": "next tuesday"},
        {"party__size": 0},
        {"party__children_ages": [19]},
        {"preferences__budget_per_day_usd": -1},
        {"preferences__day_start": "9am"},
        {"preferences__day_end": "25:00"},
    ],
)
def test_out_of_range_rejected(change):
    with pytest.raises(ValidationError):
        AccessibilityDNA.model_validate(load(**change))


def test_must_have_wins_over_nice_to_have():
    dna = AccessibilityDNA.model_validate(
        load(
            requirements__must_have=["seating", "seating"],
            requirements__nice_to_have=["seating", "elevator"],
        )
    )
    assert dna.requirements.must_have == ["seating"]
    assert dna.requirements.nice_to_have == ["elevator"]


def test_blind_solo_traveler():
    dna = AccessibilityDNA.model_validate(
        load(
            needs=["blind_low_vision"],
            mobility__equipment=[],
            mobility__walking="long_ok",
            vision__level="blind",
            vision__nav_aids=["guide_dog"],
            vision__without_sighted_companion="yes",
        )
    )
    assert dna.blind_solo
    assert dna.has_guide_dog
    assert dna.max_walk_m == 3000
    assert not dna.uses_wheelchair


def test_unanswered_falls_back_to_avoidances():
    dna = AccessibilityDNA.model_validate(
        load(
            mobility__walking=None,
            mobility__standing=None,
            preferences__avoid=["long_distances", "standing"],
        )
    )
    assert dna.max_walk_m == 400
    assert dna.max_standing_min == 5


def test_temporary_needs_default_to_trip_only():
    dna = AccessibilityDNA.model_validate(load(needs=["temporary_injury"]))
    assert dna.trip_only
    saved = AccessibilityDNA.model_validate(
        load(needs=["temporary_injury"], temporary__expected_duration="save_for_future")
    )
    assert not saved.trip_only
