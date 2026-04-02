"""Compatibility wrapper to root match service implementation."""

try:
    from match import app, image, match_contacts_for_event
except ModuleNotFoundError:  # pragma: no cover - package import fallback
    from agent.match import app, image, match_contacts_for_event

__all__ = ["app", "image", "match_contacts_for_event"]
