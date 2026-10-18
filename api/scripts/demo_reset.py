"""Reset the demo: delete the demo user's data, then make the two persona trips again.

Run from api/:  uv run python -m scripts.demo_reset [--no-llm] [--start YYYY-MM-DD] [--dry-run]

- Deletes all profiles, trips (with their versions) and feedback of the demo user.
  Seed feedback (is_seed) and the places stay.
- Makes the ankle-injury and the Deaf, non-speaking trips with fixed ids, so the demo links
  do not change: /trips/<id> below.
- The trips start today (Pacific) by default, so live mode and re-plan work in the demo.
- --no-llm uses the greedy planner: faster (no 45 s composer call), plainer text.
- All changes are in one transaction. If a step fails, nothing changes.
"""

import argparse
import json
from datetime import date, datetime
from pathlib import Path

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from app.config import get_settings
from app.db import PgPlaceStore, dumps
from app.deps import DEMO_USER_ID
from app.llm.compose import compose
from app.models.dna import AccessibilityDNA
from app.services.planner import build_trip
from app.services.scheduler import TZ
from app.services.similarity import dna_vector, to_pgvector
from app.services.weather import forecast

PERSONAS = Path(__file__).parent / "personas"

# name -> (profile id, trip id)
DEMO = {
    "ankle": ("00000000-0000-4000-8000-0000000000a1", "00000000-0000-4000-8000-0000000000b1"),
    "deaf": ("00000000-0000-4000-8000-0000000000a2", "00000000-0000-4000-8000-0000000000b2"),
}
TRANSPORT = {"transit": "transit", "walk_roll": "walk"}


def main() -> None:
    args = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    args.add_argument("--no-llm", action="store_true", help="use the greedy planner")
    args.add_argument("--start", type=date.fromisoformat, help="first day (default: today)")
    args.add_argument("--nights", type=int, default=3)
    args.add_argument("--dry-run", action="store_true", help="make the trips, then roll back")
    opts = args.parse_args()

    today = datetime.now(TZ).date()
    start = opts.start or today
    places, facts = PgPlaceStore().load()
    if not places:
        raise SystemExit("There are no places in the database. Run scripts.import_demo_csv first.")

    made = {}
    for name, (profile_id, trip_id) in DEMO.items():
        persona = json.loads((PERSONAS / f"{name}.json").read_text())
        dna = AccessibilityDNA.model_validate(persona["dna"])
        trip = build_trip(
            dna,
            places,
            facts,
            trip_id=trip_id,
            start_date=start,
            nights=opts.nights,
            travelers=dna.party.size or 1,
            lodging=None,
            composer=None if opts.no_llm else compose,
            weather=forecast,
            today=today,
        )
        made[name] = (persona, dna, trip)
        visits = sum(1 for d in trip.days for i in d.items if i.kind == "visit")
        print(f"{name}: {len(trip.days)} days, {visits} visits, {len(trip.excluded)} skipped")

    with (
        psycopg.connect(
            get_settings().database_url, row_factory=dict_row, prepare_threshold=None
        ) as conn,
        conn.transaction(force_rollback=opts.dry_run),
    ):
        deleted = conn.execute(
            "delete from feedback where user_id = %s and not is_seed", [DEMO_USER_ID]
        ).rowcount
        deleted_profiles = conn.execute(
            "delete from profiles where user_id = %s", [DEMO_USER_ID]
        ).rowcount  # trips, versions and items cascade
        print(f"deleted: {deleted_profiles} profiles (with their trips), {deleted} feedback rows")
        for name, (persona, dna, trip) in made.items():
            profile_id, trip_id = DEMO[name]
            conn.execute(
                """
                    insert into profiles (id, user_id, raw_answers, followup_qa, dna, dna_vector,
                                          consent_aggregate, trip_only)
                    values (%s, %s, %s, '[]', %s, %s::extensions.vector, %s, %s)
                    """,
                [
                    profile_id,
                    DEMO_USER_ID,
                    Jsonb(persona["raw_answers"]),
                    Jsonb(dumps(dna)),
                    to_pgvector(dna_vector(dna)),
                    persona.get("consent_aggregate", False),
                    dna.trip_only,
                ],
            )
            conn.execute(
                """
                    insert into trips (id, user_id, profile_id, start_date, nights, travelers,
                                       transport_mode, status, excluded, overall_notes)
                    values (%s, %s, %s, %s, %s, %s, %s, 'ready', %s, %s)
                    """,
                [
                    trip_id,
                    DEMO_USER_ID,
                    profile_id,
                    start,
                    opts.nights,
                    trip.travelers,
                    TRANSPORT.get(dna.trip.transport or "", "drive"),
                    Jsonb(dumps(trip.excluded)),
                    trip.overall_notes,
                ],
            )
            conn.execute(
                "insert into trip_versions (trip_id, version, plan) values (%s, 1, %s)",
                [trip_id, Jsonb(dumps(trip))],
            )
    print("Rolled back (dry run)." if opts.dry_run else "Demo reset done.")
    for name, (profile_id, trip_id) in DEMO.items():
        print(f"  {name}: profile {profile_id}  trip /trips/{trip_id}")


if __name__ == "__main__":
    main()
