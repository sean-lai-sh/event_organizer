"""
Pytest configuration for agent integration tests.

Env vars are loaded from Doppler when run via:
    doppler run -- python -m pytest tests/ -v

Falls back to a local repo .env file for editors/IDEs that run pytest directly.
"""
from pathlib import Path
import os

import pytest
from dotenv import load_dotenv

_repo_env = Path(__file__).resolve().parents[2] / ".env"
if _repo_env.is_file():
    # Doppler vars take precedence (override=False).
    load_dotenv(_repo_env, override=False)


def pytest_collection_modifyitems(config: pytest.Config, items: list[pytest.Item]) -> None:
    if os.environ.get("ATTIO_API_KEY") or os.environ.get("ATTIO_KEY"):
        return

    skip_attio = pytest.mark.skip(reason="ATTIO_API_KEY or ATTIO_KEY is required for Attio integration tests")
    for item in items:
        if "integration" in item.keywords:
            item.add_marker(skip_attio)
