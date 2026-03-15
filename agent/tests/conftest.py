"""
Pytest configuration for agent integration tests.

Env vars are loaded from Doppler when run via:
    doppler run -- python -m pytest tests/ -v

Falls back to a local .env file for editors/IDEs that run pytest directly.
"""
from pathlib import Path

from dotenv import load_dotenv

# No-op if the file doesn't exist; Doppler vars take precedence (override=False)
load_dotenv(Path(__file__).parents[2] / "backend" / ".env", override=False)
