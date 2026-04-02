"""Launcher shim for inbound reply webhook Modal app."""

try:
    from apps.replies.app import app, handle_reply, image
except ModuleNotFoundError:  # pragma: no cover - package import fallback
    from agent.apps.replies.app import app, handle_reply, image

__all__ = ["app", "image", "handle_reply"]
