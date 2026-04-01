from __future__ import annotations

import pytest

from helper.attio import AttioClient


@pytest.mark.asyncio
async def test_attio_client_prefers_attio_api_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ATTIO_API_KEY", "primary-token")
    monkeypatch.setenv("ATTIO_KEY", "legacy-token")

    async with AttioClient() as client:
        assert client._client is not None
        assert client._client.headers["Authorization"] == "Bearer primary-token"


@pytest.mark.asyncio
async def test_attio_client_falls_back_to_attio_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("ATTIO_API_KEY", raising=False)
    monkeypatch.setenv("ATTIO_KEY", "legacy-token")

    async with AttioClient() as client:
        assert client._client is not None
        assert client._client.headers["Authorization"] == "Bearer legacy-token"


@pytest.mark.asyncio
async def test_attio_client_requires_configured_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("ATTIO_API_KEY", raising=False)
    monkeypatch.delenv("ATTIO_KEY", raising=False)

    with pytest.raises(RuntimeError, match="ATTIO_API_KEY must be set"):
        async with AttioClient():
            pass
