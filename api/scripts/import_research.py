"""Add the team's source-linked research to the demo places.

Run from api/:  uv run python -m scripts.import_research [--dry-run]
scripts.import_demo_csv runs this too, so a CSV import keeps the research.

Rules:
- Only entries with research_status "official_source_review" are used (42 of 200). The other
  places stay as they are: their accessibility is unknown.
- The summary and the source links are stored as written and shown on the place card. The app
  does not read facts out of the summary text.
- These places get data tier B (official page), and the first source becomes accessibility_url.
- OFFICIAL_FACTS are the few facts a person read in the source and copied here by hand.
"""

import csv
import json
import sys
from datetime import date
from pathlib import Path

import psycopg
from psycopg.rows import tuple_row
from psycopg.types.json import Jsonb

from app.config import get_settings

RESEARCH = Path(__file__).resolve().parents[2] / "data" / "locations-research.json"
CSV = Path(__file__).resolve().parents[2] / "data" / "demo-san-diego-locations-200.csv"

# location_id -> [(attribute, value, detail, index of the source in "sources", confidence)]
# Copied by hand from the research summaries, which quote the official pages.
# VERIFIED: read on the source page on CHECKED_ON. COMMUNITY: copied from the summary only;
# confirm it on the source page, then change it to VERIFIED.
C, V = "COMMUNITY", "VERIFIED"
CHECKED_ON = date(2026, 10, 18)
OFFICIAL_FACTS: dict[str, list[tuple[str, str, str, int, str]]] = {
    "sd-021": [
        ("status", "closed", "The reserve and all its trails are closed until March 2027.", 0, V)
    ],
    "sd-041": [
        ("max_slope", "steep", "Steep grades in parts of the grounds.", 0, V),
        ("wheelchair_rental", "yes", "Wheelchair and scooter rentals near the entrance.", 0, V),
    ],
    "sd-043": [
        ("parking_accessible", "yes", "Accessible and van-accessible parking.", 0, V),
        (
            "restroom_accessible",
            "yes",
            "Wheelchair-accessible restrooms throughout the park.",
            0,
            C,
        ),
        ("wheelchair_rental", "yes", "Wheelchair and scooter rentals.", 0, V),
        ("captions_asl", "partial", "Free ASL interpreters on request.", 0, V),
    ],
    "sd-044": [
        (
            "entrance_step_free",
            "yes",
            "The operator says the aquarium is wheelchair accessible.",
            0,
            C,
        ),
        ("parking_accessible", "yes", "Designated accessible parking.", 0, V),
        ("dropoff_zone", "yes", "Drop-off in the front entrance traffic circle.", 0, V),
    ],
    "sd-051": [
        ("captions_asl", "yes", "Prerecorded ASL tour with captions on a handheld device.", 0, V),
        ("elevator", "yes", "Elevators connect the pier, hangar deck and flight deck.", 0, V),
        (
            "restroom_accessible",
            "yes",
            "Accessible restrooms on the hangar and flight decks.",
            0,
            C,
        ),
    ],
    "sd-052": [
        ("entrance_step_free", "yes", "Ramps at the plaza and to Evernham Hall.", 0, V),
        ("elevator", "yes", "An elevator and a lift in the east wing.", 0, V),
        ("wheelchair_rental", "yes", "Free wheelchairs.", 0, V),
    ],
    "sd-053": [
        ("entrance_step_free", "yes", "The museum says it is fully wheelchair accessible.", 0, V),
        ("wheelchair_rental", "yes", "Free wheelchairs, first come, first served.", 0, V),
    ],
    "sd-054": [
        ("entrance_step_free", "yes", "Accessible north entrance near the large fig tree.", 0, V),
        (
            "parking_accessible",
            "yes",
            "Accessible spaces in the east and South Carousel lots.",
            0,
            C,
        ),
        ("assistive_listening", "yes", "Infrared headsets in the Kaplan Theater.", 0, V),
    ],
    "sd-058": [
        ("entrance_step_free", "yes", "Accessible El Prado entrance.", 0, C),
        ("elevator", "yes", "Elevator to all building levels.", 0, C),
        ("restroom_accessible", "yes", "Accessible restrooms.", 0, C),
        (
            "captions_asl",
            "partial",
            "Captions on request for the documentary and some exhibits.",
            0,
            C,
        ),
    ],
    "sd-061": [
        ("captions_asl", "yes", "Captioning devices for Dome Theater films.", 0, V),
        ("assistive_listening", "yes", "Headsets that make theater sound clearer.", 0, V),
        ("restroom_accessible", "yes", "Several wheelchair-accessible restrooms.", 0, V),
    ],
    "sd-062": [
        ("entrance_step_free", "yes", "Ramp at the east end of the front of the building.", 0, V),
        ("restroom_accessible", "yes", "Accessible restrooms in the Rotunda and Gallery 15.", 0, V),
        ("assistive_listening", "yes", "Headsets for screenings and lectures.", 0, V),
    ],
    "sd-063": [
        (
            "entrance_step_free",
            "yes",
            "Wheelchair entry at the Alcazar Garden and Plaza entrances.",
            0,
            C,
        ),
        ("elevator", "yes", "Elevators to the exhibition and lower levels.", 0, V),
        ("parking_accessible", "yes", "ADA parking in the Alcazar and Organ Pavilion lots.", 0, V),
    ],
    "sd-064": [
        ("entrance_step_free", "yes", "Ramp to the left of the entrance.", 0, V),
        ("seating", "plenty", "Benches in every gallery.", 0, V),
        ("captions_asl", "partial", "ASL tours on the first Saturday of each month only.", 1, V),
    ],
    "sd-065": [
        ("entrance_step_free", "yes", "Ramps and power doors at both entrances.", 0, V),
        ("elevator", "yes", "Elevators.", 0, V),
        ("restroom_accessible", "yes", "Wheelchair-accessible restrooms.", 0, V),
        ("quiet_space", "yes", "A Calm Room.", 0, V),
        ("assistive_listening", "yes", "SoundMate listening devices.", 0, V),
    ],
    "sd-066": [
        ("entrance_step_free", "yes", "Automatic front door.", 0, V),
        ("elevator", "yes", "A public elevator to every level.", 0, V),
        ("quiet_space", "yes", "A Breathing Room on the main level.", 0, V),
        ("restroom_accessible", "yes", "Accessible restrooms on all three floors.", 0, V),
        ("parking_accessible", "yes", "Disabled parking spaces on Island Avenue.", 0, V),
    ],
    "sd-057": [
        (
            "ada_accessible",
            "no",
            "The operator says the Serra Museum and presidio site are not ADA-accessible.",
            0,
            C,
        ),
    ],
    "sd-089": [
        ("entrance_step_free", "yes", "Ground-level entrance with no steps.", 0, V),
        (
            "restroom_accessible",
            "yes",
            "Wheelchair-accessible restrooms in the community center.",
            0,
            V,
        ),
        ("assistive_listening", "yes", "Listening devices at the box office.", 0, V),
    ],
    "sd-090": [
        ("assistive_listening", "yes", "Listening systems in all three theaters.", 0, V),
        ("captions_asl", "partial", "Open captions at selected performances only.", 0, V),
    ],
    "sd-093": [
        ("elevator", "no", "No elevators or escalators.", 0, V),
        ("entrance_step_free", "yes", "A ramp at the North Entrance.", 0, V),
        ("restroom_accessible", "yes", "Accessible restrooms on the outer concourse.", 0, V),
        ("assistive_listening", "yes", "Listening devices, with an ID deposit.", 0, V),
    ],
}


def load() -> tuple[date, list[dict]]:
    data = json.loads(RESEARCH.read_text())
    researched = [
        loc for loc in data["locations"] if loc["research_status"] == "official_source_review"
    ]
    return date.fromisoformat(data["research_date"]), researched


def slugs() -> dict[str, str]:
    """location_id (sd-001) -> place slug (demo-coronado-central-beach)."""
    with CSV.open() as f:
        return {r["id"]: f"demo-{r['slug']}" for r in csv.DictReader(f)}


def apply(conn: psycopg.Connection) -> tuple[int, int]:
    """Write the research to the places. Returns (places updated, facts added)."""
    research_date, researched = load()
    slug_of = slugs()
    cur = conn.cursor(row_factory=tuple_row)
    updated = facts = 0
    for loc in researched:
        sources = [{"title": s["document_title"], "url": s["url"]} for s in loc["sources"]]
        row = cur.execute(
            """update places set research_summary = %s, research_sources = %s, data_tier = 'B',
                   accessibility_url = %s, updated_at = now()
               where slug = %s returning id""",
            [
                loc["accessibility_summary"],
                Jsonb(sources),
                sources[0]["url"] if sources else None,
                slug_of[loc["location_id"]],
            ],
        ).fetchone()
        if row is None:
            continue
        updated += 1
        for attribute, value, detail, source, confidence in OFFICIAL_FACTS.get(
            loc["location_id"], []
        ):
            cur.execute(
                "delete from place_accessibility where place_id = %s and attribute = %s",
                [row[0], attribute],
            )
            cur.execute(
                """insert into place_accessibility (place_id, attribute, value, detail, confidence,
                       source, source_url, verified_at)
                   values (%s, %s, %s, %s, %s, 'official', %s, %s)""",
                [
                    row[0],
                    attribute,
                    value,
                    detail,
                    confidence,
                    sources[source]["url"],
                    research_date,
                ],
            )
            facts += 1
    return updated, facts


def main(dry_run: bool) -> None:
    with (
        psycopg.connect(get_settings().database_url, prepare_threshold=None) as conn,
        conn.transaction(force_rollback=dry_run),
    ):
        updated, facts = apply(conn)
    print(f"research: {updated} places updated, {facts} official facts added")
    if dry_run:
        print("Rolled back (dry run).")


if __name__ == "__main__":
    main(dry_run="--dry-run" in sys.argv)
