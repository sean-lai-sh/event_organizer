# HubSpot CRM Contact Data Model — Student Club

## Architecture

```
┌─────────────────────────────┐      ┌──────────────────────────────┐
│         HUBSPOT             │      │          SUPABASE             │
│  (external contact store)   │      │   (internal club data)        │
│                             │      │                               │
│  Contact                    │      │  eboard_members               │
│  ├─ firstname, lastname     │      │  ├─ email (PK)                │
│  ├─ email                   │      │  ├─ name                      │
│  ├─ career_profile (JSON)   │      │  ├─ role                      │
│  ├─ assigned_members ───────┼──────► └─ active                    │
│  │   (array of emails)      │      │                               │
│  ├─ contact_source          │      │  contact_assignments (opt)    │
│  ├─ relationship_stage      │      │  ├─ hubspot_contact_id        │
│  ├─ outreach_status         │      │  ├─ member_email (FK)         │
│  ├─ human_notes             │      │  └─ assigned_at               │
│  └─ agent_notes             │      └──────────────────────────────┘
└─────────────────────────────┘
```

**HubSpot** = external contact datastore. Agents drive cold outreach here.
**Supabase** = internal club data (eboard members). Humans handle warm intros here.

---

## HubSpot Custom Properties (group: `club_contact`)

### Standard fields kept
- `firstname`, `lastname`, `email`, `phone`
- Native `company`, `jobtitle`, `lifecyclestage` are not used — replaced by custom fields.

### Custom properties

| Name | Label | Type | Notes |
|---|---|---|---|
| `career_profile` | Career Profile | `textarea` | JSON string (see schema below) |
| `relationship_stage` | Relationship Stage | `enumeration` | cold → active → spoken → persistent |
| `contact_source` | Contact Source | `enumeration` | warm_intro, agent_outreach, inbound, event |
| `warm_intro_by` | Warm Intro By | `string` | Name/email of introducer |
| `assigned_members` | Assigned Members | `textarea` | JSON array of eboard emails |
| `contact_type` | Contact Type | `enumeration` | prospect, alumni, speaker, mentor, partner |
| `outreach_status` | Outreach Status | `enumeration` | pending → agent_active → human_assigned → in_conversation → converted/paused/archived |
| `human_notes` | Human Notes | `textarea` | Free-form notes from eboard |
| `agent_notes` | Agent Notes | `textarea` | AI agent notes |
| `last_agent_action_at` | Last Agent Action | `datetime` | Timestamp of last agent action |
| `enrichment_status` | Enrichment Status | `enumeration` | pending, enriched, stale, failed |

### `career_profile` JSON schema
```json
{
  "experience": [
    { "company": "Stripe", "title": "SWE Intern", "start": "2024-06", "end": "2024-08", "current": false }
  ],
  "education": [
    { "school": "MIT", "degree": "BS CS", "grad_year": 2025, "current": true }
  ],
  "skills": ["Python", "ML"],
  "interests": ["fintech"],
  "linkedin_url": "https://linkedin.com/in/..."
}
```

---

## Supabase Schema

```sql
-- Eboard members (internal club roster)
create table eboard_members (
  email       text primary key,
  name        text not null,
  role        text,
  active      boolean default true,
  created_at  timestamptz default now()
);

-- Assignment history
create table contact_assignments (
  hubspot_contact_id  text not null,
  member_email        text references eboard_members(email) on delete cascade,
  assigned_at         timestamptz default now(),
  primary key (hubspot_contact_id, member_email)
);

create index on contact_assignments(member_email);
```

---

## File Structure

```
backend/
├── scripts/
│   └── bootstrap_hubspot.py     # one-time setup: flush + create HubSpot properties
├── models/
│   └── contact.py               # Pydantic: CareerProfile, HubSpotContact
├── hubspot/
│   └── client.py                # async httpx wrapper for HubSpot CRM API
├── supabase/
│   └── migrations/
│       └── 001_eboard.sql       # Supabase schema
└── .env                         # HUBSPOT_ACCESS_TOKEN=...
```

---

## Setup

### 1. Add dependencies
```toml
# pyproject.toml
dependencies = [
  "httpx>=0.27",
  "pydantic>=2.0",
  "python-dotenv",
]
```

### 2. Configure env
```bash
# backend/.env
HUBSPOT_ACCESS_TOKEN=your_private_app_token
```

Private App requires scope: `crm.schemas.contacts.write`

### 3. Bootstrap HubSpot properties
```bash
cd event_organizer
python backend/scripts/bootstrap_hubspot.py
```

### 4. Apply Supabase migration
```bash
supabase db push  # or paste 001_eboard.sql into the SQL editor
```

---

## Agent Routing Query

Cold leads available for agent outreach:
```
outreach_status = "pending" AND contact_source != "warm_intro"
```

Warm intros awaiting human follow-up:
```
contact_source = "warm_intro" AND outreach_status = "pending"
```
