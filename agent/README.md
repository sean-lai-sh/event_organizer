# Agent

Modal-based serverless agents for the event organizer pipeline.

## Apps

| File | Modal App Name | Purpose |
|------|---------------|---------|
| `runtime_app.py` | `event-agent-runtime` | Shared conversational runtime (`/agent/threads`, `/agent/runs`, `/agent/approvals`) |
| `match.py` | `event-outreach-match` | Phase 2 — score and rank speaker candidates from Attio |
| `outreach.py` | `event-outreach-send` | Phase 3 — send outreach emails via AgentMail |
| `reply_handler.py` | `event-outreach-replies` | Phase 4 — webhook endpoint, classifies inbound emails and updates Convex + Attio |
| `mcp_server.py` | — | Local MCP server exposing Attio tools to Claude |

Compatibility notes:
- `runtime/modal_app.py` is still supported as a legacy entrypoint path and forwards to `runtime_app.py`.
- Root files (`match.py`, `outreach.py`, `reply_handler.py`, `mcp_server.py`) are launchers only.

## Root Launcher Map

| Root File | Canonical Implementation | What It Runs |
|-----------|--------------------------|--------------|
| `runtime_app.py` | `apps/runtime/app.py` | Conversational runtime API (`/agent/threads`, `/agent/runs`, `/agent/approvals`) |
| `match.py` | `apps/match/app.py` | Event-to-speaker matching workflow |
| `outreach.py` | `apps/outreach/app.py` | Outbound invite composition + send workflow |
| `reply_handler.py` | `apps/replies/app.py` | Inbound webhook ingestion and known-thread/net-new routing |
| `mcp_server.py` | `apps/mcp/server.py` | FastMCP CRM tool server (`search_contacts`, `get_contact`, `create_contact`, `update_contact`) |
| `runtime/modal_app.py` | shim to `runtime_app.py` | Legacy runtime launcher path (kept for command compatibility) |

## Implementation Layout

| Directory | Purpose |
|-----------|---------|
| `apps/` | Canonical Modal/FastMCP app implementations |
| `core/` | Shared clients, policy, normalization, modal config |
| `runtime/` | Conversational runtime internals (contracts/service/api) |
| `helper/` | Compatibility wrappers and workflow helpers |

## Agent Runtime Overview

At a high level:

1. **Message ingest**
   - Inbound email events hit `reply_handler.py` (`apps/replies/app.py` implementation).
   - This path parses sender + thread metadata, dedupes by receipt id in Convex, and routes to:
     - `known_thread` path (existing outreach thread link), or
     - `net_new` path (contact upsert + draft event linkage flow).
2. **Classification + side effects**
   - Inbound content is classified via Anthropic calls in `helper/email_parse.py`.
   - Convex is updated for outreach/thread state and event milestone updates.
   - Attio gets audit notes and contact updates where applicable.
3. **Outbound send**
   - `outreach.py` (`apps/outreach/app.py`) composes invites and sends through AgentMail.
   - Thread ids from AgentMail are written back to Convex outreach rows for continuation.
4. **Conversational runtime**
   - `runtime_app.py` runs the thread/run/approval API and normalized streaming contract.
   - It can pause for approval and resume before applying externally visible actions.

How reply handling is linked to AgentMail:

- `apps/replies/app.py` receives AgentMail webhook payloads.
- `helper/email_parse.py` uses `get_agentmail_client()` from `helper/tools.py` for thread fetches.
- That client path is the integration point for thread history retrieval and response context.

## Tool Access Surface

The runtime/tooling can read and modify:

1. **Attio (CRM)**
   - Read/search contacts.
   - Create/update contacts.
   - Append notes for action history.
2. **Convex (operational state)**
   - Event lifecycle and milestone updates.
   - Outreach links (`attio_record_id`, thread ids, inbound state metadata).
   - Receipt dedupe and assignment resolution.
   - Agent thread/run/message/artifact/approval normalized state (runtime path).
3. **AgentMail (communications)**
   - Send outreach messages.
   - Read thread history for reply-context handling.
4. **Anthropic**
   - Classification and generation for matching, outreach drafting, and inbound interpretation.

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
