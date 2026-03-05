-- Eboard members (internal club roster)
create table eboard_members (
  email       text primary key,
  name        text not null,
  role        text,                          -- e.g. "President", "VP Outreach"
  active      boolean default true,
  created_at  timestamptz default now()
);

-- Optional: richer assignment history
create table contact_assignments (
  hubspot_contact_id  text not null,
  member_email        text references eboard_members(email) on delete cascade,
  assigned_at         timestamptz default now(),
  primary key (hubspot_contact_id, member_email)
);

-- Index for fast lookup by member
create index on contact_assignments(member_email);
