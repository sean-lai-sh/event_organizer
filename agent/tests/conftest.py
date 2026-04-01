"""
Pytest configuration for agent integration tests.

Env vars are loaded from Doppler when run via:
    doppler run -- python -m pytest tests/ -v

Falls back to a local repo .env file for editors/IDEs that run pytest directly.
"""
from pathlib import Path

from dotenv import load_dotenv

_repo_env = Path(__file__).resolve().parents[2] / ".env"
if _repo_env.is_file():
    # Doppler vars take precedence (override=False).
    load_dotenv(_repo_env, override=False)
