from __future__ import annotations

import modal

try:
    from core.modal.config import build_image, secret
    from runtime.api import build_app
except ModuleNotFoundError:  # pragma: no cover - package import fallback
    from agent.core.modal.config import build_image, secret
    from agent.runtime.api import build_app

app = modal.App("event-agent-runtime")

image = build_image()


@app.function(
    image=image,
    secrets=[secret("runtime")],
    timeout=600,
)
@modal.asgi_app()
def fastapi_app():
    return build_app()
