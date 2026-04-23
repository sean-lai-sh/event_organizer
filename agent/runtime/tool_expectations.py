from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable


@dataclass(frozen=True, slots=True)
class RequestToolExpectation:
    kind: str
    relevant_tools: tuple[str, ...]
    retry_instruction: str
    no_data_message: str | None = None


_FAKE_LIMITATION_MARKERS = (
    "can't access",
    "cannot access",
    "unable to access",
    "unable to retrieve",
    "access issues",
    "restricted",
    "authentication required",
    "isn't configured",
    "not configured",
    "don't have access",
    "do not have access",
    "permission",
    "remotetrigger",
)


def infer_request_tool_expectation(text: str) -> RequestToolExpectation | None:
    lowered = text.lower()

    if _mentions_any(lowered, ("attendance", "attendees", "checked in", "check-ins")):
        if _mentions_any(lowered, ("latest", "recent", "most recent", "newest")) and "event" in lowered:
            return RequestToolExpectation(
                kind="latest_event_attendance",
                relevant_tools=("list_events", "get_event_attendance"),
                retry_instruction=(
                    "This request requires MCP tool use. Use `list_events` to identify the newest "
                    "relevant event, then call `get_event_attendance` for that event before answering. "
                    "Do not ask for an event ID unless discovery fails."
                ),
                no_data_message=(
                    "I couldn't find any events in Convex, so there isn't a latest event attendance "
                    "record to report yet."
                ),
            )
        if _mentions_any(lowered, ("dashboard", "overall", "summary", "totals")):
            return RequestToolExpectation(
                kind="attendance_dashboard",
                relevant_tools=("get_attendance_dashboard",),
                retry_instruction=(
                    "This request is about aggregate attendance data. Use `get_attendance_dashboard` "
                    "before answering, and do not claim access limitations unless that tool fails."
                ),
            )
        return RequestToolExpectation(
            kind="event_attendance",
            relevant_tools=("get_event_attendance", "list_events"),
            retry_instruction=(
                "This request needs event attendance data. Use `get_event_attendance` if the event "
                "is clear, or `list_events` first if you need to derive the event ID."
            ),
        )

    if "event" in lowered and _mentions_any(lowered, ("stats", "status", "recent", "latest", "newest")):
        return RequestToolExpectation(
            kind="latest_event_stats",
            relevant_tools=("list_events", "get_event"),
            retry_instruction=(
                "This request needs current event data. Use `list_events` to identify the relevant "
                "event and `get_event` for details before answering."
            ),
            no_data_message="I couldn't find any events in Convex to report on.",
        )

    if "outreach" in lowered or "inbound" in lowered:
        return RequestToolExpectation(
            kind="event_outreach",
            relevant_tools=("get_event_outreach", "get_event_inbound_status", "list_events"),
            retry_instruction=(
                "This request is about outreach or inbound state. Use `get_event_outreach` or "
                "`get_event_inbound_status`, deriving the event ID with `list_events` if needed."
            ),
        )

    if "speaker" in lowered and _mentions_any(
        lowered, ("status", "pipeline", "workflow", "assigned", "source", "confirmed", "declined")
    ):
        return RequestToolExpectation(
            kind="speaker_lookup",
            relevant_tools=("search_speakers", "get_speaker"),
            retry_instruction=(
                "This request is about speaker workflow state. Use `search_speakers` or "
                "`get_speaker` before answering, and do not read workflow fields off `people`."
            ),
        )

    if _mentions_any(lowered, ("contact", "speaker", "person")) and _mentions_any(
        lowered, ("find", "lookup", "search", "show", "who is")
    ):
        return RequestToolExpectation(
            kind="person_lookup",
            relevant_tools=(
                "search_people",
                "get_person",
                "search_contacts",
                "get_contact",
            ),
            retry_instruction=(
                "This request is about person identity lookup. Use `search_people` or "
                "`get_person` before answering (the legacy `search_contacts`/`get_contact` "
                "aliases are accepted but not preferred)."
            ),
        )

    return None


def looks_like_fake_limitation(text: str) -> bool:
    lowered = text.lower()
    return any(marker in lowered for marker in _FAKE_LIMITATION_MARKERS)


def attempted_relevant_tools(tool_names: Iterable[str], expectation: RequestToolExpectation | None) -> bool:
    if expectation is None:
        return False
    relevant = set(expectation.relevant_tools)
    return any(name in relevant for name in tool_names)


def _mentions_any(text: str, tokens: tuple[str, ...]) -> bool:
    return any(token in text for token in tokens)
