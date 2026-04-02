"""Root launcher for the conversational runtime Modal app."""
from __future__ import annotations

try:
    from apps.runtime.app import app, fastapi_app, image
except ModuleNotFoundError:  # pragma: no cover - package import fallback
    from agent.apps.runtime.app import app, fastapi_app, image

__all__ = ["app", "image", "fastapi_app"]


if __name__ == "__main__":
    import uvicorn

    try:
        from runtime.api import build_app
    except ModuleNotFoundError:  # pragma: no cover - package import fallback
        from agent.runtime.api import build_app

    uvicorn.run(build_app(), host="127.0.0.1", port=8000)
