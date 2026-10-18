"""Postgres access through the Supabase session pooler (DATABASE_URL in api/.env).

Personal-data queries filter by the verified user_id. RLS blocks direct browser data
access; only the server reads the two seeded sample trips through a public endpoint.
"""

import json
import uuid
from typing import Any, Protocol

from psycopg.rows import dict_row
from psycopg.types.json import Jsonb
from psycopg_pool import ConnectionPool

from app.config import get_settings

_pool: ConnectionPool | None = None


def pool() -> ConnectionPool:
    global _pool
    if _pool is None:
        _pool = ConnectionPool(
            get_settings().database_url,
            min_size=1,
            max_size=5,
            kwargs={"row_factory": dict_row, "prepare_threshold": None},
            open=True,
        )
    return _pool


def close_pool() -> None:
    if _pool is not None:
        _pool.close()


class ProfileStore(Protocol):
    def list_for_user(self, user_id: uuid.UUID) -> list[dict[str, Any]]: ...
    def create(self, user_id: uuid.UUID, row: dict[str, Any]) -> dict[str, Any]: ...
    def get(self, user_id: uuid.UUID, profile_id: str) -> dict[str, Any] | None: ...
    def update(
        self, user_id: uuid.UUID, profile_id: str, changes: dict[str, Any]
    ) -> dict[str, Any] | None: ...


PROFILE_COLUMNS = "id::text, user_id, raw_answers, followup_qa, dna, consent_aggregate, trip_only"
JSON_COLUMNS = {"raw_answers", "followup_qa", "dna"}


def _value(column: str, value: Any) -> Any:
    return Jsonb(value) if column in JSON_COLUMNS else value


def _valid_uuid(value: str) -> bool:
    try:
        uuid.UUID(value)
    except ValueError:
        return False
    return True


class PgProfileStore:
    def list_for_user(self, user_id: uuid.UUID) -> list[dict[str, Any]]:
        with pool().connection() as conn:
            return conn.execute(
                f"select {PROFILE_COLUMNS} from profiles where user_id = %s "
                "order by created_at desc, id desc limit 20",
                [user_id],
            ).fetchall()

    def create(self, user_id: uuid.UUID, row: dict[str, Any]) -> dict[str, Any]:
        columns = ["user_id", *row]
        params = [user_id, *(_value(c, v) for c, v in row.items())]
        placeholders = ", ".join(
            "%s::extensions.vector" if c == "dna_vector" else "%s" for c in columns
        )
        with pool().connection() as conn:
            return conn.execute(
                f"insert into profiles ({', '.join(columns)}) values ({placeholders}) "
                f"returning {PROFILE_COLUMNS}",
                params,
            ).fetchone()

    def get(self, user_id: uuid.UUID, profile_id: str) -> dict[str, Any] | None:
        if not _valid_uuid(profile_id):
            return None
        with pool().connection() as conn:
            return conn.execute(
                f"select {PROFILE_COLUMNS} from profiles where id = %s and user_id = %s",
                [profile_id, user_id],
            ).fetchone()

    def update(
        self, user_id: uuid.UUID, profile_id: str, changes: dict[str, Any]
    ) -> dict[str, Any] | None:
        if not _valid_uuid(profile_id):
            return None
        sets = ", ".join(
            f"{c} = %s::extensions.vector" if c == "dna_vector" else f"{c} = %s" for c in changes
        )
        with pool().connection() as conn:
            return conn.execute(
                f"update profiles set {sets} where id = %s and user_id = %s returning {PROFILE_COLUMNS}",
                [*(_value(c, v) for c, v in changes.items()), profile_id, user_id],
            ).fetchone()


def get_profile_store() -> ProfileStore:
    return PgProfileStore()


def dumps(model: Any) -> Any:
    """A Pydantic model, a list of models, or plain data as JSON-ready data."""
    if isinstance(model, list):
        return [dumps(m) for m in model]
    return json.loads(model.model_dump_json()) if hasattr(model, "model_dump_json") else model


# --- places and facts -----------------------------------------------------------------------

PLACE_SQL = """
select id::text, slug, name, category, subcategories, interest_tags, neighborhood, lat, lng,
       address, google_place_id, website, accessibility_url, data_tier, indoor, est_visit_min,
       exertion_level, meal_slot, research_summary, research_sources
from places where is_active
"""
FACT_SQL = """
select pa.id, pa.place_id::text, pa.attribute, pa.value, pa.detail, pa.confidence::text,
       pa.source, pa.source_url, pa.verified_at
from place_accessibility pa join places p on p.id = pa.place_id
where p.is_active
"""


class PlaceStore(Protocol):
    def load(self) -> tuple[list[Any], dict[str, list[Any]]]: ...


class PgPlaceStore:
    def load(self) -> tuple[list[Any], dict[str, list[Any]]]:
        from app.services.facts import Fact
        from app.services.rules import Place

        with pool().connection() as conn:
            place_rows = conn.execute(PLACE_SQL).fetchall()
            fact_rows = conn.execute(FACT_SQL).fetchall()
        places = [
            Place(
                id=r["id"],
                name=r["name"],
                category=r["category"],
                est_visit_min=r["est_visit_min"],
                subcategories=tuple(r["subcategories"]),
                interest_tags=tuple(r["interest_tags"]),
                indoor=r["indoor"],
                neighborhood=r["neighborhood"],
                lat=r["lat"],
                lng=r["lng"],
                exertion_level=r["exertion_level"],
                meal_slot=r["meal_slot"],
                meta={
                    k: r[k]
                    for k in (
                        "address",
                        "google_place_id",
                        "website",
                        "accessibility_url",
                        "data_tier",
                        "research_summary",
                        "research_sources",
                    )
                },
            )
            for r in place_rows
        ]
        facts: dict[str, list[Fact]] = {}
        for r in fact_rows:
            facts.setdefault(r["place_id"], []).append(
                Fact(
                    r["id"],
                    r["attribute"],
                    r["value"],
                    r["detail"],
                    r["confidence"],
                    r["source"],
                    r["source_url"],
                    r["verified_at"],
                )
            )
        return places, facts


def get_place_store() -> PlaceStore:
    return PgPlaceStore()


# --- trips ------------------------------------------------------------------------------------


class TripStore(Protocol):
    def delete(self, user_id: uuid.UUID, trip_id: str) -> bool: ...
    def list_for_user(self, user_id: uuid.UUID) -> list[dict[str, Any]]: ...
    def create(self, user_id: uuid.UUID, row: dict[str, Any], plan: dict[str, Any]) -> None: ...
    def get(
        self, user_id: uuid.UUID, trip_id: str, version: int | None = None
    ) -> dict[str, Any] | None: ...
    def save_plan(
        self, user_id: uuid.UUID, trip_id: str, version: int, plan: dict[str, Any]
    ) -> None: ...
    def add_version(
        self,
        user_id: uuid.UUID,
        trip_id: str,
        plan: dict[str, Any],
        overrides: dict[str, Any],
        reason: str,
    ) -> int: ...
    def apply(self, user_id: uuid.UUID, trip_id: str, version: int) -> bool: ...


class PgTripStore:
    def delete(self, user_id: uuid.UUID, trip_id: str) -> bool:
        if not _valid_uuid(trip_id):
            return False
        with pool().connection() as conn:
            # Versions and itinerary items cascade; other users' trips cannot match.
            return conn.execute(
                "delete from trips where id = %s and user_id = %s returning id",
                [trip_id, user_id],
            ).fetchone() is not None

    def list_for_user(self, user_id: uuid.UUID) -> list[dict[str, Any]]:
        with pool().connection() as conn:
            rows = conn.execute(
                """select v.plan from trips t join trip_versions v
                   on v.trip_id = t.id and v.version = t.current_version
                   where t.user_id = %s order by t.created_at desc, t.id desc limit 50""",
                [user_id],
            ).fetchall()
        return [row["plan"] for row in rows]

    def create(self, user_id: uuid.UUID, row: dict[str, Any], plan: dict[str, Any]) -> None:
        columns = ["user_id", *row]
        values = [user_id, *(Jsonb(v) if isinstance(v, (dict, list)) else v for v in row.values())]
        with pool().connection() as conn, conn.transaction():
            conn.execute(
                f"insert into trips ({', '.join(columns)}) values ({', '.join(['%s'] * len(columns))})",
                values,
            )
            conn.execute(
                "insert into trip_versions (trip_id, version, plan) values (%s, 1, %s)",
                [row["id"], Jsonb(plan)],
            )

    def get(
        self, user_id: uuid.UUID, trip_id: str, version: int | None = None
    ) -> dict[str, Any] | None:
        if not _valid_uuid(trip_id):
            return None
        with pool().connection() as conn:
            return conn.execute(
                """
                select t.id::text, t.profile_id::text, t.current_version, v.version, v.plan, v.status,
                       v.overrides
                from trips t join trip_versions v on v.trip_id = t.id
                where t.id = %s and t.user_id = %s and v.version = coalesce(%s, t.current_version)
                """,
                [trip_id, user_id, version],
            ).fetchone()

    def save_plan(
        self, user_id: uuid.UUID, trip_id: str, version: int, plan: dict[str, Any]
    ) -> None:
        """Replace the snapshot of an existing version (for item status changes)."""
        with pool().connection() as conn:
            conn.execute(
                """
                update trip_versions v set plan = %s
                from trips t
                where v.trip_id = t.id and t.id = %s and t.user_id = %s and v.version = %s
                """,
                [Jsonb(plan), trip_id, user_id, version],
            )

    def add_version(
        self,
        user_id: uuid.UUID,
        trip_id: str,
        plan: dict[str, Any],
        overrides: dict[str, Any],
        reason: str,
    ) -> int:
        """Save a proposed version. The current version does not change until apply()."""
        with pool().connection() as conn, conn.transaction():
            owner = conn.execute(
                "select 1 from trips where id = %s and user_id = %s for update", [trip_id, user_id]
            ).fetchone()
            if owner is None:
                raise LookupError("trip not found")
            version = conn.execute(
                "select coalesce(max(version), 0) + 1 as v from trip_versions where trip_id = %s",
                [trip_id],
            ).fetchone()["v"]
            conn.execute(
                """insert into trip_versions (trip_id, version, plan, reason, status, overrides)
                   values (%s, %s, %s, %s, 'proposed', %s)""",
                [trip_id, version, Jsonb({**plan, "version": version}), reason, Jsonb(overrides)],
            )
            return version

    def apply(self, user_id: uuid.UUID, trip_id: str, version: int) -> bool:
        """Make a version current: apply a proposal, or undo to an earlier version."""
        with pool().connection() as conn, conn.transaction():
            row = conn.execute(
                """update trips t set current_version = %s
                   where t.id = %s and t.user_id = %s
                     and exists (select 1 from trip_versions v where v.trip_id = t.id and v.version = %s)
                   returning t.id""",
                [version, trip_id, user_id, version],
            ).fetchone()
            if row:
                conn.execute(
                    "update trip_versions set status = 'applied' where trip_id = %s and version = %s",
                    [trip_id, version],
                )
            return row is not None


def get_trip_store() -> TripStore:
    return PgTripStore()


# --- feedback -------------------------------------------------------------------------------


class FeedbackStore(Protocol):
    def create(self, user_id: uuid.UUID, row: dict[str, Any]) -> str: ...


class PgFeedbackStore:
    def create(self, user_id: uuid.UUID, row: dict[str, Any]) -> str:
        columns = ["user_id", *row]
        params = [user_id, *(Jsonb(v) if isinstance(v, (dict, list)) else v for v in row.values())]
        placeholders = ", ".join(
            "%s::extensions.vector" if c == "reporter_vector" else "%s" for c in columns
        )
        with pool().connection() as conn:
            return conn.execute(
                f"insert into feedback ({', '.join(columns)}) values ({placeholders}) returning id::text",
                params,
            ).fetchone()["id"]


def get_feedback_store() -> FeedbackStore:
    return PgFeedbackStore()
