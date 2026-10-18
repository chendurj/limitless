import json
from pathlib import Path

import pytest

from app.config import get_settings
from app.models.dna import AccessibilityDNA


@pytest.fixture(autouse=True)
def legacy_demo_auth_for_existing_tests(monkeypatch):
    # Legacy fixtures explicitly opt in; the application default is guest-only.
    monkeypatch.setattr(get_settings(), "allow_demo_auth", True)

FIXTURE = Path(__file__).parent / "fixtures" / "dna_maya.json"


def load(**changes) -> dict:
    """The example profile (Maya, manual wheelchair) with changes, e.g. party__size=2."""
    data = json.loads(FIXTURE.read_text())
    for path, value in changes.items():
        *parents, leaf = path.split("__")
        node = data
        for key in parents:
            node = node[key]
        node[leaf] = value
    return data


@pytest.fixture
def make_dna():
    return lambda **changes: AccessibilityDNA.model_validate(load(**changes))
