# Systems Architecture

High-level documentation of how the EventClub backend works — from frontend queries through Convex to the AI agent layer.

---

## Table of Contents

1. [Overall System Map](#1-overall-system-map)
2. [Frontend → Convex Communication](#2-frontend--convex-communication)
3. [Authentication Flow](#3-authentication-flow)
4. [Convex Database & Functions](#4-convex-database--functions)
5. [AI Agent System](#5-ai-agent-system)
6. [Inbound Email Processing](#6-inbound-email-processing)

---

## 1. Overall System Map

High-level view of every service and how they connect.

```
┌────────────────────────────────────────────────────────────────────┐
│                         BROWSER / CLIENT                           │
│   Next.js 16 App (fe+convex/)                                      │
│   ┌─────────────┐  ┌──────────────┐  ┌──────────────────────────┐ │
│   │ Landing     │  │ /login       │  │ /dashboard               │ │
│   │ page.tsx    │  │ /signup      │  │ events / speakers / comms│ │
│   └─────────────┘  └──────┬───────┘  └────────────┬─────────────┘ │
│                           │ Better Auth             │ useQuery /   │
│                           │ signIn/signUp           │ useMutation  │
└───────────────────────────┼─────────────────────────┼─────────────┘
                            │                         │
                ┌───────────▼─────────────────────────▼──────────────┐
                │                 CONVEX CLOUD                        │
                │         (exuberant-warbler-9.convex.cloud)          │
                │                                                     │
                │  ┌──────────────┐   ┌──────────────────────────┐   │
                │  │ HTTP Router  │   │  Query / Mutation API    │   │
                │  │ (http.ts)    │   │  events, outreach,       │   │
                │  │              │   │  eboard, assignments,    │   │
                │  │ Better Auth  │   │  inboundDashboard        │   │
                │  │ routes       │   │                          │   │
                │  └──────┬───────┘   └──────────┬───────────────┘   │
                │         │                      │                   │
                │         └────────┬─────────────┘                   │
                │                  ▼                                  │
                │         ┌────────────────┐                         │
                │         │  Convex DB     │                         │
                │         │  events        │                         │
                │         │  event_outreach│                         │
                │         │  eboard_members│                         │
                │         │  contact_asgn  │                         │
                │         │  inbnd_receipts│                         │
                │         │  _ba_* (auth)  │                         │
                │         └────────────────┘                         │
                └───────────────────────────────────────────────────-┘
                                     ▲   ▲
                          writes     │   │   reads
                                     │   │
                ┌────────────────────┘   └────────────────────────┐
                │                                                  │
    ┌───────────▼─────────────────┐          ┌────────────────────▼────┐
    │   Python Agent Backend      │          │   External Services      │
    │   (agent/)                  │          │                          │
    │   ┌────────────────────┐    │          │  ┌────────────────────┐  │
    │   │ Claude (Anthropic) │    │          │  │   Attio CRM        │  │
    │   │ via fastmcp tools  │    │          │  │   api.attio.com/v2 │  │
    │   └────────────────────┘    │          │  │   contact records  │  │
    │   ┌────────────────────┐    │◄────────►│  └────────────────────┘  │
    │   │ AgentMail          │    │          │  ┌────────────────────┐  │
    │   │ email threads      │    │          │  │   AgentMail        │  │
    │   └────────────────────┘    │          │  │   inbound webhooks │  │
    │   ┌────────────────────┐    │          │  │   email sending    │  │
    │   │ Modal (deployment) │    │          │  └────────────────────┘  │
    │   └────────────────────┘    │          └──────────────────────────┘
    └─────────────────────────────┘
```

**Notes:**
- The frontend is a Next.js app running in the browser, talking to Convex via the Convex React client over WebSocket
- The Python agent backend runs separately (Modal for serverless deployment) and talks to Convex via HTTP API using a deploy key
- Both the frontend and the agent backend share the same Convex database — Convex is the single source of truth
- Attio CRM is the contact database; `attio_record_id` is the join key between Attio and Convex
- AgentMail handles email thread lifecycle; `agentmail_thread_id` links email threads to outreach rows in Convex

---

## 2. Frontend → Convex Communication

How the Next.js frontend talks to Convex for data access.

```
Browser (Next.js)
        │
        │  1. App loads — ConvexProvider initialized
        │     NEXT_PUBLIC_CONVEX_URL points to Convex deployment
        │
        ▼
┌──────────────────────────────────────────────┐
│ app/providers.tsx                            │
│                                              │
│  ConvexBetterAuthProvider                    │
│    ├── client = ConvexReactClient(URL)       │
│    └── authClient = createAuthClient()       │
└──────────────────────────────────────────────┘
        │
        │  2. Dashboard components mount
        │
        ▼
┌──────────────────────────────────────────────┐
│ Dashboard Pages                              │
│                                              │
│  const data = useQuery(                      │
│    api.events.listEvents, { status }         │   ──[WebSocket]──►  Convex
│  )                                           │
│                                              │
│  const mutate = useMutation(                 │
│    api.outreach.updateOutreach               │   ──[WebSocket]──►  Convex
│  )                                           │
└──────────────────────────────────────────────┘
        │
        │  3. middleware.ts guards all /dashboard/* routes
        │     Checks session cookie via getSessionCookie()
        │     Redirects to /login?redirect=... if no session
        │
        ▼
┌──────────────────────────────────────────────┐
│ middleware.ts                                │
│                                              │
│  matcher: all routes except:                 │
│    /api/auth/**  (Better Auth endpoints)     │
│    /login        (login page)                │
│    /signup       (signup page)               │
│    /_next/**     (Next.js assets)            │
└──────────────────────────────────────────────┘
```

**Key files:**
- `app/providers.tsx` — wraps the app with `ConvexBetterAuthProvider`
- `middleware.ts` — enforces session on all dashboard routes
- `lib/auth-client.ts` — creates the Better Auth client used in session checks

**Transport:** Convex uses a persistent WebSocket connection. `useQuery` results are automatically reactive — any write to Convex triggers re-renders in all subscribed clients.

---

## 3. Authentication Flow

Email/password auth via Better Auth with the Convex adapter.

```
                        SIGNUP FLOW
                        ──────────
Browser                  Next.js API              Convex
   │                         │                      │
   │  POST /api/auth/sign-up  │                      │
   │─────────────────────────►│                      │
   │  { name, email, password}│                      │
   │                         │  createUser()         │
   │                         │─────────────────────► │
   │                         │                       │  INSERT _ba_users
   │                         │                       │  INSERT _ba_accounts
   │                         │                       │
   │                         │                       │  auth.onCreate trigger fires
   │                         │                       │  → INSERT eboard_members
   │                         │                       │    { userId, active: true }
   │                         │◄──────────────────────│
   │◄─────────────────────────│
   │  session cookie set      │
   │                          │

                        LOGIN FLOW
                        ──────────
Browser                  Next.js API              Convex
   │                         │                      │
   │  POST /api/auth/sign-in  │                      │
   │─────────────────────────►│                      │
   │  { email, password }     │                      │
   │                         │  verifyPassword()     │
   │                         │─────────────────────► │
   │                         │                       │  lookup _ba_users
   │                         │                       │  verify hash
   │                         │                       │  INSERT _ba_sessions
   │                         │◄──────────────────────│
   │◄─────────────────────────│
   │  session cookie set      │
   │                          │

                  MIDDLEWARE SESSION CHECK (every request)
                  ─────────────────────────────────────────
Browser                  middleware.ts
   │                         │
   │  GET /dashboard/events  │
   │─────────────────────────►│
   │                         │  getSessionCookie(request)
   │                         │  → cookie present? → pass through
   │                         │  → no cookie?      → redirect /login
   │◄─────────────────────────│
```

**Key files:**
- `convex/auth.ts` — Better Auth setup with Convex adapter + `onCreate` hook that auto-creates `eboard_members`
- `convex/http.ts` — HTTP router that registers Better Auth routes onto Convex's HTTP layer
- `app/api/auth/[...all]/route.ts` — Next.js catch-all that proxies auth requests to Convex
- `lib/auth-client.ts` — Browser-side Better Auth client (`signIn`, `signUp`, `signOut`, `useSession`)

**Session storage:** Sessions live in Convex's `_ba_sessions` table. The cookie is a signed opaque token validated server-side.

---

## 4. Convex Database & Functions

The schema and what each module does.

```
┌─────────────────────────────────────────────────────────────────────┐
│                        CONVEX SCHEMA                                │
│                                                                     │
│  events                          event_outreach                     │
│  ─────────────────────           ──────────────────────────────     │
│  _id (Id<"events">)              _id                                │
│  title          string           event_id → events._id              │
│  status         string           attio_record_id  string            │
│  event_type     string?          suggested        bool              │
│  event_date     string?          approved         bool              │
│  needs_outreach bool             outreach_sent    bool              │
│  speaker_confirmed bool?         response         string?           │
│  room_confirmed    bool?         agentmail_thread_id string?        │
│  created_at     number           inbound_state    string?           │
│                                  inbound_count    number?           │
│                                  last_classification string?        │
│                                  created_at       number            │
│                                                                     │
│  eboard_members                  contact_assignments                │
│  ──────────────────              ───────────────────────────        │
│  userId  string (BA ref)         attio_record_id  string            │
│  role    string?                 memberId → eboard_members._id      │
│  active  bool                    assigned_at      number            │
│  created_at number                                                  │
│                                                                     │
│  inbound_receipts                                                   │
│  ─────────────────                                                  │
│  message_id  string  ◄── dedup key for inbound emails               │
│  thread_id   string?                                                │
│  received_at number                                                 │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                      CONVEX FUNCTIONS                               │
│                                                                     │
│  convex/events.ts                                                   │
│  ├── listEvents(status?)           query                            │
│  ├── getEvent(event_id)            query                            │
│  ├── createEvent(...)              mutation                         │
│  ├── updateEventStatus(id,status)  mutation                         │
│  └── applyInboundMilestones(...)   mutation  ← sticky true-only     │
│                                                                     │
│  convex/outreach.ts                                                 │
│  ├── insertOutreachRows(rows)      mutation  ← called by agent      │
│  ├── getOutreachForEvent(id,appr)  query                            │
│  ├── updateOutreach(id, attio, {}) mutation                         │
│  ├── applyInboundUpdate(...)       mutation  ← called by agent      │
│  ├── upsertOutreachLink(...)       mutation  ← idempotent link      │
│  ├── recordInboundReceipt(msg_id)  mutation  ← dedup check          │
│  └── findByThread(thread_id)       query                            │
│                                                                     │
│  convex/contactAssignments.ts                                       │
│  ├── resolveAssigneesByRecord(rid) query                            │
│  ├── upsertAssignmentsByMemberIds  mutation                         │
│  └── upsertAssignmentsByEmails     mutation                         │
│                                                                     │
│  convex/inboundDashboard.ts                                         │
│  ├── getEventInboundStatus(id?)    query  ← dashboard summary       │
│  └── getMemberInboundSummary()     query  ← per-member workload     │
│                                                                     │
│  convex/eboard.ts                                                   │
│  ├── getByUserId(userId)           query                            │
│  ├── listActive()                  query                            │
│  └── upsertMember(userId, ...)     mutation                         │
└─────────────────────────────────────────────────────────────────────┘
```

**Key design decisions:**
- `speaker_confirmed` and `room_confirmed` are **sticky** — `applyInboundMilestones` only allows them to flip to `true`, never back to `false`. Prevents inbound processing from accidentally clearing confirmed milestones.
- `inbound_receipts` provides **deduplication** — agents check `recordInboundReceipt` first; if `is_duplicate: true`, they skip processing.
- Indexes on `event_outreach` enable fast lookups by event, by thread, by attio record, and by (event + attio) compound key.

---

## 5. AI Agent System

The Python agent backend: how Claude reasons and calls tools to manage speaker outreach.

```
┌──────────────────────────────────────────────────────────────────┐
│                    PYTHON AGENT BACKEND                           │
│                    (agent/ — runs on Modal)                       │
│                                                                   │
│  ┌───────────────────────────────────────────────────────────┐   │
│  │  Claude (claude-sonnet / claude-opus via Anthropic SDK)   │   │
│  │  Orchestrated via fastmcp tool calling                    │   │
│  └───────────────────────────────────────────────────────────┘   │
│          │                                                        │
│          │  calls tools                                           │
│          ▼                                                        │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │  MCP Tool Layer (fastmcp)                                │    │
│  │                                                          │    │
│  │  Attio Tools (people + speakers)  Convex Tools          │    │
│  │  ┌───────────────────────────┐  ┌─────────────────────┐  │    │
│  │  │ search_people             │  │ list_events         │  │    │
│  │  │ get_person                │  │ get_event           │  │    │
│  │  │ upsert_person             │  │ create_event        │  │    │
│  │  │ append_person_note        │  │ update_event_safe   │  │    │
│  │  │ search_speakers           │  └─────────────────────┘  │    │
│  │  │ get_speaker               │                            │    │
│  │  │ ensure_speaker_for_person │  OnceHub Tools             │    │
│  │  │ update_speaker_workflow   │  ┌─────────────────────┐  │    │
│  │  └───────────────────────────┘  │ find_oncehub_slots  │  │    │
│  │                                  │ book_oncehub_room   │  │    │
│  │                                  └─────────────────────┘  │    │
│  └──────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────┘
          │                    │                     │
          ▼                    ▼                     ▼
  ┌──────────────┐   ┌──────────────────┐   ┌──────────────────┐
  │  Attio CRM   │   │  Convex Database │   │   AgentMail      │
  │  api.attio   │   │  (write-back)    │   │  (email threads) │
  │  .com/v2     │   │                  │   │                  │
  └──────────────┘   └──────────────────┘   └──────────────────┘
```

**Agent workflow — Speaker Matching:**

```
1. Eboard creates event in Convex (status: "draft")
   │
2. Agent triggered (manually or scheduled)
   │
3. Agent reads event details from Convex
   │
4. Agent calls Attio search_speakers / search_people to find candidates
   │
5. Agent ranks & selects candidates
   │
6. Agent calls Convex create_event / update_event_safe (approval-gated) as needed
   │  and writes outreach rows for suggested speakers
   │
7. Eboard reviews suggestions in dashboard via agent approval flow
   │
8. For approved rows: agent contacts speakers
   │  - updates Attio speakers.status and active_event_id
   │  - appends audit note to parent Attio people record
   │
9. Convex event status progresses through agent run lifecycle
```

**Key files:**
- `agent/core/clients/attio.py` — async httpx wrapper for Attio API v2 (people + speakers)
- `agent/helper/attio.py` — higher-level Attio helpers used by MCP tools
- `agent/helper/tools.py` — shared Attio and Convex tool helpers
- `agent/apps/mcp/service.py` — FastMCP implementation with all registered tools
- `agent/apps/mcp/server.py` — stdio launcher started by the Anthropic Agent SDK
- `agent/pyproject.toml` — dependencies: `fastmcp`, `anthropic`, `modal`, `httpx`, `convex`

---

## 6. Inbound Email Processing

How the agent processes replies from speakers back into Convex.

```
Speaker replies to outreach email
        │
        ▼
┌─────────────────────┐
│   AgentMail         │
│   receives email    │
│   in inbox          │
└──────────┬──────────┘
           │
           │  webhook / polling
           ▼
┌─────────────────────────────────────────────────────────┐
│  Python Agent (inbound handler)                         │
│                                                         │
│  1. recordInboundReceipt(message_id)                    │
│     → if is_duplicate: true → STOP (idempotent)         │
│                                                         │
│  2. findByThread(thread_id)                             │
│     → lookup event_outreach row in Convex               │
│                                                         │
│  3. Claude classifies the reply:                        │
│     "accepted" | "declined" | "more_info" |             │
│     "scheduling" | "not_relevant"                       │
│                                                         │
│  4. applyInboundUpdate(event_id, attio_record_id, {     │
│       classification,                                   │
│       response: "accepted" | "declined",                │
│       inbound_state: "needs_review",                    │
│       sender_email, received_at                         │
│     })                                                  │
│                                                         │
│  5. If "accepted" → applyInboundMilestones(             │
│       event_id, speaker_confirmed: true                 │  ← sticky
│     )                                                   │
│                                                         │
│  6. Update Attio contact:                               │
│     update_contact(attio_record_id, {                   │
│       outreach_status: "in_conversation",               │
│       last_agent_action_at: now                         │
│     })                                                  │
└─────────────────────────────────────────────────────────┘
           │
           ▼
  ┌────────────────────────────────────┐
  │  Dashboard (Eboard views)          │
  │                                    │
  │  getEventInboundStatus() →         │
  │    shows thread status, response,  │
  │    inbound_count, last_class.      │
  │                                    │
  │  getMemberInboundSummary() →       │
  │    per-member workload view        │
  └────────────────────────────────────┘
```

**Inbound state machine for each outreach thread:**

```
    [outreach sent]
          │
          ▼
   ┌─────────────┐    inbound arrives    ┌──────────────────┐
   │ needs_review│──────────────────────►│ needs_review     │
   │ (initial)   │                       │ (agent updated,  │
   └─────────────┘                       │  awaits eboard)  │
          │                              └────────┬─────────┘
          │ eboard responds                       │ eboard responds
          ▼                                       ▼
   ┌──────────────────────┐             ┌──────────────────────┐
   │ awaiting_member_reply│             │ awaiting_member_reply│
   │ (eboard replied,     │             └──────────┬───────────┘
   │  waiting for speaker)│                        │ speaker replies
   └──────────────────────┘                        ▼
                                        ┌──────────────────────┐
                                        │     resolved         │
                                        │ (thread closed)      │
                                        └──────────────────────┘
```

---

## Environment Variables

| Variable | Where | Purpose |
|---|---|---|
| `NEXT_PUBLIC_CONVEX_URL` | Doppler (`fe+convex`) | Convex WebSocket endpoint for browser |
| `CONVEX_DEPLOYMENT` | Doppler (`fe+convex`) | Deployment identifier |
| `NEXT_PUBLIC_CONVEX_SITE_URL` | Doppler (`fe+convex`) | Convex HTTP endpoint |
| `BETTER_AUTH_SECRET` | Doppler (`fe+convex`) | Signs session tokens |
| `CONVEX_URL` | Doppler (`agent/`) | Convex HTTP API for agent write-back |
| `CONVEX_DEPLOY_KEY` | Doppler (`agent/`) | Auth key for server-side Convex calls |
| `ATTIO_API_KEY` | Doppler (`agent/`) | Attio CRM API token |
| `ANTHROPIC_API_KEY` | Doppler (`agent/`) | Claude API key |
| `AGENTMAIL_API_KEY` | Doppler (`agent/`) | AgentMail token |
| `AGENTMAIL_INBOX_ID` | Doppler (`agent/`) | Which inbox the agent uses |
