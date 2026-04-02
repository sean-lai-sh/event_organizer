"""Canonical normalization helpers shared across agent apps."""
from __future__ import annotations

try:
    from runtime.normalize import (
        as_sse,
        json_block,
        make_report_artifact,
        now_ms,
        plain_text_from_blocks,
        text_block,
    )
except ModuleNotFoundError:  # pragma: no cover - package import fallback
    from agent.runtime.normalize import (  # type: ignore
        as_sse,
        json_block,
        make_report_artifact,
        now_ms,
        plain_text_from_blocks,
        text_block,
    )

__all__ = [
    "as_sse",
    "json_block",
    "make_report_artifact",
    "now_ms",
    "plain_text_from_blocks",
    "text_block",
]
