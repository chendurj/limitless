"""Re-plan after feedback: trip-only DNA changes, then repair of the stops that are not locked.

Deterministic and fast (no LLM). The result is a proposed version; the traveler applies it.

1. Overrides: map the parsed feedback to trip-only changes in the DNA and to per-place facts.
2. Lock: stops that are done, in progress or locked stay as they are, and so does every stop
   before them on the same day. Days before the feedback day do not change.
3. Repair: re-evaluate each other stop with the new DNA. A stop that is now excluded, or whose
   access fit is below 0.6, is replaced by the best free candidate of the same kind nearby.
4. Re-time the rest of each day with the new limits. The scheduler can drop visits to fit.
5. Diff the old and new plan, and write a short message that can be read aloud.
"""

from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from typing import Any

from app.models import api
from app.models.dna import AccessibilityDNA
from app.services.facts import Fact, resolve
from app.services.planner import _item_out, _mode, _pick
from app.services.rules import Place
from app.services.scheduler import (
    DEFAULT_LODGING,
    TZ,
    Candidate,
    Pick,
    Timed,
    lay_out,
    limits_for,
    nearby,
)
from app.services.scoring import evaluate

MIN_ACCESS_FIT = 0.6
REST_NOW_MIN = 20

SLOPES = ["flat_only", "gentle", "moderate_with_help", "moderate", "steep_ok"]
WALKS = [
    "cannot_walk",
    "transfer_steps_only",
    "under_5_min",
    "5_to_15_min",
    "15_to_30_min",
    "long_ok",
]
PACES = ["relaxed", "moderate", "busy"]
RESTS = ["30_min", "45_min", "60_min", "90_min"]


@dataclass
class Overrides:
    """Trip-only changes. Stored with each trip version."""

    dna: dict[str, Any] | None = None  # the adjusted DNA; None = the profile DNA
    facts: list[dict[str, Any]] = field(
        default_factory=list
    )  # {place_id, attribute, value, detail}

    def to_json(self) -> dict[str, Any]:
        return {"dna": self.dna, "facts": self.facts}

    @classmethod
    def from_json(cls, data: dict[str, Any] | None) -> "Overrides":
        data = data or {}
        return cls(dna=data.get("dna"), facts=list(data.get("facts", [])))


def _down(value: str | None, scale: list[str], default: str) -> str:
    current = value if value in scale else default
    return scale[max(0, scale.index(current) - 1)]


def apply_feedback(
    dna: AccessibilityDNA,
    parsed: api.FeedbackParsed,
    place_id: str | None,
    old: Overrides,
    others: Sequence[tuple[str, api.PlaceReport]] = (),  # (place id, report): other named places
) -> tuple[AccessibilityDNA, Overrides, list[str]]:
    """Return the new trip DNA, the new overrides, and plain reasons for the message."""
    data = dna.model_dump()
    m, prefs = data["mobility"], data["preferences"]
    reasons: list[str] = []
    avoid = set(prefs["avoid"])
    if parsed.requested_interests:
        prefs["interests"] = list(dict.fromkeys(parsed.requested_interests))
        reasons.append("you asked for different activities")
    avoid.update(parsed.requested_avoid)
    if "long_distances" in parsed.requested_avoid:
        if m["walking"] is None or m["walking"] in WALKS[4:] or m["walking"] == "varies":
            m["walking"] = "5_to_15_min"
        prefs["pace"] = "relaxed"
        m["rest_interval"] = "30_min"
        reasons.append("you asked for less walking")
    if parsed.requested_pace:
        prefs["pace"] = parsed.requested_pace
        reasons.append("you asked for a different pace")
    if "high" in (parsed.terrain_difficulty, parsed.wheelchair_difficulty):
        m["slope_tolerance"] = _down(m["slope_tolerance"], SLOPES, "moderate")
        if m["walking"] in WALKS[3:]:
            m["walking"] = _down(m["walking"], WALKS, "long_ok")
        avoid.add("hills")
        reasons.append("hills and long walks were hard")
    if parsed.fatigue == "high":
        prefs["pace"] = _down(prefs["pace"], PACES, "moderate")
        m["rest_interval"] = _down(
            m["rest_interval"] if m["rest_interval"] in RESTS else None, RESTS, "90_min"
        )
        avoid.add("long_distances")
        reasons.append("you are tired")
    if parsed.crowding == "high":
        avoid.add("crowds")
        reasons.append("it was too crowded")
    if parsed.noise == "high":
        avoid.add("noise")
        reasons.append("it was too loud")
    prefs["avoid"] = sorted(avoid)
    new_dna = AccessibilityDNA.model_validate(data)

    facts = list(old.facts)
    reports = [(place_id, parsed)] if place_id else []
    for pid, report in [*reports, *others]:
        detail = "A traveler on this trip reported"
        for flag, attribute, value, text in (
            (
                report.restroom_ok is False,
                "restroom_accessible",
                "no",
                "the accessible restroom did not work for them",
            ),
            (
                report.entrance_ok is False,
                "entrance_step_free",
                "no",
                "the entrance did not work for them",
            ),
            (
                report.captions_ok is False,
                "captions_asl",
                "no",
                "no captions or ASL were available",
            ),
            (
                report.booking_phone_only is True,
                "booking_phone_only",
                "yes",
                "booking needed a phone call",
            ),
        ):
            if flag:
                facts.append({"place_id": pid, "attribute": attribute, "value": value,
                              "detail": f"{detail} that {text}."})  # fmt: skip
                reasons.append(text)
    return new_dna, Overrides(dna=new_dna.model_dump(mode="json"), facts=facts), reasons


def override_facts(overrides: Overrides) -> dict[str, list[Fact]]:
    """Trip-only facts. Negative ids show that they come from this trip's feedback."""
    out: dict[str, list[Fact]] = {}
    for i, f in enumerate(overrides.facts, start=1):
        out.setdefault(f["place_id"], []).append(
            Fact(-i, f["attribute"], f["value"], f["detail"], "COMMUNITY", "community_feedback")
        )
    return out


@dataclass
class Repair:
    trip: api.TripOut
    changes: list[api.ChangeOut]


def _locked(item: api.ItemOut) -> bool:
    # Repair must preserve history, explicit skips, and commitments the traveler kept.
    return item.locked or item.status in ("done", "in_progress", "skipped")


def _slot(item: api.ItemOut, kind: str) -> str:
    hour = datetime.fromisoformat(item.start).hour
    if kind == "meal":
        return "lunch" if hour < 15 else "dinner"
    return "morning" if hour < 12 else "afternoon"


def repair(
    trip: api.TripOut,
    dna: AccessibilityDNA,
    places: list[Place],
    facts: dict[str, list[Fact]],
    extra_facts: dict[str, list[Fact]],
    from_day: int,
    rest_now_after: str | None,
    today: date | None = None,
    before: dict[str, float] | None = None,
    regenerate: bool = False,
    replace_places: set[str] | None = None,
    requested_interests: list[str] | None = None,
    requested_avoid: list[str] | None = None,
    stop_today: bool = False,
) -> Repair:
    """Repair days from from_day on. rest_now_after: item id after which to add a rest now.

    before: each place's access fit before the feedback. A stop is only changed when the
    feedback made it worse; a stop that the planner accepted stays if nothing changed for it.
    """
    today = today or date.today()
    before = before or {}
    cands: dict[str, Candidate] = {}
    for p in places:
        all_facts = facts.get(p.id, []) + extra_facts.get(p.id, [])
        ev = evaluate(p, all_facts, dna, today=today)
        cands[p.id] = Candidate(p, ev, list(resolve(all_facts, today).values()))
    in_trip = {i.place.id for d in trip.days for i in d.items if i.place}
    limits = limits_for(dna)
    changes: list[api.ChangeOut] = []
    new_days = []

    for day in trip.days:
        if day.day_index < from_day or (stop_today and day.day_index > from_day):
            new_days.append(day)
            continue
        items = list(day.items)
        # Preserve the prefix through the last protected stop, keeping its sequence
        # and timing intact rather than inserting new stops before a commitment.
        last_locked = max((n for n, i in enumerate(items) if _locked(i)), default=-1)
        rest_idx = next((n for n, i in enumerate(items) if i.id == rest_now_after), None)
        if rest_idx is not None:
            last_locked = max(last_locked, rest_idx)
        kept, tail = items[: last_locked + 1], items[last_locked + 1 :]
        hood = {i.place.neighborhood for i in items if i.place}
        picks: list[Pick] = []
        replaced: dict[str, api.ChangeOut] = {}  # new place id -> its change
        for item in tail:
            if stop_today and day.day_index == from_day:
                changes.append(
                    api.ChangeOut(
                        type="removed",
                        day_index=day.day_index,
                        old_item_id=item.id,
                        reason=f"{item.title}: You asked to stop for today.",
                        cited_fact_ids=[],
                    )
                )
                continue
            if item.place is None or item.place.id not in cands:
                continue  # rests are made again by the scheduler
            cand = cands[item.place.id]
            worse = cand.ev.access_fit < before.get(cand.place.id, 1.0)
            unsafe = cand.ev.excluded or (worse and cand.ev.access_fit < MIN_ACCESS_FIT)
            requested = (
                cand.place.id in (replace_places or set())
                or (
                    cand.kind != "meal"
                    and (
                        regenerate
                        or bool(
                            requested_interests
                            and not set(requested_interests).intersection(cand.place.interest_tags)
                        )
                    )
                )
                or bool(requested_avoid and worse)
            )
            if unsafe or requested:
                why = (
                    (cand.ev.reasons or cand.ev.warnings or ["It no longer fits your needs."])[0]
                    if unsafe
                    else "You asked for a different stop."
                )
                new = _replacement(
                    cand,
                    cands,
                    in_trip,
                    hood,
                    requested_interests,
                    cand.ev.access_fit
                    if requested_avoid and not unsafe and not regenerate and not requested_interests
                    else None,
                )
                if new:
                    in_trip.add(new.place.id)
                    picks.append(_pick(new, _slot(item, new.kind), dna))
                    change = api.ChangeOut(type="replaced", day_index=day.day_index, old_item_id=item.id,
                                           reason=f"{item.title} → {new.place.name}: {why}",
                                           cited_fact_ids=cand.ev.fact_ids)  # fmt: skip
                    replaced[new.place.id] = change
                    changes.append(change)
                elif unsafe:
                    changes.append(api.ChangeOut(type="removed", day_index=day.day_index, old_item_id=item.id,
                                                 reason=f"{item.title}: {why}", cited_fact_ids=cand.ev.fact_ids))  # fmt: skip
                if new or unsafe:
                    continue
            old = next((p for p in tail if p.id == item.id), item)
            pick = _pick(cand, _slot(old, cand.kind), dna)
            pick.rationale = item.rationale  # keep the composer's text for stops that stay
            pick.fact_ids = item.cited_fact_ids
            picks.append(pick)

        start_at, here, spent = None, None, 0.0
        if kept:
            last = kept[-1]
            start_at = datetime.fromisoformat(last.end)
            spent = sum(
                cands[i.place.id].energy
                for i in kept
                if i.place and i.place.id in cands and i.status != "skipped"
            )
            loc = next((i.place for i in reversed(kept) if i.place and i.status != "skipped"), None)
            here = (loc.lat, loc.lng) if loc else None
        extra: list[api.ItemOut] = []
        if rest_idx is not None:
            begin = start_at or datetime.combine(day_date(day), limits.start, tzinfo=TZ)
            end = begin + timedelta(minutes=REST_NOW_MIN)
            extra.append(_item_out(Timed("rest", "Rest break now", begin, end, note="Take a seated break now."),
                                   0, _mode(dna)))  # fmt: skip
            changes.append(api.ChangeOut(type="rest_added", day_index=day.day_index,
                                         new_item_id=extra[0].id, reason="You asked for a break.",
                                         cited_fact_ids=[]))  # fmt: skip
            start_at = end
        lodging = here or (DEFAULT_LODGING[1], DEFAULT_LODGING[2])
        timed, energy = (
            lay_out(
                picks, day_date(day), dna, limits, lodging, start_at=start_at, energy_spent=spent
            )
            if picks
            else ([], spent)
        )
        placed = {t.pick.cand.place.id for t in timed if t.pick}
        for pick in picks:
            if pick.cand.place.id not in placed:
                old = next((i for i in tail if i.place and i.place.id == pick.cand.place.id), None)
                changes.append(api.ChangeOut(type="removed", day_index=day.day_index,
                                             old_item_id=old.id if old else None,
                                             reason=f"{pick.cand.place.name}: a lighter day to save your energy.",
                                             cited_fact_ids=[]))  # fmt: skip
        new_items = kept + extra + [_item_out(t, 0, _mode(dna), limits.energy) for t in timed]
        notes = {i.place.id: i.user_note for i in items if i.place and i.user_note}
        for item in new_items:
            original = next(
                (
                    i
                    for i in tail
                    if (item.place and i.place and item.place.id == i.place.id)
                    or (
                        not item.place
                        and not i.place
                        and item.kind == i.kind
                        and item.start == i.start
                        and item.end == i.end
                    )
                ),
                None,
            )
            if original:
                item.id = original.id
                item.status = original.status
                if item.start != original.start or item.end != original.end:
                    changes.append(
                        api.ChangeOut(
                            type="retimed",
                            day_index=day.day_index,
                            old_item_id=original.id,
                            new_item_id=item.id,
                            reason=f"{item.title}: adjusted time to fit your updated pace.",
                            cited_fact_ids=[],
                        )
                    )
            elif item.kind == "rest" and item not in extra:
                changes.append(
                    api.ChangeOut(
                        type="rest_added",
                        day_index=day.day_index,
                        new_item_id=item.id,
                        reason="An extra break to fit your pace.",
                        cited_fact_ids=[],
                    )
                )
            if item.place and item.place.id in notes:
                item.user_note = notes[item.place.id]
            if item.place and item.place.id in replaced:
                replaced[item.place.id].new_item_id = item.id
        for seq, item in enumerate(new_items):
            item.seq = seq
        new_days.append(day.model_copy(update={"items": new_items, "energy_budget": round(limits.energy),
                                               "energy_used": round(energy)}))  # fmt: skip

    new_trip = trip.model_copy(update={"days": new_days, "profile_summary": dna.summary})
    return Repair(new_trip, changes)


def day_date(day: api.DayOut) -> date:
    return date.fromisoformat(day.date)


def _replacement(
    old: Candidate,
    cands: dict[str, Candidate],
    in_trip: set[str],
    hoods: set[str],
    interests: list[str] | None = None,
    improve_fit: float | None = None,
) -> Candidate | None:
    pool = [
        c
        for c in cands.values()
        if c.kind == old.kind
        and c.place.id not in in_trip
        and not c.ev.excluded
        and c.ev.access_fit >= MIN_ACCESS_FIT
        and not c.ev.unknown_critical
        and (improve_fit is None or c.ev.access_fit > improve_fit)
    ]
    if interests and old.kind != "meal":
        pool = [c for c in pool if set(interests).intersection(c.place.interest_tags)]
    local = [c for c in pool if nearby(c.place.neighborhood, list(hoods))]
    return max(local or pool, key=lambda c: c.ev.score, default=None)


def message(ack: str, reasons: list[str], changes: list[api.ChangeOut]) -> str:
    """Two to four sentences, for the screen and for speech."""
    if not changes:
        return f"{ack} I could not find a suitable change within your access needs and the available places. Your saved plan has not changed. Try another request."
    parts = [ack]
    if reasons:
        parts.append(f"Because {reasons[0]}, I suggest these changes.")
    for change in changes[:2]:
        if change.type == "replaced":
            old, rest = change.reason.split(" → ", 1)
            parts.append(f"Swap {old} for {rest.split(':')[0]}.")
        elif change.type == "removed":
            parts.append(f"Skip {change.reason.split(':')[0]}.")
        elif change.type == "rest_added":
            parts.append("Add a rest break.")
    if len(changes) > 2:
        parts.append(f"There are {len(changes) - 2} more changes.")
    parts.append("Choose Save changes to use the new plan.")
    return " ".join(parts)


def access_fits(
    dna: AccessibilityDNA,
    places: list[Place],
    facts: dict[str, list[Fact]],
    extra_facts: dict[str, list[Fact]],
    today: date | None = None,
) -> dict[str, float]:
    """Each place's access fit, for the 'before' side of a repair."""
    return {
        p.id: evaluate(
            p, facts.get(p.id, []) + extra_facts.get(p.id, []), dna, today=today
        ).access_fit
        for p in places
    }
