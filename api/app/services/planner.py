"""Trip generation: scoring -> clusters -> composer (LLM or greedy) -> scheduler -> TripOut.

Every step except the composer is deterministic. If the composer fails, a greedy pick
with template rationales takes its place, so the demo works without the LLM.
"""

import logging
import uuid
from collections.abc import Callable
from dataclasses import dataclass
from datetime import date, timedelta
from urllib.parse import quote_plus

from pydantic import BaseModel

from app.llm.client import LLMUnavailable, user_input
from app.models import api
from app.models.dna import AccessibilityDNA
from app.services.facts import Fact, resolve
from app.services.rules import Place
from app.services.scheduler import (
    DEFAULT_LODGING,
    Candidate,
    PaceLimits,
    Pick,
    Timed,
    lay_out,
    limits_for,
    nearby,
    plan_clusters,
)
from app.services.scoring import evaluate
from app.services.weather import is_hot
from app.validators import grounding

log = logging.getLogger("planner")

SHORTLIST_VISITS = 8
SHORTLIST_MEALS = 4
SHORTLIST_SNACKS = 3
DISCLAIMER = (
    "Accessibility details come from the cited sources and can change. "
    'Call ahead to confirm anything marked "Not verified".'
)
CUISINE_WORDS = {"desserts_cafes": "coffee and dessert", "east_asian": "East Asian"}
INTEREST_WORDS = {
    "beaches": "beaches",
    "zoos_aquariums": "zoos and aquariums",
    "museums_art": "museums and art",
    "history": "history",
    "nature": "nature",
    "photography": "photography",
    "shopping": "shopping",
    "sports": "sports",
    "nightlife": "nightlife",
    "theme_parks": "theme parks",
    "food": "food",
}

Composer = Callable[[dict, list[str]], BaseModel]
WeatherFn = Callable[[date, int], list[api.Weather | None]]


@dataclass
class DayDraft:
    index: int
    date: date
    clusters: list[str]
    weather: api.Weather | None
    visits: list[Candidate]
    meals: list[Candidate]
    snacks: list[Candidate]
    picks: list[Pick] | None = None
    theme: str = ""


def build_trip(
    dna: AccessibilityDNA,
    places: list[Place],
    facts_by_place: dict[str, list[Fact]],
    *,
    trip_id: str | None = None,
    start_date: date,
    nights: int,
    travelers: int = 1,
    lodging: tuple[str, float, float] | None = None,
    composer: Composer | None = None,
    weather: WeatherFn | None = None,
    today: date | None = None,
) -> api.TripOut:
    today = today or date.today()
    limits = limits_for(dna)
    lodging = lodging or DEFAULT_LODGING
    here = (lodging[1], lodging[2])

    kept: list[Candidate] = []
    # Establish eligible places before the composer sees them. Language-model wording
    # cannot override a rule exclusion; omitted places retain reasons for the traveler.
    excluded: list[api.ExcludedPlace] = []
    for place in places:
        facts = facts_by_place.get(place.id, [])
        ev = evaluate(place, facts, dna, today=today)
        if ev.excluded:
            excluded.append(api.ExcludedPlace(place_id=place.id, name=place.name, reasons=ev.reasons,
                                              fact_ids=ev.fact_ids))  # fmt: skip
        else:
            kept.append(Candidate(place, ev, list(resolve(facts, today).values())))

    forecasts = weather(start_date, nights) if weather else [None] * nights
    days = _draft_days(kept, dna, limits, start_date, nights, forecasts)

    notes = ""
    if composer is not None:
        try:
            notes = _compose_with_llm(composer, dna, days, limits)
        except LLMUnavailable as error:
            log.warning("composer failed, using greedy picks: %s", error)
    snacks = sorted((c for c in kept if c.kind == "snack"), key=lambda c: c.ev.score, reverse=True)
    for day in days:
        if day.picks is None:
            day.picks, day.theme = _greedy(day, dna, limits, days)
        _fill_meals(day, days, dna)
        _add_light_stop(day, days, dna, snacks)

    day_outs = []
    # Composition chooses stops; scheduling owns clock times, travel estimates,
    # breaks, and effort limits for both the LLM and deterministic fallback paths.
    for day in days:
        timed, energy = lay_out(day.picks, day.date, dna, limits, here, hot=is_hot(day.weather))
        day_outs.append(
            api.DayOut(
                day_index=day.index,
                date=day.date.isoformat(),
                theme=day.theme or _theme(day),
                weather=day.weather,
                energy_budget=round(limits.energy),
                energy_used=round(energy),
                items=[_item_out(t, seq, _mode(dna), limits.energy) for seq, t in enumerate(timed)],
            )
        )

    return api.TripOut(
        id=trip_id or str(uuid.uuid4()),
        status="ready",
        version=1,
        start_date=start_date.isoformat(),
        nights=nights,
        travelers=travelers,
        profile_summary=dna.summary,
        days=day_outs,
        excluded=excluded,
        rental_links=[],
        overall_notes=notes or _overall_notes(day_outs, excluded),
        disclaimer=DISCLAIMER,
    )


# --- day drafts -----------------------------------------------------------------------------


def _draft_days(
    kept: list[Candidate],
    dna: AccessibilityDNA,
    limits: PaceLimits,
    start: date,
    nights: int,
    forecasts: list[api.Weather | None],
) -> list[DayDraft]:
    visits = [c for c in kept if c.kind == "visit"]
    clusters = plan_clusters(visits, nights, limits.max_visits)
    used: set[str] = set()
    days = []
    for i in range(nights):
        hoods = clusters[i] if i < len(clusters) else []

        def best(kind: str, n: int, hoods=hoods, local_only: bool = False) -> list[Candidate]:
            pool = sorted(
                (c for c in kept if c.kind == kind and c.place.id not in used),
                key=lambda c: c.ev.score,
                reverse=True,
            )
            local = [c for c in pool if nearby(c.place.neighborhood, hoods)]
            if local_only:
                return local[:n]
            return (local + [c for c in pool if c not in local])[:n]  # nearby first

        day_visits = [
            c for c in best("visit", SHORTLIST_VISITS) if c.place.neighborhood in hoods
        ] or best("visit", SHORTLIST_VISITS)
        day = DayDraft(i, start + timedelta(days=i), hoods, forecasts[i] if i < len(forecasts) else None,
                       day_visits, best("meal", SHORTLIST_MEALS), best("snack", SHORTLIST_SNACKS, local_only=True))  # fmt: skip
        used.update(c.place.id for c in day_visits[: limits.max_visits])
        used.update(c.place.id for c in day.meals[:2])  # lunch and dinner: keep them for this day
        days.append(day)
    return days


# --- LLM composer ---------------------------------------------------------------------------


def _compose_with_llm(
    composer: Composer, dna: AccessibilityDNA, days: list[DayDraft], limits: PaceLimits
) -> str:
    short: dict[str, Candidate] = {}
    request_days = []
    for day in days:
        listed = []
        for c in [*day.visits, *day.meals, *day.snacks]:
            sid = next((k for k, v in short.items() if v is c), None) or f"p{len(short) + 1}"
            short[sid] = c
            listed.append(
                {
                    "id": sid,
                    "name": c.place.name,
                    "kind": c.kind,
                    "category": c.place.category,
                    "subcategories": list(c.place.subcategories),
                    "neighborhood": c.place.neighborhood,
                    "indoor": c.place.indoor,
                    "est_visit_min": c.place.est_visit_min,
                    "score": c.ev.score,
                    "facts": [
                        {"fact_id": f.id, "detail": f.detail, "confidence": f.confidence}
                        for f in c.facts
                    ],
                    "warnings": c.ev.warnings,
                }
            )
        request_days.append(
            {
                "day_index": day.index,
                "date": day.date.isoformat(),
                "clusters": day.clusters,
                "weather": day.weather.model_dump() if day.weather else None,
                "max_visits": limits.max_visits,
                "candidates": listed,
            }
        )
    request = {
        "traveler": {
            "summary": user_input(dna.summary),
            "pace": dna.preferences.pace,
            "interests": dna.preferences.interests,
            "cuisines": dna.preferences.cuisines,
            "avoid": dna.preferences.avoid,
            "must_have": dna.requirements.must_have,
        },
        "days": request_days,
    }
    result = composer(request, list(short))
    taken: set[str] = set()
    for composed in result.days:
        if not 0 <= composed.day_index < len(days):
            continue
        day = days[composed.day_index]
        allowed = {id(c) for c in [*day.visits, *day.meals, *day.snacks]}
        picks = []
        for item in composed.items:
            c = short.get(item.place_id)
            if c is None or id(c) not in allowed or c.place.id in taken:
                continue  # not on this day's list, or already used
            taken.add(c.place.id)
            rationale, fact_ids = grounding.check(c.place.name, item.rationale, item.fact_ids, c.facts,
                                                  _reason(c, dna))  # fmt: skip
            tips = [t for t in (grounding.clean_tip(t) for t in item.tips[:2]) if t]
            picks.append(Pick(c, item.slot, rationale, fact_ids, tips))
        visits = [p for p in picks if p.cand.kind == "visit"]
        for extra in sorted(visits, key=lambda p: p.cand.ev.score)[
            : max(0, len(visits) - limits.max_visits)
        ]:
            picks.remove(extra)
        day.picks, day.theme = picks, composed.theme.strip()[:60]
    notes = result.overall_notes
    return (
        notes
        if not grounding.BANNED.search(notes) and not grounding.ACCESS_WORDS.search(notes)
        else ""
    )


# --- greedy fallback ------------------------------------------------------------------------


def _reason(c: Candidate, dna: AccessibilityDNA) -> str:
    tags = [t for t in c.place.interest_tags if t in dna.preferences.interests]
    if tags:
        return f"{c.place.name} fits your interest in {INTEREST_WORDS.get(tags[0], tags[0])}."
    cuisines = [s for s in c.place.subcategories if s in dna.preferences.cuisines]
    if cuisines:
        word = CUISINE_WORDS.get(cuisines[0], cuisines[0].replace("_", " ").title())
        return f"{c.place.name} has the {word} you asked for."
    if c.kind == "meal":
        return f"{c.place.name} is close to your other stops."
    return f"{c.place.name} is a well-rated stop near your other plans."


def _pick(c: Candidate, slot: str, dna: AccessibilityDNA) -> Pick:
    rationale, fact_ids = grounding.template(c.place.name, c.facts, _reason(c, dna))
    if c.ev.unknown_critical:
        rationale = f"{rationale} {grounding.NOT_VERIFIED}"
    return Pick(c, slot, rationale, fact_ids)


def _greedy(
    day: DayDraft, dna: AccessibilityDNA, limits: PaceLimits, days: list[DayDraft]
) -> tuple[list[Pick], str]:
    taken = {p.cand.place.id for d in days if d.picks for p in d.picks}
    picks: list[Pick] = []
    unknown = 0
    for c in day.visits:
        if len(picks) >= limits.max_visits:
            break
        if c.place.id in taken or (c.ev.unknown_critical and unknown >= 1):
            continue
        unknown += bool(c.ev.unknown_critical)
        slot = "morning" if not picks else "afternoon"
        picks.append(_pick(c, slot, dna))
        taken.add(c.place.id)
    wants_snack = "desserts_cafes" in dna.preferences.cuisines or dna.preferences.pace == "relaxed"
    if wants_snack:
        snack = next((c for c in day.snacks if c.place.id not in taken), None)
        if snack:
            picks.append(_pick(snack, "afternoon", dna))
    return picks, ""


def _fill_meals(day: DayDraft, days: list[DayDraft], dna: AccessibilityDNA) -> None:
    """Make sure each day has a lunch and a dinner when meal candidates exist."""
    assert day.picks is not None
    taken = {p.cand.place.id for d in days if d.picks for p in d.picks}
    slots = {p.slot for p in day.picks if p.cand.kind == "meal"}
    for slot in ("lunch", "dinner"):
        if slot in slots:
            continue
        meal = next((c for c in day.meals if c.place.id not in taken), None)
        if meal:
            day.picks.append(_pick(meal, slot, dna))
            taken.add(meal.place.id)


def _add_light_stop(
    day: DayDraft, days: list[DayDraft], dna: AccessibilityDNA, snacks: list[Candidate]
) -> None:
    """At least 3 stops a day: an activity, a meal, and one more.

    The third stop is a cafe, dessert shop or quiet rest stop, never a second activity:
    a seated stop uses no energy, so the day stays inside the traveler's energy budget.
    Nearby places come first. If none is left, the day keeps fewer stops.
    """
    assert day.picks is not None
    visits = sum(1 for p in day.picks if p.cand.kind == "visit")
    if visits >= 2 or any(p.cand.kind == "snack" for p in day.picks):
        return
    taken = {p.cand.place.id for d in days if d.picks for p in d.picks}
    pool = [c for c in [*day.snacks, *snacks] if c.place.id not in taken]
    local = [c for c in pool if nearby(c.place.neighborhood, day.clusters)]
    pick = (local or pool or [None])[0]
    if pick is not None:
        day.picks.append(_pick(pick, "afternoon", dna))


def _mode(dna: AccessibilityDNA) -> str:
    return {"transit": "transit", "walk_roll": "walk"}.get(dna.trip.transport or "", "drive")


def _theme(day: DayDraft) -> str:
    return " and ".join(h.replace("_", " ").title() for h in day.clusters) or "Free day"


def _overall_notes(days: list[api.DayOut], excluded: list[api.ExcludedPlace]) -> str:
    rests = sum(1 for d in days for i in d.items if i.kind == "rest")
    note = f"Your plan has {len(days)} days with rest breaks built in ({rests} in total)."
    if excluded:
        note += (
            f" We skipped {len(excluded)} places that do not fit your needs; see the reasons below."
        )
    return note


# --- output ---------------------------------------------------------------------------------


def _fact_out(f: Fact) -> api.Fact:
    return api.Fact(
        fact_id=f.id,
        attribute=f.attribute,
        value=f.value,
        detail=f.detail,
        confidence=f.confidence,  # type: ignore[arg-type]
        source=f.source,
        source_label=f.source_label,
        source_url=f.source_url,
        verified_at=f.verified_at.isoformat() if f.verified_at else None,
    )


def place_out(place: Place, facts: list[Fact]) -> api.PlaceOut:
    meta = place.meta
    query = quote_plus(f"{place.name} San Diego")
    maps = f"https://www.google.com/maps/search/?api=1&query={query}"
    if meta.get("google_place_id"):
        maps += f"&query_place_id={meta['google_place_id']}"
    return api.PlaceOut(
        id=place.id,
        name=place.name,
        category=place.category,
        neighborhood=place.neighborhood,
        lat=place.lat,
        lng=place.lng,
        address=meta.get("address"),
        google_maps_url=maps,
        website=meta.get("website"),
        accessibility_url=meta.get("accessibility_url"),
        data_tier=meta.get("data_tier", "C"),
        est_visit_min=place.est_visit_min,
        indoor=place.indoor,
        facts=[_fact_out(f) for f in facts],
        photos=[],
        rating=place.rating,
        research_summary=meta.get("research_summary"),
        research_sources=meta.get("research_sources") or [],
    )


def _long_visit(t: Timed, energy_budget: float) -> str | None:
    """A warning when one visit is more than the traveler's usual daily energy."""
    if t.kind != "visit" or t.pick is None:
        return None
    if round(t.pick.cand.energy) <= round(energy_budget):  # the same rounding as the page
        return None
    hours = round((t.end - t.start).total_seconds() / 1800) / 2
    return (
        f"Long visit: about {hours:g} hours. This is more than your usual daily energy. "
        "Plan rest breaks."
    )


def _item_out(t: Timed, seq: int, mode: str, energy_budget: float | None = None) -> api.ItemOut:
    pick = t.pick
    place = place_out(pick.cand.place, pick.cand.facts) if pick else None
    warnings = list(pick.cand.ev.warnings) if pick else []
    long = _long_visit(t, energy_budget) if energy_budget is not None else None
    if long:
        warnings.append(long)
    rationale = pick.rationale if pick else t.note
    if pick and pick.tips:
        rationale = f"{rationale} Tip: {' '.join(pick.tips)}"
    return api.ItemOut(
        id=str(uuid.uuid4()),
        seq=seq,
        kind=t.kind,  # type: ignore[arg-type]
        title=t.title,
        start=t.start.isoformat(),
        end=t.end.isoformat(),
        travel=api.Travel(minutes=t.travel_min, mode=mode, polyline=None, estimated=True)
        if t.travel_min is not None
        else None,
        status="planned",
        locked=False,
        place=place,
        rationale=rationale,
        cited_fact_ids=pick.fact_ids if pick else [],
        warnings=warnings,
        insights=[],
        accessibility_score=pick.cand.ev.accessibility_score if pick else None,
        verification_score=pick.cand.ev.verification_score if pick else None,
        verification_note=pick.cand.ev.verification_note if pick else None,
    )
