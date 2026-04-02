"""Async httpx wrapper for the Attio CRM v2 API."""
from __future__ import annotations

import asyncio
import os
from typing import Any

import httpx

BASE_URL = "https://api.attio.com/v2"


def _v(record: dict, attr: str, key: str = "value") -> Any:
    """Extract the first value of an attribute from an Attio record."""
    vals = record.get("values", {}).get(attr, [])
    return vals[0].get(key) if vals else None


def flatten_record(record: dict) -> dict:
    """Convert an Attio record's nested values into a flat dict for easy access."""
    values = record.get("values", {})
    flat: dict[str, Any] = {
        "id": record.get("id", {}).get("record_id"),
        "created_at": record.get("created_at"),
    }

    # Standard fields
    name_vals = values.get("name", [])
    flat["firstname"] = name_vals[0].get("first_name", "") if name_vals else ""
    flat["lastname"] = name_vals[0].get("last_name", "") if name_vals else ""

    email_vals = values.get("email_addresses", [])
    flat["email"] = email_vals[0].get("email_address") if email_vals else None

    phone_vals = values.get("phone_numbers", [])
    flat["phone"] = phone_vals[0].get("phone_number") if phone_vals else None

    # Custom club fields
    for attr in (
        "career_profile",
        "relationship_stage",
        "contact_source",
        "warm_intro_by",
        "assigned_members",
        "contact_type",
        "outreach_status",
        "enrichment_status",
        "last_agent_action_at",
    ):
        flat[attr] = _v(record, attr)

    return flat


class AttioClient:
    def __init__(self, timeout: float = 30.0):
        self._timeout = timeout
        self._client: httpx.AsyncClient | None = None

    async def __aenter__(self) -> "AttioClient":
        token = os.environ.get("ATTIO_API_KEY") or os.environ.get("ATTIO_KEY")
        if not token:
            raise RuntimeError("ATTIO_API_KEY must be set (ATTIO_KEY is accepted as a temporary fallback)")
        self._client = httpx.AsyncClient(
            base_url=BASE_URL,
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
            timeout=self._timeout,
        )
        return self

    async def __aexit__(self, *_: Any) -> None:
        if self._client:
            await self._client.aclose()

    async def _request(self, method: str, path: str, **kwargs: Any) -> httpx.Response:
        for attempt in range(4):
            resp = await self._client.request(method, path, **kwargs)
            if resp.status_code != 429:
                resp.raise_for_status()
                return resp
            wait = 2 ** attempt
            print(f"Attio 429 rate limit — retrying in {wait}s (attempt {attempt + 1})")
            await asyncio.sleep(wait)
        resp.raise_for_status()
        return resp

    # ── People (Contacts) ────────────────────────────────────────────────────

    async def create_contact(self, values: dict[str, Any]) -> dict:
        resp = await self._request("POST", "/objects/people/records", json={"data": {"values": values}})
        return resp.json().get("data", {})

    async def get_contact(self, record_id: str) -> dict:
        resp = await self._request("GET", f"/objects/people/records/{record_id}")
        return resp.json().get("data", {})

    async def update_contact(self, record_id: str, values: dict[str, Any]) -> dict:
        resp = await self._request("PATCH", f"/objects/people/records/{record_id}", json={"data": {"values": values}})
        return resp.json().get("data", {})

    async def search_contacts(
        self, filter_: dict, limit: int = 100, offset: int = 0
    ) -> list[dict]:
        """Query people records.

        filter_ uses Attio's filter syntax, e.g.:
          Shorthand:  {"enrichment_status": "enriched"}
          Verbose:    {"$and": [{"enrichment_status": {"$eq": "enriched"}}]}
          Operators:  $eq, $in, $not_empty, $contains, $starts_with, $ends_with,
                      $lt, $lte, $gt, $gte, $and, $or, $not
        """
        payload: dict[str, Any] = {"filter": filter_, "limit": limit, "offset": offset}
        resp = await self._request("POST", "/objects/people/records/query", json=payload)
        return resp.json().get("data", [])

    # ── Notes ────────────────────────────────────────────────────────────────

    async def create_note(self, record_id: str, title: str, content: str) -> dict:
        """Create a note attached to a people record."""
        payload = {
            "data": {
                "parent_object": "people",
                "parent_record_id": record_id,
                "title": title,
                "format": "plaintext",
                "content": content,
            }
        }
        resp = await self._request("POST", "/notes", json=payload)
        return resp.json().get("data", {})

    async def list_notes(self, record_id: str) -> list[dict]:
        """List all notes attached to a people record."""
        resp = await self._request(
            "GET", "/notes",
            params={"parent_object": "people", "parent_record_id": record_id, "limit": 50},
        )
        return resp.json().get("data", [])

    async def delete_note(self, note_id: str) -> None:
        """Delete a note by its ID."""
        await self._request("DELETE", f"/notes/{note_id}")
