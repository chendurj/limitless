#!/usr/bin/env bash
# Make the TypeScript API types for the web app from the server's OpenAPI spec.
# Run from the repo root after any change to api/app/models/api.py or dna.py:
#   ./scripts/gen-types.sh
set -euo pipefail
cd "$(dirname "$0")/.."
(cd api && uv run python -m scripts.export_openapi)
mkdir -p web/types
npx --yes openapi-typescript@7 api/openapi.json -o web/types/api.d.ts
echo "Wrote web/types/api.d.ts. Do not edit it by hand."
