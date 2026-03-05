"""Async httpx wrapper for the HubSpot CRM v3 API."""
from __future__ import annotations

import json
import os
from typing import Any

import httpx

BASE_URL = "https://api.hubapi.com"


class HubSpotClient:
    def __init__(self, timeout: float = 30.0):
        self._timeout = timeout
        self._client: httpx.AsyncClient | None = None

    async def __aenter__(self) -> HubSpotClient:
        pat = os.environ.get("HUBSPOT_PAT")
        if not pat:
            raise RuntimeError("HUBSPOT_PAT must be set")
        self._client = httpx.AsyncClient(
            base_url=BASE_URL,
            headers={"Authorization": f"Bearer {pat}", "Content-Type": "application/json"},
            timeout=self._timeout,
        )
        return self

    async def __aexit__(self, *_: Any) -> None:
        if self._client:
            await self._client.aclose()

    # ── Properties ──────────────────────────────────────────────────────────

    async def list_properties(self, object_type: str = "contacts") -> list[dict]:
        resp = await self._client.get(
            f"/crm/v3/properties/{object_type}",
            params={"dataSensitivity": "non_sensitive"},
        )
        resp.raise_for_status()
        return resp.json()["results"]

    async def create_property_group(
        self, object_type: str, name: str, label: str
    ) -> dict:
        resp = await self._client.post(
            f"/crm/v3/properties/{object_type}/groups",
            content=json.dumps({"name": name, "label": label}),
        )
        if resp.status_code == 409:
            return {"name": name, "label": label, "already_exists": True}
        resp.raise_for_status()
        return resp.json()

    async def create_property(self, object_type: str, payload: dict) -> dict:
        resp = await self._client.post(
            f"/crm/v3/properties/{object_type}",
            content=json.dumps(payload),
        )
        if resp.status_code == 409:
            return {**payload, "already_exists": True}
        resp.raise_for_status()
        return resp.json()

    async def delete_property(self, object_type: str, name: str) -> None:
        resp = await self._client.delete(
            f"/crm/v3/properties/{object_type}/{name}"
        )
        if resp.status_code == 404:
            return
        resp.raise_for_status()

    # ── Contacts ─────────────────────────────────────────────────────────────

    async def create_contact(self, properties: dict[str, Any]) -> dict:
        resp = await self._client.post(
            "/crm/v3/objects/contacts",
            content=json.dumps({"properties": properties}),
        )
        resp.raise_for_status()
        return resp.json()

    async def get_contact(self, contact_id: str, properties: list[str] | None = None) -> dict:
        params: dict[str, Any] = {}
        if properties:
            params["properties"] = ",".join(properties)
        resp = await self._client.get(
            f"/crm/v3/objects/contacts/{contact_id}", params=params
        )
        resp.raise_for_status()
        return resp.json()

    async def update_contact(self, contact_id: str, properties: dict[str, Any]) -> dict:
        resp = await self._client.patch(
            f"/crm/v3/objects/contacts/{contact_id}",
            content=json.dumps({"properties": properties}),
        )
        resp.raise_for_status()
        return resp.json()

    async def search_contacts(
        self, filters: list[dict], properties: list[str] | None = None, limit: int = 100
    ) -> list[dict]:
        payload: dict[str, Any] = {
            "filterGroups": [{"filters": filters}],
            "limit": limit,
        }
        if properties:
            payload["properties"] = properties
        resp = await self._client.post(
            "/crm/v3/objects/contacts/search",
            content=json.dumps(payload),
        )
        resp.raise_for_status()
        return resp.json().get("results", [])
