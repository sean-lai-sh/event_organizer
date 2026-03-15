"""Pydantic models for Attio contact data."""
from __future__ import annotations

from datetime import datetime
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


RelationshipStage = Literal["cold", "active", "spoken", "persistent"]
ContactSource = Literal["warm_intro", "agent_outreach", "inbound", "event"]
ContactType = Literal["prospect", "alumni", "speaker", "mentor", "partner"]
OutreachStatus = Literal[
    "pending",
    "agent_active",
    "human_assigned",
    "in_conversation",
    "converted",
    "paused",
    "archived",
]
EnrichmentStatus = Literal["pending", "enriched", "stale", "failed"]


class AttioContact(BaseModel):
    """Represents an Attio people record with club-specific custom attributes."""

    firstname: str
    lastname: str
    email: EmailStr
    phone: str | None = None

    career_profile: CareerProfile | None = None
    relationship_stage: RelationshipStage = "cold"
    contact_source: ContactSource = "agent_outreach"
    warm_intro_by: str | None = None
    assigned_members: list[str] = []
    contact_type: ContactType = "prospect"
    outreach_status: OutreachStatus = "pending"
    last_agent_action_at: datetime | None = None
    enrichment_status: EnrichmentStatus = "pending"
