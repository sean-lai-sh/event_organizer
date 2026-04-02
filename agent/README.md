# Agent

Modal-based serverless agents for the event organizer pipeline.

## Primary Runtime (Website `/agent`)

The main end-user agent runtime is:

- `runtime_app.py` (`event-agent-runtime`)

This is the Modal service the website uses to run conversations, approvals, and event-management actions.
It exposes:

1. `POST /agent/threads`
2. `GET /agent/threads/:id`
3. `POST /agent/runs`
4. `GET /agent/runs/:id/stream`
5. `POST /agent/approvals/:id`

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
3. The runtime can call tool surfaces (Attio/Convex/AgentMail workflows) through local modules.
4. If an action is write/send/destructive, approval gating can pause the run until user decision.
5. Streamed output, artifacts, and approval states are returned in normalized form for UI rendering.

## Tool Access Surface

The agent stack can read/modify:

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

## Supporting Services (Root Files)

These are additional root services used by workflow tooling:

| File | Modal App Name | Purpose |
|------|---------------|---------|
| `match.py` | `event-outreach-match` | Candidate scoring/matching workflow |
| `outreach.py` | `event-outreach-send` | Outbound invite send workflow |
| `reply_handler.py` | `event-outreach-replies` | AgentMail webhook ingest and thread routing |
| `mcp_server.py` | — | FastMCP CRM tool server (`search_contacts`, `get_contact`, `create_contact`, `update_contact`) |

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
