"""Load the team's 200-place demo CSV into Supabase.

Run from api/:  uv run python -m scripts.import_demo_csv [--dry-run]

Rules:
- Every fact gets source "demo_data" and confidence COMMUNITY (never VERIFIED). The app
  shows the label "demo data, not verified" on these facts.
- "unknown" and "not_applicable" values are skipped, so the app shows them as unknown.
- Safe to run again: it deletes the earlier demo places (slug starts with "demo-") first.
- Then it adds the team's research (scripts.import_research), so the research is not lost.
"""

import csv
import sys
from pathlib import Path

import psycopg

from app.config import get_settings
from scripts import import_research

CSV = Path(__file__).resolve().parents[2] / "data" / "demo-san-diego-locations-200.csv"
SOURCE, CONFIDENCE = "demo_data", "COMMUNITY"

# CSV category -> (category, interest_tags, subcategories, indoor, meal_slot)
CATEGORY = {
    "beach": ("beach", ["beaches", "nature"], [], False, None),
    "coastal_viewpoint": ("photo_spot", ["photography", "nature"], [], False, None),
    "hiking_nature": ("park", ["nature"], [], False, None),
    "adaptive_adventure": ("attraction", ["sports", "nature"], [], False, None),
    "zoo_aquarium": ("attraction", ["zoos_aquariums"], [], None, None),
    "museum_history": ("museum", ["museums_art", "history"], [], True, None),
    "art_science": ("museum", ["museums_art"], [], True, None),
    "park_garden": ("park", ["nature", "photography"], [], False, None),
    "theme_entertainment": ("attraction", ["theme_parks"], [], None, None),
    "sports": ("attraction", ["sports"], [], None, None),
    "shopping_market": ("shopping", ["shopping"], [], None, None),
    "nightlife_music": ("attraction", ["nightlife"], [], True, None),
    "quiet_rest_stop": ("cafe", [], ["desserts_cafes"], True, "snack"),
    "dessert_cafe": ("dessert", ["food"], ["desserts_cafes"], True, "snack"),
    "italian_restaurant": ("restaurant", ["food"], ["italian"], True, None),
    "mexican_restaurant": ("restaurant", ["food"], ["mexican"], True, None),
    "asian_restaurant": ("restaurant", ["food"], ["east_asian"], True, None),
    "indian_mediterranean": ("restaurant", ["food"], ["indian", "mediterranean"], True, None),
    "seafood_restaurant": ("restaurant", ["food"], ["seafood"], True, None),
    "vegan_vegetarian": ("restaurant", ["food"], ["vegetarian", "vegan"], True, None),
}
EXERTION = {"low": 1, "moderate": 2, "high": 4}

# CSV column -> (attribute, {csv value: (db value, detail)})
FACTS = {
    "step_free_entrance": ("entrance_step_free", {
        "yes": ("yes", "Step-free entrance."), "partial": ("partial", "Step-free entrance on some sides only.")}),
    "accessible_restroom": ("restroom_accessible", {
        "yes": ("yes", "Accessible restroom."), "partial": ("partial", "Accessible restroom with limits.")}),
    "accessible_parking": ("parking_accessible", {
        "yes": ("yes", "Accessible parking."), "partial": ("partial", "Limited accessible parking.")}),
    "terrain": ("terrain", {
        "smooth": ("smooth", "Smooth surfaces."), "mostly_smooth": ("smooth", "Mostly smooth surfaces."),
        "mixed": ("mixed", "Mixed surfaces."), "uneven": ("uneven", "Uneven surfaces.")}),
    "max_slope": ("max_slope", {
        "flat": ("flat", "Flat routes."), "gentle": ("gentle", "Gentle slopes."),
        "moderate": ("moderate", "Moderate slopes."), "steep": ("steep", "Steep sections.")}),
    "seating": ("seating", {"ample": ("plenty", "Plenty of seating."), "limited": ("some", "Limited seating.")}),
    "quiet_space": ("quiet_space", {"yes": ("yes", "Quiet space available."), "no": ("no", "No quiet space.")}),
    "audio_description": ("audio_description", {"yes": ("yes", "Audio description available.")}),
    "braille_tactile": ("braille_tactile", {"yes": ("yes", "Braille or tactile information.")}),
    "captions_asl": ("captions_asl", {"yes": ("yes", "Captions or ASL available.")}),
    "beach_wheelchair": ("beach_wheelchair", {"limited": ("yes", "Beach wheelchairs, limited number.")}),
    "service_animal_ok": ("service_animal_ok", {"yes": ("yes", "Service animals permitted.")}),
    "crowd_level": ("crowd_level", {
        "low": ("low", "Usually not crowded."), "medium": ("medium", "Medium crowds."),
        "high": ("high", "Often crowded.")}),
}  # fmt: skip


def rows() -> list[dict]:
    with CSV.open() as f:
        return list(csv.DictReader(f))


def place_row(r: dict) -> list:
    category, tags, subs, indoor, meal = CATEGORY[r["category"]]
    return [
        f"demo-{r['slug']}",
        r["name"],
        category,
        subs,
        tags,
        r["neighborhood"].strip().lower().replace(" ", "_"),
        float(r["latitude"]),
        float(r["longitude"]),
        indoor,
        max(15, min(480, int(r["estimated_visit_minutes"]))),
        EXERTION.get(r["adventure_level"], 2),
        meal,
        int(r["price_level"]) if r["price_level"] else None,
    ]


def fact_rows(r: dict) -> list[tuple[str, str, str]]:
    out = []
    for column, (attribute, values) in FACTS.items():
        value = r.get(column, "").strip()
        if value in values:
            out.append((attribute, *values[value]))
    return out


def main(dry_run: bool) -> None:
    data = rows()
    facts = sum(len(fact_rows(r)) for r in data)
    print(f"{len(data)} places, {facts} facts from {CSV.name}")
    if dry_run:
        return
    with (
        psycopg.connect(get_settings().database_url, prepare_threshold=None) as conn,
        conn.transaction(),
    ):
        deleted = conn.execute("delete from places where slug like 'demo-%'").rowcount
        for r in data:
            place_id = conn.execute(
                """insert into places (slug, name, category, subcategories, interest_tags, neighborhood,
                   lat, lng, data_tier, indoor, est_visit_min, exertion_level, meal_slot, price_level)
                   values (%s,%s,%s,%s,%s,%s,%s,%s,'C',%s,%s,%s,%s,%s) returning id""",
                place_row(r),
            ).fetchone()[0]
            for attribute, value, detail in fact_rows(r):
                conn.execute(
                    """insert into place_accessibility (place_id, attribute, value, detail, confidence, source)
                       values (%s,%s,%s,%s,%s,%s)""",
                    [place_id, attribute, value, detail, CONFIDENCE, SOURCE],
                )
        researched, official = import_research.apply(conn)
        total = conn.execute("select count(*) from places").fetchone()[0]
    print(f"deleted {deleted} old demo places; places in the database now: {total}")
    print(f"research: {researched} places updated, {official} official facts added")


if __name__ == "__main__":
    main(dry_run="--dry-run" in sys.argv)
