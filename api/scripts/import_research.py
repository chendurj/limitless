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

# location_id -> (attribute, value, detail, index of the source in "sources")
OFFICIAL_FACTS = {
    "sd-057": (
        "ada_accessible",
        "no",
        "The operator says the Serra Museum and the presidio site are not currently ADA-accessible.",
        0,
    ),
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
        if loc["location_id"] in OFFICIAL_FACTS:
            attribute, value, detail, source = OFFICIAL_FACTS[loc["location_id"]]
            cur.execute(
                "delete from place_accessibility where place_id = %s and attribute = %s",
                [row[0], attribute],
            )
            cur.execute(
                """insert into place_accessibility (place_id, attribute, value, detail, confidence,
                       source, source_url, verified_at)
                   values (%s, %s, %s, %s, 'VERIFIED', 'official', %s, %s)""",
                [row[0], attribute, value, detail, sources[source]["url"], research_date],
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
