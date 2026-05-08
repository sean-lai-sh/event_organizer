"""Per-run context exposed to in-process tool handlers.

The Anthropic tool loop in ``run_agent`` does not know which thread / run
it belongs to — that belongs to the runtime service. Tools that need to
write thread-scoped state (e.g. the email-draft handler) read this
context to find the active ``thread_external_id`` and ``run_external_id``
without changing every tool signature.

Set via :func:`use_run_context` on the runtime service before invoking
``run_agent``; the contextvar is async-safe (each task copies the
context, propagation across ``await`` is automatic).
"""
from __future__ import annotations

from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass
from typing import Any, Iterator


@dataclass(frozen=True)
class RunContext:
    thread_external_id: str
    run_external_id: str
    sync: Any  # ConvexAgentStateSync — typed as Any to avoid import cycle


_current: ContextVar[RunContext | None] = ContextVar(
    "agent_run_context", default=None
)


def get_run_context() -> RunContext | None:
    return _current.get()


@contextmanager
def use_run_context(
    *, thread_external_id: str, run_external_id: str, sync: Any
) -> Iterator[RunContext]:
    ctx = RunContext(
        thread_external_id=thread_external_id,
        run_external_id=run_external_id,
        sync=sync,
    )
    token = _current.set(ctx)
    try:
        yield ctx
    finally:
        _current.reset(token)
