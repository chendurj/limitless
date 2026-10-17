"""Write the OpenAPI spec to api/openapi.json. Run from api/: uv run python -m scripts.export_openapi"""

import json
from pathlib import Path

from app.main import app

out = Path(__file__).resolve().parents[1] / "openapi.json"
out.write_text(json.dumps(app.openapi(), indent=2) + "\n")
print(f"wrote {out}")
