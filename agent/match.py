"""Launcher shim for the event matching Modal app."""

try:
    from apps.match.app import app, image, match_contacts_for_event
except ModuleNotFoundError:  # pragma: no cover - package import fallback
    from agent.apps.match.app import app, image, match_contacts_for_event

__all__ = ["app", "image", "match_contacts_for_event"]
