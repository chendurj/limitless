# Limitless API

FastAPI backend. Python 3.12, managed with [uv](https://docs.astral.sh/uv/).

```
cd api
cp ../.env.example .env   # keep only the server block, fill values from the password group
uv sync
uv run fastapi dev app/main.py   # http://localhost:8000, docs at /docs
uv run pytest
```
