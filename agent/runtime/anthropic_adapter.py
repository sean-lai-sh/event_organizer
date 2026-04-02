from __future__ import annotations

import os
from collections.abc import AsyncIterator

import anthropic


DEFAULT_SYSTEM_PROMPT = (
    "You are the Event Organizer runtime assistant. "
    "Respond with concise operational guidance and clear next actions."
)
DEFAULT_ANTHROPIC_MODEL = "claude-haiku-4-5-20251001"


class AnthropicRuntimeAdapter:
    """
    Local adapter boundary around Anthropic usage.

    The rest of the application depends on this adapter only, so SDK/harness
    implementation details stay isolated to one module.
    """

    def __init__(self, *, model: str | None = None) -> None:
        self._api_key = os.environ.get("ANTHROPIC_API_KEY")
        self._model = model or os.environ.get("ANTHROPIC_MODEL", DEFAULT_ANTHROPIC_MODEL)

    @property
    def model(self) -> str:
        return self._model

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


def _chunk_text(text: str, words_per_chunk: int = 12) -> list[str]:
    words = text.split()
    if not words:
        return []

    chunks: list[str] = []
    for i in range(0, len(words), words_per_chunk):
        chunk = " ".join(words[: i + words_per_chunk])
        chunks.append(chunk)
    return chunks
