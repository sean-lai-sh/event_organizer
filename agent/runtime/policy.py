from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, ConfigDict, Field

from .contracts import RiskLevel


class ActionClass(str, Enum):
    READ = "read"
    ANALYZE = "analyze"
    FETCH = "fetch"
    WRITE = "write"
    SEND = "send"
    DESTRUCTIVE = "destructive"


class ToolAction(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    action_class: ActionClass
    payload: dict = Field(default_factory=dict)


class PolicyDecision(BaseModel):
    model_config = ConfigDict(extra="forbid")

    requires_approval: bool
    risk_level: RiskLevel
    reason: str


class ApprovalPolicy:
    """Central policy guard for tool and side-effect approvals."""

    def evaluate(self, action: ToolAction) -> PolicyDecision:
        if action.action_class == ActionClass.DESTRUCTIVE:
            return PolicyDecision(
                requires_approval=True,
                risk_level=RiskLevel.HIGH,
                reason="Destructive action requires explicit approval.",
            )
        if action.action_class in {ActionClass.WRITE, ActionClass.SEND}:
            return PolicyDecision(
                requires_approval=True,
                risk_level=RiskLevel.MEDIUM,
                reason="Write or externally visible action requires approval.",
            )
        return PolicyDecision(
            requires_approval=False,
            risk_level=RiskLevel.LOW,
            reason="Read/analyze/fetch action can execute without approval.",
        )


def infer_tool_action_from_text(text: str) -> ToolAction | None:
    """
    Lightweight heuristic to classify intended action type.

    This keeps policy decisions Modal-side while Anthropic remains a harness adapter.
    """
    lowered = text.lower().strip()
    if not lowered:
        return None

    if any(token in lowered for token in ("delete", "remove", "purge", "wipe", "destroy")):
        return ToolAction(name="destructive_change", action_class=ActionClass.DESTRUCTIVE)

    if any(token in lowered for token in ("send", "email", "message", "invite", "outreach")):
        return ToolAction(name="outbound_send", action_class=ActionClass.SEND)

    if any(token in lowered for token in ("update", "create", "set ", "assign", "write", "change")):
        return ToolAction(name="state_write", action_class=ActionClass.WRITE)

    if any(token in lowered for token in ("analyze", "summarize", "explain", "compare")):
        return ToolAction(name="analysis", action_class=ActionClass.ANALYZE)

    if any(token in lowered for token in ("find", "search", "list", "show", "fetch", "read")):
        return ToolAction(name="data_lookup", action_class=ActionClass.READ)

    return None
