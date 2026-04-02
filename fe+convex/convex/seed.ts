import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

// ─────────────────────────────────────────────
// Seed data — run once with:
//   npx convex run seed
//
// Safe to re-run: skips if events already exist.
// To wipe and re-seed:
//   npx convex run seed '{"force":true}'
// ─────────────────────────────────────────────

const SEED_EVENTS = [
  {
    title: "Founder Fireside: Scaling from 0 → 1",
    description:
      "An intimate fireside chat with a YC-backed founder on early-stage growth, hiring your first five, and navigating the fundraising gauntlet.",
    event_date: "2026-04-10",
    event_time: "6:30 PM",
    event_end_time: "8:00 PM",
    location: "Pre-money Conference Room",
    event_type: "speaker_panel",
    target_profile: "Early-stage founders, aspiring entrepreneurs",
    needs_outreach: true,
    status: "completed",
    created_by: "sean@example.com",
    speaker_confirmed: true,
    room_confirmed: true,
  },
  {
    title: "Intro to LLM Agents Workshop",
    description:
      "Hands-on workshop building a simple LLM agent with tool-use. Bring your laptop — we'll go from zero to a working agent in 90 minutes.",
    event_date: "2026-04-17",
    event_time: "5:00 PM",
    event_end_time: "6:30 PM",
    location: "Startup Lab Room 204",
    event_type: "workshop",
    target_profile: "CS students, ML enthusiasts",
    needs_outreach: false,
    status: "completed",
    created_by: "priya@example.com",
    speaker_confirmed: true,
    room_confirmed: true,
  },
  {
    title: "Spring Mixer — Meet the New Cohort",
    description:
      "Casual networking mixer to welcome the spring cohort of club members. Pizza, drinks, and lightning intros.",
    event_date: "2026-04-24",
    event_time: "7:00 PM",
    event_end_time: "9:00 PM",
    location: "Rooftop Lounge, Student Union",
    event_type: "social",
    target_profile: "All members, new and returning",
    needs_outreach: false,
    status: "completed",
    created_by: "sean@example.com",
    speaker_confirmed: false,
    room_confirmed: true,
  },
  {
    title: "VC Panel: What We Actually Look For",
    description:
      "Three early-stage VCs break down what makes a pitch deck stand out, red flags they see, and how to build a relationship before you need money.",
    event_date: "2026-05-01",
    event_time: "6:00 PM",
    event_end_time: "7:30 PM",
    location: "Pre-money Conference Room",
    event_type: "speaker_panel",
    target_profile: "Founders actively fundraising or preparing to",
    needs_outreach: true,
    status: "outreach",
    created_by: "priya@example.com",
    speaker_confirmed: true,
    room_confirmed: false,
  },
  {
    title: "Resume Roast & Career Prep Night",
    description:
      "Bring your resume and get real-time feedback from hiring managers at top startups. Plus a quick workshop on cold-emailing for internships.",
    event_date: "2026-05-08",
    event_time: "5:30 PM",
    event_end_time: "7:00 PM",
    location: "Career Center Room B",
    event_type: "workshop",
    target_profile: "Underclassmen, job seekers",
    needs_outreach: false,
    status: "matching",
    created_by: "sean@example.com",
    speaker_confirmed: false,
    room_confirmed: true,
  },
  {
    title: "Demo Day Watch Party",
    description:
      "Streaming YC Demo Day live on the big screen. Come hang, react in real-time, and discuss which startups you'd bet on.",
    event_date: "2026-05-15",
    event_time: "12:00 PM",
    event_end_time: "3:00 PM",
    location: "Main Auditorium",
    event_type: "social",
    target_profile: "Anyone interested in startups",
    needs_outreach: false,
    status: "draft",
    created_by: "priya@example.com",
    speaker_confirmed: false,
    room_confirmed: false,
  },
  {
    title: "Networking Breakfast: Founders × Engineers",
    description:
      "Early-morning speed networking pairing non-technical founders looking for co-founders with engineers looking for projects.",
    event_date: "2026-05-22",
    event_time: "8:00 AM",
    event_end_time: "9:30 AM",
    location: "Innovation Hub Café",
    event_type: "networking",
    target_profile: "Founders seeking co-founders, engineers seeking projects",
    needs_outreach: true,
    status: "draft",
    created_by: "sean@example.com",
    speaker_confirmed: false,
    room_confirmed: false,
  },
] as const;

// Dummy attendees — we'll spread these across events to make the dashboard interesting.
// Some people attend multiple events (repeat attendees).
const PEOPLE = [
  { email: "alice.zhang@university.edu", name: "Alice Zhang" },
  { email: "bob.martinez@university.edu", name: "Bob Martinez" },
  { email: "carol.nguyen@university.edu", name: "Carol Nguyen" },
  { email: "david.kim@university.edu", name: "David Kim" },
  { email: "emma.patel@university.edu", name: "Emma Patel" },
  { email: "frank.osei@university.edu", name: "Frank Osei" },
  { email: "grace.li@university.edu", name: "Grace Li" },
  { email: "hassan.ali@university.edu", name: "Hassan Ali" },
  { email: "iris.johnson@university.edu", name: "Iris Johnson" },
  { email: "jake.thompson@university.edu", name: "Jake Thompson" },
  { email: "kira.sato@university.edu", name: "Kira Sato" },
  { email: "leo.rivera@university.edu", name: "Leo Rivera" },
  { email: "maya.chen@university.edu", name: "Maya Chen" },
  { email: "nolan.wright@university.edu", name: "Nolan Wright" },
  { email: "olivia.brown@university.edu", name: "Olivia Brown" },
] as const;

// Which people attended which event (by index into SEED_EVENTS / PEOPLE).
// Only completed events (indices 0, 1, 2) get attendance.
// Some people show up at multiple events to generate repeat-attendee data.
const ATTENDANCE_MAP: {
  eventIdx: number;
  personIdx: number;
  source: string;
  minutesAfterStart: number;
}[] = [
  // Event 0 — Founder Fireside (12 attendees)
  { eventIdx: 0, personIdx: 0, source: "manual", minutesAfterStart: 0 },
  { eventIdx: 0, personIdx: 1, source: "manual", minutesAfterStart: 2 },
  { eventIdx: 0, personIdx: 2, source: "csv_import", minutesAfterStart: 5 },
  { eventIdx: 0, personIdx: 3, source: "csv_import", minutesAfterStart: 1 },
  { eventIdx: 0, personIdx: 4, source: "manual", minutesAfterStart: 8 },
  { eventIdx: 0, personIdx: 5, source: "manual", minutesAfterStart: 3 },
  { eventIdx: 0, personIdx: 6, source: "csv_import", minutesAfterStart: 10 },
  { eventIdx: 0, personIdx: 7, source: "manual", minutesAfterStart: 0 },
  { eventIdx: 0, personIdx: 8, source: "manual", minutesAfterStart: 6 },
  { eventIdx: 0, personIdx: 9, source: "csv_import", minutesAfterStart: 12 },
  { eventIdx: 0, personIdx: 10, source: "manual", minutesAfterStart: 4 },
  { eventIdx: 0, personIdx: 11, source: "manual", minutesAfterStart: 7 },

  // Event 1 — LLM Agents Workshop (9 attendees)
  { eventIdx: 1, personIdx: 0, source: "manual", minutesAfterStart: 0 },
  { eventIdx: 1, personIdx: 2, source: "manual", minutesAfterStart: 3 },
  { eventIdx: 1, personIdx: 3, source: "csv_import", minutesAfterStart: 1 },
  { eventIdx: 1, personIdx: 6, source: "manual", minutesAfterStart: 5 },
  { eventIdx: 1, personIdx: 7, source: "manual", minutesAfterStart: 2 },
  { eventIdx: 1, personIdx: 10, source: "csv_import", minutesAfterStart: 0 },
  { eventIdx: 1, personIdx: 12, source: "manual", minutesAfterStart: 8 },
  { eventIdx: 1, personIdx: 13, source: "manual", minutesAfterStart: 4 },
  { eventIdx: 1, personIdx: 14, source: "csv_import", minutesAfterStart: 6 },

  // Event 2 — Spring Mixer (14 attendees — biggest turnout)
  { eventIdx: 2, personIdx: 0, source: "manual", minutesAfterStart: 0 },
  { eventIdx: 2, personIdx: 1, source: "manual", minutesAfterStart: 5 },
  { eventIdx: 2, personIdx: 2, source: "manual", minutesAfterStart: 2 },
  { eventIdx: 2, personIdx: 3, source: "manual", minutesAfterStart: 1 },
  { eventIdx: 2, personIdx: 4, source: "csv_import", minutesAfterStart: 10 },
  { eventIdx: 2, personIdx: 5, source: "manual", minutesAfterStart: 3 },
  { eventIdx: 2, personIdx: 6, source: "manual", minutesAfterStart: 7 },
  { eventIdx: 2, personIdx: 7, source: "csv_import", minutesAfterStart: 0 },
  { eventIdx: 2, personIdx: 8, source: "manual", minutesAfterStart: 4 },
  { eventIdx: 2, personIdx: 9, source: "manual", minutesAfterStart: 6 },
  { eventIdx: 2, personIdx: 11, source: "csv_import", minutesAfterStart: 8 },
  { eventIdx: 2, personIdx: 12, source: "manual", minutesAfterStart: 12 },
  { eventIdx: 2, personIdx: 13, source: "manual", minutesAfterStart: 9 },
  { eventIdx: 2, personIdx: 14, source: "manual", minutesAfterStart: 15 },
];

/** Convert "2026-04-10" + "6:30 PM" → epoch ms */
function toEpoch(dateStr: string, timeStr: string): number {
  // Parse "6:30 PM" → 24h
  const match = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return new Date(dateStr).getTime();
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const ampm = match[3].toUpperCase();
  if (ampm === "PM" && hours !== 12) hours += 12;
  if (ampm === "AM" && hours === 12) hours = 0;
  return new Date(`${dateStr}T${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00`).getTime();
}

export default internalMutation({
  args: {
    force: v.optional(v.boolean()),
  },
  handler: async (ctx, { force }) => {
    // Guard: skip if events already exist (unless force=true)
    const existing = await ctx.db.query("events").first();
    if (existing && !force) {
      console.log(
        "⏭️  Seed skipped — events table already has data. " +
        "Run with { force: true } to wipe and re-seed."
      );
      return { skipped: true };
    }

    // ── 0. Wipe seeded tables if forcing ──────────────
    if (force) {
      console.log("🗑️  Force flag set — clearing events, attendance, and attendance_insights...");
      for (const row of await ctx.db.query("attendance").collect()) {
        await ctx.db.delete(row._id);
      }
      for (const row of await ctx.db.query("attendance_insights").collect()) {
        await ctx.db.delete(row._id);
      }
      for (const row of await ctx.db.query("events").collect()) {
        await ctx.db.delete(row._id);
      }
      console.log("🗑️  Tables cleared.");
    }

    const now = Date.now();

    // ── 1. Insert events ──────────────────────────────
    const eventIds: string[] = [];
    for (const evt of SEED_EVENTS) {
      const id = await ctx.db.insert("events", {
        title: evt.title,
        description: evt.description,
        event_date: evt.event_date,
        event_time: evt.event_time,
        event_end_time: evt.event_end_time,
        location: evt.location,
        event_type: evt.event_type,
        target_profile: evt.target_profile,
        needs_outreach: evt.needs_outreach,
        status: evt.status,
        created_by: evt.created_by,
        speaker_confirmed: evt.speaker_confirmed,
        room_confirmed: evt.room_confirmed,
        created_at: now - (SEED_EVENTS.length - SEED_EVENTS.indexOf(evt)) * 7 * 24 * 60 * 60 * 1000,
      });
      eventIds.push(id);
    }
    console.log(`✅  Inserted ${eventIds.length} events`);

    // ── 2. Insert attendance rows ─────────────────────
    let attendanceCount = 0;
    for (const row of ATTENDANCE_MAP) {
      const eventId = eventIds[row.eventIdx];
      const evt = SEED_EVENTS[row.eventIdx];
      const person = PEOPLE[row.personIdx];
      const baseTime = toEpoch(evt.event_date, evt.event_time);

      await ctx.db.insert("attendance", {
        event_id: eventId as any,  // eslint-disable-line @typescript-eslint/no-explicit-any
        email: person.email,
        name: person.name,
        checked_in_at: baseTime + row.minutesAfterStart * 60 * 1000,
        source: row.source,
      });
      attendanceCount++;
    }
    console.log(`✅  Inserted ${attendanceCount} attendance rows`);

    // ── 3. Insert a sample attendance insight ─────────
    await ctx.db.insert("attendance_insights", {
      generated_at: now,
      insight_text:
        "The Spring Mixer had the highest turnout (14 attendees), suggesting social events drive the most engagement. " +
        "Alice Zhang, Carol Nguyen, David Kim, Grace Li, and Hassan Ali attended all three completed events — " +
        "these repeat attendees are strong candidates for leadership roles or ambassador programs. " +
        "CSV imports account for ~30% of check-ins; consider streamlining the manual check-in flow.",
      data_snapshot: JSON.stringify({
        events_tracked: 3,
        unique_attendees: 15,
        total_check_ins: attendanceCount,
        top_event: "Spring Mixer — Meet the New Cohort",
        repeat_attendee_count: 8,
      }),
      event_count: 3,
      attendee_count: 15,
    });
    console.log("✅  Inserted 1 attendance insight");

    return {
      skipped: false,
      events_inserted: eventIds.length,
      attendance_rows_inserted: attendanceCount,
      insights_inserted: 1,
    };
  },
});


