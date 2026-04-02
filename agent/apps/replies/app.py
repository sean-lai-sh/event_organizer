"""Compatibility wrapper to root reply handler service implementation."""

try:
    from reply_handler import app, handle_reply, image
except ModuleNotFoundError:  # pragma: no cover - package import fallback
    from agent.reply_handler import app, handle_reply, image

__all__ = ["app", "image", "handle_reply"]
