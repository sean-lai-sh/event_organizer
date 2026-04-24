# Event Organizer

Event Organizer is moving to an agent-first operating model.

The product direction is:

- `/agent` is the primary authenticated workspace
- Modal is the execution authority for all agent logic and guardrails
- Convex stores product state, thread history, artifacts, and approvals
- Attio remains the CRM system of record for identity and speaker workflow
- Discord is a second client of the same agent runtime, not a separate automation path

## Architecture

The system is split into three layers:

| Layer | Responsibility |
|---|---|
| `fe+convex/` | Next.js app surfaces, Convex queries/mutations, authenticated UI for `/agent` and dashboard drill-downs |
| `agent/` | Modal-hosted agent runtime, MCP adapters, Attio/Convex integration helpers, Anthropic Agent SDK harness |
| Attio + Convex | Persistent business state: Attio for CRM truth, Convex for application state and agent interaction history |

## Current MVP Direction

The active MVP is the agent-first workspace:

- add a full-page `/agent` surface
- route all agent execution through Modal endpoints
- use Anthropic Agent SDK inside Modal as the agent harness
- keep Next.js and Discord thin clients
- preserve existing dashboard pages as precise drill-down tools
- prune unrelated engineering from the MVP backlog

For the authoritative product and data-contract details, read:

- `PLAN.md` for system contracts and ownership
- `AGENTS.md` for operator/runtime rules
- `IMPLEMENTATION.md` for the parallel execution plan
- `DESIGN.md` for shared dashboard and monochrome UI guidance

## Repository Layout

```text
event_organizer/
├── fe+convex/              # Next.js 16 app + Convex functions
├── agent/                  # Modal runtime, Attio helpers, MCP server, tests
├── PLAN.md                 # Architecture and data-contract source of truth
├── AGENTS.md               # Operator and runtime integration guide
├── IMPLEMENTATION.md       # Implementation workstreams and dependency plan
└── DESIGN.md               # Frontend layout and design-system rules
```

## Prerequisites

Install these before starting local development:

| Tool | Install |
|---|---|
| [Node.js 20+](https://nodejs.org) | `brew install node` |
| [Bun](https://bun.sh) | `curl -fsSL https://bun.sh/install \| bash` |
| [Python 3.11+](https://python.org) | `brew install python@3.11` |
| [uv](https://docs.astral.sh/uv/) | `curl -LsSf https://astral.sh/uv/install.sh \| sh` |
| [Doppler CLI](https://docs.doppler.com/docs/install-cli) | `brew install dopplerhq/cli/doppler` |
| [Modal CLI](https://modal.com/docs/guide) | `python -m pip install modal` |

## Secrets

Secrets are managed through Doppler. Do not create repo-local `.env` files.

One-time setup:

```bash
doppler login
cd /Users/sean_lai/event_organizer
doppler setup
```

Useful validation:

```bash
doppler secrets
```

## Local Development

Most work needs three terminals.

### 1. Convex

```bash
cd /Users/sean_lai/event_organizer/fe+convex
doppler run -- npx convex dev
```

### 2. Next.js

```bash
cd /Users/sean_lai/event_organizer/fe+convex
doppler run -- bun dev
```

The web app runs at [http://localhost:3000](http://localhost:3000).

### 3. Modal / Agent Runtime

Install Python dependencies:

```bash
cd /Users/sean_lai/event_organizer/agent
uv sync
```

Run the packaged local MCP server if you are working on tool adapters:

```bash
cd /Users/sean_lai/event_organizer/agent
doppler run -- uv run python -m apps.mcp.server
```

Inspect MCP tools interactively:

```bash
cd /Users/sean_lai/event_organizer/agent
doppler run -- npx @modelcontextprotocol/inspector uv run python -m apps.mcp.server
```

The Modal runtime starts that same MCP server over stdio through the Claude agent SDK. The current tool surface is:

- Attio reads/writes: `search_contacts`, `get_contact`, `create_contact`, `update_contact`
- Convex reads: `list_events`, `get_event`, `get_event_inbound_status`, `get_event_outreach`, `get_attendance_dashboard`, `get_event_attendance`
- Approval-gated Convex writes: `update_event_safe`

Deploy or serve Modal functions from the `agent/` package as needed for runtime work.

## Environment Variables

These live in Doppler.

| Variable | Used by | Description |
|---|---|---|
| `ATTIO_API_KEY` | `agent/` | Attio API token |
| `BETTER_AUTH_URL` | `fe+convex/` | Auth base URL |
| `BETTER_AUTH_SECRET` | `fe+convex/` | Better Auth signing secret |
| `CONVEX_DEPLOYMENT` | `fe+convex/` | Convex deployment URL |
| `NEXT_PUBLIC_CONVEX_URL` | `fe+convex/` | Browser Convex URL |
| `NEXT_PUBLIC_MODAL_ENDPOINT` | `fe+convex/` | Base URL used by Next route handlers to proxy `/api/agent/*` requests to the Modal runtime |
| `CONVEX_URL` | `agent/` | Convex HTTP endpoint for Modal-side access |
| `CONVEX_DEPLOY_KEY` | `agent/` | Convex deploy key for server-side mutations |
| `ANTHROPIC_API_KEY` | `agent/` | Anthropic API key for the Modal runtime |
| `MODAL_TOKEN_ID` | `agent/` | Modal auth |
| `MODAL_TOKEN_SECRET` | `agent/` | Modal auth |

## Testing

Frontend:

```bash
cd /Users/sean_lai/event_organizer/fe+convex
doppler run -- bun run lint
```

Agent runtime:

```bash
cd /Users/sean_lai/event_organizer/agent
doppler run -- uv run pytest tests -v
```

Convex schema/codegen refresh:

```bash
cd /Users/sean_lai/event_organizer/fe+convex
doppler run -- npx convex dev --once
```

## Working Rules

- Keep agent orchestration logic on the Modal side.
- Do not move tool policy or guardrails into Next.js or Discord handlers.
- Do not write speaker workflow state onto Attio `people`.
- Keep dashboard UI monochrome and consistent with `DESIGN.md`.
- If `PLAN.md` changes in a way that affects runtime behavior, update `AGENTS.md` in the same change.

## Backlog Discipline

The active milestone is the agent-first MVP.

Anything not directly advancing one of these should be deferred:

- `/agent` workspace
- Modal runtime
- Anthropic Agent SDK harness
- artifacts and approvals
- Discord parity on the shared backend
- required architecture-doc rewrites

## Troubleshooting

`doppler: command not found`

- Install Doppler and restart your shell.

`ATTIO_API_KEY must be set`

- Run the process through `doppler run --`.

Convex type drift after pulling

- Run `doppler run -- npx convex dev --once` inside `fe+convex/`.

`bun: command not found`

- Restart your terminal or reload your shell profile.

Modal auth failures

- Confirm `MODAL_TOKEN_ID` and `MODAL_TOKEN_SECRET` are present in Doppler and that you are logged in locally.

## OnceHub room booking (MVP)

The agent can find and book the Leslie eLab Lean/Launchpad room directly from
`/agent` or from the event dashboard. Availability is always live; the agent
pauses for approval before any booking write.

- Dashboards only launch scoped agent threads; orchestration stays on Modal.
  See `fe+convex/components/agent/launchers/roomBooking.ts`.
- MCP tools (Modal-side): `find_oncehub_slots`, `book_oncehub_room` (approval
  gated), `get_event_room_booking`.
- Convex `event_room_bookings` stores the OnceHub receipt. `events.room_confirmed`
  flips sticky-true when a booking confirms.

Configure the shared club booking profile in Doppler:

```
ONCEHUB_PROFILE_FIRST_NAME
ONCEHUB_PROFILE_LAST_NAME
ONCEHUB_PROFILE_EMAIL
ONCEHUB_PROFILE_NETID
ONCEHUB_PROFILE_AFFILIATION
ONCEHUB_PROFILE_SCHOOL
ONCEHUB_PROFILE_ORG_NAME
```

MVP scope is explicitly limited to first-time booking of the Lean/Launchpad
room. Rebooking, cancellation, per-user NYU identities, and syncing manual
OnceHub edits back into Convex are out of scope.
