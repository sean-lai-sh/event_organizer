"""Compatibility wrapper for Attio client; canonical location is core.clients.attio."""
try:
    from core.clients.attio import AttioClient, flatten_record
except ModuleNotFoundError:  # pragma: no cover - package import fallback
    from agent.core.clients.attio import AttioClient, flatten_record

__all__ = ["AttioClient", "flatten_record"]
