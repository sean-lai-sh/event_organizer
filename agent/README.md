# Agent

Modal-based serverless agents for the event organizer pipeline.

## Apps

| File | Modal App Name | Purpose |
|------|---------------|---------|
| `match.py` | `event-matching` | Phase 2 — score and rank speaker candidates from Attio |
| `outreach.py` | `event-outreach` | Phase 3 — send outreach emails via AgentMail |
| `reply_handler.py` | `event-outreach-replies` | Phase 4 — webhook endpoint, classifies inbound emails and updates Convex + Attio |
| `mcp_server.py` | — | Local MCP server exposing Attio tools to Claude |

## Running Tests

```bash
# from agent/
bash tests/run_tests.sh

# or directly with pytest
doppler run -- python -m pytest tests/ -v
```

## Helper Modules (`helper/`)

| Module | Purpose |
|--------|---------|
| `attio.py` | Attio CRM v2 async HTTP client with retry on 429 |
| `tools.py` | `ConvexClient` + shared Attio helpers (`upsert_inbound_contact`, `append_attio_note`) |
| `email_parse.py` | LLM classification (Haiku) + `handle_known_thread` / `handle_net_new` path handlers |
| `models.py` | Pydantic models for `AttioContact`, `CareerProfile`, `OutreachStatus`, etc. |
| `prompts/` | System prompts for LLM classification (`known_thread.txt`, `net_new.txt`) |
