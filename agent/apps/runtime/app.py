"""Compatibility wrapper to root runtime service implementation."""

try:
    from runtime_app import app, fastapi_app, image
except ModuleNotFoundError:  # pragma: no cover - package import fallback
    from agent.runtime_app import app, fastapi_app, image

__all__ = ["app", "image", "fastapi_app"]
