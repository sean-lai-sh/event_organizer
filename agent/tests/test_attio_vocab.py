"""Unit tests for the canonical Attio speaker source/status vocabularies."""
from __future__ import annotations

import pytest

from core.normalize.attio_vocab import (
    SPEAKER_SOURCE_VALUES,
    SPEAKER_STATUS_VALUES,
    InvalidSpeakerSource,
    InvalidSpeakerStatus,
    normalize_speaker_source,
    normalize_speaker_status,
)


def test_canonical_source_set_matches_documented_values() -> None:
    assert SPEAKER_SOURCE_VALUES == frozenset(
        {"outreach", "warm", "in bound", "event", "alumni"}
    )


def test_canonical_status_set_matches_documented_values() -> None:
    assert SPEAKER_STATUS_VALUES == frozenset(
        {"Prospect", "Engaged", "Confirmed", "Declined"}
    )


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("outreach", "outreach"),
        ("Outreach", "outreach"),
        ("cold outreach", "outreach"),
        ("agent_outreach", "outreach"),
        ("warm_intro", "warm"),
        ("warm intro", "warm"),
        ("inbound", "in bound"),
        ("inbound email", "in bound"),
        ("in bound", "in bound"),
        ("event sourcing", "event"),
        ("alumni sourcing", "alumni"),
    ],
)
def test_normalize_source_accepts_canonical_and_aliased_inputs(raw: str, expected: str) -> None:
    assert normalize_speaker_source(raw) == expected


def test_normalize_source_rejects_invented_labels() -> None:
    with pytest.raises(InvalidSpeakerSource):
        normalize_speaker_source("magic pipeline")


def test_normalize_source_rejects_empty() -> None:
    with pytest.raises(InvalidSpeakerSource):
        normalize_speaker_source("   ")


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("Prospect", "Prospect"),
        ("Confirmed", "Confirmed"),
        ("ACCEPTED", "Confirmed"),
        ("DECLINED", "Declined"),
        ("QUESTION", "Engaged"),
        ("NEEDS_HUMAN", "Engaged"),
        ("engaged", "Engaged"),
        ("declined", "Declined"),
    ],
)
def test_normalize_status_accepts_canonical_and_mapped_inputs(raw: str, expected: str) -> None:
    assert normalize_speaker_status(raw) == expected


def test_normalize_status_rejects_invented_labels() -> None:
    with pytest.raises(InvalidSpeakerStatus):
        normalize_speaker_status("super_confirmed_plus")
