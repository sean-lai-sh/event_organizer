"""Shared Convex API client for agent runtime and workflow handlers."""
from __future__ import annotations

import os
from typing import Any

import httpx


class ConvexClient:
    """Async HTTP client for the Convex deployment."""

    def __init__(self) -> None:
        self._url = os.environ["CONVEX_URL"].rstrip("/")
        self._key = os.environ["CONVEX_DEPLOY_KEY"]
        self._http: httpx.AsyncClient | None = None

    async def __aenter__(self) -> "ConvexClient":
        self._http = httpx.AsyncClient(
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Convex {self._key}",
            },
            timeout=30.0,
        )
        return self

    async def __aexit__(self, *_: Any) -> None:
        if self._http:
            await self._http.aclose()

    def _strip_nones(self, value: Any) -> Any:
        if isinstance(value, dict):
            return {
                key: self._strip_nones(val)
                for key, val in value.items()
                if val is not None
            }
        if isinstance(value, list):
            return [self._strip_nones(item) for item in value]
        return value

    async def _call(self, kind: str, path: str, args: dict) -> Any:
        resp = await self._http.post(
            f"{self._url}/api/{kind}",
            json={"path": path, "args": self._strip_nones(args), "format": "json"},
        )

        body = resp.text
        print("Convex raw response:", body)

        resp.raise_for_status()

        data = resp.json()
        if data.get("status") == "error":
            raise RuntimeError(data.get("errorMessage"))

        return data.get("value")

    async def query(self, path: str, args: dict | None = None) -> Any:
        return await self._call("query", path, args or {})

    async def mutation(self, path: str, args: dict | None = None) -> Any:
        return await self._call("mutation", path, args or {})

    # ── Events ──

    async def get_event(self, event_id: str) -> dict | None:
        return await self.query("events:getEvent", {"event_id": event_id})

    async def list_events(self, status: str | None = None, limit: int | None = None) -> list[dict]:
        rows = await self.query("events:listEvents", {"status": status, "limit": limit})
        return rows if isinstance(rows, list) else []

    async def update_event_status(self, event_id: str, status: str) -> None:
        await self.mutation("events:updateEventStatus", {"event_id": event_id, "status": status})

    async def create_event(self, event: dict) -> str:
        return await self.mutation("events:createEvent", event)

    async def apply_inbound_milestones(
        self,
        event_id: str,
        *,
        speaker_confirmed: bool | None = None,
        room_confirmed: bool | None = None,
    ) -> None:
        await self.mutation(
            "events:applyInboundMilestones",
            {
                "event_id": event_id,
                "speaker_confirmed": speaker_confirmed,
                "room_confirmed": room_confirmed,
            },
        )

    async def update_event_safe(
        self,
        event_id: str,
        *,
        title: str | None = None,
        description: str | None = None,
        event_date: str | None = None,
        event_time: str | None = None,
        event_end_time: str | None = None,
        location: str | None = None,
        status: str | None = None,
        event_type: str | None = None,
        target_profile: str | None = None,
        speaker_confirmed: bool | None = None,
        room_confirmed: bool | None = None,
    ) -> dict | None:
        return await self.mutation(
            "events:updateEvent",
            {
                "event_id": event_id,
                "title": title,
                "description": description,
                "event_date": event_date,
                "event_time": event_time,
                "event_end_time": event_end_time,
                "location": location,
                "status": status,
                "event_type": event_type,
                "target_profile": target_profile,
                "speaker_confirmed": speaker_confirmed,
                "room_confirmed": room_confirmed,
            },
        )

    # ── Event Outreach ──

    async def insert_outreach_rows(self, rows: list[dict]) -> list[str]:
        return await self.mutation("outreach:insertOutreachRows", {"rows": rows})

    async def get_outreach_for_event(
        self, event_id: str, approved: bool | None = None
    ) -> list[dict]:
        args: dict[str, Any] = {"event_id": event_id}
        if approved is not None:
            args["approved"] = approved
        return await self.query("outreach:getOutreachForEvent", args)

    async def get_event_inbound_status(self, event_id: str | None = None) -> list[dict]:
        args: dict[str, Any] = {}
        if event_id is not None:
            args["event_id"] = event_id
        rows = await self.query("inboundDashboard:getEventInboundStatus", args)
        return rows if isinstance(rows, list) else []

    async def update_outreach(
        self, event_id: str, attio_record_id: str, updates: dict
    ) -> None:
        await self.mutation(
            "outreach:updateOutreach",
            {"event_id": event_id, "attio_record_id": attio_record_id, **updates},
        )

    async def approve_contacts(self, event_id: str, record_ids: list[str]) -> None:
        for rid in record_ids:
            await self.update_outreach(event_id, rid, {"approved": True})

    async def find_outreach_by_thread(self, thread_id: str) -> dict | None:
        return await self.query("outreach:findByThread", {"thread_id": thread_id})

    async def apply_inbound_update(
        self,
        event_id: str,
        attio_record_id: str,
        *,
        classification: str,
        inbound_state: str,
        response: str | None = None,
        sender_email: str | None = None,
        received_at: int | None = None,
    ) -> None:
        await self.mutation(
            "outreach:applyInboundUpdate",
            {
                "event_id": event_id,
                "attio_record_id": attio_record_id,
                "classification": classification,
                "inbound_state": inbound_state,
                "response": response,
                "sender_email": sender_email,
                "received_at": received_at,
            },
        )

    async def upsert_outreach_link(
        self, event_id: str, attio_record_id: str, thread_id: str | None = None
    ) -> str:
        return await self.mutation(
            "outreach:upsertOutreachLink",
            {
                "event_id": event_id,
                "attio_record_id": attio_record_id,
                "thread_id": thread_id,
            },
        )

    async def begin_inbound_receipt(self, message_id: str, thread_id: str | None = None) -> dict:
        return await self.mutation(
            "outreach:beginInboundReceipt",
            {"message_id": message_id, "thread_id": thread_id},
        )

    async def complete_inbound_receipt(self, message_id: str, thread_id: str | None = None) -> bool:
        res = await self.mutation(
            "outreach:completeInboundReceipt",
            {"message_id": message_id, "thread_id": thread_id},
        )
        return bool(res.get("is_duplicate"))

    async def release_inbound_receipt(self, message_id: str) -> None:
        await self.mutation("outreach:releaseInboundReceipt", {"message_id": message_id})

    async def delete_event(self, event_id: str) -> None:
        await self.mutation("events:deleteEvent", {"event_id": event_id})

    async def delete_outreach_for_event(self, event_id: str) -> None:
        await self.mutation("outreach:deleteOutreachForEvent", {"event_id": event_id})

    async def delete_inbound_receipt(self, message_id: str) -> None:
        await self.mutation("outreach:deleteInboundReceipt", {"message_id": message_id})

    # ── Assignments / Eboard ──

    async def get_active_eboard_members(self) -> list[dict]:
        return await self.query("eboard:listActive", {})

    async def resolve_assignees_by_record(self, attio_record_id: str) -> list[dict]:
        return await self.query(
            "contactAssignments:resolveAssigneesByRecord",
            {"attio_record_id": attio_record_id},
        )

    async def upsert_assignments_by_emails(self, attio_record_id: str, emails: list[str]) -> dict:
        return await self.mutation(
            "contactAssignments:upsertAssignmentsByEmails",
            {"attio_record_id": attio_record_id, "emails": emails},
        )

    async def get_attendance_dashboard(self) -> dict:
        rows = await self.query("attendance:getAttendanceDashboard", {})
        return rows if isinstance(rows, dict) else {}

    async def get_event_attendance(self, event_id: str) -> dict:
        rows = await self.query("attendance:listEventAttendance", {"event_id": event_id})
        return rows if isinstance(rows, dict) else {}

    # ── OnceHub Room Bookings ──

    async def get_event_room_booking(self, event_id: str) -> dict | None:
        return await self.query(
            "roomBookings:getEventRoomBooking",
            {"event_id": event_id},
        )

    async def upsert_event_room_booking(
        self,
        *,
        event_id: str,
        provider: str,
        page_url: str,
        link_name: str,
        room_label: str,
        booking_status: str,
        booked_date: str,
        booked_time: str,
        booked_end_time: str,
        duration_minutes: int,
        slot_start_epoch_ms: int,
        booking_reference: str | None,
        booking_reference_json: str | None,
        approver_user_id: str | None,
        raw_response_json: str,
    ) -> str:
        return await self.mutation(
            "roomBookings:upsertEventRoomBooking",
            {
                "event_id": event_id,
                "provider": provider,
                "page_url": page_url,
                "link_name": link_name,
                "room_label": room_label,
                "booking_status": booking_status,
                "booked_date": booked_date,
                "booked_time": booked_time,
                "booked_end_time": booked_end_time,
                "duration_minutes": duration_minutes,
                "slot_start_epoch_ms": slot_start_epoch_ms,
                "booking_reference": booking_reference,
                "booking_reference_json": booking_reference_json,
                "approver_user_id": approver_user_id,
                "raw_response_json": raw_response_json,
            },
        )
