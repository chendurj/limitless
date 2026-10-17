# Limitless API

FastAPI backend. Python 3.12, managed with [uv](https://docs.astral.sh/uv/).

```
cd api
cp ../.env.example .env   # keep only the server block, fill values from the password group
uv sync
uv run fastapi dev app/main.py   # http://localhost:8000, docs at /docs
uv run pytest
```

## API contract

- The request and response models are in `app/models/api.py`. The traveler profile is in `app/models/dna.py`.
- `api/openapi.json` is the committed spec. A test fails if it does not match the code.
- After you change a model, run `./scripts/gen-types.sh` from the repo root. It updates `api/openapi.json` and `web/types/api.d.ts`.
- All routes except `/health` and `/api/places*` need the header `Authorization: Bearer <DEMO_BEARER_TOKEN>`.
- Routes that are not built yet return `501`.
