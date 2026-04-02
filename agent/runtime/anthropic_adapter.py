from __future__ import annotations

import os
import sys
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import anthropic
from claude_agent_sdk import ClaudeAgentOptions, PermissionResultAllow, PermissionResultDeny, query
from claude_agent_sdk.types import AssistantMessage, ResultMessage, TextBlock, ToolResultBlock, ToolUseBlock

from .policy import ToolAction, infer_tool_action_from_tool_name


DEFAULT_SYSTEM_PROMPT = (
    "You are the Event Organizer runtime assistant. "
    "Use the connected MCP tools when they improve accuracy. "
    "Only edit or write external state when the application explicitly approves it. "
    "Respond with concise operational guidance and clear next actions."
)
DEFAULT_ANTHROPIC_MODEL = "claude-haiku-4-5-20251001"


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
    Adapter boundary around Anthropic + Claude Agent SDK usage.

    The rest of the runtime depends on this adapter only, so SDK/harness
    implementation details stay isolated to one module.
    """

    def __init__(self, *, model: str | None = None) -> None:
        self._api_key = os.environ.get("ANTHROPIC_API_KEY")
        self._model = model or os.environ.get("ANTHROPIC_MODEL", DEFAULT_ANTHROPIC_MODEL)
        self._agent_root = Path(__file__).resolve().parents[1]

    @property
    def model(self) -> str:
        return self._model

    async def run_agent(
        self,
        *,
        user_prompt: str,
        system_prompt: str | None = None,
        max_turns: int = 6,
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

        result = AgentTurnResult(model=self._model)
        traces_by_id: dict[str, ToolTrace] = {}

        async def can_use_tool(tool_name: str, tool_input: dict[str, Any], context: Any) -> Any:
            tool_use_id = getattr(context, "tool_use_id", None)
            trace = traces_by_id.get(tool_use_id or "")
            if trace is None:
                trace = ToolTrace(name=tool_name, tool_input=dict(tool_input), tool_use_id=tool_use_id)
                result.tool_traces.append(trace)
                if tool_use_id:
                    traces_by_id[tool_use_id] = trace

            action = infer_tool_action_from_tool_name(tool_name, {"tool_input": dict(tool_input)})
            if result.blocked_action is None and action.action_class.value in {"write", "send", "destructive"}:
                result.blocked_action = action
                result.blocked_reason = f"Tool `{tool_name}` is waiting for Modal approval."
                return PermissionResultDeny(
                    message=result.blocked_reason,
                    interrupt=True,
                )

            return PermissionResultAllow()

        options = ClaudeAgentOptions(
            system_prompt=system_prompt or DEFAULT_SYSTEM_PROMPT,
            mcp_servers={
                "event_organizer": {
                    "type": "stdio",
                    "command": sys.executable,
                    "args": ["-m", "apps.mcp.server"],
                    "env": dict(os.environ),
                }
            },
            permission_mode="dontAsk",
            model=self._model,
            cwd=str(self._agent_root),
            env=dict(os.environ),
            include_partial_messages=False,
            max_turns=max_turns,
            can_use_tool=can_use_tool,
            tools=[],
        )

        last_text = ""
        async for message in query(prompt=self._prompt_stream(user_prompt), options=options):
            if isinstance(message, AssistantMessage):
                text_fragments: list[str] = []
                for block in message.content:
                    if isinstance(block, TextBlock) and block.text:
                        text_fragments.append(block.text)
                    elif isinstance(block, ToolUseBlock):
                        trace = traces_by_id.get(block.id)
                        if trace is None:
                            trace = ToolTrace(
                                name=block.name,
                                tool_input=dict(block.input),
                                tool_use_id=block.id,
                            )
                            result.tool_traces.append(trace)
                            traces_by_id[block.id] = trace
                    elif isinstance(block, ToolResultBlock):
                        trace = traces_by_id.get(block.tool_use_id)
                        if trace is not None:
                            trace.result = block.content
                            trace.is_error = bool(block.is_error)

                joined = "".join(text_fragments).strip()
                if joined and joined != last_text:
                    last_text = joined
                    result.text_deltas.append(joined)
                    result.final_text = joined

            elif isinstance(message, ResultMessage):
                if message.result and not result.final_text:
                    result.final_text = message.result.strip()
                if message.is_error and result.blocked_action is None:
                    errors = ", ".join(message.errors or [])
                    detail = message.result or errors or "Claude agent run failed."
                    raise RuntimeError(detail)

        if not result.final_text and result.blocked_action:
            result.final_text = result.blocked_reason or "Tool execution paused pending approval."

        return result

    async def stream_text(
        self,
        *,
        user_prompt: str,
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
            messages=[{"role": "user", "content": user_prompt}],
        )

        text = "".join(
            block.text for block in msg.content if getattr(block, "type", None) == "text"
        ).strip()
        if not text:
            text = "I finished the run but produced no text output."

        for chunk in _chunk_text(text):
            yield chunk

    async def _prompt_stream(self, user_prompt: str) -> AsyncIterator[dict[str, Any]]:
        yield {
            "type": "user",
            "message": {
                "role": "user",
                "content": user_prompt,
            },
            "parent_tool_use_id": None,
        }


def _chunk_text(text: str, words_per_chunk: int = 12) -> list[str]:
    words = text.split()
    if not words:
        return []

    chunks: list[str] = []
    for i in range(0, len(words), words_per_chunk):
        chunk = " ".join(words[: i + words_per_chunk])
        chunks.append(chunk)
    return chunks
