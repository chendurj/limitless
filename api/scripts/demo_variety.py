"""Add more demo values, so the two demo personas get different scores and skipped places.

Run from api/:  uv run python -m scripts.demo_variety [--dry-run]
Then:           uv run python -m scripts.demo_reset

Why: the demo CSV has almost no negative values. Captions are never "no", and there is no
booking or walking data, so every chosen stop scored 100.

Rules:
- Every value here is generated, like the rest of the CSV: source "demo_data", confidence
  COMMUNITY, never VERIFIED. The app labels it "demo data, not verified".
- The researched places (data tier B) do not change, so no value contradicts the research.
- The values come from a hash of the place slug, not from random numbers. Each run gives
  the same result.
- Safe to run again: it replaces its own attributes for each place.
- To undo: uv run python -m scripts.import_demo_csv
"""

import hashlib
import sys

import psycopg
from psycopg.rows import tuple_row

from app.config import get_settings

VENUES = {"museum", "attraction"}
FOOD = {"restaurant", "cafe", "dessert"}
WALKS = {"museum", "attraction", "park", "shopping", "photo_spot"}
# Most indoor places in a city are flat. The CSV gives many of them moderate or steep slopes
# and uneven floors, which skipped most places for wheelchair users.
INDOOR = {"restaurant", "cafe", "dessert", "museum", "shopping"}
# Percent of places that get each value. High on purpose: the planner picks the best places,
# so a problem must be common before it shows on a chosen stop.
SHARE = {"captions_partial": 90, "captions_no": 50, "phone_only": 92, "online": 100,
         "kiosk": 30, "text": 25, "uneven": 30, "walk": 90}  # fmt: skip


def pick(slug: str, attribute: str) -> int:
    """A stable number from 0 to 99 for this place and attribute."""
    return int(hashlib.sha256(f"{slug}:{attribute}".encode()).hexdigest(), 16) % 100


def values(slug: str, category: str, captions: str | None, terrain: str | None) -> dict:
    """attribute -> (value, detail) for one place."""
    out = {}
    # Deaf traveler: captions are a must-have at museums and attractions.
    if category in VENUES:
        n = pick(slug, "captions_asl")
        if captions == "yes" and n < SHARE["captions_partial"]:
            out["captions_asl"] = ("partial", "Captions on some films and exhibits only.")
        elif captions is None and n < SHARE["captions_no"]:
            out["captions_asl"] = ("no", "No captions or ASL.")
    # Non-speaking traveler: how to book and order without a phone call.
    if category in VENUES | {"restaurant"}:
        n = pick(slug, "booking")
        if n < SHARE["phone_only"]:
            out["booking_phone_only"] = ("yes", "Bookings by phone call only.")
        elif n < SHARE["online"]:
            out["online_booking"] = ("yes", "Book online.")
    if category in FOOD and pick(slug, "kiosk") < SHARE["kiosk"]:
        out["kiosk_or_app_ordering"] = ("yes", "Order at a kiosk or by QR code.")
    if pick(slug, "text_contact") < SHARE["text"]:
        out["text_contact"] = ("yes", "Answers text messages and email.")
    # Slopes and floors: realistic for indoor places, varied for outdoor places.
    if category in INDOOR:
        flat = pick(slug, "max_slope") < 50
        out["max_slope"] = ("flat", "Flat routes.") if flat else ("gentle", "Gentle slopes.")
        smooth = pick(slug, "terrain") < 60
        out["terrain"] = ("smooth", "Smooth floors.") if smooth else ("mixed", "Mixed surfaces.")
    elif terrain in ("smooth", "mixed") and pick(slug, "terrain") < SHARE["uneven"]:
        out["terrain"] = ("uneven", "Uneven surfaces.")
    if category in WALKS and pick(slug, "typical_walk_m") < SHARE["walk"]:
        meters = 250 + pick(slug, "meters") * 3 // 2  # 250-398 m
        out["typical_walk_m"] = (str(meters), f"About {meters} m of walking inside.")
    return out


PLACES_SQL = """
select p.id, p.slug, p.category,
       max(pa.value) filter (where pa.attribute = 'captions_asl') as captions,
       max(pa.value) filter (where pa.attribute = 'terrain') as terrain
from places p left join place_accessibility pa on pa.place_id = p.id
where p.slug like 'demo-%%' and p.data_tier <> 'B'
group by p.id, p.slug, p.category
"""


def apply(conn: psycopg.Connection) -> dict[str, int]:
    """Write the values. Returns the count of facts for each attribute."""
    cur = conn.cursor(row_factory=tuple_row)
    counts: dict[str, int] = {}
    for place_id, slug, category, captions, terrain in cur.execute(PLACES_SQL).fetchall():
        for attribute, (value, detail) in values(slug, category, captions, terrain).items():
            cur.execute(
                """delete from place_accessibility
                   where place_id = %s and attribute = %s and source = 'demo_data'""",
                [place_id, attribute],
            )
            cur.execute(
                """insert into place_accessibility (place_id, attribute, value, detail,
                       confidence, source)
                   values (%s, %s, %s, %s, 'COMMUNITY', 'demo_data')""",
                [place_id, attribute, value, detail],
            )
            key = attribute if attribute == "typical_walk_m" else f"{attribute}={value}"
            counts[key] = counts.get(key, 0) + 1
    return counts


def main(dry_run: bool) -> None:
    with (
        psycopg.connect(get_settings().database_url, prepare_threshold=None) as conn,
        conn.transaction(force_rollback=dry_run),
    ):
        counts = apply(conn)
    for key, n in sorted(counts.items()):
        print(f"  {key}: {n}")
    print("Rolled back (dry run)." if dry_run else "Done. Now run scripts.demo_reset.")


if __name__ == "__main__":
    main(dry_run="--dry-run" in sys.argv)
