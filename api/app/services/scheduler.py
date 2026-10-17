"""Deterministic day planning: daily limits, neighborhood clusters, timing, meals and rests.

The scheduler is the final authority. The composer (LLM or greedy) only picks and orders
places; this module sets the times and drops items until each day fits its limits.
"""

import math
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from app.models.dna import AccessibilityDNA
from app.services.facts import Fact
from app.services.rules import Place
from app.services.scoring import Evaluation

TZ = ZoneInfo("America/Los_Angeles")

# Downtown / Little Italy, the default lodging point.
DEFAULT_LODGING = ("Downtown San Diego", 32.7157, -117.1611)


@dataclass(frozen=True)
class PaceLimits:
    max_visits: int
    start: time
    end: time
    energy: float
    max_leg_min: int
    travel_cap_min: int


PACE = {
    "relaxed": PaceLimits(2, time(10, 0), time(18, 30), 6, 30, 75),
    "moderate": PaceLimits(3, time(9, 30), time(19, 30), 9, 40, 100),
    "busy": PaceLimits(4, time(9, 0), time(21, 0), 12, 45, 120),
}

ADJACENT = {
    "downtown": {"little_italy", "balboa_park", "coronado", "gaslamp"},
    "gaslamp": {"downtown", "little_italy"},
    "little_italy": {"downtown", "gaslamp", "old_town", "point_loma", "balboa_park"},
    "balboa_park": {"downtown", "little_italy", "old_town"},
    "old_town": {"little_italy", "mission_bay", "point_loma", "balboa_park"},
    "mission_bay": {"old_town", "la_jolla", "point_loma"},
    "la_jolla": {"mission_bay"},
    "point_loma": {"little_italy", "old_town", "mission_bay"},
    "coronado": {"downtown"},
    "east_village": {"downtown", "gaslamp", "balboa_park"},
    "south_park": {"balboa_park"},
    "mission_beach": {"mission_bay", "pacific_beach"},
    "pacific_beach": {"mission_bay", "mission_beach", "la_jolla"},
    "convoy": {"clairemont", "university_city"},
    "clairemont": {"convoy", "university_city", "mission_bay"},
    "university_city": {"la_jolla", "convoy", "clairemont"},
}

for _hood, _near in list(ADJACENT.items()):  # make the map symmetric
    for _other in _near:
        ADJACENT.setdefault(_other, set()).add(_hood)

LUNCH = (time(11, 45), time(13, 30))
DINNER = (time(17, 30), time(19, 30))
MEAL_MIN = 60
REST_MIN = 20
DRIVE_BUFFER_MIN = 15  # loading a wheelchair or mobility device, and parking
UNKNOWN_CRITICAL_PER_DAY = 1


@dataclass
class Candidate:
    place: Place
    ev: Evaluation
    facts: list[Fact]  # effective facts, shown in the UI and given to the composer

    @property
    def kind(self) -> str:
        if self.place.category == "restaurant":
            return "meal"
        if self.place.category in ("cafe", "dessert"):
            return "snack"
        return "visit"

    @property
    def energy(self) -> float:
        if self.kind != "visit":
            return 0.0  # a seated meal or cafe stop is a rest
        cost = self.place.exertion_level * self.place.est_visit_min / 60
        return cost + (1 if self.ev.access_fit < 0.7 else 0)


@dataclass
class Pick:
    cand: Candidate
    slot: str  # morning | lunch | afternoon | dinner | evening
    rationale: str
    fact_ids: list[int]
    tips: list[str] = field(default_factory=list)


@dataclass
class Timed:
    kind: str  # visit | meal | rest
    title: str
    start: datetime
    end: datetime
    pick: Pick | None = None
    travel_min: int | None = None
    travel_estimated: bool = True
    note: str = ""


def limits_for(dna: AccessibilityDNA) -> PaceLimits:
    base = PACE[dna.preferences.pace or "relaxed"]
    start, end = base.start, base.end
    if dna.preferences.day_start:
        start = time.fromisoformat(dna.preferences.day_start)
    if dna.preferences.day_end:
        end = time.fromisoformat(dna.preferences.day_end)
    energy = base.energy
    if any(age < 6 for age in dna.party.children_ages):
        energy *= 0.85
    return PaceLimits(base.max_visits, start, end, energy, base.max_leg_min, base.travel_cap_min)


def travel_minutes(a: tuple[float, float], b: tuple[float, float]) -> int:
    """Estimate: straight-line distance x 1.4 for roads, at 40 km/h. At least 5 minutes."""
    lat1, lng1, lat2, lng2 = map(math.radians, (*a, *b))
    h = (
        math.sin((lat2 - lat1) / 2) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin((lng2 - lng1) / 2) ** 2
    )
    km = 2 * 6371 * math.asin(math.sqrt(h))
    return max(5, round(km * 1.4 / 40 * 60))


# --- day clusters ------------------------------------------------------------------------


def plan_clusters(visits: list[Candidate], days: int, max_visits: int) -> list[list[str]]:
    """Give each day 1-2 adjacent neighborhoods, best first, spread across the trip."""
    by_hood: dict[str, list[float]] = {}
    for c in visits:
        by_hood.setdefault(c.place.neighborhood, []).append(c.ev.score)
    strength = {h: sum(sorted(s, reverse=True)[:3]) for h, s in by_hood.items()}
    count = {h: len(s) for h, s in by_hood.items()}
    order = sorted(strength, key=strength.get, reverse=True)
    result: list[list[str]] = []
    used: set[str] = set()
    for _ in range(days):
        fresh = [h for h in order if h not in used] or order
        if not fresh:
            result.append([])
            continue
        anchor = fresh[0]
        clusters = [anchor]
        if count[anchor] < max_visits:
            neighbors = [h for h in fresh[1:] if h in ADJACENT.get(anchor, set())]
            if neighbors:
                clusters.append(neighbors[0])
        used.update(clusters)
        result.append(clusters)
    return result


def nearby(hood: str, clusters: list[str]) -> bool:
    return hood in clusters or any(hood in ADJACENT.get(c, set()) for c in clusters)


# --- timing ----------------------------------------------------------------------------------

SLOT_ORDER = {"morning": 0, "lunch": 1, "afternoon": 2, "dinner": 3, "evening": 4}


def _at(day: date, t: time) -> datetime:
    return datetime.combine(day, t, tzinfo=TZ)


def lay_out(
    picks: list[Pick],
    day: date,
    dna: AccessibilityDNA,
    limits: PaceLimits,
    lodging: tuple[float, float],
    hot: bool = False,
) -> tuple[list[Timed], float]:
    """Set times for one day. Drop the weakest visits until the day fits. Returns (items, energy)."""
    picks = _order(picks, dna, hot)
    # A meal window outside the traveler's day is dropped, not the visits.
    day_start, day_end = _at(day, limits.start), _at(day, limits.end)
    if day_end < _at(day, DINNER[0]) + timedelta(minutes=MEAL_MIN):
        picks = [p for p in picks if p.slot != "dinner"]
    if day_start > _at(day, LUNCH[1]):
        picks = [p for p in picks if p.slot != "lunch"]
    while True:
        items, energy, travel, ok = _try(picks, day, dna, limits, lodging)
        unknown = [p for p in picks if p.cand.ev.unknown_critical]
        over = (
            not ok
            or energy > limits.energy
            or travel > limits.travel_cap_min
            or len(unknown) > UNKNOWN_CRITICAL_PER_DAY
        )
        visits = [p for p in picks if p.cand.kind == "visit"]
        if not over or len(visits) <= 1:
            return items, round(energy, 1)  # never drop the last visit of a day
        drop = unknown if len(unknown) > UNKNOWN_CRITICAL_PER_DAY else visits
        picks = [p for p in picks if p is not min(drop, key=lambda p: p.cand.ev.score)]


def _order(picks: list[Pick], dna: AccessibilityDNA, hot: bool) -> list[Pick]:
    crowd_averse = "crowds" in dna.preferences.avoid or "crowds" in dna.sensory.reduce

    def key(p: Pick) -> tuple:
        crowded = any(f.attribute == "crowd_level" and f.value == "high" for f in p.cand.facts)
        outdoor = p.cand.place.indoor is False
        early = (crowd_averse and crowded) or (hot and outdoor)
        unknown = bool(p.cand.ev.unknown_critical)  # never the first stop of the day
        slot = SLOT_ORDER.get(p.slot, 2)
        if early and p.cand.kind == "visit":
            slot = 0
        return (slot, unknown, -p.cand.ev.score)

    ordered = sorted(picks, key=key)
    if ordered and ordered[0].cand.ev.unknown_critical:
        safe = next((i for i, p in enumerate(ordered) if not p.cand.ev.unknown_critical), None)
        if safe:
            ordered.insert(0, ordered.pop(safe))
    return ordered


def _try(
    picks: list[Pick],
    day: date,
    dna: AccessibilityDNA,
    limits: PaceLimits,
    lodging: tuple[float, float],
) -> tuple[list[Timed], float, int, bool]:
    driving = dna.trip.transport in ("personal_car", "accessible_vehicle", "rideshare", None)
    buffer = (
        DRIVE_BUFFER_MIN
        if driving and (dna.uses_wheelchair or "crutches" in dna.mobility.equipment)
        else 0
    )
    rest_every = dna.rest_every_min or 90
    t = _at(day, limits.start)
    end_of_day = _at(day, limits.end)
    here = lodging
    items: list[Timed] = []
    energy = 0.0
    travel_total = 0
    active = 0  # minutes since the last rest
    ok = True
    for i, pick in enumerate(picks):
        place = pick.cand.place
        leg = travel_minutes(here, (place.lat, place.lng)) + buffer
        if items and leg - buffer > limits.max_leg_min:  # the first leg from the hotel is exempt
            continue  # too far from the last stop: leave this pick out
        if items:
            travel_total += leg - buffer  # road time between stops; not the hotel leg or the buffer
        start = t + timedelta(minutes=leg)
        kind = "meal" if pick.cand.kind in ("meal", "snack") else "visit"
        if pick.slot == "lunch" or (
            pick.cand.kind == "meal" and pick.slot not in ("dinner", "evening")
        ):
            start = max(start, _at(day, LUNCH[0]))
            if start > _at(day, LUNCH[1]):
                ok = False
        elif pick.slot == "dinner":
            start = max(start, _at(day, DINNER[0]))
            if start > _at(day, DINNER[1]):
                ok = False
        minutes = MEAL_MIN if pick.cand.kind == "meal" else place.est_visit_min
        end = start + timedelta(minutes=minutes)
        items.append(Timed(kind, place.name, start, end, pick, travel_min=leg))
        energy += pick.cand.energy
        active = (
            0 if pick.cand.kind in ("meal", "snack") else active + leg + minutes
        )  # seated stops rest
        t, here = end, (place.lat, place.lng)
        nxt = picks[i + 1].cand.kind if i + 1 < len(picks) else None
        needs_rest = kind == "visit" and (place.exertion_level >= 3 or active >= rest_every)
        if needs_rest and nxt not in ("snack", None):
            seating = next(
                (f for f in pick.cand.facts if f.attribute == "seating" and f.value != "none"), None
            )
            note = f"Rest here. {seating.detail}" if seating else "Rest here before you go on."
            items.append(Timed("rest", "Rest break", t, t + timedelta(minutes=REST_MIN), note=note))
            t += timedelta(minutes=REST_MIN)
            active = 0
        elif nxt == "snack":
            active = 0  # the cafe or dessert stop is the rest
    if t > end_of_day:
        ok = False
    return items, energy, travel_total, ok
