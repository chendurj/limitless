"""Grounding validator: the LLM may not make an accessibility claim that the facts do not support.

For each composed item:
- fact_ids must belong to the same place.
- An access keyword with no valid citation, a banned phrase, or a number that is not in a cited
  fact replaces the rationale with a template made from the facts.
- A cited INFERRED fact needs the words "not yet verified".
"""

import re

from app.services.facts import Fact

ACCESS_WORDS = re.compile(
    r"\b(accessib\w*|wheelchair\w*|ramp\w*|step[- ]free|steps?|stairs?|elevator\w*|lift|restroom\w*|"
    r"toilet\w*|parking|slope\w*|hill\w*|flat|paved|smooth|surface\w*|seat\w*|bench\w*|shade\w*|"
    r"crowd\w*|quiet|noise|noisy|loud|caption\w*|asl|sign language|interpret\w*|audio description|"
    r"braille|tactile|service animal\w*|guide dog\w*|beach (wheel)?chair\w*|beach mat\w*|"
    r"hearing loop|assistive listening|kiosk\w*|booking|book online|text|email)\b",
    re.IGNORECASE,
)
BANNED = re.compile(
    r"fully accessible|completely accessible|100% accessible|wheelchair[- ]friendly|"
    r"accessible for everyone|easy for everyone|no barriers|barrier[- ]free|"
    r"confined to|suffers? from|despite (your|their|her|his)",
    re.IGNORECASE,
)
NUMBER = re.compile(r"\d+(?:[.,]\d+)?")
NOT_VERIFIED = "This is not yet verified, so consider calling ahead."


def template(place_name: str, facts: list[Fact], reason: str = "") -> tuple[str, list[int]]:
    """A safe rationale built only from strong fact details."""
    strong = [f for f in facts if f.is_strong and f.value not in ("no", "none")][:2]
    lead = reason or f"{place_name} fits your interests."
    if not strong:
        return lead, []
    details = " ".join(f"{f.detail.rstrip('.')}." for f in strong)
    return f"{lead} {details}", [f.id for f in strong]


def check(
    place_name: str, rationale: str, fact_ids: list[int], facts: list[Fact], reason: str = ""
) -> tuple[str, list[int]]:
    """Return a grounded (rationale, fact_ids)."""
    own = {f.id: f for f in facts}
    cited = [own[i] for i in dict.fromkeys(fact_ids) if i in own]
    ids = [f.id for f in cited]
    cited_text = " ".join(f.detail for f in cited)
    numbers_ok = all(n in cited_text for n in NUMBER.findall(rationale))
    if (
        BANNED.search(rationale)
        or (ACCESS_WORDS.search(rationale) and not cited)
        or not numbers_ok
        or not rationale.strip()
    ):
        return template(place_name, facts, reason)
    if (
        any(f.confidence == "INFERRED" for f in cited)
        and "not yet verified" not in rationale.lower()
    ):
        rationale = f"{rationale.rstrip()} {NOT_VERIFIED}"
    return rationale, ids


def clean_tip(tip: str) -> str | None:
    """Keep a tip only if it makes no access claim and has no numbers."""
    if BANNED.search(tip) or NUMBER.search(tip):
        return None
    if ACCESS_WORDS.search(tip):
        return None
    return tip.strip() or None
