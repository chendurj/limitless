"""Postgres access through the Supabase session pooler (DATABASE_URL in api/.env).

Every query filters by user_id. RLS blocks the public key; this server is the only client.
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
    """A Pydantic model or plain data as JSON-ready data."""
    return json.loads(model.model_dump_json()) if hasattr(model, "model_dump_json") else model
