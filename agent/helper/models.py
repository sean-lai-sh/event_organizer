"""Pydantic models for Attio people identity and speaker workflow data."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, EmailStr


class Experience(BaseModel):
    company: str
    title: str
    start: str  # "YYYY-MM"
    end: str | None = None
    current: bool = False


class Education(BaseModel):
    school: str
    degree: str
    grad_year: int
    current: bool = False


class CareerProfile(BaseModel):
    experience: list[Experience] = []
    education: list[Education] = []
    skills: list[str] = []
    interests: list[str] = []
    linkedin_url: str | None = None


SpeakerStatus = Literal["Prospect", "Engaged", "Confirmed", "Declined"]
SpeakerSource = Literal["outreach", "warm", "in bound", "event", "alumni"]


class AttioContact(BaseModel):
    """Represents an Attio people record with identity/profile attributes only."""

    firstname: str
    lastname: str
    email: EmailStr
    phone: str | None = None
    company: str | None = None
    job_title: str | None = None
    description: str | None = None


class AttioSpeakerWorkflow(BaseModel):
    """Represents an Attio speakers list entry with workflow attributes."""

    person_record_id: str
    status: SpeakerStatus = "Prospect"
    source: SpeakerSource | None = None
    active_event_id: str | None = None
    assigned: str | None = None
    managed_poc: str | None = None
    previous_events: str | None = None
    speaker_info: str | None = None
    work_history: str | None = None
