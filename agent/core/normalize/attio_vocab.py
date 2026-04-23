"""Canonical vocabularies for Attio `speakers` workflow fields.

These values match the live Attio option titles documented in `AGENTS.md` and
`PLAN.md`. They exist so the agent does not write guessed historical labels
like `warm_intro`, `agent_outreach`, or `inbound` onto Attio.
"""
from __future__ import annotations

# Canonical live `speakers.source` option titles.
SPEAKER_SOURCE_VALUES: frozenset[str] = frozenset(
    {
        "outreach",
        "warm",
        "in bound",
        "event",
        "alumni",
    }
)

# Canonical live `speakers.status` option titles.
SPEAKER_STATUS_VALUES: frozenset[str] = frozenset(
    {
        "Prospect",
        "Engaged",
        "Confirmed",
        "Declined",
    }
)

# Historical/guessed source labels mapped to the canonical live title. These
# come from older helpers that wrote workflow state onto `people`.
_SOURCE_ALIASES: dict[str, str] = {
    "cold outreach": "outreach",
    "agent_outreach": "outreach",
    "warm intro": "warm",
    "warm_intro": "warm",
    "inbound": "in bound",
    "inbound email": "in bound",
    "event sourcing": "event",
    "alumni sourcing": "alumni",
}

# Inbound reply intent → canonical speaker status.
_STATUS_ALIASES: dict[str, str] = {
    "ACCEPTED": "Confirmed",
    "DECLINED": "Declined",
    "QUESTION": "Engaged",
    "NEEDS_HUMAN": "Engaged",
    "PROSPECT": "Prospect",
    # common lowercase / historical forms
    "accepted": "Confirmed",
    "declined": "Declined",
    "question": "Engaged",
    "engaged": "Engaged",
    "confirmed": "Confirmed",
    "prospect": "Prospect",
}


class InvalidSpeakerSource(ValueError):
    """Raised when a source value cannot be normalized to a canonical label."""


class InvalidSpeakerStatus(ValueError):
    """Raised when a status value cannot be normalized to a canonical label."""


def normalize_speaker_source(value: str) -> str:
    """Normalize a source input to its canonical live Attio option title."""
    if value is None:
        raise InvalidSpeakerSource("source is required")
    stripped = value.strip()
    if not stripped:
        raise InvalidSpeakerSource("source is required")
    if stripped in SPEAKER_SOURCE_VALUES:
        return stripped
    lowered = stripped.lower()
    if lowered in SPEAKER_SOURCE_VALUES:
        return lowered
    if lowered in _SOURCE_ALIASES:
        return _SOURCE_ALIASES[lowered]
    raise InvalidSpeakerSource(
        f"Unknown speaker source {stripped!r}; expected one of "
        f"{sorted(SPEAKER_SOURCE_VALUES)}"
    )


def normalize_speaker_status(value: str) -> str:
    """Normalize a status input to its canonical live Attio option title."""
    if value is None:
        raise InvalidSpeakerStatus("status is required")
    stripped = value.strip()
    if not stripped:
        raise InvalidSpeakerStatus("status is required")
    if stripped in SPEAKER_STATUS_VALUES:
        return stripped
    if stripped in _STATUS_ALIASES:
        return _STATUS_ALIASES[stripped]
    lowered = stripped.lower()
    if lowered in _STATUS_ALIASES:
        return _STATUS_ALIASES[lowered]
    raise InvalidSpeakerStatus(
        f"Unknown speaker status {stripped!r}; expected one of "
        f"{sorted(SPEAKER_STATUS_VALUES)}"
    )


__all__ = [
    "SPEAKER_SOURCE_VALUES",
    "SPEAKER_STATUS_VALUES",
    "InvalidSpeakerSource",
    "InvalidSpeakerStatus",
    "normalize_speaker_source",
    "normalize_speaker_status",
]
