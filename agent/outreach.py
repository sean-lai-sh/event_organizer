"""Launcher shim for the outreach send Modal app."""

try:
    from apps.outreach.app import app, image, send_outreach_for_event
except ModuleNotFoundError:  # pragma: no cover - package import fallback
    from agent.apps.outreach.app import app, image, send_outreach_for_event

__all__ = ["app", "image", "send_outreach_for_event"]
