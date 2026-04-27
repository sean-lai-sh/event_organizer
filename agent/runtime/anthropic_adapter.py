from __future__ import annotations

import json
import os
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from typing import Any

import anthropic

from .policy import ToolAction, infer_tool_action_from_tool_name
from .tool_executor import execute_tool_call


DEFAULT_SYSTEM_PROMPT = (
    "You are the Event Organizer runtime assistant. "
    "You have live access to Convex event and attendance data and Attio people/speaker data via in-process tools. "
    "Use the available tools whenever the user asks for current or specific business data. "
    "For latest or recent event attendance questions, first call `list_events`, then call "
    "`get_event_attendance` for the newest relevant event. "
    "`get_attendance_dashboard` is aggregate dashboard data, while `get_event_attendance` is "
    "actual attendance for one event. "
    "Attio `people` is identity-only. Use `search_people`, `get_person`, `upsert_person`, and "
    "`append_person_note` for identity and notes. "
    "Attio `speakers` is the workflow layer. Use `search_speakers`, `get_speaker`, "
    "`ensure_speaker_for_person`, and `update_speaker_workflow` for status, source, assignment, "
    "and active event state. Never write workflow fields through the people tools. "
    "`status` and `source` must use the canonical live Attio option titles "
    "(source: outreach, warm, in bound, event, alumni; status: Prospect, Engaged, Confirmed, Declined). "
    "Prefer deriving IDs through tool lookups instead of asking the user for them when possible. "
    "If a tool fails, mention the tool name and the concrete failure. "
    "Do not invent permission issues, authentication issues, environment restrictions, "
    "or unrelated APIs unless a tool actually failed with that error. "
    "Only edit or write external state when the application explicitly approves it. "
    "Respond with concise operational guidance and clear next actions. "
    "When a user asks to create an event, call create_event immediately using whatever details "
    "the user has provided. Only ask the user for event name or date if those two required fields "
    "are genuinely missing from their request — do not ask for or wait on optional fields. "
    "If no location is specified, default to '16 Washington Place'. "
    "Do not use internal field names (event_date, needs_outreach, event_time, etc.) when talking "
    "to the user — use natural language equivalents instead. "
    "When updating an event, confirm which fields will change before calling update_event_safe."
)
DEFAULT_ANTHROPIC_MODEL = "claude-haiku-4-5-20251001"

# Anthropic tool definitions for all in-process tools
_IN_PROCESS_TOOLS: list[dict[str, Any]] = [
    {
        "name": "search_people",
        "description": (
            "Search Attio people by identity fields such as email or free-text name query. "
            "Use `search_speakers` for workflow-scoped filters like status or source."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "email": {"type": "string", "description": "Exact email match"},
                "query": {"type": "string", "description": "Free-text name query"},
                "limit": {"type": "integer", "description": "Max results to return (default 20)"},
            },
        },
    },
    {
        "name": "get_person",
        "description": "Fetch one Attio person by record ID when the specific person is already known.",
        "input_schema": {
            "type": "object",
            "properties": {
                "record_id": {"type": "string", "description": "Attio people record ID"},
            },
            "required": ["record_id"],
        },
    },
    {
        "name": "upsert_person",
        "description": (
            "Upsert an Attio person using identity/profile fields only. "
            "Workflow state (status, source, assignment) must be written through "
            "`update_speaker_workflow`, not here."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "firstname": {"type": "string"},
                "lastname": {"type": "string"},
                "email": {"type": "string"},
                "phone": {"type": "string"},
                "company": {"type": "string"},
                "job_title": {"type": "string"},
                "description": {"type": "string"},
            },
            "required": ["firstname", "lastname", "email"],
        },
    },
    {
        "name": "append_person_note",
        "description": "Append an audit-history note to an Attio person record.",
        "input_schema": {
            "type": "object",
            "properties": {
                "record_id": {"type": "string"},
                "note": {"type": "string"},
                "title": {"type": "string"},
            },
            "required": ["record_id", "note"],
        },
    },
    {
        "name": "search_contacts",
        "description": (
            "Compatibility alias for `search_people`; identity-only. "
            "Prefer `search_people` or `search_speakers` in new prompts."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "email": {"type": "string"},
                "query": {"type": "string"},
                "limit": {"type": "integer"},
            },
        },
    },
    {
        "name": "get_contact",
        "description": "Compatibility alias for `get_person`; identity-only read.",
        "input_schema": {
            "type": "object",
            "properties": {
                "record_id": {"type": "string"},
            },
            "required": ["record_id"],
        },
    },
    {
        "name": "search_speakers",
        "description": (
            "Search Attio speaker workflow entries by status, source, or active event id. "
            "`status` and `source` are normalized to canonical live Attio option titles."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "status": {"type": "string", "description": "Prospect|Engaged|Confirmed|Declined"},
                "source": {"type": "string", "description": "outreach|warm|in bound|event|alumni"},
                "active_event_id": {"type": "string"},
                "limit": {"type": "integer"},
            },
        },
    },
    {
        "name": "get_speaker",
        "description": "Fetch one Attio speaker workflow entry by its list entry id.",
        "input_schema": {
            "type": "object",
            "properties": {
                "speaker_entry_id": {"type": "string"},
            },
            "required": ["speaker_entry_id"],
        },
    },
    {
        "name": "ensure_speaker_for_person",
        "description": (
            "Return the single MVP speaker entry for a person, creating it if needed. "
            "Requires the Attio people record id; `source`, when provided, must use the "
            "canonical live option title."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "person_record_id": {"type": "string"},
                "source": {"type": "string"},
            },
            "required": ["person_record_id"],
        },
    },
    {
        "name": "update_speaker_workflow",
        "description": (
            "Update workflow fields on an Attio speakers list entry (status, source, "
            "active_event_id, assigned, managed_poc, previous_events, speaker_info, "
            "work_history). Use canonical live Attio option titles for `status` and `source`."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "speaker_entry_id": {"type": "string"},
                "status": {"type": "string"},
                "source": {"type": "string"},
                "active_event_id": {"type": "string"},
                "assigned": {"type": "string"},
                "managed_poc": {"type": "string"},
                "previous_events": {"type": "string"},
                "speaker_info": {"type": "string"},
                "work_history": {"type": "string"},
            },
            "required": ["speaker_entry_id"],
        },
    },
    {
        "name": "list_events",
        "description": "List Convex events, typically to find the newest relevant event before a follow-up read.",
        "input_schema": {
            "type": "object",
            "properties": {
                "status": {"type": "string", "description": "Filter by event status"},
                "limit": {"type": "integer", "description": "Max results to return (default 50)"},
            },
        },
    },
    {
        "name": "get_event",
        "description": "Fetch one Convex event when you already know the event ID.",
        "input_schema": {
            "type": "object",
            "properties": {
                "event_id": {"type": "string"},
            },
            "required": ["event_id"],
        },
    },
    {
        "name": "get_event_inbound_status",
        "description": "Return inbound reply status summaries for one event or all tracked events.",
        "input_schema": {
            "type": "object",
            "properties": {
                "event_id": {"type": "string", "description": "Event ID, or omit for all events"},
            },
        },
    },
    {
        "name": "get_event_outreach",
        "description": "Return per-event outreach rows and responses for a specific Convex event.",
        "input_schema": {
            "type": "object",
            "properties": {
                "event_id": {"type": "string"},
                "approved": {"type": "boolean"},
            },
            "required": ["event_id"],
        },
    },
    {
        "name": "get_attendance_dashboard",
        "description": "Return aggregate attendance dashboard totals and trends across events.",
        "input_schema": {
            "type": "object",
            "properties": {},
        },
    },
    {
        "name": "get_event_attendance",
        "description": "Return actual attendance details for one specific event, not aggregate dashboard stats.",
        "input_schema": {
            "type": "object",
            "properties": {
                "event_id": {"type": "string"},
            },
            "required": ["event_id"],
        },
    },
    {
        "name": "create_event",
        "description": "Create a new event. Call immediately with whatever details the user provided; only title and event_date are required.",
        "input_schema": {
            "type": "object",
            "properties": {
                "title":          {"type": "string", "description": "Event name"},
                "event_date":     {"type": "string", "description": "Date in YYYY-MM-DD format"},
                "status":         {"type": "string", "description": "draft|matching|outreach|completed"},
                "description":    {"type": "string"},
                "event_time":     {"type": "string", "description": "Start time in HH:MM format"},
                "event_end_time": {"type": "string", "description": "End time in HH:MM format"},
                "location":       {"type": "string"},
                "event_type":     {"type": "string", "description": "speaker_panel|workshop|networking|social"},
                "target_profile": {"type": "string", "description": "Intended audience profile"},
                "needs_outreach": {"type": "boolean"},
            },
            "required": ["title", "event_date"],
        },
    },
    {
        "name": "update_event_safe",
        "description": "Safely patch approved event fields and milestone booleans for a Convex event.",
        "input_schema": {
            "type": "object",
            "properties": {
                "event_id":       {"type": "string"},
                "title":          {"type": "string"},
                "description":    {"type": "string"},
                "event_date":     {"type": "string"},
                "event_time":     {"type": "string"},
                "event_end_time": {"type": "string"},
                "location":       {"type": "string"},
                "status":         {"type": "string"},
                "event_type":     {"type": "string"},
                "target_profile": {"type": "string"},
                "speaker_confirmed": {"type": "boolean"},
                "room_confirmed":    {"type": "boolean"},
            },
            "required": ["event_id"],
        },
    },
    {
        "name": "find_oncehub_slots",
        "description": (
            "Return live Leslie eLab Lean/Launchpad room availability for a date range. "
            "Always live — no caching. Read-only, no approval required."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "start_date":            {"type": "string", "description": "YYYY-MM-DD (inclusive)"},
                "end_date":              {"type": "string", "description": "YYYY-MM-DD (inclusive)"},
                "duration_minutes":      {"type": "integer", "description": "Slot length in minutes"},
                "preferred_time_window": {
                    "type": "string",
                    "description": "Optional filter: 'morning', 'afternoon', 'evening', or 'HH:MM-HH:MM'",
                },
            },
            "required": ["start_date", "end_date", "duration_minutes"],
        },
    },
    {
        "name": "book_oncehub_room",
        "description": (
            "Book the Leslie eLab Lean/Launchpad room for a specific slot. "
            "Approval-gated. On approval, submits to OnceHub under the shared club "
            "booking profile and persists the receipt to Convex event_room_bookings. "
            "If event_id is provided, the event's room_confirmed flag is stickied true; "
            "if event_id is omitted, a new Convex event is created from the booking."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "slot_start_epoch_ms": {"type": "integer", "description": "Slot start in epoch ms (from find_oncehub_slots)"},
                "duration_minutes":    {"type": "integer"},
                "title":               {"type": "string", "description": "Event/booking title"},
                "num_attendees":       {"type": "integer"},
                "event_id":            {"type": "string", "description": "Optional: existing Convex event id"},
                "description":         {"type": "string"},
                "event_type":          {"type": "string"},
                "target_profile":      {"type": "string"},
            },
            "required": ["slot_start_epoch_ms", "duration_minutes", "title", "num_attendees"],
        },
    },
    {
        "name": "get_event_room_booking",
        "description": "Return the latest OnceHub booking record for a Convex event, or null.",
        "input_schema": {
            "type": "object",
            "properties": {
                "event_id": {"type": "string"},
            },
            "required": ["event_id"],
        },
    },
]


@dataclass(slots=True)
class ToolTrace:
    name: str
    tool_input: dict[str, Any]
    tool_use_id: str | None = None
    result: Any = None
    is_error: bool = False


@dataclass(slots=True)
class AgentTurnResult:
    text_deltas: list[str] = field(default_factory=list)
    final_text: str = ""
    tool_traces: list[ToolTrace] = field(default_factory=list)
    blocked_action: ToolAction | None = None
    blocked_reason: str | None = None
    model: str | None = None


class AnthropicRuntimeAdapter:
    """
    Adapter boundary around Anthropic API usage.

    Runs an in-process tool loop: read tools execute directly, write/send/destructive
    tools pause for approval. No subprocess or MCP transport required.
    """

    def __init__(self, *, model: str | None = None) -> None:
        self._api_key = os.environ.get("ANTHROPIC_API_KEY")
        self._model = model or os.environ.get("ANTHROPIC_MODEL", DEFAULT_ANTHROPIC_MODEL)

    @property
    def model(self) -> str:
        return self._model

    async def run_agent(
        self,
        *,
        messages: list[dict[str, Any]],
        system_prompt: str | None = None,
        max_turns: int = 8,
    ) -> AgentTurnResult:
        if not self._api_key:
            fallback = (
                "Anthropic API key is not configured. "
                "This run used the local fallback adapter response."
            )
            return AgentTurnResult(
                text_deltas=_chunk_text(fallback),
                final_text=fallback,
                model=self._model,
            )

        client = anthropic.AsyncAnthropic(api_key=self._api_key)
        result = AgentTurnResult(model=self._model)
        messages = list(messages)

        for _ in range(max_turns):
            response = await client.messages.create(
                model=self._model,
                max_tokens=1024,
                system=system_prompt or DEFAULT_SYSTEM_PROMPT,
                tools=_IN_PROCESS_TOOLS,  # type: ignore[arg-type]
                messages=messages,
            )

            # Collect text and tool_use blocks from this turn
            tool_use_blocks: list[Any] = []
            for block in response.content:
                if block.type == "text" and block.text:
                    joined = block.text.strip()
                    if joined:
                        result.text_deltas.append(joined)
                        result.final_text = joined
                elif block.type == "tool_use":
                    tool_use_blocks.append(block)

            if not tool_use_blocks or response.stop_reason == "end_turn":
                break

            # Process tool calls
            tool_result_content: list[dict[str, Any]] = []
            for block in tool_use_blocks:
                tool_name: str = block.name
                tool_input: dict[str, Any] = dict(block.input)
                tool_use_id: str = block.id

                trace = ToolTrace(name=tool_name, tool_input=tool_input, tool_use_id=tool_use_id)
                result.tool_traces.append(trace)

                action = infer_tool_action_from_tool_name(tool_name, {"tool_input": tool_input})
                if result.blocked_action is None and action.action_class.value in {"write", "send", "destructive"}:
                    result.blocked_action = action
                    result.blocked_reason = f"Tool `{tool_name}` is waiting for Modal approval."
                    # Append the assistant turn before returning so conversation is intact
                    messages.append({"role": "assistant", "content": response.content})
                    return result

                # Execute read tool in-process
                try:
                    tool_result = await execute_tool_call(tool_name, tool_input)
                    trace.result = tool_result
                    tool_result_content.append(
                        {
                            "type": "tool_result",
                            "tool_use_id": tool_use_id,
                            "content": json.dumps(tool_result, default=str),
                        }
                    )
                except Exception as exc:
                    trace.result = str(exc)
                    trace.is_error = True
                    tool_result_content.append(
                        {
                            "type": "tool_result",
                            "tool_use_id": tool_use_id,
                            "is_error": True,
                            "content": str(exc),
                        }
                    )

            # Add assistant turn + tool results, then loop
            messages.append({"role": "assistant", "content": response.content})
            messages.append({"role": "user", "content": tool_result_content})

            if response.stop_reason == "end_turn":
                break

        if not result.final_text and result.blocked_action:
            result.final_text = result.blocked_reason or "Tool execution paused pending approval."

        return result

    async def stream_text(
        self,
        *,
        messages: list[dict[str, Any]],
        system_prompt: str | None = None,
        max_tokens: int = 900,
    ) -> AsyncIterator[str]:
        if not self._api_key:
            fallback = (
                "Anthropic API key is not configured. "
                "This run used the local fallback adapter response."
            )
            for chunk in _chunk_text(fallback):
                yield chunk
            return

        client = anthropic.AsyncAnthropic(api_key=self._api_key)
        msg = await client.messages.create(
            model=self._model,
            max_tokens=max_tokens,
            system=system_prompt or DEFAULT_SYSTEM_PROMPT,
            messages=messages,
        )

        text = "".join(
            block.text for block in msg.content if getattr(block, "type", None) == "text"
        ).strip()
        if not text:
            text = "I finished the run but produced no text output."

        for chunk in _chunk_text(text):
            yield chunk


def _chunk_text(text: str, words_per_chunk: int = 12) -> list[str]:
    words = text.split()
    if not words:
        return []

    chunks: list[str] = []
    for i in range(0, len(words), words_per_chunk):
        chunk = " ".join(words[: i + words_per_chunk])
        chunks.append(chunk)
    return chunks
