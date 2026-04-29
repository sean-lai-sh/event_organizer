"""Shared Modal configuration primitives for agent apps."""
from __future__ import annotations

from collections.abc import Iterable

import modal

DEFAULT_PYTHON_VERSION = "3.11"

SECRETS = {
    "runtime": "doppler-v1",
    "match": "doppler-v1",
    "outreach": "doppler-v1",
    "replies": "doppler-v1",
}


def build_image(*, extra_pip: Iterable[str] = (), add_prompts: bool = False) -> modal.Image:
    base = (
        modal.Image.debian_slim(python_version=DEFAULT_PYTHON_VERSION)
        .pip_install(
            "httpx>=0.27",
            "anthropic>=0.40",
            "claude-agent-sdk",
            "python-dotenv",
            "pydantic[email]>=2.0",
            "fastmcp>=2.0",
            "fastapi[standard]",
            "agentmail",
            *list(extra_pip),
        )
        .add_local_python_source("helper", "runtime", "apps", "core")
    )
    if add_prompts:
        return base.add_local_dir("helper/prompts", "/root/helper/prompts")
    return base


def secret(name: str) -> modal.Secret:
    return modal.Secret.from_name(SECRETS[name])
