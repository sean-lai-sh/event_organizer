"""Canonical approval policy surface for agent actions."""
from __future__ import annotations

try:
    from runtime.policy import (  # re-export runtime policy primitives as canonical shared API
        ActionClass,
        ApprovalPolicy,
        PolicyDecision,
        ToolAction,
        infer_tool_action_from_text,
    )
except ModuleNotFoundError:  # pragma: no cover - package import fallback
    from agent.runtime.policy import (  # type: ignore
        ActionClass,
        ApprovalPolicy,
        PolicyDecision,
        ToolAction,
        infer_tool_action_from_text,
    )

__all__ = [
    "ActionClass",
    "ApprovalPolicy",
    "PolicyDecision",
    "ToolAction",
    "infer_tool_action_from_text",
]
