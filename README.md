# Event Organizer — Dev Setup Guide

This repo has three main parts:

| Directory | What it is |
|---|---|
| `fe+convex/` | Next.js 16 frontend + Convex real-time backend (TypeScript) |
| `backend/` | Python services — Attio CRM clients and FastMCP server |
| `agent/` | AI agent / MCP server (Attio CRM tools for outreach automation) |

Secrets are managed via **Doppler** — you will never manually create `.env` files.

---

## Prerequisites

Install these before anything else:

| Tool | Install |
|---|---|
| [Node.js 20+](https://nodejs.org) | `brew install node` |
| [Bun](https://bun.sh) | `curl -fsSL https://bun.sh/install \| bash` |
| [Python 3.11+](https://python.org) | `brew install python@3.11` |
| [uv](https://docs.astral.sh/uv/) | `curl -LsSf https://astral.sh/uv/install.sh \| sh` |
| [Doppler CLI](https://docs.doppler.com/docs/install-cli) | `brew install dopplerhq/cli/doppler` |

---

## 1. Doppler Setup (one-time per machine)

Doppler injects secrets into every process — no `.env` files needed.

```bash
# Authenticate with Doppler (opens browser)
doppler login

# Link the repo to the Doppler project (run from repo root)
doppler setup
# Select project: event-organizer  (or whatever the project is named in Doppler)
# Select config:  dev
```

Verify it's working:

```bash
doppler secrets
```

You should see all the project secrets listed (e.g. `ATTIO_API_KEY`, `BETTER_AUTH_SECRET`, etc.).

> **Note:** If you don't have access to the Doppler project, ask the team lead to invite you at **app.doppler.com** → Project → Access.

---

## 2. Frontend + Convex (`fe+convex/`)

### Install dependencies

```bash
cd fe+convex
bun install
```

### Start Convex dev server (first terminal)

```bash
doppler run -- npx convex dev
```

This syncs your Convex functions and prints a deployment URL. Keep it running.

### Start Next.js dev server (second terminal)

```bash
cd fe+convex
doppler run -- bun dev
```

App runs at [http://localhost:3000](http://localhost:3000).

### Seed demo attendance data for `/dashboard/data`

For local/dev demos, seed a small attendance dataset so the dashboard data page is populated without a manual CSV import:

```bash
cd fe+convex
doppler run -- bun run seed:attendance-demo
```

This mutation is idempotent. Re-running it will reuse the same demo events and attendance rows instead of duplicating them.

If you open `/dashboard/data` with no attendance yet, the empty state also exposes a `Load demo attendance` button in non-production builds.

Tests can clean up demo attendance and demo insight rows with `attendance:deleteDemoData`, but that mutation is intentionally guarded behind the Convex env var `ALLOW_TEST_MUTATIONS=true`.

### First-time Convex setup (only needed once per new Convex project)

```bash
doppler run -- npx convex dev --once  # deploy schema + functions once
```

---

## 3. Backend / Agent (`backend/`, `agent/`)

### Install Python dependencies

```bash
cd backend
uv sync
```

### Run the MCP server (Attio CRM tools)

```bash
cd <repo-root>
doppler run -- uv run python agent/mcp_server.py
```

### Inspect MCP tools interactively

```bash
doppler run -- npx @modelcontextprotocol/inspector uv run python agent/mcp_server.py
```

## Environment Variables Reference

These live in Doppler — do **not** add them to any `.env` file.

| Variable | Used by | Description |
|---|---|---|
| `ATTIO_API_KEY` | `backend/`, `agent/` | Attio CRM API token |
| `BETTER_AUTH_URL` | `fe+convex/` | Base URL for the auth server (e.g. `http://localhost:3000`) |
| `BETTER_AUTH_SECRET` | `fe+convex/` | Secret key for better-auth session signing |
| `CONVEX_DEPLOYMENT` | `fe+convex/` | Convex deployment URL (auto-set by `convex dev`) |
| `ANTHROPIC_API_KEY` | `agent/` | Anthropic API key for AI features |

---

## Typical Dev Workflow

Open **three terminals**:

```
Terminal 1 — Convex
  cd fe+convex && doppler run -- npx convex dev

Terminal 2 — Next.js
  cd fe+convex && doppler run -- bun dev

Terminal 3 — Agent MCP server (only if working on agent features)
  doppler run -- uv run python agent/mcp_server.py
```

---

## Project Structure

```
event-organizer/
├── fe+convex/
│   ├── app/               # Next.js App Router pages
│   ├── convex/            # Convex functions (queries, mutations, auth)
│   │   ├── schema.ts      # Database schema
│   │   ├── auth.ts        # better-auth integration
│   │   └── eboard.ts      # Eboard member functions
│   └── package.json
├── backend/
│   ├── attio/client.py    # Attio CRM API wrapper
│   ├── models/contact.py  # Pydantic data models
│   └── pyproject.toml
├── agent/
│   ├── mcp_server.py      # FastMCP server (Attio CRM tools)
│   ├── outreach.py        # Outreach automation
│   └── tools.py           # Agent tool definitions
└── PLAN.md                # Architecture decisions
```

---

## Troubleshooting

**`doppler: command not found`** — Make sure Doppler CLI is installed and your shell has been restarted after install.

**`ATTIO_API_KEY must be set`** — You ran the process without `doppler run --`. Prefix your command with `doppler run --`.

**Convex type errors after pulling** — Run `npx convex dev --once` to regenerate `_generated/` types.

**`bun: command not found`** — Restart your terminal after installing bun, or run `source ~/.bashrc` / `source ~/.zshrc`.
