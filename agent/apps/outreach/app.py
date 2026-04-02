"""Compatibility wrapper to root outreach service implementation."""

try:
    from outreach import app, image, send_outreach_for_event
except ModuleNotFoundError:  # pragma: no cover - package import fallback
    from agent.outreach import app, image, send_outreach_for_event

__all__ = ["app", "image", "send_outreach_for_event"]
