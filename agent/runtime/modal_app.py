from __future__ import annotations

import modal

app = modal.App("event-agent-runtime")

image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install("httpx>=0.27", "anthropic>=0.40", "python-dotenv", "pydantic[email]>=2.0", "modal", "fastapi[standard]")
    .add_local_python_source("helper", "runtime")
)


@app.function(
    image=image,
    secrets=[modal.Secret.from_name("event-outreach-secrets")],
    timeout=600,
)
@modal.asgi_app()
def fastapi_app():
    from runtime.api import build_app

    return build_app()


if __name__ == "__main__":
    import uvicorn

    from runtime.api import build_app

    uvicorn.run(build_app(), host="127.0.0.1", port=8000)
