# Agent

Modal-based serverless agents for the event organizer pipeline.

## Primary Runtime (Website `/agent`)

The main end-user agent runtime is:

- `runtime_app.py` (`event-agent-runtime`)

This is the Modal service the website uses to run conversations, approvals, and event-management actions.
It exposes:

1. `GET /agent/threads`
2. `POST /agent/threads`
3. `GET /agent/threads/:id`
4. `POST /agent/runs`
5. `GET /agent/runs/:id/stream`
6. `POST /agent/approvals/:id`

`runtime/modal_app.py` remains as a compatibility entrypoint for existing deploy commands and forwards to the same runtime service.

## Implementation Layout

| Directory | Purpose |
|-----------|---------|
| `apps/` | Compatibility wrappers around root services |
| `core/` | Shared clients, policy, normalization, modal config |
| `runtime/` | Conversational runtime internals (contracts/service/api) |
| `helper/` | Compatibility wrappers and workflow helpers |

## High-Level Runtime Behavior

When a user interacts with the website agent:

1. The UI starts/resumes a thread via `runtime_app.py`.
2. A run is created and executed in Modal.
3. The runtime runs the Claude agent SDK harness and launches the packaged FastMCP server over stdio from `apps.mcp.server`.
4. If an action is write/send/destructive, approval gating can pause the run until user decision.
5. Streamed output, artifacts, and approval states are returned in normalized form for UI rendering.

## Tool Access Surface

The runtime's current MCP tool surface is:

1. **Attio (CRM)**
   - `search_contacts`
   - `get_contact`
   - `create_contact`
   - `update_contact`
2. **Convex (operational state)**
   - `list_events`
   - `get_event`
   - `get_event_inbound_status`
   - `get_event_outreach`
   - `get_attendance_dashboard`
   - `get_event_attendance`
   - approval-gated `update_event_safe`

## Supporting Services (Root Files)

These are additional root services used by workflow tooling:

| File | Modal App Name | Purpose |
|------|---------------|---------|
| `match.py` | `event-outreach-match` | Candidate scoring/matching workflow |
| `outreach.py` | `event-outreach-send` | Outbound invite send workflow |
| `reply_handler.py` | `event-outreach-replies` | AgentMail webhook ingest and thread routing |
| `mcp_server.py` | — | Compatibility shim to the packaged FastMCP server |

## Running Tests

```bash
# from agent/
bash tests/run_tests.sh

# or directly with pytest
doppler run -- python -m pytest tests/ -v

# runtime-only tests
python -m pytest tests/test_runtime_*.py -v
```

## Helper Modules (`helper/`)

| Module | Purpose |
|--------|---------|
| `attio.py` | Attio CRM v2 async HTTP client with retry on 429 |
| `tools.py` | `ConvexClient` + shared Attio helpers (`upsert_inbound_contact`, `append_attio_note`) |
| `email_parse.py` | LLM classification (Haiku) + `handle_known_thread` / `handle_net_new` path handlers |
| `models.py` | Pydantic models for `AttioContact`, `CareerProfile`, `OutreachStatus`, etc. |
| `prompts/` | System prompts for LLM classification (`known_thread.txt`, `net_new.txt`) |
