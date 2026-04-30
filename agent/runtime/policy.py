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


READ_ONLY_TOOL_NAMES = {
    # people reads
    "search_people",
    "get_person",
    # compatibility read aliases
    "search_contacts",
    "get_contact",
    # speaker reads
    "search_speakers",
    "get_speaker",
    # convex reads
    "list_events",
    "get_event",
    "get_event_inbound_status",
    "get_event_outreach",
    "get_attendance_dashboard",
    "get_event_attendance",
    "find_oncehub_slots",
    "get_event_room_booking",
}

WRITE_TOOL_NAMES = {
    # people identity writes + notes
    "upsert_person",
    "append_person_note",
    # speaker workflow writes
    "ensure_speaker_for_person",
    "update_speaker_workflow",
    # convex event writes
    "create_event",
    "update_event_safe",
    "book_oncehub_room",
}

SEND_TOOL_NAMES = {
    "send_outreach_email",
}


def infer_tool_action_from_tool_name(tool_name: str, payload: dict | None = None) -> ToolAction:
    normalized = tool_name.strip()
    if normalized in READ_ONLY_TOOL_NAMES:
        return ToolAction(name=normalized, action_class=ActionClass.READ, payload=payload or {})
    if normalized in WRITE_TOOL_NAMES:
        return ToolAction(name=normalized, action_class=ActionClass.WRITE, payload=payload or {})
    if normalized in SEND_TOOL_NAMES:
        return ToolAction(name=normalized, action_class=ActionClass.SEND, payload=payload or {})

    return ToolAction(name=normalized or "unknown_tool", action_class=ActionClass.ANALYZE, payload=payload or {})


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
