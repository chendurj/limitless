"""The 16-number DNA vector, for "travelers like you" feedback matching. Each value is in [0, 1]."""

from app.models.dna import AccessibilityDNA

SLOPE = {
    "flat_only": 0.0,
    "gentle": 0.33,
    "moderate_with_help": 0.5,
    "moderate": 0.66,
    "steep_ok": 1.0,
}
STAIRS = {"none": 0.0, "few_with_rail": 0.5, "ok": 1.0}
PUSH = {"push_and_transfer": 1.0, "light_only": 0.5, "sometimes": 0.5}
PACE = {"relaxed": 0.0, "moderate": 0.5, "busy": 1.0}


def dna_vector(dna: AccessibilityDNA) -> list[float]:
    equipment = set(dna.mobility.equipment)
    walk = dna.max_walk_m
    stand = dna.max_standing_min
    avoid = set(dna.preferences.avoid) | set(dna.sensory.reduce)
    return [
        float("manual_wheelchair" in equipment),
        float(bool({"powered_wheelchair", "mobility_scooter"} & equipment)),
        float(bool({"walker", "cane", "crutches"} & equipment)),
        float(dna.is_blind_low_vision),
        float("deaf_hoh" in dna.needs),
        float(dna.is_non_speaking),
        # walking limit: 1 = cannot walk far. A wheelchair user has no walk limit but rolls, so 1.
        1.0 if dna.uses_wheelchair else (1 - min(walk / 2000, 1) if walk is not None else 0.0),
        SLOPE.get(dna.mobility.slope_tolerance or "", 0.5),
        STAIRS.get(dna.mobility.stairs_tolerance or "", 0.5),
        1 - min(stand / 60, 1) if stand is not None else 0.0,
        float("crowds" in avoid),
        float("noise" in avoid),
        float("heat_sun" in dna.preferences.avoid),
        PUSH.get(dna.party.companion_assist or "", 0.0),
        PACE.get(dna.preferences.pace or "", 0.5),
        float(bool(dna.party.children_ages)),
    ]


def to_pgvector(values: list[float]) -> str:
    return "[" + ",".join(f"{v:.4f}" for v in values) + "]"
