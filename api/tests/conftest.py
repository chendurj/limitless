import json
from pathlib import Path

import pytest

from app.models.dna import AccessibilityDNA

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
