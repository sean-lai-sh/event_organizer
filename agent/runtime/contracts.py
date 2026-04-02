from __future__ import annotations

from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class Channel(str, Enum):
    WEB = "web"
    DISCORD = "discord"


class RunStatus(str, Enum):
    IDLE = "idle"
    RUNNING = "running"
    PAUSED_APPROVAL = "paused_approval"
    COMPLETED = "completed"
    ERROR = "error"


class RiskLevel(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class ApprovalStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class ArtifactKind(str, Enum):
    METRIC_GROUP = "metric_group"
    TABLE = "table"
    TIMELINE = "timeline"
    CHECKLIST = "checklist"
    REPORT = "report"
    CHART = "chart"
    LINK_BUNDLE = "link_bundle"


class ContentBlock(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: str
    label: str | None = None
    text: str | None = None
    mime_type: str | None = None
    data_json: str | None = None
    url: str | None = None


class ContextLinkRecord(BaseModel):
    model_config = ConfigDict(extra="forbid")

    link_key: str
    relation: str
    entity_type: str
    entity_id: str
    label: str | None = None
    url: str | None = None
    metadata_json: str | None = None
    created_at: int
    updated_at: int


class ContextLinkInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    relation: str = "context"
    entity_type: str
    entity_id: str
    label: str | None = None
    url: str | None = None
    metadata_json: str | None = None


class ThreadRecord(BaseModel):
    model_config = ConfigDict(extra="forbid")

    external_id: str
    channel: Channel
    status: str = "active"
    title: str | None = None
    summary: str | None = None
    created_by_user_id: str | None = None
    last_message_at: int | None = None
    last_run_started_at: int | None = None
    archived_at: int | None = None
    created_at: int
    updated_at: int


class RunRecord(BaseModel):
    model_config = ConfigDict(extra="forbid")

    external_id: str
    thread_external_id: str
    status: RunStatus
    trigger_source: str
    mode: str | None = None
    initiated_by_user_id: str | None = None
    model: str | None = None
    summary: str | None = None
    error_message: str | None = None
    started_at: int
    completed_at: int | None = None
    updated_at: int
    latest_message_sequence: int | None = None


class MessageRecord(BaseModel):
    model_config = ConfigDict(extra="forbid")

    external_id: str
    thread_external_id: str
    run_external_id: str | None = None
    role: str
    status: str
    sequence_number: int
    plain_text: str | None = None
    content_blocks: list[ContentBlock]
    created_at: int
    updated_at: int


class ArtifactRecord(BaseModel):
    model_config = ConfigDict(extra="forbid")

    external_id: str
    thread_external_id: str
    run_external_id: str | None = None
    kind: ArtifactKind
    status: str
    sort_order: int
    title: str | None = None
    summary: str | None = None
    content_blocks: list[ContentBlock]
    created_at: int
    updated_at: int


class ApprovalRecord(BaseModel):
    model_config = ConfigDict(extra="forbid")

    external_id: str
    thread_external_id: str
    run_external_id: str
    status: ApprovalStatus
    action_type: str
    title: str
    summary: str | None = None
    risk_level: RiskLevel
    payload_json: str | None = None
    requested_at: int
    expires_at: int | None = None
    resolved_at: int | None = None
    decision_note: str | None = None
    decided_by_user_id: str | None = None
    updated_at: int


class StreamEvent(BaseModel):
    model_config = ConfigDict(extra="forbid")

    run_id: str
    sequence: int
    event: str
    created_at: int
    data: dict[str, Any] = Field(default_factory=dict)


class ThreadCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    external_id: str | None = None
    channel: Channel = Channel.WEB
    title: str | None = None
    created_by_user_id: str | None = None
    context_links: list[ContextLinkInput] | None = None


class RunCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    thread_id: str
    input_text: str
    trigger_source: str = "web"
    mode: str | None = None
    initiated_by_user_id: str | None = None
    max_tokens: int = 900


class ApprovalDecisionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    decision: Literal["approved", "rejected"]
    note: str | None = None
    decided_by_user_id: str | None = None


class ThreadStateResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    thread: ThreadRecord
    runs: list[RunRecord]
    messages: list[MessageRecord]
    artifacts: list[ArtifactRecord]
    approvals: list[ApprovalRecord]
    context_links: list[ContextLinkRecord]


class ApprovalDecisionResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    approval: ApprovalRecord
    run: RunRecord
