-- Events created by eboard members
create table events (
  id              uuid primary key default gen_random_uuid(),
  title           text not null,
  description     text,
  event_date      date not null,
  event_time      time,
  event_end_time  time,
  location        text,
  event_type      text,           -- speaker_panel | workshop | networking | social
  target_profile  text,           -- free-text: "fintech founders", "ML researchers", etc.
  needs_outreach  boolean default true,   -- false for inbound (company already confirmed)
  status          text default 'draft',   -- draft | matching | outreach | completed
  created_by      text references eboard_members(email),
  created_at      timestamptz default now()
);

-- Track which contacts were suggested/approved/reached for each event
create table event_outreach (
  event_id            uuid references events(id) on delete cascade,
  hubspot_contact_id  text not null,
  suggested           boolean default true,
  approved            boolean default false,
  outreach_sent       boolean default false,
  response            text,                  -- accepted | declined | no_reply | pending
  agentmail_thread_id text,
  created_at          timestamptz default now(),
  primary key (event_id, hubspot_contact_id)
);

create index on event_outreach(event_id);
create index on event_outreach(agentmail_thread_id);
