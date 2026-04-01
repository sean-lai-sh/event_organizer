# /dashboard/data — Implementation Plan

Attendance analytics, attendee profiles with interest prediction, and an AI insight card.

---

## What We're Building

A new `/dashboard/data` page with four zones:

1. **KPI row** — events tracked, unique attendees, avg attendance, top event
2. **Main grid** — attendance-over-time line chart (left) + AI insight card (right)
3. **Attendee profile table** — email, event types, streak, active/lapsed status, interest prediction for 4+ event attendees
4. **CSV import flow** — per-event bulk import via dialog

Architecture: Python agent (Modal) writes AI insights to Convex → frontend reads reactively via `useQuery`.

---

## Files Changed / Created

| File | Action | Purpose |
|------|--------|---------|
| `fe+convex/convex/schema.ts` | Edit | Add `attendance` + `attendance_insights` tables |
| `fe+convex/convex/attendance.ts` | New | All queries + mutations for attendance data |
| `fe+convex/app/dashboard/layout.tsx` | Edit | Add "Data" nav link (BarChart3 icon) |
| `fe+convex/app/dashboard/data/page.tsx` | New | Main data page |
| `fe+convex/app/dashboard/agent/page.tsx` | New | Stub page for future agent chat |
| `fe+convex/components/dashboard/AttendanceTrendChart.tsx` | New | recharts line chart |
| `fe+convex/components/dashboard/AttendeeProfileList.tsx` | New | Profile table with interest prediction |
| `fe+convex/components/dashboard/InsightCard.tsx` | New | AI insight display + "Chat about this →" |
| `fe+convex/components/dashboard/AttendanceImport.tsx` | New | CSV import dialog |
| `agent/insights.py` | New | Modal function — generates Claude insights, writes to Convex |
| `agent/helper/tools.py` | Edit | Add attendance methods to ConvexClient |

---

## Step 1 — Schema (`fe+convex/convex/schema.ts`)

Add to `defineSchema`:

```ts
attendance: defineTable({
  event_id: v.id("events"),
  email: v.string(),
  name: v.optional(v.string()),
  checked_in_at: v.number(),          // Date.now()
  source: v.optional(v.string()),      // "manual" | "csv_import"
})
  .index("by_event", ["event_id"])
  .index("by_email", ["email"])
  .index("by_event_email", ["event_id", "email"]),

attendance_insights: defineTable({
  generated_at: v.number(),
  insight_text: v.string(),            // 2-3 sentences from Claude
  data_snapshot: v.optional(v.string()), // JSON of context fed to Claude
  event_count: v.number(),
  attendee_count: v.number(),
}),
```

No materialized `attendee_profiles` — profiles are computed at query time from `attendance` + `events`.

After editing: `npx convex dev` to push schema.

---

## Step 2 — Convex Functions (`fe+convex/convex/attendance.ts`)

### Mutations

**`recordAttendance`**
```ts
// Args: { event_id, email, name?, source? }
// Deduplicates on (event_id, email). If duplicate, returns silently (idempotent).
```

**`importAttendanceBatch`**
```ts
// Args: { event_id, rows: Array<{ email: string; name?: string }> }
// Returns: { imported: number; duplicates: number }
```

**`saveInsight`**
```ts
// Args: { insight_text, data_snapshot?, event_count, attendee_count }
// Called by Python agent. Inserts a new row.
```

### Queries

**`getAttendanceTrends`**
```ts
// Returns: Array<{ event_id, title, event_date, event_type, attendee_count }>
// Sorted by event_date ascending. Joins attendance with events.
// Powers the line chart.
```

**`getAttendeeProfiles`**
```ts
// Args: { min_events?: number }
// Returns per-email aggregation joined with events for type/date context:
{
  email: string,
  name: string | null,
  events_attended: number,
  first_seen: string,        // event_date (YYYY-MM-DD)
  last_seen: string,
  event_types: string[],     // unique types attended
  streak: number,            // consecutive most-recent events
  is_active: boolean,        // attended >= 1 of last 3 events by date
  interest_prediction: {     // null if events_attended < 4
    primary_type: string,
    type_distribution: Record<string, number>,
    confidence: "low" | "medium" | "high",
  } | null,
}
```

**Interest prediction algorithm (deterministic, no AI):**
- Only for `events_attended >= 4`
- `type_distribution`: count per event_type
- `primary_type`: highest count
- `confidence`: high if primary >= 60% of total, medium if >= 40%, low otherwise

**Streak algorithm:**
- Get all events sorted by date descending
- Walk from most recent; streak breaks on first miss by this attendee

**`getAttendanceStats`**
```ts
// Returns:
{
  total_events_tracked: number,   // events with >= 1 attendance record
  total_unique_attendees: number,
  avg_attendance: number,         // rounded integer
  top_event: { title: string; count: number } | null,
}
```

**`getLatestInsight`**
```ts
// Returns most recent attendance_insights row, or null.
```

---

## Step 3 — Install recharts

```sh
cd fe+convex && bun add recharts
```

Monochrome-friendly via direct `stroke`/`fill` props, pure React (no canvas), `ResponsiveContainer` handles layout.

---

## Step 4 — Nav Link (`fe+convex/app/dashboard/layout.tsx`)

Add after Communications, before Invites:
```ts
import { BarChart3 } from "lucide-react";

// In navLinks array:
{ href: "/dashboard/data", label: "Data", icon: BarChart3 }
```

---

## Step 5 — Page (`fe+convex/app/dashboard/data/page.tsx`)

```tsx
"use client";

// Four data fetches (all parallel, reactive):
const trends = useQuery(api.attendance.getAttendanceTrends);
const profiles = useQuery(api.attendance.getAttendeeProfiles, {});
const stats = useQuery(api.attendance.getAttendanceStats);
const insight = useQuery(api.attendance.getLatestInsight);
```

**Layout:**
```
DashboardPageShell title="Data" action={<ImportButton />}
  ├── KPI row (grid-cols-2 xl:grid-cols-4)
  │     total events | unique attendees | avg attendance | top event
  ├── Main grid (xl:grid-cols-[1fr_340px])
  │     AttendanceTrendChart      InsightCard
  └── AttendeeProfileList (full width)
```

**KPI card styling** — match dashboard home exactly:
```tsx
<div className="flex flex-col gap-2 rounded-[18px] border border-[#e8e8e8] bg-[#f4f4f4] p-4">
  <span className="font-[var(--font-outfit)] text-[34px] font-light leading-none tracking-[-0.04em] text-[#1f1f1f]">
    {value}
  </span>
  <span className="text-[13px] font-medium text-[#767676]">{label}</span>
</div>
```

**Loading state:** `<Skeleton>` for each zone while query `=== undefined`.

**Empty state** (no data): centered card with "No attendance data yet" + import button. Skip chart and profile sections.

---

## Step 6 — Import Dialog (`fe+convex/components/dashboard/AttendanceImport.tsx`)

Uses shadcn `<Dialog>` from `components/ui/dialog.tsx`.

**Flow:**
1. Select event from dropdown (`useQuery(api.events.listEvents, {})`)
2. File input accepts `.csv` — parsed client-side via `FileReader`, no library
   - Expected: `email,name` per row; header auto-detected if row 1 lacks `@`
   - Trims whitespace, lowercases emails
3. Preview table: first 5 rows + "and N more". Invalid rows (no `@`) shown `text-[#999999] line-through`
4. Submit: `useMutation(api.attendance.importAttendanceBatch)` → shows `"{N} imported, {D} already existed"` → auto-close after 1.5s

**Design (Emil):**
- Dialog open: `200ms ease-out`; close: `120ms`
- Submit button: `active:scale-[0.97] transition-transform duration-[120ms] ease-out`
- No spinner — button text changes to "Importing…" if slow

---

## Step 7 — Trend Chart (`fe+convex/components/dashboard/AttendanceTrendChart.tsx`)

```tsx
<div className="rounded-[14px] border border-[#EBEBEB] bg-white p-5">
  <h2 className="mb-4 text-[15px] font-semibold text-[#111111]">Attendance over time</h2>
  <ResponsiveContainer width="100%" height={280}>
    <LineChart data={data}>
      <CartesianGrid stroke="#E0E0E0" strokeDasharray="3 3" />
      <XAxis dataKey="event_date" tick={{ fill: "#999999", fontSize: 11 }} />
      <YAxis tick={{ fill: "#999999", fontSize: 11 }} allowDecimals={false} />
      <Tooltip content={<CustomTooltip />} />
      <Line
        type="monotone"
        dataKey="attendee_count"
        stroke="#0A0A0A"
        strokeWidth={1.5}
        dot={{ fill: "#0A0A0A", r: 3 }}
        activeDot={{ r: 5 }}
        isAnimationActive={false}  // ← seen many times/day; don't animate
      />
    </LineChart>
  </ResponsiveContainer>
</div>
```

**Custom tooltip:**
```tsx
// rounded-[8px] border border-[#E0E0E0] bg-white p-3 shadow-none
// CSS: opacity transition 100ms ease-out in, 80ms out (asymmetric)
```

---

## Step 8 — Profile List (`fe+convex/components/dashboard/AttendeeProfileList.tsx`)

**Controls:**
```tsx
// Search input: h-10 rounded-[8px] border border-[#E0E0E0] px-3 text-[13px]
// Filter pills: "All" | "2+" | "4+"
//   active:  bg-[#0A0A0A] text-white rounded-[6px] px-3 h-8 text-[12px]
//   inactive: bg-white border border-[#E0E0E0] text-[#555555] ...same
```

**Table columns:**

| Column | Notes |
|--------|-------|
| Email | `font-medium text-[#111111]` |
| Name | `text-[#6B6B6B]`, `—` if null |
| Events | count + "Frequent" chip (`bg-[#F4F4F4] rounded-[4px] px-1.5 text-[10px]`) if >= 4 |
| Types | chips: `bg-[#F4F4F4] rounded-[4px] px-1.5 py-0.5 text-[10px] text-[#555555]` |
| Streak | `{n} in a row` or `—` |
| Status | `Active` `text-[#111111]` or `Lapsed` `text-[#999999]` |
| Predicted Interest | see below |
| Last Seen | short date |

**Interest prediction column:**
- `< 4 events`: `—`
- `>= 4 events`: emphasized chip `bg-[#EAEAEA] rounded-[4px] px-1.5 py-0.5 text-[10px] font-medium text-[#111111]` + confidence dot:
  - high → `w-1.5 h-1.5 rounded-full bg-[#0A0A0A]`
  - medium → `bg-[#999999]`
  - low → `bg-[#CCCCCC]`
- Hover tooltip shows full distribution ("workshop: 3, panel: 2"):
  - `rounded-[8px] border border-[#E0E0E0] bg-white p-2 text-[11px]`
  - origin-aware: `transform-origin` from chip position
  - enter: `scale(0.97) opacity-0` → `scale(1) opacity-1`, `125ms ease-out`

**Row stagger (motion, already installed):**
```tsx
<motion.tr
  initial={{ opacity: 0, y: 4 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.15, delay: Math.min(index, 15) * 0.04 }}
>
```
Cap at 15 to avoid long waits on large lists.

---

## Step 9 — Insight Card (`fe+convex/components/dashboard/InsightCard.tsx`)

```tsx
<div className="rounded-[14px] border border-[#EBEBEB] bg-white p-4">
  {/* Header */}
  <div className="flex items-center gap-1.5">
    <Sparkles className="h-3.5 w-3.5 text-[#999999]" />
    <span className="text-[12px] font-semibold uppercase tracking-[0.07em] text-[#999999]">
      AI Insight
    </span>
  </div>

  {/* Body */}
  {insight ? (
    <>
      <p className="mt-3 text-[13px] leading-[1.5] text-[#4d4d4d]">{insight.insight_text}</p>
      <div className="mt-4 flex items-center justify-between">
        <span className="text-[11px] text-[#999999]">Generated {relativeTime}</span>
        <Link
          href="/dashboard/agent?context=attendance"
          className="text-[13px] font-medium text-[#111111] transition-colors duration-[120ms] hover:text-[#555555]"
        >
          Chat about this →
        </Link>
      </div>
    </>
  ) : hasData ? (
    <p className="mt-3 text-[13px] text-[#999999]">
      Import complete. Run the insight agent to see analysis here.
    </p>
  ) : (
    <p className="mt-3 text-[13px] text-[#999999]">
      No insights yet. Import attendance data to get started.
    </p>
  )}
</div>
```

---

## Step 10 — Agent Chat Stub (`fe+convex/app/dashboard/agent/page.tsx`)

```tsx
"use client";
import { DashboardPageShell } from "@/components/dashboard/PageShell";

export default function AgentPage() {
  return (
    <DashboardPageShell title="Agent">
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-[15px] font-medium text-[#111111]">Coming soon</p>
        <p className="mt-1 text-[13px] text-[#999999]">
          Chat with an AI agent about your attendance data.
        </p>
      </div>
    </DashboardPageShell>
  );
}
```

No nav link — only reachable via InsightCard CTA. Prevents the link from 404ing.

---

## Step 11 — AI Insight Agent

### `agent/insights.py` (new)

```python
import anthropic
import json
import asyncio
import modal
from helper.tools import ConvexClient

app = modal.App("attendance-insights")

image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install("httpx>=0.27", "anthropic>=0.40", "python-dotenv", "pydantic>=2.0")
    .add_local_python_source("helper")
)

@app.function(
    image=image,
    secrets=[modal.Secret.from_name("event-outreach-secrets")],
    timeout=120,
)
async def generate_attendance_insight() -> dict:
    convex = ConvexClient()
    trends = await convex.get_attendance_trends()
    stats = await convex.get_attendance_stats()
    profiles = await convex.get_attendee_profiles()

    # Build type breakdown + active ratio for prompt context
    type_breakdown: dict[str, int] = {}
    for t in trends:
        t_type = t.get("event_type") or "unknown"
        type_breakdown[t_type] = type_breakdown.get(t_type, 0) + 1

    active_count = sum(1 for p in profiles if p.get("is_active"))
    top_streaks = sorted(profiles, key=lambda p: p.get("streak", 0), reverse=True)[:5]

    payload = {
        "trends": trends,
        "stats": stats,
        "type_breakdown": type_breakdown,
        "active_ratio": f"{active_count}/{len(profiles)} attendees active",
        "top_streaks": [{"email": p["email"], "streak": p.get("streak", 0)} for p in top_streaks],
    }

    client = anthropic.AsyncAnthropic()
    msg = await client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=256,
        system=(
            "You are analyzing attendance data for a university student club that hosts "
            "speaker panels, workshops, networking events, and socials. "
            "Give 2-3 concise sentences: (1) what the attendance trend shows with exact numbers, "
            "(2) one plausible hypothesis for why based on event type mix and timing, "
            "(3) one specific actionable suggestion for the next event. "
            "No marketing language. No hedging."
        ),
        messages=[{"role": "user", "content": json.dumps(payload)}],
    )
    insight_text = msg.content[0].text

    await convex.save_insight(
        insight_text=insight_text,
        data_snapshot=json.dumps(payload),
        event_count=stats.get("total_events_tracked", 0),
        attendee_count=stats.get("total_unique_attendees", 0),
    )
    return {"insight": insight_text}
```

**To run manually:**
```sh
modal run agent/insights.py::generate_attendance_insight
```

### `agent/helper/tools.py` additions

Add to `ConvexClient`:
```python
async def get_attendance_trends(self) -> list[dict]:
    return await self._query("attendance:getAttendanceTrends", {})

async def get_attendee_profiles(self, min_events: int = 0) -> list[dict]:
    return await self._query("attendance:getAttendeeProfiles", {"min_events": min_events})

async def get_attendance_stats(self) -> dict:
    return await self._query("attendance:getAttendanceStats", {})

async def save_insight(
    self,
    insight_text: str,
    data_snapshot: str,
    event_count: int,
    attendee_count: int,
) -> None:
    await self._mutation("attendance:saveInsight", {
        "insight_text": insight_text,
        "data_snapshot": data_snapshot,
        "event_count": event_count,
        "attendee_count": attendee_count,
    })
```

---

## Design Reference

| Element | Value |
|---------|-------|
| Page bg | `#FAFAFA` |
| Panel bg | `#FFFFFF` / `#F4F4F4` |
| Primary text | `#0A0A0A` / `#111111` |
| Secondary text | `#555555` |
| Muted text | `#999999` |
| Border | `#E0E0E0` |
| Divider | `#EBEBEB` |
| Card radius | `rounded-[14px]` |
| KPI card radius | `rounded-[18px]` |
| Input/button radius | `rounded-[8px]` |
| Chip radius | `rounded-[4px]` |
| Dialog open | `200ms ease-out` |
| Dialog close | `120ms` |
| Button active | `scale(0.97)`, `120ms ease-out` |
| List stagger | `40ms` per row, cap at 15 rows |
| Tooltip in | `125ms ease-out` from `scale(0.97) opacity-0` |
| Chart tooltip in | `100ms ease-out` |
| Chart tooltip out | `80ms` |
| Chart animation | **None** (seen many times/day) |

No chromatic colors anywhere. Confidence dots: high = `#0A0A0A`, medium = `#999999`, low = `#CCCCCC`.

---

## Verification Checklist

- [ ] `npx convex dev` — schema push succeeds, tables appear in Convex dashboard
- [ ] Import dialog: select event → upload CSV → preview shows correct rows → imported count matches
- [ ] Chart: 2+ events with data → line renders with dots; tooltip shows title + count
- [ ] Profiles table: all attendees appear; "4+" filter works; interest prediction column shows for qualified rows
- [ ] Interest prediction: user with 4+ events of mixed types shows correct `primary_type` and `confidence`
- [ ] Stagger: rows fade/slide in on mount (check with DevTools slow-mo)
- [ ] AI insight: `modal run agent/insights.py::generate_attendance_insight` → InsightCard updates reactively
- [ ] "Chat about this →": navigates to `/dashboard/agent` (not 404)
- [ ] Nav: "Data" link active state matches other sidebar items
- [ ] Design audit: zero chromatic colors, all border/spacing tokens match spec
