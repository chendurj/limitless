# Limitless API

FastAPI backend for traveler profiles, requirement checks, itinerary generation, and versioned trip editing. Start with the [project overview](../README.md) and [architecture guide](../docs/architecture.md).

## Local setup

Use Python 3.12+ and uv. From the repository root:

```bash
cd api
uv sync
uv run fastapi dev app/main.py
```

Before starting, create `api/.env` using the server variables in [`.env.example`](../.env.example):

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Supabase Postgres session-pooler connection string. |
| `SUPABASE_URL` | Project URL used to validate guest sessions. |
| `SUPABASE_SECRET_KEY` | Server-only key for Supabase Auth verification. |
| `OPENAI_API_KEY` | Structured profile extraction, feedback parsing, and composition. |
| `CORS_ORIGINS` | Allowed frontend origins; defaults to `http://localhost:3000`. |
| `OPENAI_MODEL_EXTRACT` / `OPENAI_MODEL_COMPOSE` | Optional model overrides. |
| `ALLOW_DEMO_AUTH` | Keep `false` for normal guest authentication. |

Use a development Supabase project with the SQL migrations in `supabase/migrations/` applied in filename order. Import/setup utilities live in `api/scripts/`; inspect each script’s help and the intended database before running it. Never run a reset against a project containing trips you want to keep.

Check [http://localhost:8000/health](http://localhost:8000/health). Interactive route documentation is at [http://localhost:8000/docs](http://localhost:8000/docs).

## Authentication and ownership

Personal endpoints require `Authorization: Bearer <supabase_access_token>`. Supabase anonymous users are authenticated guests with their own user IDs; the server verifies the token with Supabase Auth and scopes private queries to that identity.

Public reads include `/health`, `/api/places`, `/api/places/{place_id}`, and the two allowlisted `/api/trips/samples/{persona}` examples. Sample itineraries do not grant edit access. Private profile and trip responses use `Cache-Control: private, no-store`.

The old shared bearer token is available only when `ALLOW_DEMO_AUTH=true` explicitly enables it for development. The web client does not fall back to it.

## Main request paths

| Route | Responsibility |
| --- | --- |
| `POST /api/intake` | Extract a structured profile from reviewed questionnaire answers. |
| `POST /api/intake/{id}/followups` | Process the supported follow-up round. |
| `GET/PATCH /api/profiles/{id}` | Read or update an owned profile. |
| `POST /api/trips` | Score places, compose a plan, schedule it, and save version 1. |
| `GET /api/trips` | List the guest’s saved itineraries. |
| `GET/DELETE /api/trips/{id}` | Retrieve or delete an owned itinerary. |
| `PATCH /api/trips/{id}/items/{item_id}` | Save stop status, a keep flag, or a personal note. |
| `POST /api/trips/{id}/feedback` | Interpret a request and propose repaired remaining stops. |
| `POST /api/trips/{id}/replan` | Apply a saved proposal or restore an earlier version. |

A feedback proposal does not become the current itinerary until the traveler accepts it. Trip-specific adjustments do not rewrite the base profile or shared venue records.

## Shared API contract

- `app/models/api.py` defines request/response shapes.
- `app/models/dna.py` defines the structured traveler profile and derived planning limits.
- `api/openapi.json` and `web/types/api.d.ts` are generated artifacts.

After changing API models, run from the repository root:

```bash
./scripts/gen-types.sh
```

The backend contract test checks that the committed OpenAPI specification matches the running application.

## Verification

```bash
uv run pytest
```

The suite covers profile extraction contracts, access rules, evidence resolution, scheduling, grounding checks, guest isolation, manual changes, and proposal/apply/undo behavior. Tests use isolated fixtures rather than deleting real guest trips.

Deployment: [Render + Vercel instructions](../docs/deploy.md).
