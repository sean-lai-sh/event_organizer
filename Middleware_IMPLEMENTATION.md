# Middleware Implementation

This document is the low-level implementation reference for the repo's backend request path. In this project, "middleware" is broader than a single framework hook. The backend path is composed of:

- Next.js edge middleware for route protection
- Next.js API route handlers that proxy or aggregate backend state
- Convex queries and mutations that act as the operational data layer
- Modal-hosted agent endpoints for orchestration-heavy work

The goal of this document is to describe what actually runs for backend requests, how authentication is enforced, which requests go straight to Convex, which requests are proxied to Modal, and where state-changing business logic lives.

## Scope

This document covers:

- `fe+convex/middleware.ts`
- `fe+convex/app/api/auth/[...all]/route.ts`
- `fe+convex/app/api/agent/_lib/modalProxy.ts`
- `fe+convex/app/api/agent/threads/route.ts`
- `fe+convex/app/api/agent/threads/[threadId]/route.ts`
- `fe+convex/app/api/agent/runs/route.ts`
- `fe+convex/app/api/agent/approvals/[approvalId]/route.ts`
- `fe+convex/convex/auth.ts`
- `fe+convex/convex/events.ts`
- `fe+convex/convex/outreach.ts`
- `fe+convex/convex/attendance.ts`
- `fe+convex/convex/invites.ts`
- `fe+convex/convex/eboard.ts`
- `fe+convex/convex/contactAssignments.ts`
- `fe+convex/convex/inboundDashboard.ts`
- `fe+convex/convex/agentState.ts`
- `agent/runtime/api.py`
- `agent/runtime/service.py`

## Backend Boundary

The repo has two backend execution planes.

### Convex

Convex is the operational database and product query layer.

It handles:

- auth-adjacent lifecycle hooks
- event and outreach state
- attendance storage and aggregation
- invite management
- normalized agent thread, run, message, artifact, approval, and context-link persistence

### Modal

Modal is the execution authority for the conversational agent runtime.

It handles:

- thread creation
- run execution
- approval gating
- tool calling
- normalized sync back into Convex

### Next.js server layer

The Next.js server layer does not own orchestration policy. It does three smaller jobs:

- redirect unauthenticated users before page render
- proxy Better Auth requests into Convex
- proxy selected `/api/agent/*` writes into Modal

## Request Flow Overview

### Authenticated page request

1. Browser requests `/agent` or `/dashboard/...`.
2. `fe+convex/middleware.ts` checks for a Better Auth session cookie.
3. If no session exists, the user is redirected to `/login?redirect=...`.
4. If a session exists and the user hits `/login` or `/signup`, they are redirected to `/agent` or the validated redirect target.
5. The frontend page then uses Convex client hooks or Next API routes to fetch data.

### Agent read path

1. Browser calls `/api/agent/threads` or `/api/agent/threads/:id`.
2. The Next route handler reads from Convex directly with `ConvexHttpClient`.
3. The response returns normalized thread state from `convex/agentState.ts`.

This is intentionally cheap and read-only.

### Agent write / run path

1. Browser calls `/api/agent/threads` with `POST`, `/api/agent/runs`, or `/api/agent/approvals/:id`.
2. The Next route handler passes the request to `proxyModalRequest()`.
3. `modalProxy.ts` forwards method, query string, `accept`, and `content-type` to the Modal runtime.
4. Modal executes the run or approval logic.
5. Modal syncs normalized state back into Convex.
6. The frontend reads updated state from Convex.

This keeps orchestration on Modal while still letting the web app expose a stable local API surface.

## Edge Middleware

Primary file:

- `fe+convex/middleware.ts`

Behavior:

- protects `/dashboard/:path*`
- protects `/agent` and `/agent/:path*`
- allows `/login` and `/signup` but redirects authenticated users away from them
- validates the redirect target with `getSafeRedirectPath()` so open redirects are not accepted

Important details:

- session presence is determined with `getSessionCookie(request)`
- this is a coarse auth gate, not an authorization layer
- no role lookup happens here

Pitfalls:

- expanding the matcher without checking public routes can accidentally lock out static or onboarding pages
- this file should stay small; business policy does not belong here

## Better Auth Proxy Path

Primary files:

- `fe+convex/app/api/auth/[...all]/route.ts`
- `fe+convex/convex/auth.ts`

Flow:

1. Browser sends auth requests to `/api/auth/...`.
2. The Next catch-all route builds a Better Auth handler with `convexBetterAuthNextJs`.
3. Requests are proxied into Convex's Better Auth adapter.
4. Convex persists auth state.
5. The `onCreate` trigger in `convex/auth.ts` inserts a corresponding `eboard_members` row.

Why this matters:

- auth writes are not handled by custom application code
- user bootstrap into `eboard_members` is transactional with auth creation

Pitfalls:

- `convexSiteUrl` must resolve correctly from environment variables
- changing the `onCreate` trigger affects every new user signup

## Modal Proxy Layer

Primary file:

- `fe+convex/app/api/agent/_lib/modalProxy.ts`

Responsibilities:

- build the upstream URL from `NEXT_PUBLIC_MODAL_ENDPOINT`
- forward request method and raw body
- preserve `accept` and `content-type`
- return upstream status and body directly

Important details:

- no auth token enrichment is happening here today
- no request transformation is applied beyond URL and header copying
- failures are collapsed into a JSON `{ error }` response with HTTP 500

Pitfalls:

- if Modal needs user identity beyond the session gate, this proxy will need explicit propagation
- only a small header subset is copied back to the client
- `NEXT_PUBLIC_MODAL_ENDPOINT` is required even though the proxy runs server-side

## Agent API Route Handlers

### `app/api/agent/threads/route.ts`

- `GET` reads `api.agentState.listThreads` from Convex
- `POST` proxies thread creation to Modal

Why split it this way:

- listing threads is cheap and already normalized in Convex
- creating a thread is part of the orchestration lifecycle, so Modal owns it

### `app/api/agent/threads/[threadId]/route.ts`

- `GET` reads `api.agentState.getThreadState` from Convex
- returns 404 if normalized state is absent

### `app/api/agent/runs/route.ts`

- `POST` proxies run creation and execution to Modal

### `app/api/agent/approvals/[approvalId]/route.ts`

- `POST` proxies approval resolution to Modal

Design consequence:

- the web app is a thin gateway
- thread and run state should be considered Convex-backed cached state from the Modal runtime, not state invented by Next.js

## Convex Backend Functions

Convex is where most non-orchestration backend logic lives.

### Event functions

Primary file:

- `fe+convex/convex/events.ts`

Responsibilities:

- create events
- list and fetch events
- patch event metadata
- apply sticky inbound milestone booleans

Important behavior:

- `speaker_confirmed` and `room_confirmed` are sticky-true flags
- `updateEvent()` refuses to auto-reset them to false
- `applyInboundMilestones()` is specialized for inbound-triggered milestone writes

### Outreach and receipt functions

Primary file:

- `fe+convex/convex/outreach.ts`

Responsibilities:

- create and update event outreach rows
- link AgentMail thread ids
- update inbound metadata
- maintain inbound dedupe receipts with a lease

Important behavior:

- `beginInboundReceipt()` uses a time-based processing lease
- `completeInboundReceipt()` marks the receipt as committed
- `releaseInboundReceipt()` deletes in-flight receipts on failure

Pitfalls:

- receipt completion must happen after external side effects succeed
- `inbound_state` is internal processing state, not the Attio workflow truth

### Attendance functions

Primary file:

- `fe+convex/convex/attendance.ts`

Responsibilities:

- normalize and dedupe attendance imports
- store attendance rows keyed by `(event_id, email)`
- build dashboard aggregates
- store append-only insight snapshots

Important behavior:

- emails are normalized to lowercase
- repeated attendee rows for the same event are merged
- dashboard summaries are derived dynamically from raw rows

### Invite functions

Primary file:

- `fe+convex/convex/invites.ts`

Responsibilities:

- validate invite codes
- consume invite codes after signup
- create, list, and revoke invites
- seed the first admin invite

Important behavior:

- `requireAdmin()` checks member role in `eboard_members`
- multi-use and single-use invites follow separate consumption rules
- role grants are applied after successful consume when a user session is available

Pitfalls:

- `consume()` uses `safeGetAuthUser()`, so some flows intentionally tolerate the auth session not being immediately visible
- code normalization and email normalization are security-sensitive, not cosmetic

### Member and assignment functions

Primary files:

- `fe+convex/convex/eboard.ts`
- `fe+convex/convex/contactAssignments.ts`

Responsibilities:

- manage internal member records
- bootstrap the first admin
- assign members to Attio contacts by member id or by email resolution
- expose assignment summaries for the inbound workflow

Important behavior:

- `contact_assignments` is the current ownership history table
- email-to-member resolution only uses active members
- deduping is done before assignment responses are returned

### Inbound dashboard functions

Primary file:

- `fe+convex/convex/inboundDashboard.ts`

Responsibilities:

- aggregate inbound reply state by event
- aggregate inbound workload by member

This is query-only reporting logic, not orchestration logic.

### Agent state functions

Primary file:

- `fe+convex/convex/agentState.ts`

Responsibilities:

- list threads
- fetch thread state
- fetch run state
- list pending approvals
- upsert normalized agent records written by Modal

Important behavior:

- all reads are sorted into frontend-friendly order
- `requireThread()` and `requireRun()` centralize lookup rules
- thread activity timestamps are patched separately to maintain correct recency ordering

This file is the backend read model for the `/agent` UI.

## Modal Runtime Endpoints

Primary files:

- `agent/runtime/api.py`
- `agent/runtime/service.py`

Exposed endpoints:

- `GET /agent/threads`
- `POST /agent/threads`
- `GET /agent/threads/{thread_id}`
- `POST /agent/runs`
- `POST /agent/approvals/{approval_id}`

Responsibilities:

- maintain run lifecycle
- manage approval pauses and resumes
- invoke the Anthropic adapter
- sync normalized state into Convex

Important boundary:

- Next.js must not reproduce this logic locally
- Convex stores the normalized state, but Modal decides when runs start, pause, resume, and complete

## Error Handling And Failure Modes

### Edge middleware failures

- typically manifest as unexpected redirects or public-route lockouts

### Auth proxy failures

- usually come from missing `CONVEX_SITE_URL` or related auth configuration

### Modal proxy failures

- collapse to a generic HTTP 500 JSON response
- upstream details are not richly preserved

### Convex mutation failures

- throw explicit runtime errors
- are surfaced either to the frontend or to Modal callers depending on the request path

### Orchestration drift

- occurs when Next route handlers start inventing behavior that should belong to Modal
- the safest pattern is read from Convex, write through Modal, sync back to Convex

## Resource Management Notes

- Next route handlers are thin and mostly stateless.
- `ConvexHttpClient` instances are created per request in the current API routes.
- Modal syncs runtime state back to Convex rather than keeping Convex in the request critical path for every intermediate step.
- Lease-based inbound receipt handling prevents duplicate webhook processing during retries or concurrent deliveries.

## Change Safety Rules

- Do not move orchestration decisions into `middleware.ts` or Next API route handlers.
- Do not bypass Modal for agent writes just because Convex can store the result.
- Do not convert `inbound_state` into the user-visible workflow state.
- Do not weaken invite enforcement by skipping email or expiry normalization.
- Do not add role checks only in the frontend; authorization must remain server-side.

## File Map

| File | Backend role |
|---|---|
| `fe+convex/middleware.ts` | Edge route protection and safe redirect handling |
| `fe+convex/app/api/auth/[...all]/route.ts` | Better Auth proxy into Convex |
| `fe+convex/app/api/agent/_lib/modalProxy.ts` | Shared upstream proxy to Modal agent runtime |
| `fe+convex/app/api/agent/threads/route.ts` | Thread list read from Convex, thread create proxy to Modal |
| `fe+convex/app/api/agent/threads/[threadId]/route.ts` | Thread state read from Convex |
| `fe+convex/app/api/agent/runs/route.ts` | Run start proxy to Modal |
| `fe+convex/app/api/agent/approvals/[approvalId]/route.ts` | Approval decision proxy to Modal |
| `fe+convex/convex/auth.ts` | Better Auth setup and `eboard_members` bootstrap trigger |
| `fe+convex/convex/events.ts` | Event CRUD and sticky milestone mutations |
| `fe+convex/convex/outreach.ts` | Outreach linking, inbound updates, and receipt dedupe |
| `fe+convex/convex/attendance.ts` | Attendance ingestion and dashboard aggregation |
| `fe+convex/convex/invites.ts` | Invite validation, consumption, and admin management |
| `fe+convex/convex/eboard.ts` | Member lookup and role management |
| `fe+convex/convex/contactAssignments.ts` | Contact-owner assignment resolution and upsert logic |
| `fe+convex/convex/inboundDashboard.ts` | Inbound status reporting queries |
| `fe+convex/convex/agentState.ts` | Normalized agent thread/run/message/artifact/approval read model |
| `agent/runtime/api.py` | Canonical Modal HTTP surface for the conversational agent |
| `agent/runtime/service.py` | Run orchestration, approvals, and state sync coordination |

