# Agent-First MVP Implementation

This document is the execution blueprint for the agent-first MVP.

It is intentionally implementation-oriented:

- `PLAN.md` defines system contracts
- `AGENTS.md` defines runtime/operator rules
- `IMPLEMENTATION.md` defines the work breakdown and ordering

## Goal

Ship an MVP where:

- `/agent` is the primary authenticated workspace
- all agent execution runs through Modal endpoints
- Anthropic Agent SDK is used inside Modal as the harness layer
- Convex stores normalized thread, run, artifact, approval, and context-link state
- Discord talks to the same backend as the web app

## Workstreams

### 1. Modal Runtime

Deliverables:

- shared Modal app entrypoint for conversational runs
- thread creation endpoint
- run start endpoint
- streaming endpoint
- approval decision endpoint
- internal runtime adapter around Anthropic Agent SDK
- policy layer for approval-gated tool execution

Key constraints:

- all guardrails live here
- MCP access is invoked from here
- Attio and Convex integration helpers are called from here
- Next.js and Discord must not duplicate orchestration logic

Definition of done:

- a user utterance can reach Modal, produce a streamed response, pause for approval, and resume after approval

### 2. Convex Persistence

Deliverables:

- schema additions for:
  - `agent_threads`
  - `agent_messages`
  - `agent_runs`
  - `agent_artifacts`
  - `agent_approvals`
  - `agent_context_links`
- query and mutation layer for:
  - creating and listing threads
  - reading normalized conversation state
  - syncing run lifecycle
  - storing approvals
  - storing artifacts

Key constraints:

- Convex stores normalized state
- Modal remains execution authority
- normalized records must not depend on raw SDK payloads

Definition of done:

- the web app can fully render a thread from Convex without requiring raw Modal response payloads

### 3. Web `/agent` Workspace

Deliverables:

- full-page `/agent` route
- thread rail
- conversation timeline
- artifact canvas
- approval cards
- streaming UI
- authenticated landing redirect to `/agent`

Key constraints:

- stay within the repo’s monochrome design system
- dashboard routes remain available
- the UI is a thin client over Modal and Convex

Definition of done:

- a signed-in user lands on `/agent`, starts a conversation, sees streamed output, and views artifacts and approvals

### 4. Scoped Launchers

Deliverables:

- global "Ask agent" entrypoint
- event-scoped launcher
- speaker-scoped launcher
- communications-scoped launcher

Key constraints:

- launchers must feed context into the same shared thread model
- launchers must not create separate orchestration paths

Definition of done:

- from any of the supported surfaces, the user can open the agent with relevant context attached

### 5. Discord Client

Deliverables:

- Discord message intake wired to the shared Modal runtime
- thread identity mapping between Discord and internal thread ids
- approval handling in Discord
- compact artifact rendering in Discord
- deep links to `/agent` for rich artifacts

Key constraints:

- same backend, same rules, same thread model
- thinner rendering than web

Definition of done:

- a user can continue an existing conversation from Discord and see the result reflected in the web app

### 6. Documentation and Scope Control

Deliverables:

- rewrite `README.md`
- rewrite `PLAN.md`
- rewrite `AGENTS.md`
- maintain this implementation document
- create and enforce GitHub issue pruning around the agent-first MVP

Definition of done:

- docs describe the same architecture and the active backlog is narrowed to MVP work only

## Suggested Execution Order

1. Docs and backlog pruning
2. Convex schema and normalized agent data model
3. Modal runtime shell and Anthropic Agent SDK adapter
4. `/agent` workspace shell with mocked data
5. wire web UI to real Convex and Modal endpoints
6. add scoped launchers from existing pages
7. add Discord client on the same backend
8. verification, regression coverage, and cleanup

## Parallelization Plan

These streams can move in parallel once contracts are locked:

| Stream | Can start after | Notes |
|---|---|---|
| Docs + backlog pruning | immediately | establishes constraints |
| Convex schema | docs | unlocks frontend and runtime persistence |
| Modal runtime adapter | docs | can mock persistence early |
| `/agent` UI shell | docs | can use mocked thread/artifact data first |
| Scoped launchers | `/agent` shell | depends on shared thread contract |
| Discord client | Modal runtime endpoints | can follow once the canonical API exists |

## Backlog Pruning Rules

Every open issue must be triaged into one of:

- `mvp-agent`
- `post-mvp`
- `close-as-out-of-scope`

Keep only issues that directly advance:

- `/agent` UX
- Modal runtime
- Anthropic harness integration
- artifacts
- approvals
- Discord client
- scoped context launchers
- architecture docs

Move out or close anything focused on:

- unrelated dashboard polish
- unrelated Attio/Convex cleanup
- speculative integrations beyond Discord
- standalone features outside the agent-first interaction loop

## Acceptance Checklist

### Runtime

- Modal is the only place that decides tool execution
- Anthropic Agent SDK usage is wrapped behind a local runtime adapter
- approval-gated actions cannot bypass Modal policy

### Data

- Convex can persist and read back normalized threads, messages, runs, artifacts, approvals, and context links
- Attio `people` remains identity-only
- Attio `speakers` remains workflow-only

### UI

- `/agent` is the default authenticated landing route
- thread timeline, artifact canvas, and approvals render correctly
- existing dashboard routes still work as drill-down tools

### Cross-client

- Discord and web can continue the same conversation
- rich artifacts can deep-link from Discord into the web app

### Docs

- `README.md`, `PLAN.md`, and `AGENTS.md` describe the same architecture
- no stale `backend/` references remain unless a real backend directory is reintroduced
